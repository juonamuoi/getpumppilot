
CREATE TABLE public.mcp_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  client_id text,
  tool_name text NOT NULL,
  status text NOT NULL,
  duration_ms integer,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_audit_log_user_time_idx ON public.mcp_audit_log (user_id, created_at DESC);
CREATE INDEX mcp_audit_log_correlation_idx ON public.mcp_audit_log (correlation_id);

GRANT SELECT ON public.mcp_audit_log TO authenticated;
GRANT ALL ON public.mcp_audit_log TO service_role;
ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own MCP audit log" ON public.mcp_audit_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.mcp_consent_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL,
  first_granted_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  tools_used text[] NOT NULL DEFAULT '{}',
  call_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  UNIQUE (user_id, client_id)
);
CREATE INDEX mcp_consent_grants_user_idx ON public.mcp_consent_grants (user_id);

GRANT SELECT, UPDATE ON public.mcp_consent_grants TO authenticated;
GRANT ALL ON public.mcp_consent_grants TO service_role;
ALTER TABLE public.mcp_consent_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own MCP grants" ON public.mcp_consent_grants
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users revoke own MCP grants" ON public.mcp_consent_grants
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Begin an MCP call: enforce consent + per-minute rate limit, record the attempt.
CREATE OR REPLACE FUNCTION public.mcp_begin_call(
  _correlation_id uuid,
  _client_id text,
  _tool_name text,
  _request jsonb DEFAULT '{}'::jsonb,
  _limit integer DEFAULT 60,
  _window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  used integer;
  grant_row public.mcp_consent_grants%ROWTYPE;
  lim integer := LEAST(GREATEST(COALESCE(_limit, 60), 1), 600);
  win integer := LEAST(GREATEST(COALESCE(_window_seconds, 60), 1), 3600);
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  INSERT INTO public.mcp_consent_grants (user_id, client_id, tools_used, call_count, last_seen_at)
  VALUES (uid, COALESCE(_client_id, 'unknown'), ARRAY[_tool_name], 1, now())
  ON CONFLICT (user_id, client_id) DO UPDATE
    SET last_seen_at = now(),
        call_count = public.mcp_consent_grants.call_count + 1,
        tools_used = (
          SELECT ARRAY(SELECT DISTINCT unnest(public.mcp_consent_grants.tools_used || ARRAY[_tool_name]))
        )
  RETURNING * INTO grant_row;

  IF grant_row.revoked_at IS NOT NULL THEN
    INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request, error_message)
    VALUES (_correlation_id, uid, _client_id, _tool_name, 'revoked', COALESCE(_request, '{}'::jsonb), 'Access revoked for this client');
    RETURN jsonb_build_object('allowed', false, 'reason', 'revoked');
  END IF;

  SELECT count(*) INTO used
  FROM public.mcp_audit_log
  WHERE user_id = uid
    AND created_at > now() - make_interval(secs => win)
    AND status <> 'rate_limited';

  IF used >= lim THEN
    INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request, error_message)
    VALUES (_correlation_id, uid, _client_id, _tool_name, 'rate_limited', COALESCE(_request, '{}'::jsonb),
            format('Rate limit of %s requests per %ss exceeded', lim, win));
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'limit', lim, 'window_seconds', win, 'retry_after_seconds', win);
  END IF;

  INSERT INTO public.mcp_audit_log (correlation_id, user_id, client_id, tool_name, status, request)
  VALUES (_correlation_id, uid, _client_id, _tool_name, 'started', COALESCE(_request, '{}'::jsonb));

  RETURN jsonb_build_object('allowed', true, 'remaining', GREATEST(lim - used - 1, 0), 'limit', lim, 'window_seconds', win);
END;
$$;

-- Finish an MCP call: stamp outcome on the started audit row.
CREATE OR REPLACE FUNCTION public.mcp_finish_call(
  _correlation_id uuid,
  _status text,
  _duration_ms integer DEFAULT NULL,
  _error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE public.mcp_audit_log
     SET status = COALESCE(_status, 'unknown'),
         duration_ms = _duration_ms,
         error_message = left(_error_message, 500)
   WHERE correlation_id = _correlation_id
     AND user_id = uid
     AND status = 'started';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mcp_begin_call(uuid, text, text, jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mcp_finish_call(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_begin_call(uuid, text, text, jsonb, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_finish_call(uuid, text, integer, text) TO authenticated, service_role;
