CREATE OR REPLACE FUNCTION public.mcp_my_limits(_client_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;
  RETURN public.mcp_effective_limits(uid, NULLIF(_client_id, ''));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mcp_my_limits(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_my_limits(text) TO authenticated;