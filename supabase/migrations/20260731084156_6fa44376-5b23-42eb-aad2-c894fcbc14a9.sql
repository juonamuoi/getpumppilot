REVOKE ALL ON FUNCTION public.pump_transfer_history(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pump_transfer_history(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.pump_transfer_history(integer, integer) TO authenticated;