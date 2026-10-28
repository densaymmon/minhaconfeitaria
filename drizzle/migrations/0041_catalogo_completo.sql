-- Catálogo completo:
--   1. agenda: dias da semana sem atendimento, datas bloqueadas e horários de retirada;
--   2. aparência: logo e cor da confeitaria no catálogo;
--   3. taxa de entrega por bairro;
--   4. cupons de desconto (percentual ou valor, mínimo, validade, limite de usos, primeira compra);
--   5. encomenda personalizada (descrição + fotos de referência, vira pedido para orçamento).
-- Aditiva: colunas novas com padrão vazio; catalogo_publico e criar_pedido_catalogo
-- continuam aceitando os mesmos dados de antes. Idempotente.

BEGIN;

-- 1. Configuração da confeitaria ----------------------------------------------
CREATE OR REPLACE FUNCTION public._taxas_bairro_validas(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_typeof(p) = 'array'
    AND jsonb_array_length(p) <= 100
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p) b
      WHERE jsonb_typeof(b) IS DISTINCT FROM 'object'
         OR jsonb_typeof(b->'bairro') IS DISTINCT FROM 'string'
         OR char_length(btrim(b->>'bairro')) NOT BETWEEN 1 AND 60
         OR jsonb_typeof(b->'taxa') IS DISTINCT FROM 'number'
         OR (b->>'taxa')::numeric NOT BETWEEN 0 AND 1000
    )
    AND (SELECT count(DISTINCT lower(btrim(b->>'bairro'))) FROM jsonb_array_elements(p) b) = jsonb_array_length(p)
$function$;

ALTER TABLE public.confeitarias
  ADD COLUMN IF NOT EXISTS cor_primaria text,
  ADD COLUMN IF NOT EXISTS dias_fechados smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS datas_bloqueadas date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS horarios_retirada text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS taxas_bairro jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aceita_encomenda boolean NOT NULL DEFAULT false;
ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitarias_catalogo_extras;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_catalogo_extras CHECK (
  (cor_primaria IS NULL OR cor_primaria ~ '^#[0-9a-fA-F]{6}$')
  AND dias_fechados <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  AND cardinality(datas_bloqueadas) <= 200
  AND cardinality(horarios_retirada) <= 24
  AND array_to_string(horarios_retirada, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*)?$'
  AND public._taxas_bairro_validas(taxas_bairro)
);

-- A dona edita os novos campos (lista de colunas liberadas por coluna).
GRANT INSERT (cor_primaria, dias_fechados, datas_bloqueadas, horarios_retirada, taxas_bairro, aceita_encomenda)
  ON public.confeitarias TO authenticated;
GRANT UPDATE (cor_primaria, dias_fechados, datas_bloqueadas, horarios_retirada, taxas_bairro, aceita_encomenda)
  ON public.confeitarias TO authenticated;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cupom_codigo text,
  ADD COLUMN IF NOT EXISTS encomenda boolean NOT NULL DEFAULT false;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedido_cupom_tamanho;
ALTER TABLE public.pedidos ADD CONSTRAINT pedido_cupom_tamanho CHECK (cupom_codigo IS NULL OR char_length(cupom_codigo) <= 20);

-- 2. Cupons --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo text NOT NULL CHECK (codigo ~ '^[A-Z0-9]{3,20}$'),
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 120),
  tipo text NOT NULL CHECK (tipo IN ('percentual', 'valor')),
  valor numeric(10,2) NOT NULL CHECK (valor > 0 AND valor <= 10000),
  pedido_minimo numeric(10,2) NOT NULL DEFAULT 0 CHECK (pedido_minimo >= 0 AND pedido_minimo <= 100000),
  valido_ate date,
  limite_usos integer CHECK (limite_usos IS NULL OR limite_usos BETWEEN 1 AND 100000),
  usos integer NOT NULL DEFAULT 0 CHECK (usos >= 0),
  primeira_compra boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupom_percentual_ate_100 CHECK (tipo <> 'percentual' OR valor <= 100),
  CONSTRAINT cupons_codigo_unico UNIQUE (user_id, codigo)
);
ALTER TABLE public.cupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cupons FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cupons TO authenticated;
GRANT ALL ON public.cupons TO service_role;
DROP POLICY IF EXISTS cupons_dono ON public.cupons;
CREATE POLICY cupons_dono ON public.cupons FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS acesso_liberado ON public.cupons;
CREATE POLICY acesso_liberado ON public.cupons AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()));

-- 3. Regras compartilhadas -------------------------------------------------------
-- Dia da semana, data bloqueada e horário de retirada.
CREATE OR REPLACE FUNCTION public._validar_agenda_catalogo(c public.confeitarias, p_tipo text, p_data date, p_hora text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_dias text[] := ARRAY['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
BEGIN
  IF extract(dow FROM p_data)::smallint = ANY (c.dias_fechados) THEN
    RAISE EXCEPTION 'CATALOGO: a confeitaria não atende neste dia da semana (%). Escolha outra data.', v_dias[extract(dow FROM p_data)::int + 1];
  END IF;
  IF p_data = ANY (c.datas_bloqueadas) THEN
    RAISE EXCEPTION 'CATALOGO: a confeitaria não atende em %. Escolha outra data.', to_char(p_data, 'DD/MM/YYYY');
  END IF;
  IF p_tipo = 'retirada' AND cardinality(c.horarios_retirada) > 0 AND (p_hora IS NULL OR NOT p_hora = ANY (c.horarios_retirada)) THEN
    RAISE EXCEPTION 'CATALOGO: escolha um dos horários de retirada.';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._validar_agenda_catalogo(public.confeitarias, text, date, text) FROM PUBLIC, anon, authenticated;

-- Taxa do bairro escolhido (nome como cadastrado pela confeitaria); vazio se não estiver na lista.
CREATE OR REPLACE FUNCTION public._taxa_bairro(p_lista jsonb, p_bairro text, OUT taxa numeric, OUT nome text)
RETURNS record
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT (b->>'taxa')::numeric, b->>'bairro'
  FROM jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) b
  WHERE lower(btrim(b->>'bairro')) = lower(btrim(coalesce(p_bairro, '')))
  LIMIT 1
$function$;

-- Desconto do cupom (erro "CATALOGO: ..." quando não pode ser usado).
CREATE OR REPLACE FUNCTION public._desconto_cupom(p_cupom public.cupons, p_subtotal numeric, p_hoje date, p_ja_comprou boolean)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_cupom.id IS NULL OR NOT p_cupom.ativo
     OR (p_cupom.valido_ate IS NOT NULL AND p_cupom.valido_ate < p_hoje)
     OR (p_cupom.limite_usos IS NOT NULL AND p_cupom.usos >= p_cupom.limite_usos) THEN
    RAISE EXCEPTION 'CATALOGO: cupom inválido ou expirado.';
  END IF;
  IF p_subtotal < p_cupom.pedido_minimo THEN
    RAISE EXCEPTION 'CATALOGO: este cupom vale para pedidos a partir de R$ %.', replace(to_char(p_cupom.pedido_minimo, 'FM999999990.00'), '.', ',');
  END IF;
  IF p_cupom.primeira_compra AND p_ja_comprou THEN
    RAISE EXCEPTION 'CATALOGO: este cupom é só para a primeira compra.';
  END IF;
  RETURN CASE WHEN p_cupom.tipo = 'percentual' THEN round(p_subtotal * p_cupom.valor / 100, 2) ELSE least(p_cupom.valor, p_subtotal) END;
END;
$function$;

-- Prévia do cupom no catálogo (não conta uso).
CREATE OR REPLACE FUNCTION public.validar_cupom_catalogo(p_slug text, p_codigo text, p_subtotal numeric, p_telefone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  c public.confeitarias%ROWTYPE;
  v_cupom public.cupons%ROWTYPE;
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_desconto numeric;
BEGIN
  SELECT * INTO c FROM public.confeitarias WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo AND public._catalogo_liberado(user_id);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'mensagem', 'Catálogo indisponível.'); END IF;
  IF char_length(v_tel) IN (12, 13) AND left(v_tel, 2) = '55' THEN v_tel := substr(v_tel, 3); END IF;
  SELECT * INTO v_cupom FROM public.cupons
  WHERE user_id = c.user_id AND codigo = upper(btrim(coalesce(p_codigo, ''))) AND ativo;
  BEGIN
    v_desconto := public._desconto_cupom(v_cupom, coalesce(p_subtotal, 0), public._hoje_confeitaria(),
      char_length(v_tel) IN (10, 11) AND EXISTS (
        SELECT 1 FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
        WHERE p.user_id = c.user_id AND p.status <> 'cancelado'
          AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel)));
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', regexp_replace(SQLERRM, '^CATALOGO:\s*', ''));
  END;
  RETURN jsonb_build_object('ok', true, 'codigo', v_cupom.codigo, 'desconto', v_desconto, 'tipo', v_cupom.tipo, 'valor', v_cupom.valor,
    'descricao', v_cupom.descricao, 'pedido_minimo', v_cupom.pedido_minimo);
END;
$function$;
REVOKE ALL ON FUNCTION public.validar_cupom_catalogo(text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_cupom_catalogo(text, text, numeric, text) TO anon, authenticated;

-- 4. Encomenda personalizada --------------------------------------------------------
CREATE OR REPLACE FUNCTION public._encomenda_aceita(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.confeitarias c
    WHERE c.slug = lower(btrim(p_slug)) AND c.catalogo_ativo AND c.aceita_encomenda AND public._catalogo_liberado(c.user_id)
  )
$function$;
REVOKE ALL ON FUNCTION public._encomenda_aceita(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._encomenda_aceita(text) TO anon, authenticated;

-- Fotos de referência: o cliente (sem login) envia para catalogo/encomendas/<endereço>/.
DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_encomenda_fotos ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_encomenda_fotos ON storage.objects FOR INSERT TO anon, authenticated
    WITH CHECK (
      bucket_id = 'catalogo'
      AND (storage.foldername(name))[1] = 'encomendas'
      AND array_length(storage.foldername(name), 1) = 2
      AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
      AND public._encomenda_aceita((storage.foldername(name))[2])
    )$p$;
END
$storage$;

CREATE OR REPLACE FUNCTION public.criar_encomenda_catalogo(
  p_slug text,
  p_token uuid,
  p_cliente jsonb,
  p_encomenda jsonb
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
  v_descricao text;
  v_fotos text[];
  v_prefixo text;
  v_hoje date := public._hoje_confeitaria();
  v_taxa numeric(12,2) := 0;
  v_bairro text;
  v_cliente_id uuid;
  v_codigo uuid := gen_random_uuid();
  v_numero bigint;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'CATALOGO: identificador da encomenda ausente.'; END IF;
  IF jsonb_typeof(p_cliente) IS DISTINCT FROM 'object' OR jsonb_typeof(p_encomenda) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'CATALOGO: dados da encomenda inválidos.';
  END IF;
  SELECT * INTO c FROM public.confeitarias
  WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo AND aceita_encomenda AND public._catalogo_liberado(user_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'CATALOGO: esta confeitaria não está aceitando encomendas personalizadas.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('catalogo:' || c.id::text, 0));
  SELECT * INTO v_existente FROM public.pedidos WHERE user_id = c.user_id AND catalogo_token = p_token;
  IF FOUND THEN RETURN jsonb_build_object('codigo', v_existente.codigo_publico, 'numero', v_existente.numero); END IF;

  v_nome := left(regexp_replace(btrim(coalesce(p_cliente->>'nome', '')), '\s+', ' ', 'g'), 120);
  v_telefone := regexp_replace(coalesce(p_cliente->>'telefone', ''), '\D', '', 'g');
  IF char_length(v_telefone) IN (12, 13) AND left(v_telefone, 2) = '55' THEN v_telefone := substr(v_telefone, 3); END IF;
  v_endereco := nullif(left(btrim(coalesce(p_cliente->>'endereco', '')), 300), '');
  IF char_length(v_nome) < 2 THEN RAISE EXCEPTION 'CATALOGO: informe seu nome.'; END IF;
  IF char_length(v_telefone) NOT IN (10, 11) THEN RAISE EXCEPTION 'CATALOGO: informe um WhatsApp válido com DDD.'; END IF;

  v_descricao := btrim(coalesce(p_encomenda->>'descricao', ''));
  IF char_length(v_descricao) < 10 THEN RAISE EXCEPTION 'CATALOGO: descreva a encomenda (tema, tamanho, sabor, quantidade de pessoas).'; END IF;
  v_descricao := left(v_descricao, 1000);

  v_tipo := p_encomenda->>'tipo';
  IF v_tipo IS NULL OR v_tipo NOT IN ('retirada', 'entrega') THEN RAISE EXCEPTION 'CATALOGO: escolha retirada ou entrega.'; END IF;
  IF v_tipo = 'retirada' AND NOT c.aceita_retirada THEN RAISE EXCEPTION 'CATALOGO: esta confeitaria não oferece retirada.'; END IF;
  IF v_tipo = 'entrega' AND NOT c.aceita_entrega THEN RAISE EXCEPTION 'CATALOGO: esta confeitaria não faz entregas.'; END IF;
  IF v_tipo = 'entrega' AND coalesce(char_length(v_endereco), 0) < 5 THEN RAISE EXCEPTION 'CATALOGO: informe o endereço de entrega.'; END IF;
  BEGIN
    v_data := (p_encomenda->>'data')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CATALOGO: data inválida.';
  END;
  IF v_data IS NULL OR v_data < v_hoje + 1 THEN RAISE EXCEPTION 'CATALOGO: escolha uma data a partir de amanhã.'; END IF;
  IF v_data > v_hoje + 180 THEN RAISE EXCEPTION 'CATALOGO: escolha uma data nos próximos 6 meses.'; END IF;
  v_hora := nullif(btrim(coalesce(p_encomenda->>'hora', '')), '');
  IF v_hora IS NOT NULL AND v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'CATALOGO: horário inválido.'; END IF;
  PERFORM public._validar_agenda_catalogo(c, v_tipo, v_data, v_hora);

  IF v_tipo = 'entrega' THEN
    v_taxa := c.taxa_entrega;
    IF jsonb_array_length(coalesce(c.taxas_bairro, '[]'::jsonb)) > 0 THEN
      SELECT b.taxa, b.nome INTO v_taxa, v_bairro FROM public._taxa_bairro(c.taxas_bairro, p_encomenda->>'bairro') b;
      IF v_bairro IS NULL THEN RAISE EXCEPTION 'CATALOGO: escolha o bairro de entrega da lista.'; END IF;
      v_endereco := left(v_endereco || ' — ' || v_bairro, 300);
    END IF;
  END IF;

  -- Fotos de referência: só arquivos enviados para a pasta de encomendas desta confeitaria.
  v_prefixo := '^https://[a-z0-9-]+\.(supabase\.co|lovable\.cloud)/storage/v1/object/public/catalogo/encomendas/'
    || c.slug || '/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$';
  SELECT coalesce(array_agg(f), ARRAY[]::text[]) INTO v_fotos
  FROM jsonb_array_elements_text(coalesce(p_encomenda->'fotos', '[]'::jsonb)) f;
  IF cardinality(v_fotos) > 3 THEN RAISE EXCEPTION 'CATALOGO: envie no máximo 3 fotos de referência.'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_fotos) f WHERE f !~ v_prefixo OR char_length(f) > 500) THEN
    RAISE EXCEPTION 'CATALOGO: foto de referência inválida. Envie de novo.';
  END IF;

  IF (
    SELECT count(*) FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
    WHERE p.user_id = c.user_id AND p.origem = 'catalogo' AND p.created_at > now() - interval '24 hours'
      AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_telefone, '55' || v_telefone)
  ) >= 5 THEN
    RAISE EXCEPTION 'CATALOGO: muitos pedidos deste WhatsApp hoje. Fale direto com a confeitaria.';
  END IF;
  IF (SELECT count(*) FROM public.pedidos WHERE user_id = c.user_id AND origem = 'catalogo' AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'CATALOGO: muitos pedidos no momento. Tente novamente em alguns minutos.';
  END IF;

  SELECT cl.id INTO v_cliente_id FROM public.clientes cl
  WHERE cl.user_id = c.user_id AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_telefone, '55' || v_telefone)
  ORDER BY cl.created_at LIMIT 1;
  IF v_cliente_id IS NULL THEN
    INSERT INTO public.clientes (user_id, nome, telefone, endereco) VALUES (c.user_id, v_nome, v_telefone, v_endereco)
    RETURNING id INTO v_cliente_id;
  END IF;

  INSERT INTO public.pedidos (
    user_id, cliente_id, data_entrega, hora_entrega, status, forma_pagamento, valor_entrada, saldo_quitado,
    desconto, taxa_entrega, observacoes, origem, codigo_publico, catalogo_token, tipo_entrega, endereco_entrega, encomenda
  ) VALUES (
    c.user_id, v_cliente_id, v_data, v_hora, 'recebido', 'pix', 0, false, 0, v_taxa,
    left(concat_ws(E'\n',
      'ENCOMENDA PERSONALIZADA (aguardando orçamento) — pedido feito pelo catálogo por ' || v_nome || '.',
      'O que o cliente quer: ' || v_descricao,
      CASE WHEN cardinality(v_fotos) > 0 THEN 'Fotos de referência: ' || array_to_string(v_fotos, ' ') END,
      CASE WHEN v_tipo = 'entrega' THEN 'Entrega em: ' || v_endereco ELSE 'Retirada na confeitaria.' END), 2000),
    'catalogo', v_codigo, p_token, v_tipo, CASE WHEN v_tipo = 'entrega' THEN v_endereco END, true
  ) RETURNING numero INTO v_numero;

  RETURN jsonb_build_object('codigo', v_codigo, 'numero', v_numero);
END;
$function$;
REVOKE ALL ON FUNCTION public.criar_encomenda_catalogo(text, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_encomenda_catalogo(text, uuid, jsonb, jsonb) TO anon, authenticated;

-- 5. Catálogo e pedido do catálogo com agenda, aparência, bairros e cupom ----------
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
  WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo AND public._catalogo_liberado(user_id);
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
    'cor', c.cor_primaria,
    'logo_url', c.logo_url,
    'dias_fechados', to_jsonb(c.dias_fechados),
    'datas_bloqueadas', coalesce((SELECT jsonb_agg(d ORDER BY d) FROM unnest(c.datas_bloqueadas) AS d WHERE d >= public._hoje_confeitaria()), '[]'::jsonb),
    'horarios_retirada', to_jsonb(c.horarios_retirada),
    'bairros', c.taxas_bairro,
    'aceita_encomenda', c.aceita_encomenda,
    'tem_cupons', EXISTS (SELECT 1 FROM public.cupons cp WHERE cp.user_id = c.user_id AND cp.ativo
                          AND (cp.valido_ate IS NULL OR cp.valido_ate >= public._hoje_confeitaria())
                          AND (cp.limite_usos IS NULL OR cp.usos < cp.limite_usos)),
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
  v_bairro text;
  v_cupom public.cupons%ROWTYPE;
  v_codigo_cupom text;
  v_desconto numeric(12,2) := 0;
BEGIN
  IF p_token IS NULL THEN RAISE EXCEPTION 'CATALOGO: identificador do pedido ausente.'; END IF;
  IF jsonb_typeof(p_cliente) IS DISTINCT FROM 'object' OR jsonb_typeof(p_entrega) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'CATALOGO: dados do pedido inválidos.';
  END IF;

  SELECT * INTO c FROM public.confeitarias WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo AND public._catalogo_liberado(user_id);
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
  PERFORM public._validar_agenda_catalogo(c, v_tipo, v_data, v_hora);

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
  -- Taxa por bairro: com a lista cadastrada, o bairro escolhido define a taxa.
  IF v_tipo = 'entrega' AND jsonb_array_length(coalesce(c.taxas_bairro, '[]'::jsonb)) > 0 THEN
    SELECT b.taxa, b.nome INTO v_taxa, v_bairro FROM public._taxa_bairro(c.taxas_bairro, p_entrega->>'bairro') b;
    IF v_bairro IS NULL THEN RAISE EXCEPTION 'CATALOGO: escolha o bairro de entrega da lista.'; END IF;
    v_endereco := left(v_endereco || ' — ' || v_bairro, 300);
  END IF;

  -- Cupom de desconto (validado e contado aqui; o navegador só mostra a prévia).
  v_codigo_cupom := upper(nullif(btrim(coalesce(p_entrega->>'cupom', '')), ''));
  IF v_codigo_cupom IS NOT NULL THEN
    SELECT * INTO v_cupom FROM public.cupons WHERE user_id = c.user_id AND codigo = v_codigo_cupom AND ativo FOR UPDATE;
    v_desconto := public._desconto_cupom(v_cupom, v_subtotal, v_hoje,
      EXISTS (SELECT 1 FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
              WHERE p.user_id = c.user_id AND p.status <> 'cancelado'
                AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_telefone, '55' || v_telefone)));
    UPDATE public.cupons SET usos = usos + 1 WHERE id = v_cupom.id;
  END IF;

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
    origem, codigo_publico, catalogo_token, tipo_entrega, endereco_entrega, cupom_codigo
  ) VALUES (
    c.user_id, v_cliente_id, v_data, v_hora, 'recebido', 'pix',
    0, false, v_desconto, v_taxa,
    concat_ws(E'\n',
      'Pedido feito pelo catálogo por ' || v_nome || '.',
      CASE WHEN v_tipo = 'entrega' THEN 'Entrega em: ' || v_endereco ELSE 'Retirada na confeitaria.' END,
      CASE WHEN v_obs IS NOT NULL THEN 'Observações do cliente: ' || v_obs END,
      CASE WHEN v_codigo_cupom IS NOT NULL THEN 'Cupom ' || v_codigo_cupom || ': desconto de R$ ' || replace(to_char(v_desconto, 'FM999999990.00'), '.', ',') END),
    'catalogo', v_codigo, p_token, v_tipo, CASE WHEN v_tipo = 'entrega' THEN v_endereco END, v_codigo_cupom
  ) RETURNING id, numero INTO v_pedido_id, v_numero;

  INSERT INTO public.pedido_itens (user_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, custo_unitario, quantidade_produzida)
  SELECT c.user_id, v_pedido_id, l.produto_id, l.descricao, l.quantidade, l.preco, l.custo, 0
  FROM jsonb_to_recordset(v_linhas) AS l(produto_id uuid, descricao text, quantidade integer, preco numeric, custo numeric);

  RETURN jsonb_build_object('codigo', v_codigo, 'numero', v_numero);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
