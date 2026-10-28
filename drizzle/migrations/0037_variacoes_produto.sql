-- Variações de produto (tamanho, sabor, recheio...).
--   * produtos.opcoes: [{"grupo": "Tamanho", "itens": [{"nome": "G", "preco": 20, "custo": 8}]}]
--     "preco" é o acréscimo (pode ser negativo) somado ao preço de venda; "custo" é o acréscimo de custo.
--     Cada grupo é de escolha única e obrigatória. Até 5 grupos e 15 opções por grupo.
--   * criar_pedido_catalogo recebe "opcoes": {"Tamanho": "G"} em cada item, valida a escolha e calcula
--     preço, custo e descrição no servidor.
--   * catalogo_publico devolve as opções sem o custo.
-- Produtos sem opções continuam funcionando como antes. Idempotente.

BEGIN;

CREATE OR REPLACE FUNCTION public._opcoes_validas(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_typeof(p) = 'array'
    AND jsonb_array_length(p) <= 5
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) g
      WHERE jsonb_typeof(g) IS DISTINCT FROM 'object'
         OR jsonb_typeof(g->'grupo') IS DISTINCT FROM 'string'
         OR char_length(btrim(g->>'grupo')) NOT BETWEEN 1 AND 40
         OR jsonb_typeof(g->'itens') IS DISTINCT FROM 'array'
         OR jsonb_array_length(g->'itens') NOT BETWEEN 1 AND 15
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(g->'itens') i
           WHERE jsonb_typeof(i) IS DISTINCT FROM 'object'
              OR jsonb_typeof(i->'nome') IS DISTINCT FROM 'string'
              OR char_length(btrim(i->>'nome')) NOT BETWEEN 1 AND 40
              OR jsonb_typeof(i->'preco') IS DISTINCT FROM 'number'
              OR (i->>'preco')::numeric NOT BETWEEN -10000 AND 10000
              OR (i ? 'custo' AND (jsonb_typeof(i->'custo') IS DISTINCT FROM 'number' OR (i->>'custo')::numeric NOT BETWEEN -10000 AND 10000))
         )
         OR (SELECT count(DISTINCT lower(btrim(i->>'nome'))) FROM jsonb_array_elements(g->'itens') i) <> jsonb_array_length(g->'itens')
    )
    AND (SELECT count(DISTINCT lower(btrim(g->>'grupo'))) FROM jsonb_array_elements(p) g) = jsonb_array_length(p)
$function$;

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS opcoes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produto_opcoes_validas;
ALTER TABLE public.produtos ADD CONSTRAINT produto_opcoes_validas CHECK (public._opcoes_validas(opcoes));

-- Valida a escolha do cliente (uma opção por grupo) e devolve acréscimo de preço, de custo e a descrição.
CREATE OR REPLACE FUNCTION public._aplicar_opcoes(p_nome text, p_grupos jsonb, p_escolha jsonb,
  OUT acrescimo numeric, OUT custo_extra numeric, OUT descricao text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  g jsonb;
  v_escolhido text;
  v_item jsonb;
  v_partes text[] := ARRAY[]::text[];
BEGIN
  acrescimo := 0;
  custo_extra := 0;
  p_grupos := coalesce(p_grupos, '[]'::jsonb);
  p_escolha := coalesce(p_escolha, '{}'::jsonb);
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_escolha) k
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_grupos) x WHERE x->>'grupo' = k)
  ) THEN
    RAISE EXCEPTION 'CATALOGO: opção inexistente para %. Atualize a página e tente de novo.', p_nome;
  END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(p_grupos) LOOP
    v_escolhido := p_escolha->>(g->>'grupo');
    IF v_escolhido IS NULL THEN
      RAISE EXCEPTION 'CATALOGO: escolha % para %.', lower(g->>'grupo'), p_nome;
    END IF;
    SELECT i INTO v_item FROM jsonb_array_elements(g->'itens') i WHERE i->>'nome' = v_escolhido LIMIT 1;
    IF v_item IS NULL THEN
      RAISE EXCEPTION 'CATALOGO: a opção "%" de % não está mais disponível. Atualize a página.', v_escolhido, p_nome;
    END IF;
    acrescimo := acrescimo + coalesce((v_item->>'preco')::numeric, 0);
    custo_extra := custo_extra + coalesce((v_item->>'custo')::numeric, 0);
    v_partes := v_partes || ((g->>'grupo') || ': ' || v_escolhido);
  END LOOP;
  descricao := p_nome || CASE WHEN array_length(v_partes, 1) > 0 THEN ' (' || array_to_string(v_partes, ', ') || ')' ELSE '' END;
END;
$function$;
REVOKE ALL ON FUNCTION public._aplicar_opcoes(text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.catalogo_publico(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  c public.confeitarias%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.confeitarias
  WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'nome', c.nome,
    'slogan', c.slogan,
    'whatsapp', c.whatsapp,
    'aviso', c.catalogo_aviso,
    'aceita_retirada', c.aceita_retirada,
    'aceita_entrega', c.aceita_entrega,
    'taxa_entrega', c.taxa_entrega,
    'pedido_minimo', c.pedido_minimo,
    'endereco_retirada', c.endereco_retirada,
    'hoje', public._hoje_confeitaria(),
    'produtos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'descricao', p.descricao,
        'categoria', p.categoria,
        'preco', p.preco_venda,
        'imagem_url', p.imagem_url,
        'antecedencia_dias', p.antecedencia_dias,
        -- Opções sem o custo interno: só nome e acréscimo de preço.
        'opcoes', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'grupo', g->>'grupo',
            'itens', (SELECT jsonb_agg(jsonb_build_object('nome', i->>'nome', 'preco', (i->>'preco')::numeric) ORDER BY n)
                      FROM jsonb_array_elements(g->'itens') WITH ORDINALITY AS it(i, n))
          ) ORDER BY gn)
          FROM jsonb_array_elements(p.opcoes) WITH ORDINALITY AS gr(g, gn)
        ), '[]'::jsonb),
        'midias', coalesce((
          SELECT jsonb_agg(jsonb_build_object('tipo', m.tipo, 'url', m.url) ORDER BY m.ordem)
          FROM public.produto_midias m
          WHERE m.produto_id = p.id AND m.user_id = c.user_id
        ), '[]'::jsonb)
      ) ORDER BY p.categoria, p.nome)
      FROM public.produtos p
      WHERE p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
    ), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_pedido_catalogo(
  p_slug text,
  p_token uuid,
  p_cliente jsonb,
  p_entrega jsonb,
  p_itens jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  c public.confeitarias%ROWTYPE;
  v_existente public.pedidos%ROWTYPE;
  v_nome text;
  v_telefone text;
  v_endereco text;
  v_tipo text;
  v_data date;
  v_hora text;
  v_obs text;
  v_hoje date := public._hoje_confeitaria();
  v_antecedencia integer := 0;
  v_subtotal numeric(12,2) := 0;
  v_taxa numeric(12,2) := 0;
  v_cliente_id uuid;
  v_pedido_id uuid;
  v_codigo uuid := gen_random_uuid();
  v_numero bigint;
  v_qtd_itens integer;
  v_itens jsonb;
  v_linhas jsonb := '[]'::jsonb;
  v_linha record;
  v_opcao record;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'CATALOGO: identificador do pedido ausente.'; END IF;
  IF jsonb_typeof(p_cliente) IS DISTINCT FROM 'object' OR jsonb_typeof(p_entrega) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'CATALOGO: dados do pedido inválidos.';
  END IF;

  SELECT * INTO c FROM public.confeitarias WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO: este catálogo não está disponível no momento.'; END IF;

  -- Serializa pedidos da mesma confeitaria: capacidade e limites ficam corretos sob concorrência.
  PERFORM pg_advisory_xact_lock(hashtextextended('catalogo:' || c.id::text, 0));

  -- Repetição do mesmo envio (duplo clique, rede instável) devolve o pedido já criado.
  SELECT * INTO v_existente FROM public.pedidos
  WHERE user_id = c.user_id AND catalogo_token = p_token;
  IF FOUND THEN
    RETURN jsonb_build_object('codigo', v_existente.codigo_publico, 'numero', v_existente.numero);
  END IF;

  -- Cliente
  v_nome := left(regexp_replace(btrim(coalesce(p_cliente->>'nome', '')), '\s+', ' ', 'g'), 120);
  v_telefone := regexp_replace(coalesce(p_cliente->>'telefone', ''), '\D', '', 'g');
  IF char_length(v_telefone) IN (12, 13) AND left(v_telefone, 2) = '55' THEN v_telefone := substr(v_telefone, 3); END IF;
  v_endereco := nullif(left(btrim(coalesce(p_cliente->>'endereco', '')), 300), '');
  IF char_length(v_nome) < 2 THEN RAISE EXCEPTION 'CATALOGO: informe seu nome.'; END IF;
  IF char_length(v_telefone) NOT IN (10, 11) THEN RAISE EXCEPTION 'CATALOGO: informe um WhatsApp válido com DDD.'; END IF;

  -- Entrega
  v_tipo := p_entrega->>'tipo';
  IF v_tipo = 'retirada' AND NOT c.aceita_retirada THEN RAISE EXCEPTION 'CATALOGO: esta confeitaria não oferece retirada.'; END IF;
  IF v_tipo = 'entrega' AND NOT c.aceita_entrega THEN RAISE EXCEPTION 'CATALOGO: esta confeitaria não faz entregas.'; END IF;
  IF v_tipo IS NULL OR v_tipo NOT IN ('retirada', 'entrega') THEN RAISE EXCEPTION 'CATALOGO: escolha retirada ou entrega.'; END IF;
  IF v_tipo = 'entrega' AND coalesce(char_length(v_endereco), 0) < 5 THEN RAISE EXCEPTION 'CATALOGO: informe o endereço de entrega.'; END IF;
  BEGIN
    v_data := (p_entrega->>'data')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CATALOGO: data de entrega inválida.';
  END;
  IF v_data IS NULL THEN RAISE EXCEPTION 'CATALOGO: escolha a data.'; END IF;
  IF v_data > v_hoje + 90 THEN RAISE EXCEPTION 'CATALOGO: escolha uma data nos próximos 90 dias.'; END IF;
  v_hora := nullif(btrim(coalesce(p_entrega->>'hora', '')), '');
  IF v_hora IS NOT NULL AND v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'CATALOGO: horário inválido.'; END IF;
  v_obs := nullif(left(btrim(coalesce(p_entrega->>'observacoes', '')), 500), '');

  -- Itens: agrupa repetidos, valida produto da própria confeitaria, preço do servidor.
  SELECT count(*) INTO v_qtd_itens FROM jsonb_array_elements(p_itens);
  IF v_qtd_itens NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'CATALOGO: o pedido deve ter de 1 a 30 itens.'; END IF;

  -- Agrupa linhas iguais (mesmo produto e mesmas opções escolhidas).
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('produto_id', g.produto_id, 'opcoes', g.opcoes, 'quantidade', g.quantidade))
      INTO v_itens
    FROM (
      SELECT (e->>'produto_id')::uuid AS produto_id,
             coalesce(nullif(e->'opcoes', 'null'::jsonb), '{}'::jsonb) AS opcoes,
             sum((e->>'quantidade')::integer) AS quantidade
      FROM jsonb_array_elements(p_itens) e
      GROUP BY 1, 2
    ) g;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CATALOGO: itens do pedido inválidos.';
  END;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, opcoes jsonb, quantidade integer)
    WHERE jsonb_typeof(ci.opcoes) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'CATALOGO: opções do produto inválidas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, opcoes jsonb, quantidade integer)
    WHERE ci.produto_id IS NULL OR ci.quantidade IS NULL OR ci.quantidade NOT BETWEEN 1 AND 99
  ) THEN
    RAISE EXCEPTION 'CATALOGO: a quantidade de cada produto deve ser de 1 a 99.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, opcoes jsonb, quantidade integer)
    LEFT JOIN public.produtos p
      ON p.id = ci.produto_id AND p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'CATALOGO: um dos produtos não está mais disponível. Atualize a página e tente de novo.';
  END IF;

  -- Preço, custo e descrição de cada linha calculados no servidor, a partir das opções do produto.
  FOR v_linha IN
    SELECT p.id, p.nome, p.preco_venda, p.antecedencia_dias, p.opcoes AS grupos, ci.opcoes AS escolha, ci.quantidade
    FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, opcoes jsonb, quantidade integer)
    JOIN public.produtos p ON p.id = ci.produto_id AND p.user_id = c.user_id
    ORDER BY p.nome
  LOOP
    SELECT * INTO v_opcao FROM public._aplicar_opcoes(v_linha.nome, v_linha.grupos, v_linha.escolha);
    IF round(v_linha.preco_venda + v_opcao.acrescimo, 2) <= 0 THEN
      RAISE EXCEPTION 'CATALOGO: preço inválido para %.', v_linha.nome;
    END IF;
    v_linhas := v_linhas || jsonb_build_object(
      'produto_id', v_linha.id,
      'descricao', left(v_opcao.descricao, 300),
      'quantidade', v_linha.quantidade,
      'preco', round(v_linha.preco_venda + v_opcao.acrescimo, 2),
      'custo', greatest(0, round(public._custo_unitario_produto(v_linha.id, c.user_id) + v_opcao.custo_extra, 4))
    );
    v_antecedencia := greatest(v_antecedencia, v_linha.antecedencia_dias);
    v_subtotal := v_subtotal + round(v_linha.preco_venda + v_opcao.acrescimo, 2) * v_linha.quantidade;
  END LOOP;
  IF v_data < v_hoje + v_antecedencia THEN
    RAISE EXCEPTION 'CATALOGO: para estes produtos, a data mínima é %.', to_char(v_hoje + v_antecedencia, 'DD/MM/YYYY');
  END IF;
  IF v_subtotal < c.pedido_minimo THEN
    RAISE EXCEPTION 'CATALOGO: o pedido mínimo é de R$ %.', replace(to_char(c.pedido_minimo, 'FM999999990.00'), '.', ',');
  END IF;
  v_taxa := CASE WHEN v_tipo = 'entrega' THEN c.taxa_entrega ELSE 0 END;

  -- Capacidade diária e limites contra abuso.
  IF c.limite_pedidos_dia IS NOT NULL AND (
    SELECT count(*) FROM public.pedidos
    WHERE user_id = c.user_id AND origem = 'catalogo' AND data_entrega = v_data AND status <> 'cancelado'
  ) >= c.limite_pedidos_dia THEN
    RAISE EXCEPTION 'CATALOGO: não há mais vagas para %. Escolha outra data.', to_char(v_data, 'DD/MM/YYYY');
  END IF;
  IF (
    SELECT count(*) FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
    WHERE p.user_id = c.user_id AND p.origem = 'catalogo' AND p.created_at > now() - interval '24 hours'
      AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_telefone, '55' || v_telefone)
  ) >= 5 THEN
    RAISE EXCEPTION 'CATALOGO: muitos pedidos deste WhatsApp hoje. Fale direto com a confeitaria.';
  END IF;
  IF (
    SELECT count(*) FROM public.pedidos
    WHERE user_id = c.user_id AND origem = 'catalogo' AND created_at > now() - interval '1 hour'
  ) >= 60 THEN
    RAISE EXCEPTION 'CATALOGO: muitos pedidos no momento. Tente novamente em alguns minutos.';
  END IF;

  -- Cliente: reaproveita pelo telefone, sem sobrescrever o cadastro da confeitaria.
  SELECT cl.id INTO v_cliente_id FROM public.clientes cl
  WHERE cl.user_id = c.user_id
    AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_telefone, '55' || v_telefone)
  ORDER BY cl.created_at
  LIMIT 1;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, telefone, endereco)
    VALUES (c.user_id, v_nome, v_telefone, v_endereco)
    RETURNING id INTO v_cliente_id;
  ELSIF v_endereco IS NOT NULL THEN
    UPDATE public.clientes SET endereco = v_endereco
    WHERE id = v_cliente_id AND user_id = c.user_id AND endereco IS NULL;
  END IF;

  INSERT INTO public.pedidos (
    user_id, cliente_id, data_entrega, hora_entrega, status, forma_pagamento,
    valor_entrada, saldo_quitado, desconto, taxa_entrega, observacoes,
    origem, codigo_publico, catalogo_token, tipo_entrega, endereco_entrega
  ) VALUES (
    c.user_id, v_cliente_id, v_data, v_hora, 'recebido', 'pix',
    0, false, 0, v_taxa,
    concat_ws(E'\n',
      'Pedido feito pelo catálogo por ' || v_nome || '.',
      CASE WHEN v_tipo = 'entrega' THEN 'Entrega em: ' || v_endereco ELSE 'Retirada na confeitaria.' END,
      CASE WHEN v_obs IS NOT NULL THEN 'Observações do cliente: ' || v_obs END),
    'catalogo', v_codigo, p_token, v_tipo, CASE WHEN v_tipo = 'entrega' THEN v_endereco END
  ) RETURNING id, numero INTO v_pedido_id, v_numero;

  INSERT INTO public.pedido_itens (user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario, quantidade_produzida)
  SELECT c.user_id, v_pedido_id, l.produto_id, l.descricao, l.quantidade, l.preco, l.custo, 0
  FROM jsonb_to_recordset(v_linhas) AS l(produto_id uuid, descricao text, quantidade integer, preco numeric, custo numeric);

  RETURN jsonb_build_object('codigo', v_codigo, 'numero', v_numero);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
