-- Compatibility migration: expose the production RPC in the argument order
-- used by the application and smoke tests: event id, order-item id, produced qty.
-- The legacy 0006 implementation used (order-item id, qty, event id), which
-- does not match calls from the frontend. Keep its implementation as the single
-- source of stock-delta logic and route the canonical signature through it.

CREATE OR REPLACE FUNCTION public.ajustar_producao(
  evento_id uuid,
  pedido_item_id uuid,
  quantidade_resultado numeric
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RETURN public.ajustar_producao($2, $3, $1);
END;
$function$;

REVOKE ALL ON FUNCTION public.ajustar_producao(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_producao(uuid, uuid, numeric) TO authenticated, service_role;

-- Do not expose the legacy argument order to authenticated clients. The wrapper
-- runs as the function owner and can still call this implementation internally.
REVOKE ALL ON FUNCTION public.ajustar_producao(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_producao(uuid, numeric, uuid) TO service_role;

COMMENT ON FUNCTION public.ajustar_producao(uuid, uuid, numeric) IS
  'Canonical RPC signature: event id, order item id, produced quantity. Delegates to the atomic stock-delta implementation.';
