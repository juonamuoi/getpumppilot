
REVOKE EXECUTE ON FUNCTION public.mcp_plan_defaults(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_effective_limits(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_set_rate_limits(integer, integer, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mcp_set_agent_rate_limit(text, integer, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mcp_plan_defaults(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_effective_limits(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_set_rate_limits(integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_set_agent_rate_limit(text, integer, text) TO authenticated;
