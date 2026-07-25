
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_referral_rewards() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_referral_code_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_strategy_likes_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- Keep referral helpers callable (needed by client)
GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_reward_months() TO authenticated;
