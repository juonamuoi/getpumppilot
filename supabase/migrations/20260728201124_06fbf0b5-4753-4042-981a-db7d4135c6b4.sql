CREATE OR REPLACE FUNCTION public.mcp_rate_limit_status(_user_id uuid DEFAULT NULL, _client_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  uid uuid;
  cid text := NULLIF(_client_id, '');
  eff jsonb;
  lim integer;
  win integer;
  clim integer;
  used integer;
  client_used integer;
  oldest timestamptz;
  client_oldest timestamptz;
  account_retry integer := 0;
  client_retry integer := 0;
  revoked boolean := false;
BEGIN
  uid := COALESCE(caller, _user_id);
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;
  -- A signed-in caller may only inspect their own quota.
  IF caller IS NOT NULL AND _user_id IS NOT NULL AND _user_id <> caller THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  eff := public.mcp_effective_limits(uid, cid);
  lim := LEAST(GREATEST((eff->>'account_limit')::int, 1), 600);
  win := LEAST(GREATEST((eff->>'window_seconds')::int, 1), 3600);
  clim := LEAST(GREATEST((eff->>'client_limit')::int, 1), 600);

  SELECT count(*), min(created_at) INTO used, oldest
  FROM public.mcp_audit_log
  WHERE user_id = uid
    AND created_at > now() - make_interval(secs => win)
    AND status <> 'rate_limited';

  IF used >= lim THEN
    account_retry := GREATEST(1, win - FLOOR(EXTRACT(epoch FROM (now() - oldest)))::integer);
  END IF;

  IF cid IS NOT NULL THEN
    SELECT count(*), min(created_at) INTO client_used, client_oldest
    FROM public.mcp_audit_log
    WHERE user_id = uid
      AND COALESCE(NULLIF(client_id, ''), 'unknown') = cid
      AND created_at > now() - make_interval(secs => win)
      AND status <> 'rate_limited';

    IF client_used >= clim THEN
      client_retry := GREATEST(1, win - FLOOR(EXTRACT(epoch FROM (now() - client_oldest)))::integer);
    END IF;

    SELECT (g.revoked_at IS NOT NULL) INTO revoked
    FROM public.mcp_consent_grants g
    WHERE g.user_id = uid AND g.client_id = cid;
    revoked := COALESCE(revoked, false);
  END IF;

  RETURN jsonb_build_object(
    'user_id', uid,
    'plan', eff->>'plan',
    'window_seconds', win,
    'checked_at', now(),
    'account', jsonb_build_object(
      'limit', lim,
      'used', COALESCE(used, 0),
      'remaining', GREATEST(lim - COALESCE(used, 0), 0),
      'throttled', COALESCE(used, 0) >= lim,
      'retry_after_seconds', account_retry,
      'next_retry_at', CASE WHEN account_retry > 0 THEN now() + make_interval(secs => account_retry) ELSE now() END
    ),
    'client', CASE WHEN cid IS NULL THEN NULL ELSE jsonb_build_object(
      'client_id', cid,
      'revoked', revoked,
      'limit', clim,
      'used', COALESCE(client_used, 0),
      'remaining', GREATEST(clim - COALESCE(client_used, 0), 0),
      'throttled', COALESCE(client_used, 0) >= clim,
      'retry_after_seconds', client_retry,
      'next_retry_at', CASE WHEN client_retry > 0 THEN now() + make_interval(secs => client_retry) ELSE now() END
    ) END,
    'retry_after_seconds', GREATEST(account_retry, client_retry),
    'next_retry_at', now() + make_interval(secs => GREATEST(account_retry, client_retry))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mcp_rate_limit_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_rate_limit_status(uuid, text) TO authenticated, service_role;