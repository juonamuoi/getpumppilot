CREATE OR REPLACE FUNCTION public.pump_transfer_history(_limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  lim integer := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  off integer := GREATEST(COALESCE(_offset, 0), 0);
  total bigint;
  rows jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT count(*) INTO total
  FROM public.pump_ledger l
  WHERE l.user_id = uid AND l.kind IN ('transfer_out', 'transfer_in');

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO rows
  FROM (
    SELECT
      l.id,
      l.created_at,
      split_part(COALESCE(l.external_ref, ''), ':', 2) AS ref,
      l.kind,
      CASE WHEN l.kind = 'transfer_out' THEN 'sent' ELSE 'received' END AS direction,
      abs(l.delta) AS amount,
      l.delta AS my_delta,
      l.balance_after AS my_balance_after,
      l.memo,
      l.counterparty_id,
      COALESCE(
        (SELECT rc.code FROM public.referral_codes rc WHERE rc.user_id = l.counterparty_id LIMIT 1),
        substring(l.counterparty_id::text, 1, 8)
      ) AS counterparty_tag,
      (
        SELECT l2.delta
        FROM public.pump_ledger l2
        WHERE l2.user_id = l.counterparty_id
          AND l2.counterparty_id = l.user_id
          AND split_part(COALESCE(l2.external_ref, ''), ':', 2) = split_part(COALESCE(l.external_ref, ''), ':', 2)
        LIMIT 1
      ) AS counterparty_delta
    FROM public.pump_ledger l
    WHERE l.user_id = uid AND l.kind IN ('transfer_out', 'transfer_in')
    ORDER BY l.created_at DESC
    LIMIT lim OFFSET off
  ) t;

  RETURN jsonb_build_object('ok', true, 'total', total, 'limit', lim, 'offset', off, 'transfers', rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.pump_transfer_history(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pump_transfer_history(integer, integer) TO authenticated;