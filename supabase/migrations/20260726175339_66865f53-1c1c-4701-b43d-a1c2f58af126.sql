-- 1. Referral code resolution: only signed-in users may resolve a code.
REVOKE ALL ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO authenticated, service_role;

-- 2. MCP audit/rate-limit routines: move from auth.uid() to an explicit,
--    server-verified user id and restrict execution to the trusted backend.
DROP FUNCTION IF EXISTS public.mcp_begin_call(uuid, text, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.mcp_finish_call(uuid, text, integer, text);

CREATE OR REPLACE FUNCTION public.mcp_begin_call(
  _user_id uuid,
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
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := _user_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.mcp_finish_call(
  _user_id uuid,
  _correlation_id uuid,
  _status text,
  _duration_ms integer DEFAULT NULL::integer,
  _error_message text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  UPDATE public.mcp_audit_log
     SET status = COALESCE(_status, 'unknown'),
         duration_ms = _duration_ms,
         error_message = left(_error_message, 500)
   WHERE correlation_id = _correlation_id
     AND user_id = _user_id
     AND status = 'started';
END;
$function$;

REVOKE ALL ON FUNCTION public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mcp_finish_call(uuid, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mcp_finish_call(uuid, uuid, text, integer, text) TO service_role;