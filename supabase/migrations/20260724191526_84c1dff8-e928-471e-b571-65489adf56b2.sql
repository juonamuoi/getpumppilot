-- Tighten SECURITY DEFINER function exposure

-- handle_new_user is a trigger function; it should never be invoked directly via the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- tg_strategy_likes_count is a trigger function; direct API calls are not needed.
REVOKE EXECUTE ON FUNCTION public.tg_strategy_likes_count() FROM anon, authenticated, PUBLIC;

-- has_active_subscription is currently unused and should not be callable externally.
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM anon, authenticated, PUBLIC;

-- resolve_referral_code is intentionally a public, controlled RPC for referral attribution.
-- It uses SECURITY DEFINER so anon visitors can resolve a code without reading the whole table.
-- Keep execute for anon/authenticated; revoke from PUBLIC to make grants explicit.
REVOKE EXECUTE ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO anon, authenticated;
