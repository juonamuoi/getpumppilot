REVOKE ALL ON FUNCTION public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer, integer) TO service_role;
DROP FUNCTION IF EXISTS public.mcp_begin_call(uuid, uuid, text, text, jsonb, integer, integer);