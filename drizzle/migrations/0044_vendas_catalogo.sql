-- Vendas pelo catálogo:
--   1. limite por produto e por dia (conta pedidos de todas as origens, sem cancelados);
--   2. sinal obrigatório (% do total, a partir de um valor), mostrado no acompanhamento;
--   3. produtos sazonais (janela de venda) e kits (componentes com custo somado);
--   4. fidelidade: a cada N pedidos, o seguinte ganha desconto (não soma com cupom);
--   5. avaliação do pedido entregue, com média e comentários no catálogo.
-- Aditiva. As funções do catálogo recebem trocas pontuais conferidas (erro se o trecho
-- esperado não existir) e marcadas com /*0044*/ para não repetir.

BEGIN;

-- 1. Colunas novas ------------------------------------------------------------------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS limite_dia integer,
  ADD COLUMN IF NOT EXISTS venda_de date,
  ADD COLUMN IF NOT EXISTS venda_ate date,
  ADD COLUMN IF NOT EXISTS componentes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_vendas_extras;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_vendas_extras CHECK (
  (limite_dia IS NULL OR limite_dia BETWEEN 1 AND 10000)
  AND (venda_de IS NULL OR venda_ate IS NULL OR venda_de <= venda_ate)
  AND jsonb_typeof(componentes) = 'array' AND jsonb_array_length(componentes) <= 20
);

ALTER TABLE public.confeitarias
  ADD COLUMN IF NOT EXISTS sinal_percentual numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sinal_a_partir_de numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fidelidade_a_cada smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fidelidade_tipo text NOT NULL DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS fidelidade_valor numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitarias_vendas_extras;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_vendas_extras CHECK (
  sinal_percentual BETWEEN 0 AND 100 AND sinal_a_partir_de BETWEEN 0 AND 100000
  AND (fidelidade_a_cada = 0 OR fidelidade_a_cada BETWEEN 2 AND 50)
  AND fidelidade_tipo IN ('percentual', 'valor')
  AND fidelidade_valor >= 0 AND (fidelidade_tipo <> 'percentual' OR fidelidade_valor <= 100) AND fidelidade_valor <= 10000
);
GRANT INSERT (sinal_percentual, sinal_a_partir_de, fidelidade_a_cada, fidelidade_tipo, fidelidade_valor) ON public.confeitarias TO authenticated;
GRANT UPDATE (sinal_percentual, sinal_a_partir_de, fidelidade_a_cada, fidelidade_tipo, fidelidade_valor) ON public.confeitarias TO authenticated;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS sinal_valor numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fidelidade boolean NOT NULL DEFAULT false;

-- 2. Kits: componentes válidos (produtos da mesma confeitaria, sem kit dentro de kit) ----
CREATE OR REPLACE FUNCTION public._validar_componentes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  k jsonb;
  v_comp public.produtos%ROWTYPE;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NEW.componentes IS NULL THEN NEW.componentes := '[]'::jsonb; END IF;
  IF jsonb_array_length(NEW.componentes) > 0
     AND EXISTS (SELECT 1 FROM public.produtos o WHERE o.user_id = NEW.user_id AND o.id <> NEW.id AND o.componentes @> jsonb_build_array(jsonb_build_object('produto_id', NEW.id))) THEN
    RAISE EXCEPTION 'KIT: este produto faz parte de outro kit e não pode virar kit.';
  END IF;
  FOR k IN SELECT * FROM jsonb_array_elements(NEW.componentes) LOOP
    IF jsonb_typeof(k) IS DISTINCT FROM 'object' OR coalesce(k->>'produto_id', '') !~ '^[0-9a-fA-F-]{36}$'
       OR jsonb_typeof(k->'quantidade') IS DISTINCT FROM 'number' OR (k->>'quantidade')::numeric NOT BETWEEN 0.001 AND 1000 THEN
      RAISE EXCEPTION 'KIT: item do kit inválido.';
    END IF;
    SELECT * INTO v_comp FROM public.produtos WHERE id = (k->>'produto_id')::uuid AND user_id = NEW.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'KIT: produto do kit não encontrado.'; END IF;
    IF v_comp.id = NEW.id THEN RAISE EXCEPTION 'KIT: o kit não pode conter ele mesmo.'; END IF;
    IF jsonb_array_length(v_comp.componentes) > 0 THEN RAISE EXCEPTION 'KIT: % já é um kit; não dá para colocar kit dentro de kit.', v_comp.nome; END IF;
    IF v_comp.id = ANY (v_ids) THEN RAISE EXCEPTION 'KIT: % aparece duas vezes no kit.', v_comp.nome; END IF;
    v_ids := v_ids || v_comp.id;
  END LOOP;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._validar_componentes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validar_componentes ON public.produtos;
CREATE TRIGGER trg_validar_componentes BEFORE INSERT OR UPDATE OF componentes ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public._validar_componentes();

-- Custo do kit = receita própria (se houver) + custo dos componentes × quantidade.
DO $custo$
BEGIN
  IF to_regprocedure('public._custo_base_produto(uuid, uuid)') IS NULL THEN
    ALTER FUNCTION public._custo_unitario_produto(uuid, uuid) RENAME TO _custo_base_produto;
  END IF;
END
$custo$;
CREATE OR REPLACE FUNCTION public._custo_unitario_produto(p_produto_id uuid, p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT round(coalesce(public._custo_base_produto(p_produto_id, p_user_id), 0) + coalesce((
    SELECT sum(public._custo_base_produto((k->>'produto_id')::uuid, p_user_id) * (k->>'quantidade')::numeric)
    FROM public.produtos p, jsonb_array_elements(p.componentes) k
    WHERE p.id = p_produto_id AND p.user_id = p_user_id
  ), 0), 4)
$function$;
REVOKE ALL ON FUNCTION public._custo_unitario_produto(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._custo_base_produto(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Avaliações ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL UNIQUE REFERENCES public.pedidos(id) ON DELETE CASCADE,
  nota smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario text CHECK (comentario IS NULL OR char_length(comentario) <= 500),
  cliente_nome text CHECK (cliente_nome IS NULL OR char_length(cliente_nome) <= 60),
  publicada boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avaliacoes_user_idx ON public.avaliacoes (user_id, created_at DESC);
ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.avaliacoes FROM anon;
GRANT SELECT, DELETE ON public.avaliacoes TO authenticated;
GRANT UPDATE (publicada) ON public.avaliacoes TO authenticated;
GRANT ALL ON public.avaliacoes TO service_role;
DROP POLICY IF EXISTS avaliacoes_dono ON public.avaliacoes;
CREATE POLICY avaliacoes_dono ON public.avaliacoes FOR ALL TO authenticated
  USING ((SELECT public._tenant()) = user_id) WITH CHECK ((SELECT public._tenant()) = user_id);
DROP POLICY IF EXISTS acesso_liberado ON public.avaliacoes;
CREATE POLICY acesso_liberado ON public.avaliacoes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()));

-- O cliente avalia pelo link de acompanhamento, uma vez, depois da entrega.
-- Aceita o código curto do link (/p/xxxxxxxxxx) ou o código longo.
CREATE OR REPLACE FUNCTION public.avaliar_pedido(p_codigo text, p_nota integer, p_comentario text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  p public.pedidos%ROWTYPE;
  v_nome text;
  v_texto text := lower(btrim(coalesce(p_codigo, '')));
BEGIN
  SELECT * INTO p FROM public.pedidos
  WHERE origem = 'catalogo'
    AND ((v_texto ~ '^[a-z2-9]{10}$' AND codigo_curto = v_texto)
      OR (v_texto ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND codigo_publico = v_texto::uuid));
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO: pedido não encontrado.'; END IF;
  IF p.status NOT IN ('entregue', 'finalizado') THEN RAISE EXCEPTION 'CATALOGO: a avaliação abre depois da entrega.'; END IF;
  IF p_nota IS NULL OR p_nota NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'CATALOGO: escolha de 1 a 5 estrelas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.avaliacoes WHERE pedido_id = p.id) THEN RAISE EXCEPTION 'CATALOGO: este pedido já foi avaliado. Obrigado!'; END IF;
  SELECT split_part(btrim(nome), ' ', 1) INTO v_nome FROM public.clientes WHERE id = p.cliente_id AND user_id = p.user_id;
  INSERT INTO public.avaliacoes (user_id, pedido_id, nota, comentario, cliente_nome)
  VALUES (p.user_id, p.id, p_nota, nullif(left(btrim(coalesce(p_comentario, '')), 500), ''), nullif(left(v_nome, 60), ''));
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.avaliar_pedido(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.avaliar_pedido(text, integer, text) TO anon, authenticated;

-- Progresso do cliente no programa de fidelidade (pelo WhatsApp informado no catálogo).
CREATE OR REPLACE FUNCTION public.progresso_fidelidade(p_slug text, p_telefone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  c public.confeitarias%ROWTYPE;
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_feitos integer;
BEGIN
  SELECT * INTO c FROM public.confeitarias WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo AND public._catalogo_liberado(user_id);
  IF NOT FOUND OR c.fidelidade_a_cada = 0 OR c.fidelidade_valor <= 0 THEN RETURN NULL; END IF;
  IF char_length(v_tel) IN (12, 13) AND left(v_tel, 2) = '55' THEN v_tel := substr(v_tel, 3); END IF;
  IF char_length(v_tel) NOT IN (10, 11) THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_feitos FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
  WHERE p.user_id = c.user_id AND p.status <> 'cancelado'
    AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel);
  RETURN jsonb_build_object(
    'a_cada', c.fidelidade_a_cada,
    'tipo', c.fidelidade_tipo,
    'valor', c.fidelidade_valor,
    'ganha_agora', v_feitos > 0 AND v_feitos % c.fidelidade_a_cada = 0,
    'faltam', CASE WHEN v_feitos > 0 AND v_feitos % c.fidelidade_a_cada = 0 THEN 0 ELSE c.fidelidade_a_cada - (v_feitos % c.fidelidade_a_cada) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.progresso_fidelidade(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.progresso_fidelidade(text, text) TO anon, authenticated;

-- 4. Trocas pontuais nas funções do catálogo ---------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_funcao regprocedure, p_trocas text[])
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v text := pg_get_functiondef(p_funcao);
  i integer;
BEGIN
  IF position('/*0044*/' IN v) > 0 THEN RETURN; END IF;
  FOR i IN 1 .. array_length(p_trocas, 1) BY 2 LOOP
    IF position(p_trocas[i] IN v) = 0 THEN
      RAISE EXCEPTION 'Migração 0044: trecho esperado não encontrado em %: %', p_funcao, left(p_trocas[i], 120);
    END IF;
    v := replace(v, p_trocas[i], p_trocas[i + 1]);
  END LOOP;
  EXECUTE v;
END;
$function$;

SELECT pg_temp.trocar('public.criar_pedido_catalogo(text, uuid, jsonb, jsonb, jsonb)', ARRAY[
$a$  v_desconto numeric(12,2) := 0;
BEGIN$a$,
$b$  v_desconto numeric(12,2) := 0;
  v_reservado numeric;
  v_limite record;
  v_fidelidade boolean := false;
  v_compras integer;
  v_sinal numeric(12,2) := 0;
BEGIN /*0044*/$b$,

$a$      ON p.id = ci.produto_id AND p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
    WHERE p.id IS NULL$a$,
$b$      ON p.id = ci.produto_id AND p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
      AND (p.venda_de IS NULL OR p.venda_de <= v_hoje) AND (p.venda_ate IS NULL OR p.venda_ate >= v_hoje)
    WHERE p.id IS NULL$b$,

$a$  END LOOP;
  IF v_data < v_hoje + v_antecedencia THEN$a$,
$b$  END LOOP;
  -- Limite por produto e por dia (pedidos de todas as origens, sem cancelados).
  FOR v_limite IN
    SELECT p.id, p.nome, p.limite_dia, sum(ci.quantidade) AS qtd
    FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, opcoes jsonb, quantidade integer)
    JOIN public.produtos p ON p.id = ci.produto_id AND p.user_id = c.user_id
    WHERE p.limite_dia IS NOT NULL
    GROUP BY p.id, p.nome, p.limite_dia
  LOOP
    SELECT coalesce(sum(i.quantidade), 0) INTO v_reservado
    FROM public.pedido_itens i JOIN public.pedidos pe ON pe.id = i.pedido_id AND pe.user_id = i.user_id
    WHERE i.user_id = c.user_id AND i.produto_id = v_limite.id AND pe.data_entrega = v_data AND pe.status <> 'cancelado';
    IF v_reservado + v_limite.qtd > v_limite.limite_dia THEN
      RAISE EXCEPTION 'CATALOGO: % esgotou para %: restam % unidade(s). Diminua a quantidade ou escolha outra data.',
        v_limite.nome, to_char(v_data, 'DD/MM'), trim_scale(greatest(0, v_limite.limite_dia - v_reservado));
    END IF;
  END LOOP;
  IF v_data < v_hoje + v_antecedencia THEN$b$,

$a$  -- Capacidade diária e limites contra abuso.$a$,
$b$  -- Fidelidade: a cada N pedidos, o seguinte ganha desconto (não soma com cupom).
  IF v_codigo_cupom IS NULL AND coalesce(c.fidelidade_a_cada, 0) > 0 AND coalesce(c.fidelidade_valor, 0) > 0 THEN
    SELECT count(*) INTO v_compras FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
    WHERE p.user_id = c.user_id AND p.status <> 'cancelado'
      AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_telefone, '55' || v_telefone);
    IF v_compras > 0 AND v_compras % c.fidelidade_a_cada = 0 THEN
      v_fidelidade := true;
      v_desconto := CASE WHEN c.fidelidade_tipo = 'valor' THEN least(c.fidelidade_valor, v_subtotal)
                         ELSE round(v_subtotal * c.fidelidade_valor / 100, 2) END;
    END IF;
  END IF;

  -- Sinal para confirmar (percentual do total, a partir de um valor).
  IF coalesce(c.sinal_percentual, 0) > 0 AND v_subtotal + v_taxa - v_desconto >= coalesce(c.sinal_a_partir_de, 0) THEN
    v_sinal := round((v_subtotal + v_taxa - v_desconto) * c.sinal_percentual / 100, 2);
  END IF;

  -- Capacidade diária e limites contra abuso.$b$,

$a$      CASE WHEN v_codigo_cupom IS NOT NULL THEN 'Cupom ' || v_codigo_cupom || ': desconto de R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') END),$a$,
$b$      CASE WHEN v_codigo_cupom IS NOT NULL THEN 'Cupom ' || v_codigo_cupom || ': desconto de R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') END,
      CASE WHEN v_fidelidade THEN 'Fidelidade: desconto de R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') || ' (pedido premiado).' END,
      CASE WHEN v_sinal > 0 THEN 'Sinal para confirmar: R$ ' || replace(to_char(v_sinal, 'FM999999990.00'), '.', ',') END),$b$,

$a$origem, codigo_publico, catalogo_token, tipo_entrega, endereco_entrega, cupom_codigo
  ) VALUES ($a$,
$b$origem, codigo_publico, catalogo_token, tipo_entrega, endereco_entrega, cupom_codigo, fidelidade, sinal_valor
  ) VALUES ($b$,

$a$CASE WHEN v_tipo = 'entrega' THEN v_endereco END, v_codigo_cupom
  ) RETURNING id, numero$a$,
$b$CASE WHEN v_tipo = 'entrega' THEN v_endereco END, v_codigo_cupom, v_fidelidade, v_sinal
  ) RETURNING id, numero$b$
]);

SELECT pg_temp.trocar('public.catalogo_publico(text)', ARRAY[
$a$  c public.confeitarias%ROWTYPE;
BEGIN$a$,
$b$  c public.confeitarias%ROWTYPE;
  v_hoje date := public._hoje_confeitaria();
BEGIN /*0044*/$b$,

$a$    'tem_cupons', EXISTS ($a$,
$b$    'sinal_percentual', c.sinal_percentual,
    'sinal_a_partir_de', c.sinal_a_partir_de,
    'fidelidade', CASE WHEN c.fidelidade_a_cada > 0 AND c.fidelidade_valor > 0
      THEN jsonb_build_object('a_cada', c.fidelidade_a_cada, 'tipo', c.fidelidade_tipo, 'valor', c.fidelidade_valor) END,
    'avaliacoes', (
      SELECT CASE WHEN count(*) > 0 THEN jsonb_build_object(
        'media', round(avg(a.nota), 1),
        'total', count(*),
        'ultimas', (SELECT coalesce(jsonb_agg(jsonb_build_object('nota', x.nota, 'comentario', x.comentario, 'cliente', x.cliente_nome, 'data', x.created_at::date) ORDER BY x.created_at DESC), '[]'::jsonb)
                    FROM (SELECT * FROM public.avaliacoes WHERE user_id = c.user_id AND publicada AND comentario IS NOT NULL ORDER BY created_at DESC LIMIT 6) x)
      ) END
      FROM public.avaliacoes a WHERE a.user_id = c.user_id AND a.publicada),
    'tem_cupons', EXISTS ($b$,

$a$        'antecedencia_dias', p.antecedencia_dias,$a$,
$b$        'antecedencia_dias', p.antecedencia_dias,
        'limite_dia', p.limite_dia,
        'venda_ate', p.venda_ate,
        -- Quantidade já reservada por data (só para produtos com limite).
        'reservas', CASE WHEN p.limite_dia IS NOT NULL THEN coalesce((
          SELECT jsonb_object_agg(r.data_entrega, r.qtd) FROM (
            SELECT pe.data_entrega, trim_scale(sum(i.quantidade)) AS qtd
            FROM public.pedido_itens i JOIN public.pedidos pe ON pe.id = i.pedido_id AND pe.user_id = i.user_id
            WHERE i.user_id = c.user_id AND i.produto_id = p.id AND pe.status <> 'cancelado' AND pe.data_entrega >= v_hoje
            GROUP BY pe.data_entrega) r), '{}'::jsonb) END,
        'componentes', CASE WHEN jsonb_array_length(p.componentes) > 0 THEN (
          SELECT jsonb_agg(jsonb_build_object('nome', cp.nome, 'quantidade', (k->>'quantidade')::numeric) ORDER BY kn)
          FROM jsonb_array_elements(p.componentes) WITH ORDINALITY AS kc(k, kn)
          JOIN public.produtos cp ON cp.id = (k->>'produto_id')::uuid AND cp.user_id = c.user_id) END,$b$,

$a$      WHERE p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
    ), '[]'::jsonb)$a$,
$b$      WHERE p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
        AND (p.venda_de IS NULL OR p.venda_de <= v_hoje) AND (p.venda_ate IS NULL OR p.venda_ate >= v_hoje)
    ), '[]'::jsonb)$b$
]);

SELECT pg_temp.trocar('public.acompanhar_pedido_catalogo(uuid)', ARRAY[
$a$  v_cliente text;
BEGIN$a$,
$b$  v_cliente text;
  v_sinal numeric(12,2);
  v_avaliacao public.avaliacoes%ROWTYPE;
BEGIN /*0044*/$b$,

$a$  RETURN jsonb_build_object(
    'numero', p.numero,$a$,
$b$  -- Sinal: o gravado no pedido do catálogo; na encomenda, calculado depois do orçamento.
  v_sinal := CASE
    WHEN coalesce(p.sinal_valor, 0) > 0 THEN least(p.sinal_valor, v_total)
    WHEN p.encomenda AND v_subtotal > 0 AND coalesce(c.sinal_percentual, 0) > 0 AND v_total >= coalesce(c.sinal_a_partir_de, 0)
      THEN round(v_total * c.sinal_percentual / 100, 2)
    ELSE 0 END;
  SELECT * INTO v_avaliacao FROM public.avaliacoes WHERE pedido_id = p.id;

  RETURN jsonb_build_object(
    'numero', p.numero,
    'sinal', v_sinal,
    'encomenda', p.encomenda,
    'pode_avaliar', v_avaliacao.id IS NULL AND p.status IN ('entregue', 'finalizado'),
    'avaliacao', CASE WHEN v_avaliacao.id IS NOT NULL THEN jsonb_build_object('nota', v_avaliacao.nota, 'comentario', v_avaliacao.comentario) END,$b$
]);

NOTIFY pgrst, 'reload schema';

COMMIT;
