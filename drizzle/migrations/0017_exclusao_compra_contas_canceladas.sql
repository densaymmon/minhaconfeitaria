-- Corrige exclusão de compras com contas canceladas sob RLS/revogação de UPDATE.
-- A operação financeira ocorre dentro da RPC SECURITY DEFINER e da mesma transação
-- que verifica as contas, preserva o histórico e exclui a compra.
CREATE OR REPLACE FUNCTION public.excluir_compra(
  registro_id uuid,
  evento_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  compra public.compras;
  evento_existente public.estoque_eventos;
  movimento record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF registro_id IS NULL OR evento_id IS NULL THEN
    RAISE EXCEPTION 'Compra e identificador da exclusão são obrigatórios.';
  END IF;

  INSERT INTO public.estoque_eventos(user_id, evento_id, compra_id, tipo)
  VALUES (uid, evento_id, registro_id, 'excluir_compra')
  ON CONFLICT ON CONSTRAINT estoque_eventos_user_evento_unique DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO evento_existente
    FROM public.estoque_eventos
    WHERE user_id = uid AND estoque_eventos.evento_id = excluir_compra.evento_id;
    IF evento_existente.tipo <> 'excluir_compra'
       OR evento_existente.compra_id IS DISTINCT FROM registro_id THEN
      RAISE EXCEPTION 'Este identificador já foi usado em outra operação.';
    END IF;
    RETURN true;
  END IF;

  SELECT * INTO compra
  FROM public.compras c
  WHERE c.id = registro_id AND c.user_id = uid
  FOR UPDATE;

  IF compra.id IS NULL THEN
    RAISE EXCEPTION 'Compra não encontrada ou sem permissão.';
  END IF;

  -- Contas ainda ativas continuam protegendo a compra. A checagem e a
  -- desvinculação das parcelas canceladas ocorrem na mesma transação e com
  -- privilégios da função, sem exigir UPDATE direto para o papel authenticated.
  IF EXISTS (
    SELECT 1
    FROM public.contas_pagar cp
    WHERE cp.compra_id = registro_id
      AND cp.user_id = uid
      AND cp.status IS DISTINCT FROM 'cancelado'
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir esta compra porque ainda existe uma conta a pagar não cancelada. Cancele ou resolva todas as parcelas antes de excluir.';
  END IF;

  UPDATE public.contas_pagar cp
  SET compra_id = NULL,
      updated_at = now()
  WHERE cp.compra_id = registro_id
    AND cp.user_id = uid
    AND cp.status = 'cancelado';

  -- Se a compra ainda está ativa e movimentou o estoque, registra estornos
  -- antes de remover o registro e seus itens. O saldo não fica inflado.
  IF compra.cancelada_em IS NULL AND compra.estoque_integrado THEN
    FOR movimento IN
      SELECT ci.id AS item_id, ci.insumo_id, m.id AS movimento_id,
             m.quantidade_delta_base, m.unidade_base
      FROM public.compra_itens ci
      JOIN public.estoque_movimentos m
        ON m.user_id = uid
       AND m.origem_tipo = 'compra_item'
       AND m.origem_id = ci.id
       AND m.tipo_movimento = 'entrada_compra'
      WHERE ci.user_id = uid AND ci.compra_id = registro_id
      ORDER BY ci.insumo_id, ci.id
    LOOP
      INSERT INTO public.estoque_movimentos(
        user_id, insumo_id, quantidade_delta_base, unidade_base,
        tipo_movimento, origem_tipo, origem_id, evento_id,
        reverte_movimento_id, observacao
      ) VALUES (
        uid, movimento.insumo_id, -movimento.quantidade_delta_base,
        movimento.unidade_base, 'estorno', 'compra_item', movimento.item_id,
        evento_id, movimento.movimento_id, 'Estorno por exclusão de compra'
      );
    END LOOP;
  END IF;

  DELETE FROM public.compras
  WHERE id = registro_id AND user_id = uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível excluir a compra.';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.excluir_compra(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_compra(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.excluir_compra(uuid, uuid) IS
  'Exclui permanentemente uma compra do histórico, estornando a entrada no estoque quando necessário e bloqueando contas a pagar não canceladas e desvinculando parcelas canceladas atomicamente.';
