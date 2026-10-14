-- Draft migration 0012: freeze recipe inputs while production is still active.
-- ajustar_producao() reverses the difference using the current recipe. To make that
-- correct, recipe quantities and product yield cannot change until all produced
-- quantities referencing that product have been reversed back to zero.

CREATE INDEX pedido_itens_producao_ativa_idx
  ON public.pedido_itens (user_id, produto_id)
  WHERE quantidade_produzida > 0;

CREATE OR REPLACE FUNCTION public.bloquear_receita_com_producao_ativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- On UPDATE, protect both the old and new product. Otherwise moving a recipe
  -- row away from a product with active production could bypass the freeze.
  IF TG_OP <> 'INSERT' AND OLD.produto_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pedido_itens pi
    WHERE pi.user_id = OLD.user_id
      AND pi.produto_id = OLD.produto_id
      AND pi.quantidade_produzida > 0
  ) THEN
    RAISE EXCEPTION
      'Não é possível alterar os ingredientes da receita enquanto houver produção registrada. Reduza a quantidade produzida a zero para estornar o estoque antes de editar a receita.';
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.produto_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pedido_itens pi
    WHERE pi.user_id = NEW.user_id
      AND pi.produto_id = NEW.produto_id
      AND pi.quantidade_produzida > 0
  ) THEN
    RAISE EXCEPTION
      'Não é possível alterar os ingredientes da receita enquanto houver produção registrada. Reduza a quantidade produzida a zero para estornar o estoque antes de editar a receita.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER receita_itens_bloquear_edicao_producao
BEFORE INSERT OR UPDATE OR DELETE ON public.receita_itens
FOR EACH ROW EXECUTE FUNCTION public.bloquear_receita_com_producao_ativa();

CREATE OR REPLACE FUNCTION public.bloquear_rendimento_com_producao_ativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.rendimento IS DISTINCT FROM OLD.rendimento AND EXISTS (
    SELECT 1
    FROM public.pedido_itens pi
    WHERE pi.user_id = NEW.user_id
      AND pi.produto_id = OLD.id
      AND pi.quantidade_produzida > 0
  ) THEN
    RAISE EXCEPTION
      'Não é possível alterar o rendimento enquanto houver produção registrada. Estorne a quantidade produzida a zero antes de alterar a receita.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER produto_bloquear_rendimento_producao
BEFORE UPDATE OF rendimento ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.bloquear_rendimento_com_producao_ativa();

COMMENT ON FUNCTION public.bloquear_receita_com_producao_ativa() IS
  'Prevents recipe inputs from changing while production quantities remain active, so later stock reversals use the same recipe.';
COMMENT ON FUNCTION public.bloquear_rendimento_com_producao_ativa() IS
  'Prevents yield changes while production quantities remain active, so later stock reversals use the same yield.';
