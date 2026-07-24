
-- Add lifecycle columns to referrals
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_granted_at TIMESTAMPTZ;

-- Reward ledger
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  months INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT 'referral_qualified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_rewards_user_id_idx ON public.referral_rewards(user_id);

GRANT SELECT ON public.referral_rewards TO authenticated;
GRANT ALL ON public.referral_rewards TO service_role;

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rewards"
ON public.referral_rewards FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Qualify + grant rewards in one pass. Uses auth.users.last_sign_in_at as the
-- "still active" heuristic: referred user must have signed in at least once
-- more than 7 days after their referral was recorded.
CREATE OR REPLACE FUNCTION public.process_referral_rewards()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  granted INTEGER := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT ref.id, ref.referrer_id, ref.referred_user_id
    FROM public.referrals ref
    JOIN auth.users u ON u.id = ref.referred_user_id
    WHERE ref.reward_granted_at IS NULL
      AND ref.created_at < now() - INTERVAL '7 days'
      AND u.last_sign_in_at IS NOT NULL
      AND u.last_sign_in_at > ref.created_at + INTERVAL '7 days'
      AND ref.referrer_id <> ref.referred_user_id
  LOOP
    INSERT INTO public.referral_rewards (user_id, referral_id, months, reason)
    VALUES
      (r.referrer_id,      r.id, 1, 'referral_qualified_referrer'),
      (r.referred_user_id, r.id, 1, 'referral_qualified_referred');

    UPDATE public.referrals
    SET qualified_at = COALESCE(qualified_at, now()),
        reward_granted_at = now(),
        status = 'rewarded'
    WHERE id = r.id;

    granted := granted + 1;
  END LOOP;

  RETURN granted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_referral_rewards() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_referral_rewards() TO service_role;

-- Helper for the client to read the current user's total credited months.
CREATE OR REPLACE FUNCTION public.my_referral_reward_months()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(months), 0)::INTEGER
  FROM public.referral_rewards
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_referral_reward_months() TO authenticated;

-- Schedule daily processing via pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process_referral_rewards_daily') THEN
    PERFORM cron.unschedule('process_referral_rewards_daily');
  END IF;
  PERFORM cron.schedule(
    'process_referral_rewards_daily',
    '17 3 * * *',
    $cron$SELECT public.process_referral_rewards();$cron$
  );
END $$;
