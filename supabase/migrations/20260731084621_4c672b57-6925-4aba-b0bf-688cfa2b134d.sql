ALTER TABLE public.pump_balances ADD COLUMN IF NOT EXISTS payout_address_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.pump_set_payout_address(_address text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  addr text := NULLIF(trim(COALESCE(_address, '')), '');
  prev text;
  ts timestamptz;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF addr IS NOT NULL AND addr !~ '^0x[0-9a-fA-F]{40}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_address');
  END IF;
  PERFORM public.pump_ensure_account(uid, 500);
  SELECT payout_address, payout_address_updated_at INTO prev, ts
    FROM public.pump_balances WHERE user_id = uid;
  IF prev IS DISTINCT FROM addr THEN
    ts := now();
    UPDATE public.pump_balances
      SET payout_address = addr, payout_address_updated_at = ts
      WHERE user_id = uid;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'payout_address', addr,
    'previous_address', prev,
    'changed', prev IS DISTINCT FROM addr,
    'payout_address_updated_at', ts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pump_my_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  b public.pump_balances%ROWTYPE;
  tag text;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT * INTO b FROM public.pump_balances WHERE user_id = uid;
  SELECT code INTO tag FROM public.referral_codes WHERE user_id = uid LIMIT 1;
  RETURN jsonb_build_object(
    'ok', true,
    'tag', COALESCE(tag, substring(uid::text, 1, 8)),
    'balance', COALESCE(b.balance, 0),
    'lifetime_earned', COALESCE(b.lifetime_earned, 0),
    'lifetime_sent', COALESCE(b.lifetime_sent, 0),
    'lifetime_received', COALESCE(b.lifetime_received, 0),
    'payout_address', b.payout_address,
    'payout_address_updated_at', b.payout_address_updated_at,
    'quests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', q.key, 'title', q.title, 'description', q.description,
        'reward', q.reward,
        'claimed', c.user_id IS NOT NULL,
        'claimed_at', c.created_at
      ) ORDER BY q.sort_order, q.key)
      FROM public.pump_quests q
      LEFT JOIN public.pump_quest_claims c ON c.quest_key = q.key AND c.user_id = uid
      WHERE q.active
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'delta', l.delta, 'balance_after', l.balance_after,
        'kind', l.kind, 'quest_key', l.quest_key, 'memo', l.memo, 'created_at', l.created_at
      ) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.pump_ledger WHERE user_id = uid ORDER BY created_at DESC LIMIT 50) l
    ), '[]'::jsonb)
  );
END;
$function$;