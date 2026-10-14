-- Draft migration 0010: prevent edits from orphaning production consumption.
-- save_pedido() replaces pedido_itens rows on edit. Once production has been
-- recorded, deleting/replacing those rows would reset quantidade_produzida and
-- allow a later retry to consume the same ingredients again. Until a dedicated
-- production-reversal/edit workflow exists, fail closed and preserve the ledger.

CREATE OR REPLACE FUNCTION public.bloquear_edicao_item_com_producao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  item_id uuid;
  uid uuid;
BEGIN
  item_id := OLD.id;
  uid := OLD.user_id;

  IF EXISTS (
    SELECT 1
    FROM public.producao_eventos pe
    WHERE pe.user_id = uid
      AND pe.pedido_item_id = item_id
  ) OR coalesce(OLD.quantidade_produzida, 0) > 0 THEN
    RAISE EXCEPTION
      'Este item já tem produção registrada e não pode ser substituído ou excluído. Estorne a produção por um fluxo próprio antes de editar o pedido.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER pedido_item_bloquear_delete_com_producao
BEFORE DELETE ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_item_com_producao();

CREATE TRIGGER pedido_item_bloquear_alteracao_com_producao
BEFORE UPDATE OF pedido_id, produto_id, descricao, quantidade ON public.pedido_itens
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_item_com_producao();

-- Report the compatible stock base unit based on the configured package/recipe
-- measure, not only the legacy unit. This allows packages configured as 500 g,
-- 1 L, or a countable quantity to show the same base unit used by the ledger.
CREATE OR REPLACE FUNCTION public.saldo_estoque()
RETURNS TABLE (
  insumo_id uuid,
  nome text,
  unidade_base text,
  saldo numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    i.id,
    i.nome,
    CASE
      WHEN coalesce(i.unidade_embalagem, i.unidade) IN ('kg', 'g') THEN 'g'
      WHEN coalesce(i.unidade_embalagem, i.unidade) IN ('L', 'ml') THEN 'ml'
      WHEN coalesce(i.unidade_embalagem, i.unidade) IN ('un', 'unidade', 'dúzia') THEN 'un'
      ELSE NULL
    END AS unidade_base,
    coalesce(sum(m.quantidade_delta_base), 0)::numeric AS saldo
  FROM public.insumos i
  LEFT JOIN public.estoque_movimentos m
    ON m.insumo_id = i.id
   AND m.user_id = i.user_id
  WHERE i.user_id = auth.uid()
  GROUP BY i.id, i.nome, i.unidade, i.unidade_embalagem
  ORDER BY i.nome;
$function$;

REVOKE ALL ON FUNCTION public.saldo_estoque() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_estoque() TO authenticated, service_role;

COMMENT ON FUNCTION public.bloquear_edicao_item_com_producao() IS
  'Fail-closed protection while save_pedido replaces item rows: prevents edits/deletes from resetting produced quantities and duplicating ingredient consumption.';
COMMENT ON FUNCTION public.saldo_estoque() IS
  'Returns stock balance in the configured compatible base unit (g, ml, un) based on package measure; package-only units remain undefined until configured.';
