-- Allow recipe/yield edits when production is only historical (closed orders).
-- Keep the freeze for open orders, and freeze production quantity changes after
-- delivery so a later reversal can never be calculated from a newly edited recipe.
-- Existing stock movements and production snapshots are not modified.

CREATE OR REPLACE FUNCTION public.bloquear_receita_com_producao_ativa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  produto_lock uuid;
BEGIN
  -- Serialize recipe edits with production and lock products in stable order.
  IF TG_OP = 'UPDATE' THEN
    FOR produto_lock IN
      SELECT p.id
      FROM public.produtos p
      WHERE (p.id = OLD.produto_id AND p.user_id = OLD.user_id)
         OR (p.id = NEW.produto_id AND p.user_id = NEW.user_id)
      ORDER BY p.id
      FOR UPDATE
    LOOP
      NULL;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public.produtos p
    WHERE p.id = OLD.produto_id AND p.user_id = OLD.user_id
    FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.produtos p
    WHERE p.id = NEW.produto_id AND p.user_id = NEW.user_id
    FOR UPDATE;
  END IF;

  -- Only open orders lock the recipe. Historical production on closed orders
  -- must not prevent future recipe maintenance.
  IF TG_OP <> 'INSERT' AND OLD.produto_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = OLD.user_id
      AND pi.produto_id = OLD.produto_id
      AND coalesce(pi.quantidade_produzida, 0) > 0
      AND lower(trim(coalesce(p.status, ''))) NOT IN
          ('entregue', 'finalizado', 'cancelado', 'perdido')
  ) THEN
    RAISE EXCEPTION
      'Não é possível alterar a receita enquanto houver produção em pedidos abertos. Finalize o pedido ou estorne a produção antes de editar.';
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.produto_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = NEW.user_id
      AND pi.produto_id = NEW.produto_id
      AND coalesce(pi.quantidade_produzida, 0) > 0
      AND lower(trim(coalesce(p.status, ''))) NOT IN
          ('entregue', 'finalizado', 'cancelado', 'perdido')
  ) THEN
    RAISE EXCEPTION
      'Não é possível alterar a receita enquanto houver produção em pedidos abertos. Finalize o pedido ou estorne a produção antes de editar.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

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
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = NEW.user_id
      AND pi.produto_id = OLD.id
      AND coalesce(pi.quantidade_produzida, 0) > 0
      AND lower(trim(coalesce(p.status, ''))) NOT IN
          ('entregue', 'finalizado', 'cancelado', 'perdido')
  ) THEN
    RAISE EXCEPTION
      'Não é possível alterar o rendimento enquanto houver produção em pedidos abertos. Finalize o pedido ou estorne a produção antes de alterar a receita.';
  END IF;
  RETURN NEW;
END;
$function$;

-- A produção encerrada é imutável neste fluxo. This prevents an adjustment
-- from using a changed recipe to reverse stock consumption from old production.
CREATE OR REPLACE FUNCTION public.bloquear_ajuste_producao_pedido_encerrado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  pedido_status text;
BEGIN
  IF NEW.quantidade_produzida IS NOT DISTINCT FROM OLD.quantidade_produzida THEN
    RETURN NEW;
  END IF;

  SELECT lower(trim(coalesce(p.status, '')))
    INTO pedido_status
  FROM public.pedidos p
  WHERE p.id = OLD.pedido_id
    AND p.user_id = OLD.user_id;

  IF pedido_status IN ('entregue', 'finalizado', 'cancelado', 'perdido') THEN
    RAISE EXCEPTION
      'A produção deste pedido encerrado é histórica e não pode ser alterada por este fluxo. O estoque foi preservado.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS pedido_item_bloquear_ajuste_encerrado ON public.pedido_itens;
CREATE TRIGGER pedido_item_bloquear_ajuste_encerrado
BEFORE UPDATE OF quantidade_produzida ON public.pedido_itens
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_ajuste_producao_pedido_encerrado();

COMMENT ON FUNCTION public.bloquear_receita_com_producao_ativa() IS
  'Blocks recipe changes only while produced quantities belong to open orders; closed-order history does not lock recipe maintenance.';
COMMENT ON FUNCTION public.bloquear_rendimento_com_producao_ativa() IS
  'Blocks yield changes only while produced quantities belong to open orders.';
COMMENT ON FUNCTION public.bloquear_ajuste_producao_pedido_encerrado() IS
  'Prevents post-close production adjustments from reversing historical stock using a recipe that may have changed.';
