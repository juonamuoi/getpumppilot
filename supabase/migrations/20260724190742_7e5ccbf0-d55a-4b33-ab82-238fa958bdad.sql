
DROP POLICY IF EXISTS "Referral codes are readable by anyone" ON public.referral_codes;
DROP POLICY IF EXISTS "Public can read referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "referral_codes_select_public" ON public.referral_codes;

REVOKE SELECT ON public.referral_codes FROM anon;

CREATE POLICY "Users can read their own referral code"
ON public.referral_codes FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.resolve_referral_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.referral_codes WHERE code = _code LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO anon, authenticated;
