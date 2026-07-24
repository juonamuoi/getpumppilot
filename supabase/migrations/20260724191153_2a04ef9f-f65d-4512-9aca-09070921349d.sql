-- Drop the overly permissive public SELECT policy on referral_codes
DROP POLICY IF EXISTS "Referral codes are publicly readable" ON public.referral_codes;

-- Ensure only owners can read their own referral code (existing policy should remain)
-- The resolve_referral_code security definer RPC is the safe way to look up a referrer by code.

-- Revoke direct table SELECT from anon to prevent public enumeration
REVOKE SELECT ON public.referral_codes FROM anon;
