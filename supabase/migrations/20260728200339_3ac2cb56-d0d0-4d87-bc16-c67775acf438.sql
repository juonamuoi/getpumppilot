
CREATE TABLE public.mcp_rate_limit_settings (
  user_id uuid PRIMARY KEY,
  account_limit integer NOT NULL,
  client_limit integer NOT NULL,
  window_seconds integer NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcp_rate_limit_settings TO authenticated;
GRANT ALL ON public.mcp_rate_limit_settings TO service_role;
ALTER TABLE public.mcp_rate_limit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own rate limit settings" ON public.mcp_rate_limit_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.mcp_agent_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  call_limit integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_id)
);
GRANT SELECT ON public.mcp_agent_rate_limits TO authenticated;
GRANT ALL ON public.mcp_agent_rate_limits TO service_role;
ALTER TABLE public.mcp_agent_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own agent rate limits" ON public.mcp_agent_rate_limits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.mcp_rate_limit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL,
  client_id text,
  field text NOT NULL,
  old_value integer,
  new_value integer,
  reason text,
  plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_rate_limit_audit_user_idx ON public.mcp_rate_limit_audit (user_id, created_at DESC);
GRANT SELECT ON public.mcp_rate_limit_audit TO authenticated;
GRANT ALL ON public.mcp_rate_limit_audit TO service_role;
ALTER TABLE public.mcp_rate_limit_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own rate limit audit" ON public.mcp_rate_limit_audit
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mcp_plan_defaults(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_pro boolean := false;
BEGIN
  IF _user_id IS NOT NULL THEN
    is_pro := public.has_active_subscription(_user_id, 'live');
  END IF;
  IF is_pro THEN
    RETURN jsonb_build_object('plan','pro','account_limit',300,'client_limit',120,'window_seconds',60,
      'max_account_limit',600,'max_client_limit',600);
  END IF;
  RETURN jsonb_build_object('plan','free','account_limit',60,'client_limit',30,'window_seconds',60,
    'max_account_limit',120,'max_client_limit',120);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_effective_limits(_user_id uuid, _client_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d jsonb := public.mcp_plan_defaults(_user_id);
  s public.mcp_rate_limit_settings%ROWTYPE;
  agent_limit integer;
  acct integer := (d->>'account_limit')::int;
  cli integer := (d->>'client_limit')::int;
  win integer := (d->>'window_seconds')::int;
BEGIN
  SELECT * INTO s FROM public.mcp_rate_limit_settings WHERE user_id = _user_id;
  IF FOUND THEN
    acct := s.account_limit; cli := s.client_limit; win := s.window_seconds;
  END IF;
  IF _client_id IS NOT NULL THEN
    SELECT call_limit INTO agent_limit FROM public.mcp_agent_rate_limits
     WHERE user_id = _user_id AND client_id = _client_id;
    IF agent_limit IS NOT NULL THEN cli := agent_limit; END IF;
  END IF;
  RETURN jsonb_build_object(
    'plan', d->>'plan',
    'account_limit', LEAST(GREATEST(acct,1), (d->>'max_account_limit')::int),
    'client_limit', LEAST(GREATEST(cli,1), (d->>'max_client_limit')::int),
    'window_seconds', LEAST(GREATEST(win,10), 3600),
    'defaults', d,
    'agent_override', agent_limit,
    'customized', FOUND
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_set_rate_limits(
  _account_limit integer DEFAULT NULL,
  _client_limit integer DEFAULT NULL,
  _window_seconds integer DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  d jsonb;
  cur public.mcp_rate_limit_settings%ROWTYPE;
  old_acct integer; old_cli integer; old_win integer;
  new_acct integer; new_cli integer; new_win integer;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  d := public.mcp_plan_defaults(uid);

  SELECT * INTO cur FROM public.mcp_rate_limit_settings WHERE user_id = uid;
  IF FOUND THEN
    old_acct := cur.account_limit; old_cli := cur.client_limit; old_win := cur.window_seconds;
  ELSE
    old_acct := (d->>'account_limit')::int; old_cli := (d->>'client_limit')::int; old_win := (d->>'window_seconds')::int;
  END IF;

  new_acct := LEAST(GREATEST(COALESCE(_account_limit, old_acct), 1), (d->>'max_account_limit')::int);
  new_cli  := LEAST(GREATEST(COALESCE(_client_limit, old_cli), 1), (d->>'max_client_limit')::int);
  new_win  := LEAST(GREATEST(COALESCE(_window_seconds, old_win), 10), 3600);
  IF new_cli > new_acct THEN new_cli := new_acct; END IF;

  INSERT INTO public.mcp_rate_limit_settings (user_id, account_limit, client_limit, window_seconds)
  VALUES (uid, new_acct, new_cli, new_win)
  ON CONFLICT (user_id) DO UPDATE
    SET account_limit = EXCLUDED.account_limit,
        client_limit = EXCLUDED.client_limit,
        window_seconds = EXCLUDED.window_seconds,
        updated_at = now();

  IF new_acct IS DISTINCT FROM old_acct THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, field, old_value, new_value, reason, plan)
    VALUES (uid, 'tenant', 'account_limit', old_acct, new_acct, left(_reason, 300), d->>'plan');
  END IF;
  IF new_cli IS DISTINCT FROM old_cli THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, field, old_value, new_value, reason, plan)
    VALUES (uid, 'tenant', 'client_limit', old_cli, new_cli, left(_reason, 300), d->>'plan');
  END IF;
  IF new_win IS DISTINCT FROM old_win THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, field, old_value, new_value, reason, plan)
    VALUES (uid, 'tenant', 'window_seconds', old_win, new_win, left(_reason, 300), d->>'plan');
  END IF;

  RETURN jsonb_build_object('ok', true, 'limits', public.mcp_effective_limits(uid, NULL));
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_set_agent_rate_limit(
  _client_id text,
  _call_limit integer,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  d jsonb;
  eff jsonb;
  cid text := NULLIF(left(COALESCE(_client_id,''), 128), '');
  old_limit integer;
  new_limit integer;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF cid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_client'); END IF;
  d := public.mcp_plan_defaults(uid);
  eff := public.mcp_effective_limits(uid, NULL);

  SELECT call_limit INTO old_limit FROM public.mcp_agent_rate_limits WHERE user_id = uid AND client_id = cid;

  IF _call_limit IS NULL THEN
    DELETE FROM public.mcp_agent_rate_limits WHERE user_id = uid AND client_id = cid;
    IF old_limit IS NOT NULL THEN
      INSERT INTO public.mcp_rate_limit_audit (user_id, scope, client_id, field, old_value, new_value, reason, plan)
      VALUES (uid, 'agent', cid, 'call_limit', old_limit, NULL, left(_reason,300), d->>'plan');
    END IF;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;

  new_limit := LEAST(GREATEST(_call_limit, 1), (eff->>'account_limit')::int);

  INSERT INTO public.mcp_agent_rate_limits (user_id, client_id, call_limit)
  VALUES (uid, cid, new_limit)
  ON CONFLICT (user_id, client_id) DO UPDATE SET call_limit = EXCLUDED.call_limit, updated_at = now();

  IF new_limit IS DISTINCT FROM old_limit THEN
    INSERT INTO public.mcp_rate_limit_audit (user_id, scope, client_id, field, old_value, new_value, reason, plan)
    VALUES (uid, 'agent', cid, 'call_limit', old_limit, new_limit, left(_reason,300), d->>'plan');
  END IF;

  RETURN jsonb_build_object('ok', true, 'client_id', cid, 'call_limit', new_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.mcp_begin_call(_user_id uuid, _correlation_id uuid, _client_id text, _tool_name text, _request jsonb DEFAULT '{}'::jsonb, _limit integer DEFAULT 60, _window_seconds integer DEFAULT 60, _client_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := _user_id;
  cid text := COALESCE(NULLIF(_client_id, ''), 'unknown');
  used integer;
  client_used integer;
  grant_row public.mcp_consent_grants%ROWTYPE;
  eff jsonb;
  lim integer;
  win integer;
  clim integer;
  oldest timestamptz;
  retry_after integer;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  eff := public.mcp_effective_limits(uid, cid);
  lim := LEAST(GREATEST((eff->>'account_limit')::int, 1), 600);
  win := LEAST(GREATEST((eff->>'window_seconds')::int, 1), 3600);
  clim := LEAST(GREATEST((eff->>'client_limit')::int, 1), 600);

  INSERT INTO public.mcp_consent_grants (user_id, client_id, tools_used, call_count, last_seen_at)
  VALUES (uid, cid, ARRAY[_tool_name], 1, now())
  ON CONFLICT (user_id, client_id) DO UPDATE
    SET last_seen_at = now(),
        call_count = public.mcp_consent_grants.call_count + 1,
        tools_used = (
          SELECT ARRAY(SELECT DISTINCT unnest(public.mcp_consent_grants.tools_used || ARRAY[_tool_name]))
        )
  RETURNING * INTO grant_row;

  IF grant_row.revoked_at IS NOT NULL THEN
    INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request, error_message)
    VALUES (_correlation_id, uid, cid, _tool_name, 'revoked', COALESCE(_request, '{}'::jsonb), 'Access revoked for this client');
    RETURN jsonb_build_object('allowed', false, 'reason', 'revoked', 'client_id', cid);
  END IF;

  SELECT count(*), min(created_at) INTO used, oldest
  FROM public.mcp_audit_log
  WHERE user_id = uid
    AND created_at > now() - make_interval(secs => win)
    AND status <> 'rate_limited';

  IF used >= lim THEN
    retry_after := GREATEST(1, win - FLOOR(EXTRACT(epoch FROM (now() - oldest)))::integer);
    INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request, error_message)
    VALUES (_correlation_id, uid, cid, _tool_name, 'rate_limited', COALESCE(_request, '{}'::jsonb),
            format('Account rate limit of %s requests per %ss exceeded', lim, win));
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'rate_limited', 'scope', 'account',
      'limit', lim, 'used', used, 'window_seconds', win,
      'retry_after_seconds', retry_after, 'client_id', cid
    );
  END IF;

  SELECT count(*), min(created_at) INTO client_used, oldest
  FROM public.mcp_audit_log
  WHERE user_id = uid
    AND COALESCE(NULLIF(client_id, ''), 'unknown') = cid
    AND created_at > now() - make_interval(secs => win)
    AND status <> 'rate_limited';

  IF client_used >= clim THEN
    retry_after := GREATEST(1, win - FLOOR(EXTRACT(epoch FROM (now() - oldest)))::integer);
    INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request, error_message)
    VALUES (_correlation_id, uid, cid, _tool_name, 'rate_limited', COALESCE(_request, '{}'::jsonb),
            format('Client %s rate limit of %s requests per %ss exceeded', cid, clim, win));
    RETURN jsonb_build_object(
      'allowed', false, 'reason', 'rate_limited', 'scope', 'client',
      'limit', clim, 'used', client_used, 'window_seconds', win,
      'retry_after_seconds', retry_after, 'client_id', cid
    );
  END IF;

  INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request)
  VALUES (_correlation_id, uid, cid, _tool_name, 'started', COALESCE(_request, '{}'::jsonb));

  RETURN jsonb_build_object(
    'allowed', true,
    'limit', lim,
    'remaining', GREATEST(lim - used - 1, 0),
    'client_limit', clim,
    'client_remaining', GREATEST(clim - client_used - 1, 0),
    'window_seconds', win,
    'client_id', cid,
    'plan', eff->>'plan'
  );
END;
$function$;
