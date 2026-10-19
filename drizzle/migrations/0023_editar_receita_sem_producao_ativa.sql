-- Block recipe edits while any related order is open, even before production starts.
-- Closed orders do not lock recipe maintenance; historical stock snapshots remain unchanged.

CREATE OR REPLACE FUNCTION public.bloquear_receita_com_producao_ativa()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE produto_lock uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR produto_lock IN
      SELECT p.id FROM public.produtos p
      WHERE (p.id = OLD.produto_id AND p.user_id = OLD.user_id)
         OR (p.id = NEW.produto_id AND p.user_id = NEW.user_id)
      ORDER BY p.id FOR UPDATE
    LOOP NULL; END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public.produtos p WHERE p.id = OLD.produto_id AND p.user_id = OLD.user_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.produtos p WHERE p.id = NEW.produto_id AND p.user_id = NEW.user_id FOR UPDATE;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.produto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = OLD.user_id AND pi.produto_id = OLD.produto_id
      AND lower(trim(coalesce(p.status, ''))) NOT IN ('entregue','finalizado','cancelado','perdido')
  ) THEN
    RAISE EXCEPTION 'Não é possível alterar os ingredientes da receita enquanto houver produção registrada em pedido aberto. Finalize ou estorne a produção antes de editar.';
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.produto_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = NEW.user_id AND pi.produto_id = NEW.produto_id
      AND lower(trim(coalesce(p.status, ''))) NOT IN ('entregue','finalizado','cancelado','perdido')
  ) THEN
    RAISE EXCEPTION 'Não é possível alterar os ingredientes da receita enquanto houver produção registrada em pedido aberto. Finalize ou estorne a produção antes de editar.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bloquear_rendimento_com_producao_ativa()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.rendimento IS DISTINCT FROM OLD.rendimento AND EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.user_id = NEW.user_id AND pi.produto_id = OLD.id
      AND lower(trim(coalesce(p.status, ''))) NOT IN ('entregue','finalizado','cancelado','perdido')
  ) THEN
    RAISE EXCEPTION 'Não é possível alterar o rendimento enquanto houver produção registrada em pedido aberto. Finalize ou estorne a produção antes de editar.';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.bloquear_receita_com_producao_ativa() IS
  'Blocks recipe edits only while any related order is open; closed orders do not lock recipe maintenance.';
COMMENT ON FUNCTION public.bloquear_rendimento_com_producao_ativa() IS
  'Blocks yield edits while any related order is open.';
NOTIFY pgrst, 'reload schema';
