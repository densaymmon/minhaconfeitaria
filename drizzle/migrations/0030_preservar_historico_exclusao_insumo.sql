-- Preserve historical purchase and stock records when an ingredient is removed.
-- Ingredients used by a recipe remain protected. If historical records exist,
-- mark the ingredient inactive instead of deleting rows referenced by the ledger.
CREATE OR REPLACE FUNCTION public.excluir_insumo_se_sem_receita(p_insumo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  possui_historico boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  PERFORM 1
  FROM public.insumos i
  WHERE i.id = p_insumo_id AND i.user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo não encontrado ou sem permissão.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.receita_itens ri
    WHERE ri.insumo_id = p_insumo_id AND ri.user_id = uid
  ) THEN
    RAISE EXCEPTION 'INSUMO_USADO_EM_RECEITA: remova o insumo de todas as receitas antes de excluí-lo.';
  END IF;

  -- Only count purchase rows belonging to this user's purchase. A dangling or
  -- cross-user compra_itens reference must not preserve an unrelated ingredient.
  SELECT
    EXISTS (
      SELECT 1 FROM public.estoque_movimentos em
      WHERE em.insumo_id = p_insumo_id AND em.user_id = uid
    )
    OR EXISTS (
      SELECT 1
      FROM public.compra_itens ci
      JOIN public.compras c ON c.id = ci.compra_id
      WHERE ci.insumo_id = p_insumo_id AND c.user_id = uid
    )
  INTO possui_historico;

  IF possui_historico THEN
    UPDATE public.insumos
    SET ativo = false
    WHERE id = p_insumo_id AND user_id = uid;
    RETURN;
  END IF;

  DELETE FROM public.insumos
  WHERE id = p_insumo_id AND user_id = uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.excluir_insumo_se_sem_receita(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_insumo_se_sem_receita(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.excluir_insumo_se_sem_receita(uuid) IS
  'Remove insumos sem receita; quando há compras ou movimentações, inativa o cadastro para preservar a rastreabilidade histórica.';
NOTIFY pgrst, 'reload schema';
