-- Draft migration 0008: cancel purchases without deleting their audit trail.
-- Cancellation reverses only the currently active purchase-item movements; earlier
-- edits have already appended compensating reversals. Historical rows are retained.

ALTER TABLE public.compras
  ADD COLUMN cancelada_em timestamptz;

ALTER TABLE public.estoque_eventos
  DROP CONSTRAINT IF EXISTS estoque_eventos_tipo_check;
ALTER TABLE public.estoque_eventos
  ADD CONSTRAINT estoque_eventos_tipo_check
  CHECK (tipo IN ('salvar_compra', 'cancelar_compra'));

CREATE OR REPLACE FUNCTION public.bloquear_edicao_compra_cancelada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF OLD.cancelada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta compra está cancelada e não pode ser editada.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER compras_bloquear_edicao_cancelada
BEFORE UPDATE ON public.compras
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_compra_cancelada();

CREATE OR REPLACE FUNCTION public.cancelar_compra(
  registro_id uuid,
  evento_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  rid uuid;
  integrada boolean;
  cancelada timestamptz;
  evento_existente public.estoque_eventos;
  movimento record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF registro_id IS NULL OR evento_id IS NULL THEN
    RAISE EXCEPTION 'Compra e identificador do cancelamento são obrigatórios.';
  END IF;

  INSERT INTO public.estoque_eventos(user_id, evento_id, compra_id, tipo)
  VALUES (uid, evento_id, registro_id, 'cancelar_compra')
  ON CONFLICT ON CONSTRAINT estoque_eventos_user_evento_unique DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO evento_existente
    FROM public.estoque_eventos
    WHERE user_id = uid AND estoque_eventos.evento_id = cancelar_compra.evento_id;
    IF evento_existente.tipo <> 'cancelar_compra'
       OR evento_existente.compra_id IS DISTINCT FROM registro_id THEN
      RAISE EXCEPTION 'Este identificador já foi usado em outra operação.';
    END IF;
    RETURN true;
  END IF;

  SELECT c.id, c.estoque_integrado, c.cancelada_em
    INTO rid, integrada, cancelada
  FROM public.compras c
  WHERE c.id = registro_id AND c.user_id = uid
  FOR UPDATE;

  IF rid IS NULL THEN RAISE EXCEPTION 'Compra não encontrada.'; END IF;
  IF cancelada IS NOT NULL THEN RETURN true; END IF;

  IF integrada THEN
    FOR movimento IN
      SELECT ci.id AS item_id, ci.insumo_id, m.id AS movimento_id,
             m.quantidade_delta_base, m.unidade_base
      FROM public.compra_itens ci
      JOIN public.estoque_movimentos m
        ON m.user_id = uid
       AND m.origem_tipo = 'compra_item'
       AND m.origem_id = ci.id
       AND m.tipo_movimento = 'entrada_compra'
      WHERE ci.user_id = uid AND ci.compra_id = rid
      ORDER BY ci.insumo_id, ci.id
    LOOP
      INSERT INTO public.estoque_movimentos(
        user_id, insumo_id, quantidade_delta_base, unidade_base,
        tipo_movimento, origem_tipo, origem_id, evento_id,
        reverte_movimento_id, observacao
      ) VALUES (
        uid, movimento.insumo_id, -movimento.quantidade_delta_base,
        movimento.unidade_base, 'estorno', 'compra_item', movimento.item_id,
        evento_id, movimento.movimento_id, 'Estorno por cancelamento de compra'
      );
    END LOOP;
  END IF;

  UPDATE public.compras
  SET cancelada_em = now()
  WHERE id = rid AND user_id = uid;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancelar_compra(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_compra(uuid,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cancelar_compra(uuid,uuid) IS
  'Soft-cancels a purchase and appends compensating stock movements for its active integrated items. Does not delete the purchase or ledger history.';
