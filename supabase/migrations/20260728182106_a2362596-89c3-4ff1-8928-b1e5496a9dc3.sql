
CREATE TABLE public.credit_balances (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  lifetime_purchased integer NOT NULL DEFAULT 0,
  lifetime_spent integer NOT NULL DEFAULT 0,
  low_balance_notified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_balance_non_negative CHECK (balance >= 0)
);

GRANT SELECT ON public.credit_balances TO authenticated;
GRANT ALL ON public.credit_balances TO service_role;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit balance" ON public.credit_balances
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  balance_after integer NOT NULL,
  kind text NOT NULL,
  feature text,
  description text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX credit_ledger_external_ref_key ON public.credit_ledger (external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX credit_ledger_user_created_idx ON public.credit_ledger (user_id, created_at DESC);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Ensure a balance row exists (welcome credits for new accounts)
CREATE OR REPLACE FUNCTION public.ensure_credit_account(_user_id uuid, _welcome integer DEFAULT 100)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.credit_balances (user_id, balance)
  VALUES (_user_id, GREATEST(COALESCE(_welcome, 0), 0))
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted AND COALESCE(_welcome, 0) > 0 THEN
    INSERT INTO public.credit_ledger (user_id, delta, balance_after, kind, description, external_ref)
    VALUES (_user_id, _welcome, _welcome, 'welcome', 'Welcome credits', 'welcome:' || _user_id::text)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_credit_account(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_credit_account(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_credit_account_for_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.ensure_credit_account(NEW.id, 100);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_account_for_new_profile ON public.profiles;
CREATE TRIGGER credit_account_for_new_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_credit_account_for_new_profile();

-- Spend credits as the signed-in user
CREATE OR REPLACE FUNCTION public.consume_credits(_amount integer, _feature text, _description text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  amt integer := LEAST(GREATEST(COALESCE(_amount, 0), 0), 100000);
  cur integer;
  newbal integer;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  PERFORM public.ensure_credit_account(uid, 100);

  SELECT balance INTO cur FROM public.credit_balances WHERE user_id = uid FOR UPDATE;

  IF amt = 0 THEN
    RETURN jsonb_build_object('ok', true, 'charged', 0, 'balance', cur);
  END IF;

  IF cur < amt THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits', 'balance', cur, 'required', amt);
  END IF;

  newbal := cur - amt;
  UPDATE public.credit_balances
     SET balance = newbal,
         lifetime_spent = lifetime_spent + amt,
         updated_at = now()
   WHERE user_id = uid;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, kind, feature, description, metadata)
  VALUES (uid, -amt, newbal, 'spend', _feature, _description, COALESCE(_metadata, '{}'::jsonb));

  RETURN jsonb_build_object('ok', true, 'charged', amt, 'balance', newbal);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credits(integer, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_credits(integer, text, text, jsonb) TO authenticated;

-- Grant credits (purchases / refunds) — server-side only
CREATE OR REPLACE FUNCTION public.grant_credits(_user_id uuid, _amount integer, _kind text, _description text DEFAULT NULL, _external_ref text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  amt integer := GREATEST(COALESCE(_amount, 0), 0);
  newbal integer;
BEGIN
  IF _user_id IS NULL OR amt = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  IF _external_ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.credit_ledger WHERE external_ref = _external_ref) THEN
    SELECT balance INTO newbal FROM public.credit_balances WHERE user_id = _user_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'balance', newbal);
  END IF;

  PERFORM public.ensure_credit_account(_user_id, 100);

  UPDATE public.credit_balances
     SET balance = balance + amt,
         lifetime_purchased = lifetime_purchased + (CASE WHEN _kind = 'purchase' THEN amt ELSE 0 END),
         low_balance_notified_at = NULL,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING balance INTO newbal;

  INSERT INTO public.credit_ledger (user_id, delta, balance_after, kind, description, external_ref, metadata)
  VALUES (_user_id, amt, newbal, COALESCE(_kind, 'grant'), _description, _external_ref, COALESCE(_metadata, '{}'::jsonb));

  RETURN jsonb_build_object('ok', true, 'balance', newbal, 'granted', amt);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_credits(uuid, integer, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, text, jsonb) TO service_role;

-- Backfill existing users
INSERT INTO public.credit_balances (user_id, balance)
SELECT id, 100 FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;
