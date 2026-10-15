-- Registra o estabelecimento onde a compra de insumos foi realizada.
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS local_compra text;

CREATE OR REPLACE FUNCTION public.registrar_local_compra(
  registro_id uuid,
  local_compra text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  nome_local text := NULLIF(btrim(local_compra), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;

  UPDATE public.compras
  SET local_compra = nome_local
  WHERE id = registro_id
    AND user_id = uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada ou sem permissão.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_local_compra(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_local_compra(uuid, text) TO authenticated, service_role;

COMMENT ON COLUMN public.compras.local_compra IS
  'Nome do mercado, loja ou fornecedor onde a compra de insumos foi realizada.';
