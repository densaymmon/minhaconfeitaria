-- Draft migration 0006: atomic production quantity changes and stock consumption.
-- Apply only after migrations 0000-0005 pass in an isolated database.
CREATE TABLE public.producao_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  evento_id uuid NOT NULL,
  pedido_item_id uuid NOT NULL,
  quantidade_resultado numeric(12,3) NOT NULL CHECK (quantidade_resultado >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producao_evento_unico UNIQUE (user_id, evento_id)
);
ALTER TABLE public.producao_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY producao_eventos_dono_select ON public.producao_eventos
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON TABLE public.producao_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.producao_eventos TO authenticated;
GRANT ALL ON TABLE public.producao_eventos TO service_role;

CREATE OR REPLACE FUNCTION public.ajustar_producao(
  pedido_item_id uuid,
  quantidade_resultado numeric,
  evento_id uuid
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  uid uuid := auth.uid();
  pi public.pedido_itens;
  p public.produtos;
  item_receita record;
  existente public.producao_eventos;
  delta numeric;
  consumo_base numeric;
  unidade_base text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF evento_id IS NULL THEN RAISE EXCEPTION 'Identificador do evento obrigatório.'; END IF;
  IF quantidade_resultado IS NULL OR quantidade_resultado::text IN ('NaN','Infinity','-Infinity')
     OR quantidade_resultado < 0 THEN
    RAISE EXCEPTION 'Quantidade produzida inválida.';
  END IF;
  IF quantidade_resultado <> round(quantidade_resultado, 3) THEN
    RAISE EXCEPTION 'A quantidade produzida aceita no máximo três casas decimais.';
  END IF;

  SELECT * INTO existente FROM public.producao_eventos
    WHERE user_id = uid AND producao_eventos.evento_id = ajustar_producao.evento_id;
  IF FOUND THEN
    IF existente.pedido_item_id <> ajustar_producao.pedido_item_id
       OR existente.quantidade_resultado <> ajustar_producao.quantidade_resultado THEN
      RAISE EXCEPTION 'Este identificador de evento já foi usado com outros dados.';
    END IF;
    RETURN existente.quantidade_resultado;
  END IF;

  SELECT * INTO pi FROM public.pedido_itens
    WHERE id = ajustar_producao.pedido_item_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item do pedido não encontrado.'; END IF;
  IF quantidade_resultado > pi.quantidade THEN
    RAISE EXCEPTION 'A quantidade produzida não pode superar a quantidade do pedido.';
  END IF;

  INSERT INTO public.producao_eventos(user_id, evento_id, pedido_item_id, quantidade_resultado)
    VALUES (uid, evento_id, pi.id, quantidade_resultado);

  delta := quantidade_resultado - pi.quantidade_produzida;
  IF delta <> 0 AND pi.produto_id IS NOT NULL THEN
    SELECT * INTO p FROM public.produtos
      WHERE id = pi.produto_id AND user_id = uid FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto da receita não encontrado.'; END IF;

    FOR item_receita IN
      SELECT ri.insumo_id, ri.quantidade_utilizada, ri.unidade_receita,
             ri.quantidade, i.unidade, i.unidade_embalagem
      FROM public.receita_itens ri
      JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = uid
      WHERE ri.produto_id = p.id AND ri.user_id = uid
      ORDER BY ri.insumo_id
      FOR SHARE OF i
    LOOP
      unidade_base := public.medida_base(coalesce(item_receita.unidade_receita, item_receita.unidade));
      IF unidade_base NOT IN ('g','ml','un') THEN
        RAISE EXCEPTION 'O insumo de pacote precisa ter seu conteúdo convertido para peso, volume ou unidade antes de usar a baixa automática.';
      END IF;
      IF p.rendimento IS NULL OR p.rendimento <= 0 THEN
        RAISE EXCEPTION 'O rendimento da receita precisa ser maior que zero.';
      END IF;
      consumo_base := coalesce(item_receita.quantidade_utilizada, item_receita.quantidade)
        * public.medida_fator(coalesce(item_receita.unidade_receita, item_receita.unidade))
        / p.rendimento * delta;

      IF consumo_base <> 0 THEN
        INSERT INTO public.estoque_movimentos(
          user_id, insumo_id, quantidade_delta_base, unidade_base, tipo_movimento,
          origem_tipo, origem_id, evento_id, observacao
        ) VALUES (
          uid, item_receita.insumo_id, -consumo_base, unidade_base,
          CASE WHEN delta > 0 THEN 'saida_producao' ELSE 'estorno' END,
          'producao', pi.id, evento_id,
          CASE WHEN delta > 0 THEN 'Consumo automático por produção' ELSE 'Estorno por redução da quantidade produzida' END
        );
      END IF;
    END LOOP;
  END IF;

  UPDATE public.pedido_itens SET quantidade_produzida = quantidade_resultado
    WHERE id = pi.id AND user_id = uid;
  RETURN quantidade_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.ajustar_producao(uuid,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_producao(uuid,numeric,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.ajustar_producao(uuid,numeric,uuid) IS
  'Atomically records the produced quantity and ingredient consumption delta. Corrections append compensating stock movements; negative stock is allowed.';
