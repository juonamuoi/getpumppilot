REVOKE EXECUTE ON FUNCTION public.pump_my_summary() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pump_claim_quest(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pump_transfer(text, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pump_set_payout_address(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pump_ensure_account(uuid, integer) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_pump_account_for_new_profile() FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.pump_my_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pump_claim_quest(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pump_transfer(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pump_set_payout_address(text) TO authenticated;