
DROP FUNCTION IF EXISTS public.resolve_referral_code(TEXT);

CREATE TABLE public.referral_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_codes TO anon, authenticated;
GRANT ALL ON public.referral_codes TO service_role;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Referral codes are publicly readable"
ON public.referral_codes FOR SELECT
TO anon, authenticated
USING (true);

-- Trigger: create a referral code for each new user (first 8 chars of uuid).
CREATE OR REPLACE FUNCTION public.create_referral_code_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.referral_codes (code, user_id)
  VALUES (substring(NEW.id::text, 1, 8), NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_referral ON auth.users;
CREATE TRIGGER on_auth_user_created_referral
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_referral_code_for_new_user();

-- Backfill codes for existing users.
INSERT INTO public.referral_codes (code, user_id)
SELECT substring(id::text, 1, 8), id FROM auth.users
ON CONFLICT DO NOTHING;
