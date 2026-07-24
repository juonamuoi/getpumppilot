
CREATE OR REPLACE FUNCTION public.my_referral_reward_months()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(months), 0)::INTEGER
  FROM public.referral_rewards
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.resolve_referral_code(_code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT user_id FROM public.referral_codes
  WHERE code = lower(_code)
  LIMIT 1;
$$;
