-- Allow deleting an ingredient only when no recipe uses it.
-- For eligible ingredients, dependent purchase lines and stock movements are removed
-- in the same transaction so historical foreign keys do not block the requested deletion.
CREATE OR REPLACE FUNCTION public.excluir_insumo_se_sem_receita(p_insumo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.';
  END IF;

  PERFORM 1
  FROM public.insumos i
  WHERE i.id = p_insumo_id
    AND i.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insumo não encontrado ou sem permissão.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.receita_itens ri
    WHERE ri.insumo_id = p_insumo_id
  ) THEN
    RAISE EXCEPTION 'INSUMO_USADO_EM_RECEITA: remova o insumo de todas as receitas antes de excluí-lo.';
  END IF;

  DELETE FROM public.estoque_movimentos
  WHERE insumo_id = p_insumo_id;

  DELETE FROM public.compra_itens
  WHERE insumo_id = p_insumo_id;

  DELETE FROM public.insumos
  WHERE id = p_insumo_id
    AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_insumo_se_sem_receita(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_insumo_se_sem_receita(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
