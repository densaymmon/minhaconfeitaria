-- Corrige a RPC chamada pela tela de produção.
-- A operação é transacional: quantidade produzida e movimentos de estoque são
-- persistidos juntos. Cada evento é idempotente e o consumo usa apenas a diferença.

CREATE TABLE IF NOT EXISTS public.producao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  evento_id uuid NOT NULL,
  pedido_item_id uuid NOT NULL,
  quantidade_resultado numeric(18,6) NOT NULL,
  quantidade_resultante numeric(18,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producao_eventos_user_evento_unique UNIQUE (user_id, evento_id)
);

ALTER TABLE public.producao_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS producao_eventos_dono_select ON public.producao_eventos;
CREATE POLICY producao_eventos_dono_select
  ON public.producao_eventos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
REVOKE ALL ON TABLE public.producao_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.producao_eventos TO authenticated;
GRANT ALL ON TABLE public.producao_eventos TO service_role;

CREATE OR REPLACE FUNCTION public.ajustar_producao(
  evento_id uuid,
  pedido_item_id uuid,
  quantidade_resultado numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  item public.pedido_itens%ROWTYPE;
  produto public.produtos%ROWTYPE;
  evento_existente public.producao_eventos%ROWTYPE;
  delta numeric;
  rendimento numeric;
  receita record;
  base_unit text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF evento_id IS NULL OR pedido_item_id IS NULL THEN
    RAISE EXCEPTION 'Identificador do evento e do item são obrigatórios.';
  END IF;
  IF quantidade_resultado IS NULL
     OR quantidade_resultado < 0
     OR quantidade_resultado::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'A quantidade produzida informada é inválida.';
  END IF;

  -- Bloqueia o item para serializar cliques concorrentes e calcular só a diferença.
  SELECT pi.* INTO item
  FROM public.pedido_itens pi
  JOIN public.pedidos p ON p.id = pi.pedido_id
  WHERE pi.id = pedido_item_id
    AND pi.user_id = uid
    AND p.user_id = uid
  FOR UPDATE OF pi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item do pedido não encontrado ou sem permissão.';
  END IF;
  IF quantidade_resultado > item.quantidade THEN
    RAISE EXCEPTION 'A quantidade produzida não pode exceder a quantidade do pedido (%).', item.quantidade;
  END IF;

  -- Repetir o mesmo evento não deve repetir baixa/estorno de estoque.
  SELECT * INTO evento_existente
  FROM public.producao_eventos pe
  WHERE pe.user_id = uid AND pe.evento_id = ajustar_producao.evento_id;

  IF FOUND THEN
    IF evento_existente.pedido_item_id <> pedido_item_id
       OR evento_existente.quantidade_resultado <> quantidade_resultado THEN
      RAISE EXCEPTION 'Este identificador de evento já foi usado para outra operação.';
    END IF;
    RETURN evento_existente.quantidade_resultante;
  END IF;

  delta := quantidade_resultado - coalesce(item.quantidade_produzida, 0);

  IF delta <> 0 AND item.produto_id IS NOT NULL THEN
    SELECT pr.* INTO produto
    FROM public.produtos pr
    WHERE pr.id = item.produto_id AND pr.user_id = uid
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto vinculado ao item não encontrado.';
    END IF;

    rendimento := CASE WHEN coalesce(produto.rendimento, 0) > 0
                       THEN produto.rendimento ELSE 1 END;

    -- Consolida linhas repetidas da receita por insumo. Consumo negativo
    -- (redução da produção) gera um movimento positivo de estorno.
    FOR receita IN
      SELECT
        ri.insumo_id,
        i.nome AS insumo_nome,
        public.medida_base(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade)) AS unidade_base,
        sum(
          coalesce(ri.quantidade_utilizada, ri.quantidade)
          * public.medida_fator(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade))
        ) * delta / rendimento AS quantidade_delta
      FROM public.receita_itens ri
      JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid
      WHERE ri.produto_id = item.produto_id AND ri.user_id = uid
      GROUP BY ri.insumo_id, i.nome,
        public.medida_base(coalesce(ri.unidade_receita, i.unidade_embalagem, i.unidade))
    LOOP
      IF receita.unidade_base IS NULL OR receita.unidade_base NOT IN ('g', 'ml', 'un') THEN
        RAISE EXCEPTION 'Unidade incompatível ou não configurada para o insumo "%".', receita.insumo_nome;
      END IF;
      IF receita.quantidade_delta IS NULL
         OR receita.quantidade_delta::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'Não foi possível calcular o consumo do insumo "%".', receita.insumo_nome;
      END IF;
      IF receita.quantidade_delta <> 0 THEN
        INSERT INTO public.estoque_movimentos (
          user_id, insumo_id, quantidade_delta_base, unidade_base,
          tipo_movimento, origem_tipo, origem_id, evento_id, observacao
        ) VALUES (
          uid,
          receita.insumo_id,
          -receita.quantidade_delta,
          receita.unidade_base,
          CASE WHEN delta > 0 THEN 'saida_producao' ELSE 'estorno' END,
          'producao',
          pedido_item_id,
          evento_id,
          CASE WHEN delta > 0
            THEN 'Consumo automático por aumento da produção'
            ELSE 'Estorno automático por redução da produção'
          END
        );
      END IF;
    END LOOP;
  END IF;

  UPDATE public.pedido_itens
  SET quantidade_produzida = quantidade_resultado
  WHERE id = pedido_item_id AND user_id = uid;

  INSERT INTO public.producao_eventos (
    user_id, evento_id, pedido_item_id,
    quantidade_resultado, quantidade_resultante
  ) VALUES (
    uid, evento_id, pedido_item_id,
    quantidade_resultado, quantidade_resultado
  );

  RETURN quantidade_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.ajustar_producao(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_producao(uuid, uuid, numeric) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
