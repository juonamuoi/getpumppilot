CREATE OR REPLACE FUNCTION public.tg_app_config_audit_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'app_config_audit is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;