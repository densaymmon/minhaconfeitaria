-- 0055: excluir um produto que já foi produzido em pedidos.
--
-- pedido_itens.produto_id é ON DELETE SET NULL: ao excluir o produto, os itens antigos ficam com o
-- nome, a quantidade, o preço e o custo gravados, só sem o vínculo. Mas o trigger
-- bloquear_edicao_item_com_producao via essa troca como "edição de item produzido" e barrava a
-- exclusão ("Este item já tem produção registrada..."). Agora ele aceita exatamente esse caso:
-- produto_id passando para NULL sem mudar mais nada do item. Qualquer outra edição ou exclusão de
-- item com produção continua bloqueada.
-- Aplicada em produção em 18/11/2026. Idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION public.bloquear_edicao_item_com_producao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.quantidade_produzida, 0) > 0 THEN
    -- A alteração exclusivamente financeira não muda a produção física.
    -- Todo o restante continua bloqueado até existir um fluxo de estorno.
    IF TG_OP = 'UPDATE'
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.pedido_id IS NOT DISTINCT FROM OLD.pedido_id
       AND (NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
            -- 0055: o produto foi excluído (ON DELETE SET NULL); o item guarda nome, quantidades e custo.
            OR (NEW.produto_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = OLD.produto_id)))
       AND NEW.descricao IS NOT DISTINCT FROM OLD.descricao
       AND NEW.quantidade IS NOT DISTINCT FROM OLD.quantidade
       AND NEW.custo_unitario IS NOT DISTINCT FROM OLD.custo_unitario
       AND NEW.quantidade_produzida IS NOT DISTINCT FROM OLD.quantidade_produzida THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Este item já tem produção registrada e não pode ser substituído ou excluído. Estorne a produção por um fluxo próprio antes de editar o pedido.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
