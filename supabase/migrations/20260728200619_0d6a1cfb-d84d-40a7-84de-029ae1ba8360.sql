
CREATE OR REPLACE FUNCTION public.mcp_effective_limits(_user_id uuid, _client_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  d jsonb := public.mcp_plan_defaults(_user_id);
  s public.mcp_rate_limit_settings%ROWTYPE;
  has_settings boolean := false;
  agent_limit integer;
  acct integer := (d->>'account_limit')::int;
  cli integer := (d->>'client_limit')::int;
  win integer := (d->>'window_seconds')::int;
BEGIN
  SELECT * INTO s FROM public.mcp_rate_limit_settings WHERE user_id = _user_id;
  IF FOUND THEN
    has_settings := true;
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
    'customized', has_settings
  );
END;
$$;

DROP FUNCTION IF EXISTS public.mcp_set_agent_rate_limit(text, integer, text);
CREATE OR REPLACE FUNCTION public.mcp_set_agent_rate_limit(
  _client_id text,
  _call_limit integer DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
REVOKE EXECUTE ON FUNCTION public.mcp_set_agent_rate_limit(text, integer, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mcp_set_agent_rate_limit(text, integer, text) TO authenticated;
