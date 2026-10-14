-- Draft migration 0007: physical inventory reconciliation.
-- Apply only in an isolated test database after reviewing migrations 0004-0006.
-- No legacy purchase is imported automatically; this function reconciles against
-- the current ledger balance explicitly supplied by the user.

CREATE TABLE public.inventario_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  evento_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventario_evento_unico UNIQUE (user_id, evento_id)
);

ALTER TABLE public.inventario_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventario_eventos FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.inventario_eventos TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_inventario_fisico(
  itens jsonb,
  evento_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  item jsonb;
  ins public.insumos;
  iid uuid;
  qtd numeric;
  unidade text;
  saldo_atual numeric;
  delta numeric;
  evento_existente public.inventario_eventos;
  tem_movimentos boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF evento_id IS NULL THEN RAISE EXCEPTION 'Identificador do inventário obrigatório.'; END IF;
  IF jsonb_typeof(itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Os itens do inventário precisam ser enviados como uma lista.';
  END IF;
  IF jsonb_array_length(itens) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Informe de 1 a 200 insumos para conferir o estoque.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(itens) AS t(value)
    GROUP BY value->>'insumo_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada insumo deve aparecer apenas uma vez no inventário.';
  END IF;

  INSERT INTO public.inventario_eventos(user_id, evento_id, payload)
  VALUES (uid, evento_id, itens)
  ON CONFLICT (user_id, evento_id) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO evento_existente
    FROM public.inventario_eventos
    WHERE user_id = uid AND inventario_eventos.evento_id = registrar_inventario_fisico.evento_id;
    IF evento_existente.payload IS DISTINCT FROM itens THEN
      RAISE EXCEPTION 'Este identificador de inventário já foi usado com outros dados. Atualize e tente novamente.';
    END IF;
    RETURN true;
  END IF;

  -- Consistent lock ordering reduces deadlocks when two inventory sessions overlap.
  FOR item IN
    SELECT value FROM jsonb_array_elements(itens)
    ORDER BY value->>'insumo_id'
  LOOP
    BEGIN
      iid := (item->>'insumo_id')::uuid;
      qtd := (item->>'quantidade_fisica')::numeric;
      unidade := item->>'unidade_base';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Um item do inventário contém dados inválidos.';
    END;

    IF qtd IS NULL OR qtd < 0 OR qtd::text IN ('NaN','Infinity','-Infinity')
       OR unidade NOT IN ('g','ml','un') THEN
      RAISE EXCEPTION 'Informe quantidades físicas não negativas em g, ml ou un.';
    END IF;

    SELECT * INTO ins FROM public.insumos
    WHERE id = iid AND user_id = uid
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insumo inválido ou sem permissão.'; END IF;

    IF public.medida_base(coalesce(ins.unidade_embalagem, ins.unidade)) IS DISTINCT FROM unidade THEN
      RAISE EXCEPTION 'A unidade informada não corresponde à medida do insumo "%".', ins.nome;
    END IF;

    SELECT coalesce(sum(m.quantidade_delta_base), 0)
      INTO saldo_atual
    FROM public.estoque_movimentos m
    WHERE m.user_id = uid AND m.insumo_id = iid;

    delta := qtd - saldo_atual;
    IF delta <> 0 THEN
      SELECT EXISTS (
        SELECT 1 FROM public.estoque_movimentos m
        WHERE m.user_id = uid AND m.insumo_id = iid
      ) INTO tem_movimentos;

      INSERT INTO public.estoque_movimentos(
        user_id, insumo_id, quantidade_delta_base, unidade_base,
        tipo_movimento, origem_tipo, origem_id, evento_id, observacao
      ) VALUES (
        uid, iid, delta, unidade,
        CASE WHEN tem_movimentos THEN 'ajuste_manual' ELSE 'inventario_inicial' END,
        CASE WHEN tem_movimentos THEN 'ajuste' ELSE 'inventario' END,
        iid, evento_id,
        CASE WHEN tem_movimentos
          THEN 'Ajuste pela contagem física do estoque'
          ELSE 'Saldo inicial definido pela contagem física'
        END
      );
    END IF;
  END LOOP;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_inventario_fisico(jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_inventario_fisico(jsonb,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.registrar_inventario_fisico(jsonb,uuid) IS
  'Reconciles a user-confirmed physical count against the append-only stock ledger. Legacy purchases are not imported; differences are appended as inventory or adjustment movements.';
