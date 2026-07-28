CREATE OR REPLACE FUNCTION public.mcp_begin_call(
  _user_id uuid,
  _correlation_id uuid,
  _client_id text,
  _tool_name text,
  _request jsonb DEFAULT '{}'::jsonb,
  _limit integer DEFAULT 60,
  _window_seconds integer DEFAULT 60,
  _client_limit integer DEFAULT 30
)
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
  lim integer := LEAST(GREATEST(COALESCE(_limit, 60), 1), 600);
  win integer := LEAST(GREATEST(COALESCE(_window_seconds, 60), 1), 3600);
  clim integer := LEAST(GREATEST(COALESCE(_client_limit, 30), 1), 600);
  oldest timestamptz;
  retry_after integer;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

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
    'client_id', cid
  );
END;
$function$;