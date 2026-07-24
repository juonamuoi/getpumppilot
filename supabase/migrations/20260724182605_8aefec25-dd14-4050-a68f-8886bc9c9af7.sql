
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  referrer_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed_up',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX referrals_referrer_id_idx ON public.referrals(referrer_id);
CREATE INDEX referrals_referrer_code_idx ON public.referrals(referrer_code);

GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- A user can see referrals where they are the referrer OR the referred party.
CREATE POLICY "Users can view their own referral records"
ON public.referrals FOR SELECT
TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

-- A user can only insert a row where they are the referred_user_id.
CREATE POLICY "Users can record their own referral on signup"
ON public.referrals FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = referred_user_id AND auth.uid() <> referrer_id);

-- Safe lookup: given a code, return the matching user id (or null). No PII exposed.
CREATE OR REPLACE FUNCTION public.resolve_referral_code(_code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users
  WHERE substring(id::text, 1, 8) = lower(_code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_referral_code(TEXT) TO anon, authenticated;
