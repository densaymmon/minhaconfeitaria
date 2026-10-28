-- Catálogo: várias fotos e vídeos por produto, links curtos e confirmação pelo WhatsApp.
--   * produto_midias: até 10 fotos/vídeos por produto, em ordem; a primeira foto é a capa (produtos.imagem_url).
--   * Catálogo em /<endereço>: endereços que coincidem com páginas do sistema ficam bloqueados.
--   * Acompanhamento em /p/<código curto> (10 caracteres aleatórios, ~49 bits).
--   * pedidos.confirmacao_enviada_em: quando a confeitaria enviou a confirmação ao cliente.
-- Não altera pedidos, itens, pagamentos nem produtos existentes. Idempotente.

BEGIN;

-- 1. Mídias dos produtos -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.produto_midias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('imagem', 'video')),
  url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 500),
  ordem smallint NOT NULL DEFAULT 0 CHECK (ordem BETWEEN 0 AND 9),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS produto_midias_produto_idx ON public.produto_midias (produto_id, ordem);

ALTER TABLE public.produto_midias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.produto_midias FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produto_midias TO authenticated;
GRANT ALL ON public.produto_midias TO service_role;

DROP POLICY IF EXISTS produto_midias_dono_select ON public.produto_midias;
CREATE POLICY produto_midias_dono_select ON public.produto_midias
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS produto_midias_dono_insert ON public.produto_midias;
CREATE POLICY produto_midias_dono_insert ON public.produto_midias
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS produto_midias_dono_update ON public.produto_midias;
CREATE POLICY produto_midias_dono_update ON public.produto_midias
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS produto_midias_dono_delete ON public.produto_midias;
CREATE POLICY produto_midias_dono_delete ON public.produto_midias
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Foto de capa já cadastrada vira a primeira mídia.
INSERT INTO public.produto_midias (user_id, produto_id, tipo, url, ordem)
SELECT p.user_id, p.id, 'imagem', p.imagem_url, 0
FROM public.produtos p
WHERE p.imagem_url ~ '^https://'
  AND NOT EXISTS (SELECT 1 FROM public.produto_midias m WHERE m.produto_id = p.id);

-- Substitui as mídias do produto de uma vez (ordem = posição na lista) e atualiza a capa.
-- p_midias: [{"tipo": "imagem"|"video", "url": "https://..."}]
CREATE OR REPLACE FUNCTION public.salvar_midias_produto(p_produto_id uuid, p_midias jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_total integer;
  v_capa text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
  IF jsonb_typeof(p_midias) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de fotos e vídeos inválida.'; END IF;
  v_total := jsonb_array_length(p_midias);
  IF v_total > 10 THEN RAISE EXCEPTION 'Cada produto pode ter no máximo 10 fotos e vídeos.'; END IF;
  PERFORM 1 FROM public.produtos WHERE id = p_produto_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;

  DELETE FROM public.produto_midias WHERE produto_id = p_produto_id AND user_id = auth.uid();
  INSERT INTO public.produto_midias (user_id, produto_id, tipo, url, ordem)
  SELECT auth.uid(), p_produto_id, e->>'tipo', e->>'url', (n - 1)::smallint
  FROM jsonb_array_elements(p_midias) WITH ORDINALITY AS t(e, n);

  SELECT url INTO v_capa FROM public.produto_midias
  WHERE produto_id = p_produto_id AND user_id = auth.uid() AND tipo = 'imagem'
  ORDER BY ordem LIMIT 1;
  UPDATE public.produtos SET imagem_url = v_capa WHERE id = p_produto_id AND user_id = auth.uid();
  RETURN v_total;
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_midias_produto(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_midias_produto(uuid, jsonb) TO authenticated;

-- Vídeos curtos no mesmo bucket das fotos (até 50 MB).
DO $storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
  UPDATE storage.buckets
  SET file_size_limit = 52428800,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
  WHERE id = 'catalogo';
END
$storage$;

-- 2. Endereço curto do catálogo: /<endereço> ---------------------------------
-- Nomes usados por páginas do sistema não podem ser endereço de catálogo.
CREATE OR REPLACE FUNCTION public._slug_reservado(p_slug text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT p_slug = ANY (ARRAY[
    'c', 'p', 'pedido', 'pedidos', 'pedidos-recorrentes', 'painel', 'auth', 'mcp', 'reset-password',
    'clientes', 'produtos', 'producao', 'financeiro', 'relatorios', 'despesas', 'compras', 'contas-pagar',
    'configuracoes', 'mais', 'api', 'admin', 'app', 'login', 'entrar', 'cadastro', 'suporte', 'ajuda',
    'termos', 'privacidade', 'www', 'assets', 'static', 'catalogo', 'loja', 'planos', 'precos'
  ])
$function$;

ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitaria_slug_nao_reservado;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitaria_slug_nao_reservado
  CHECK (slug IS NULL OR NOT public._slug_reservado(slug));

-- 3. Código curto do pedido e confirmação pelo WhatsApp ----------------------
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS codigo_curto text,
  ADD COLUMN IF NOT EXISTS confirmacao_enviada_em timestamptz;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedido_codigo_curto_valido;
ALTER TABLE public.pedidos ADD CONSTRAINT pedido_codigo_curto_valido
  CHECK (codigo_curto IS NULL OR codigo_curto ~ '^[a-z2-9]{10}$');
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_codigo_curto_key ON public.pedidos (codigo_curto) WHERE codigo_curto IS NOT NULL;

-- 10 caracteres sem letras/números ambíguos (sem i, l, o, 0, 1), a partir de bytes aleatórios do UUID v4.
CREATE OR REPLACE FUNCTION public._gerar_codigo_curto()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_codigo text;
  v_pos integer;
BEGIN
  LOOP
    v_bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
    v_codigo := '';
    -- Pula os bytes de versão/variante (6 e 8 de cada UUID).
    FOREACH v_pos IN ARRAY ARRAY[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] LOOP
      v_codigo := v_codigo || substr(v_alfabeto, (get_byte(v_bytes, v_pos) % 31) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.pedidos WHERE codigo_curto = v_codigo);
  END LOOP;
  RETURN v_codigo;
END;
$function$;
REVOKE ALL ON FUNCTION public._gerar_codigo_curto() FROM PUBLIC, anon, authenticated;

UPDATE public.pedidos SET codigo_curto = public._gerar_codigo_curto()
WHERE origem = 'catalogo' AND codigo_curto IS NULL;

-- Todo pedido do catálogo recebe um código curto ao ser criado.
CREATE OR REPLACE FUNCTION public._definir_codigo_curto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.origem = 'catalogo' AND NEW.codigo_curto IS NULL THEN
    NEW.codigo_curto := public._gerar_codigo_curto();
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_pedidos_codigo_curto ON public.pedidos;
CREATE TRIGGER trg_pedidos_codigo_curto BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public._definir_codigo_curto();

-- 4. Funções públicas -------------------------------------------------------
-- Catálogo com a lista de fotos e vídeos de cada produto.
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

-- Acompanhamento pelo código curto ou pelo código longo (links antigos).
CREATE OR REPLACE FUNCTION public.pedido_publico(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_codigo uuid;
  v_texto text := lower(btrim(coalesce(p_codigo, '')));
BEGIN
  IF v_texto ~ '^[a-z2-9]{10}$' THEN
    SELECT codigo_publico INTO v_codigo FROM public.pedidos WHERE codigo_curto = v_texto AND origem = 'catalogo';
  ELSIF v_texto ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_codigo := v_texto::uuid;
  END IF;
  IF v_codigo IS NULL THEN RETURN NULL; END IF;
  RETURN public.acompanhar_pedido_catalogo(v_codigo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.informar_pagamento_pedido(p_codigo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_texto text := lower(btrim(coalesce(p_codigo, '')));
BEGIN
  UPDATE public.pedidos
  SET pagamento_informado_em = coalesce(pagamento_informado_em, now())
  WHERE origem = 'catalogo' AND status <> 'cancelado'
    AND ((v_texto ~ '^[a-z2-9]{10}$' AND codigo_curto = v_texto)
      OR (v_texto ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND codigo_publico = v_texto::uuid));
  RETURN FOUND;
END;
$function$;

-- O pedido criado devolve também o código curto para o link de acompanhamento.
CREATE OR REPLACE FUNCTION public.codigo_curto_pedido(p_codigo uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT codigo_curto FROM public.pedidos WHERE codigo_publico = p_codigo AND origem = 'catalogo'
$function$;

REVOKE ALL ON FUNCTION public.pedido_publico(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.informar_pagamento_pedido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.codigo_curto_pedido(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pedido_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.informar_pagamento_pedido(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.codigo_curto_pedido(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
