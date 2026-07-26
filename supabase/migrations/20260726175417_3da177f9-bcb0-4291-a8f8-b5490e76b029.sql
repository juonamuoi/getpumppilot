REVOKE ALL ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO service_role;