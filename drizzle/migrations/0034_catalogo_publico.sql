-- Catálogo público com pedido online (Etapa 3 do docs/plano-evolucao.md).
--
-- O cliente vê os produtos em /c/<slug>, monta o pedido e recebe a chave Pix.
-- Segurança:
--   * Visitantes anônimos NÃO leem tabelas. Só executam quatro funções
--     SECURITY DEFINER com saída restrita (sem custo, receita, margem ou dados de outros clientes).
--   * Preço, taxa de entrega e custo do item são calculados no servidor.
--   * O pedido é gravado na conta da confeitaria dona do slug, nunca em outra.
--   * Limites contra abuso: por telefone (24h) e por confeitaria (1h), além da
--     capacidade diária opcional.
-- Não altera pedidos, itens, pagamentos ou produtos existentes (só adiciona colunas com padrão).
-- Idempotente.

BEGIN;

-- 0. Chave Pix (já existe em produção pela migração do Supabase de 18/10; garante o mesmo em instalações novas).
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS pix_chave text NOT NULL DEFAULT '';

-- 1. Produtos: campos do catálogo -------------------------------------------
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS imagem_url text,
  ADD COLUMN IF NOT EXISTS no_catalogo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS antecedencia_dias integer NOT NULL DEFAULT 1;

ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produto_catalogo_valido;
ALTER TABLE public.produtos ADD CONSTRAINT produto_catalogo_valido CHECK (
  coalesce(char_length(descricao), 0) <= 600
  AND coalesce(char_length(imagem_url), 0) <= 500
  AND antecedencia_dias BETWEEN 0 AND 60
);

-- 2. Confeitaria: configuração do catálogo ----------------------------------
ALTER TABLE public.confeitarias
  ADD COLUMN IF NOT EXISTS catalogo_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalogo_aviso text,
  ADD COLUMN IF NOT EXISTS aceita_retirada boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_entrega boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS taxa_entrega numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pedido_minimo numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS endereco_retirada text,
  ADD COLUMN IF NOT EXISTS limite_pedidos_dia integer;

ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitaria_catalogo_valido;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitaria_catalogo_valido CHECK (
  (NOT catalogo_ativo OR slug IS NOT NULL)
  AND (NOT catalogo_ativo OR aceita_retirada OR aceita_entrega)
  AND coalesce(char_length(catalogo_aviso), 0) <= 300
  AND coalesce(char_length(endereco_retirada), 0) <= 300
  AND taxa_entrega >= 0 AND taxa_entrega <= 1000
  AND pedido_minimo >= 0 AND pedido_minimo <= 100000
  AND (limite_pedidos_dia IS NULL OR limite_pedidos_dia BETWEEN 1 AND 500)
);

-- 3. Pedidos: origem e acompanhamento ---------------------------------------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS codigo_publico uuid,
  ADD COLUMN IF NOT EXISTS catalogo_token uuid,
  ADD COLUMN IF NOT EXISTS tipo_entrega text,
  ADD COLUMN IF NOT EXISTS endereco_entrega text,
  ADD COLUMN IF NOT EXISTS visualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS pagamento_informado_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedido_catalogo_valido;
ALTER TABLE public.pedidos ADD CONSTRAINT pedido_catalogo_valido CHECK (
  origem IN ('manual', 'catalogo')
  AND (tipo_entrega IS NULL OR tipo_entrega IN ('retirada', 'entrega'))
  AND coalesce(char_length(endereco_entrega), 0) <= 300
);
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_codigo_publico_key ON public.pedidos (codigo_publico) WHERE codigo_publico IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_catalogo_token_key ON public.pedidos (user_id, catalogo_token) WHERE catalogo_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedidos_catalogo_novos_idx ON public.pedidos (user_id, created_at) WHERE origem = 'catalogo';

-- 4. Funções internas (sem acesso direto) -----------------------------------
CREATE OR REPLACE FUNCTION public._hoje_confeitaria()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$ SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date $function$;

-- Custo unitário atual do produto, com a mesma regra de conversão de medidas do app
-- (src/lib/ingredient-cost.ts) e de recalcular_custos_historicos().
CREATE OR REPLACE FUNCTION public._custo_unitario_produto(p_produto_id uuid, p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT coalesce(round((
    coalesce(sum(
      CASE
        WHEN public.medida_base(coalesce(i.unidade_embalagem, i.unidade, 'un'))
           = public.medida_base(coalesce(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
        THEN (coalesce(i.preco_embalagem, i.preco_unidade, 0)
               / nullif(coalesce(i.quantidade_embalagem, 1) * public.medida_fator(coalesce(i.unidade_embalagem, i.unidade, 'un')), 0))
             * coalesce(ri.quantidade_utilizada, ri.quantidade, 0)
             * public.medida_fator(coalesce(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
      END
    ), 0)
    + coalesce(p.custo_gas, 0) + coalesce(p.custo_energia, 0) + coalesce(p.custo_mao_obra, 0)
  ) / CASE WHEN coalesce(p.rendimento, 0) > 0 THEN p.rendimento ELSE 1 END, 4), 0)
  FROM public.produtos p
  LEFT JOIN public.receita_itens ri ON ri.produto_id = p.id AND ri.user_id = p.user_id
  LEFT JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = p.user_id
  WHERE p.id = p_produto_id AND p.user_id = p_user_id
  GROUP BY p.id, p.custo_gas, p.custo_energia, p.custo_mao_obra, p.rendimento
$function$;

REVOKE ALL ON FUNCTION public._custo_unitario_produto(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5. Catálogo público --------------------------------------------------------
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
        'antecedencia_dias', p.antecedencia_dias
      ) ORDER BY p.categoria, p.nome)
      FROM public.produtos p
      WHERE p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
    ), '[]'::jsonb)
  );
END;
$function$;

-- 6. Criar pedido pelo catálogo ---------------------------------------------
-- p_cliente: {"nome", "telefone", "endereco"}
-- p_entrega: {"tipo": "retirada"|"entrega", "data": "AAAA-MM-DD", "hora": "HH:MM"|null, "observacoes"}
-- p_itens:   [{"produto_id", "quantidade"}]
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
  v_linha record;
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

  BEGIN
    SELECT jsonb_agg(jsonb_build_object('produto_id', g.produto_id, 'quantidade', g.quantidade))
      INTO v_itens
    FROM (
      SELECT (e->>'produto_id')::uuid AS produto_id, sum((e->>'quantidade')::integer) AS quantidade
      FROM jsonb_array_elements(p_itens) e
      GROUP BY 1
    ) g;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CATALOGO: itens do pedido inválidos.';
  END;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, quantidade integer)
    WHERE ci.produto_id IS NULL OR ci.quantidade IS NULL OR ci.quantidade NOT BETWEEN 1 AND 99
  ) THEN
    RAISE EXCEPTION 'CATALOGO: a quantidade de cada produto deve ser de 1 a 99.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, quantidade integer)
    LEFT JOIN public.produtos p
      ON p.id = ci.produto_id AND p.user_id = c.user_id AND p.ativo AND p.no_catalogo AND p.preco_venda > 0
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'CATALOGO: um dos produtos não está mais disponível. Atualize a página e tente de novo.';
  END IF;

  SELECT coalesce(max(p.antecedencia_dias), 0), coalesce(sum(round(p.preco_venda, 2) * ci.quantidade), 0)
    INTO v_antecedencia, v_subtotal
  FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, quantidade integer)
  JOIN public.produtos p ON p.id = ci.produto_id AND p.user_id = c.user_id;
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

  FOR v_linha IN
    SELECT p.id, p.nome, round(p.preco_venda, 2) AS preco, ci.quantidade
    FROM jsonb_to_recordset(v_itens) AS ci(produto_id uuid, quantidade integer)
    JOIN public.produtos p ON p.id = ci.produto_id AND p.user_id = c.user_id
    ORDER BY p.nome
  LOOP
    INSERT INTO public.pedido_itens (user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario, quantidade_produzida)
    VALUES (c.user_id, v_pedido_id, v_linha.id, left(v_linha.nome, 300), v_linha.quantidade, v_linha.preco,
            public._custo_unitario_produto(v_linha.id, c.user_id), 0);
  END LOOP;

  RETURN jsonb_build_object('codigo', v_codigo, 'numero', v_numero);
END;
$function$;

-- 7. Acompanhar pedido (pelo código público, que não é adivinhável) --------
CREATE OR REPLACE FUNCTION public.acompanhar_pedido_catalogo(p_codigo uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  p public.pedidos%ROWTYPE;
  c public.confeitarias%ROWTYPE;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_pago numeric(12,2);
  v_pix text;
  v_cliente text;
BEGIN
  SELECT * INTO p FROM public.pedidos WHERE codigo_publico = p_codigo AND origem = 'catalogo';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.confeitarias WHERE user_id = p.user_id;
  SELECT pix_chave INTO v_pix FROM public.configuracoes WHERE user_id = p.user_id;
  SELECT split_part(nome, ' ', 1) INTO v_cliente FROM public.clientes WHERE id = p.cliente_id AND user_id = p.user_id;

  SELECT coalesce(sum(quantidade * preco_unitario), 0) INTO v_subtotal
  FROM public.pedido_itens WHERE pedido_id = p.id AND user_id = p.user_id;
  v_total := greatest(0, v_subtotal + coalesce(p.taxa_entrega, 0) - coalesce(p.desconto, 0));
  SELECT least(v_total, greatest(
    coalesce(p.valor_entrada, 0),
    coalesce((SELECT sum(valor) FROM public.pedido_pagamentos WHERE pedido_id = p.id AND user_id = p.user_id), 0),
    CASE WHEN p.saldo_quitado THEN v_total ELSE 0 END
  )) INTO v_pago;

  RETURN jsonb_build_object(
    'numero', p.numero,
    'status', p.status,
    'cliente', v_cliente,
    'data_entrega', p.data_entrega,
    'hora_entrega', p.hora_entrega,
    'tipo_entrega', p.tipo_entrega,
    'endereco_entrega', p.endereco_entrega,
    'subtotal', v_subtotal,
    'taxa_entrega', p.taxa_entrega,
    'desconto', p.desconto,
    'total', v_total,
    'pago', v_pago,
    'pagamento_informado', p.pagamento_informado_em IS NOT NULL,
    'criado_em', p.created_at,
    'itens', coalesce((
      SELECT jsonb_agg(jsonb_build_object('descricao', descricao, 'quantidade', quantidade, 'preco', preco_unitario) ORDER BY descricao)
      FROM public.pedido_itens WHERE pedido_id = p.id AND user_id = p.user_id
    ), '[]'::jsonb),
    'confeitaria', jsonb_build_object(
      'nome', c.nome,
      'whatsapp', c.whatsapp,
      'slug', c.slug,
      'endereco_retirada', c.endereco_retirada,
      'pix_chave', nullif(btrim(coalesce(v_pix, '')), '')
    )
  );
END;
$function$;

-- 8. Cliente avisa que pagou (a confeitaria confirma o recebimento no sistema) --
CREATE OR REPLACE FUNCTION public.informar_pagamento_catalogo(p_codigo uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.pedidos
  SET pagamento_informado_em = coalesce(pagamento_informado_em, now())
  WHERE codigo_publico = p_codigo AND origem = 'catalogo' AND status <> 'cancelado';
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.catalogo_publico(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_pedido_catalogo(text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acompanhar_pedido_catalogo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.informar_pagamento_catalogo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_pedido_catalogo(text, uuid, jsonb, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acompanhar_pedido_catalogo(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.informar_pagamento_catalogo(uuid) TO anon, authenticated;

-- 9. Fotos dos produtos (Supabase Storage). Ignorado onde o Storage não existe (CI).
DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Storage indisponível: fotos do catálogo não configuradas.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('catalogo', 'catalogo', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

  -- Cada confeitaria grava só na própria pasta: <user_id>/arquivo.
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_insert ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_update ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_delete ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_select_dono ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_select_dono ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = auth.uid()::text)$p$;
END
$storage$;

NOTIFY pgrst, 'reload schema';

COMMIT;
