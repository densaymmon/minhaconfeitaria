-- Draft migration 0009: preserve order/product context and recipe snapshots
-- when save_pedido replaces pedido_itens rows. Stock ledger rows remain append-only.

ALTER TABLE public.producao_eventos
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_numero bigint,
  ADD COLUMN IF NOT EXISTS produto_id uuid,
  ADD COLUMN IF NOT EXISTS descricao_snapshot text,
  ADD COLUMN IF NOT EXISTS quantidade_pedida_snapshot numeric(12,3),
  ADD COLUMN IF NOT EXISTS receita_snapshot jsonb;

ALTER TABLE public.estoque_movimentos
  ADD COLUMN IF NOT EXISTS pedido_id uuid,
  ADD COLUMN IF NOT EXISTS pedido_numero bigint,
  ADD COLUMN IF NOT EXISTS produto_id uuid,
  ADD COLUMN IF NOT EXISTS descricao_snapshot text;

CREATE OR REPLACE FUNCTION public.snapshot_producao_evento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  SELECT pi.pedido_id, p.numero, pi.produto_id, pi.descricao, pi.quantidade
    INTO NEW.pedido_id, NEW.pedido_numero, NEW.produto_id,
         NEW.descricao_snapshot, NEW.quantidade_pedida_snapshot
  FROM public.pedido_itens pi
  JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
  WHERE pi.id = NEW.pedido_item_id AND pi.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O item do pedido não existe para registrar o histórico de produção.';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'insumo_id', ri.insumo_id,
        'insumo_nome', i.nome,
        'quantidade_utilizada', coalesce(ri.quantidade_utilizada, ri.quantidade),
        'unidade_receita', coalesce(ri.unidade_receita, i.unidade),
        'quantidade_unidade_legacy', ri.quantidade
      ) ORDER BY i.nome
    ),
    '[]'::jsonb
  )
  INTO NEW.receita_snapshot
  FROM public.receita_itens ri
  JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = NEW.user_id
  WHERE ri.produto_id = NEW.produto_id AND ri.user_id = NEW.user_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS producao_evento_snapshot ON public.producao_eventos;
CREATE TRIGGER producao_evento_snapshot
BEFORE INSERT ON public.producao_eventos
FOR EACH ROW EXECUTE FUNCTION public.snapshot_producao_evento();

CREATE OR REPLACE FUNCTION public.snapshot_movimento_producao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.origem_tipo = 'producao' AND NEW.origem_id IS NOT NULL THEN
    SELECT pi.pedido_id, p.numero, pi.produto_id, pi.descricao
      INTO NEW.pedido_id, NEW.pedido_numero, NEW.produto_id, NEW.descricao_snapshot
    FROM public.pedido_itens pi
    JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
    WHERE pi.id = NEW.origem_id AND pi.user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS estoque_movimento_producao_snapshot ON public.estoque_movimentos;
CREATE TRIGGER estoque_movimento_producao_snapshot
BEFORE INSERT ON public.estoque_movimentos
FOR EACH ROW EXECUTE FUNCTION public.snapshot_movimento_producao();

-- Backfill context for any draft/test data already present before these triggers.
UPDATE public.producao_eventos pe
SET pedido_id = pi.pedido_id,
    pedido_numero = p.numero,
    produto_id = pi.produto_id,
    descricao_snapshot = pi.descricao,
    quantidade_pedida_snapshot = pi.quantidade,
    receita_snapshot = coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'insumo_id', ri.insumo_id,
          'insumo_nome', i.nome,
          'quantidade_utilizada', coalesce(ri.quantidade_utilizada, ri.quantidade),
          'unidade_receita', coalesce(ri.unidade_receita, i.unidade),
          'quantidade_unidade_legacy', ri.quantidade
        ) ORDER BY i.nome
      )
      FROM public.receita_itens ri
      JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = pe.user_id
      WHERE ri.produto_id = pi.produto_id AND ri.user_id = pe.user_id
    ), '[]'::jsonb)
FROM public.pedido_itens pi
JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
WHERE pi.id = pe.pedido_item_id AND pi.user_id = pe.user_id;

UPDATE public.estoque_movimentos m
SET pedido_id = pi.pedido_id,
    pedido_numero = p.numero,
    produto_id = pi.produto_id,
    descricao_snapshot = pi.descricao
FROM public.pedido_itens pi
JOIN public.pedidos p ON p.id = pi.pedido_id AND p.user_id = pi.user_id
WHERE m.origem_tipo = 'producao'
  AND m.origem_id = pi.id
  AND m.user_id = pi.user_id;

CREATE INDEX IF NOT EXISTS producao_eventos_pedido_idx
  ON public.producao_eventos (user_id, pedido_id, created_at);
CREATE INDEX IF NOT EXISTS estoque_movimentos_pedido_idx
  ON public.estoque_movimentos (user_id, pedido_id, created_at);

COMMENT ON COLUMN public.producao_eventos.receita_snapshot IS
  'Recipe as it existed when this production event was recorded; retained if the order item or current recipe is later edited.';
COMMENT ON COLUMN public.estoque_movimentos.pedido_id IS
  'Snapshot reference to the order associated with production movement; intentionally has no foreign key so ledger history survives order edits/deletion.';
