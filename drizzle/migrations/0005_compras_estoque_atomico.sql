-- Draft migration 0005: atomic purchase saves integrated with the append-only stock ledger.
-- Apply only in an isolated test database after review. Do not run on production yet.

ALTER TABLE public.compras
  ADD COLUMN estoque_integrado boolean NOT NULL DEFAULT false;

-- Event idempotency is separate from movements: one event may contain multiple
-- movements for the same ingredient (e.g. compensating reversal + replacement).
ALTER TABLE public.estoque_movimentos
  DROP CONSTRAINT IF EXISTS estoque_evento_insumo_unico;

CREATE TABLE public.estoque_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  evento_id uuid NOT NULL,
  compra_id uuid,
  tipo text NOT NULL CHECK (tipo IN ('salvar_compra')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estoque_eventos_user_evento_unique UNIQUE (user_id, evento_id)
);

ALTER TABLE public.estoque_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY estoque_eventos_dono_select
  ON public.estoque_eventos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE ALL ON TABLE public.estoque_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.estoque_eventos TO authenticated;
GRANT ALL ON TABLE public.estoque_eventos TO service_role;

-- Prevent direct client writes from bypassing the atomic RPC.
REVOKE INSERT, UPDATE, DELETE ON public.compras, public.compra_itens FROM authenticated;

CREATE OR REPLACE FUNCTION public.salvar_compra(
  payload jsonb,
  itens jsonb,
  registro_id uuid DEFAULT NULL,
  evento_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  rid uuid;
  old_item record;
  item jsonb;
  ins public.insumos;
  iid uuid;
  qty numeric;
  price numeric;
  unit text;
  base_unit text;
  factor numeric;
  integrated boolean := false;
  existing_event public.estoque_eventos;
  new_item_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF evento_id IS NULL THEN RAISE EXCEPTION 'Identificador do evento obrigatório.'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
     OR coalesce(payload->>'data_compra','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Informe uma data de compra válida.';
  END IF;
  IF jsonb_typeof(itens) IS DISTINCT FROM 'array'
     OR jsonb_array_length(itens) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'A compra precisa ter de 1 a 100 itens.';
  END IF;

  -- Serialize retries and concurrent operations for the same idempotency key.
  INSERT INTO public.estoque_eventos(user_id, evento_id, compra_id, tipo)
  VALUES (uid, evento_id, registro_id, 'salvar_compra')
  ON CONFLICT (user_id, evento_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO existing_event
    FROM public.estoque_eventos
    WHERE user_id = uid AND evento_id = salvar_compra.evento_id;
    IF existing_event.compra_id IS NULL THEN
      RAISE EXCEPTION 'Evento repetido sem resultado persistido; tente com um novo identificador.';
    END IF;
    RETURN existing_event.compra_id;
  END IF;

  IF registro_id IS NULL THEN
    INSERT INTO public.compras(user_id, data_compra, estoque_integrado)
    VALUES (uid, (payload->>'data_compra')::date, true)
    RETURNING id INTO rid;
    integrated := true;
  ELSE
    SELECT c.id, c.estoque_integrado INTO rid, integrated
    FROM public.compras c
    WHERE c.id = registro_id AND c.user_id = uid
    FOR UPDATE;
    IF rid IS NULL THEN RAISE EXCEPTION 'Compra não encontrada.'; END IF;

    UPDATE public.compras
    SET data_compra = (payload->>'data_compra')::date
    WHERE id = rid AND user_id = uid;

    -- For previously integrated purchases, append exact reversals for prior
    -- item movements. Legacy purchases remain unintegrated pending physical count.
    IF integrated THEN
      FOR old_item IN
        SELECT ci.id AS compra_item_id, ci.insumo_id, m.id AS movimento_id,
          m.quantidade_delta_base, m.unidade_base
        FROM public.compra_itens ci
        JOIN public.estoque_movimentos m
          ON m.origem_tipo = 'compra_item'
         AND m.origem_id = ci.id
         AND m.user_id = uid
         AND m.tipo_movimento = 'entrada_compra'
        WHERE ci.compra_id = rid AND ci.user_id = uid
      LOOP
        INSERT INTO public.estoque_movimentos(
          user_id, insumo_id, quantidade_delta_base, unidade_base,
          tipo_movimento, origem_tipo, origem_id, evento_id,
          reverte_movimento_id, observacao
        ) VALUES (
          uid, old_item.insumo_id, -old_item.quantidade_delta_base,
          old_item.unidade_base, 'estorno', 'compra_item', old_item.compra_item_id,
          evento_id, old_item.movimento_id, 'Estorno automático por edição de compra'
        );
      END LOOP;
    END IF;

    DELETE FROM public.compra_itens
    WHERE compra_id = rid AND user_id = uid;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(itens) LOOP
    BEGIN
      iid := (item->>'insumo_id')::uuid;
      qty := (item->>'quantidade')::numeric;
      price := (item->>'preco_unitario')::numeric;
      unit := item->>'unidade';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Um item da compra contém dados inválidos.';
    END;

    IF qty IS NULL OR qty <= 0 OR qty::text IN ('NaN','Infinity','-Infinity')
       OR price IS NULL OR price < 0 OR price::text IN ('NaN','Infinity','-Infinity')
       OR unit NOT IN ('g','kg','L','un') THEN
      RAISE EXCEPTION 'Confira a quantidade, a unidade e o preço dos itens.';
    END IF;

    SELECT * INTO ins FROM public.insumos
    WHERE id = iid AND user_id = uid
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insumo inválido ou sem permissão.'; END IF;

    base_unit := public.medida_base(unit);
    factor := public.medida_fator(unit);
    IF base_unit IS NULL OR factor IS NULL
       OR base_unit IS DISTINCT FROM public.medida_base(coalesce(ins.unidade_embalagem, ins.unidade)) THEN
      RAISE EXCEPTION 'Unidade incompatível com o insumo "%".', ins.nome;
    END IF;

    INSERT INTO public.compra_itens(
      user_id, compra_id, insumo_id, quantidade, unidade, preco_unitario
    ) VALUES (uid, rid, iid, qty, unit, price)
    RETURNING id INTO new_item_id;

    IF integrated THEN
      INSERT INTO public.estoque_movimentos(
        user_id, insumo_id, quantidade_delta_base, unidade_base,
        tipo_movimento, origem_tipo, origem_id, evento_id, observacao
      ) VALUES (
        uid, iid, qty * factor, base_unit,
        'entrada_compra', 'compra_item', new_item_id, evento_id,
        'Entrada automática de compra'
      );
    END IF;
  END LOOP;

  UPDATE public.estoque_eventos
  SET compra_id = rid
  WHERE user_id = uid AND estoque_eventos.evento_id = salvar_compra.evento_id;

  RETURN rid;
END;
$function$;

REVOKE ALL ON FUNCTION public.salvar_compra(jsonb,jsonb,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_compra(jsonb,jsonb,uuid,uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.compras.estoque_integrado IS
  'False for legacy purchases pending physical inventory confirmation. New purchases saved through salvar_compra are integrated into the stock ledger.';
COMMENT ON FUNCTION public.salvar_compra(jsonb,jsonb,uuid,uuid) IS
  'Atomic/idempotent purchase save. New purchases affect stock; legacy purchases remain excluded until inventory reconciliation. Edits append compensating reversals rather than rewriting ledger history.';
