-- Plataforma pronta para outras confeitarias:
--   1. administradoras da plataforma (a primeira conta da instalação);
--   2. situação de acesso de cada confeitaria (pendente, ativa, bloqueada),
--      aplicada no banco por uma política RESTRICTIVE em todas as tabelas da confeitaria;
--   3. aprovação manual de novas contas, dados do responsável pela plataforma;
--   4. aceite dos termos de uso e conclusão do cadastro guiado;
--   5. funções do painel da plataforma (somente administradoras).
-- Não altera pedidos, itens, pagamentos, produtos, clientes nem estoque.
-- As confeitarias existentes continuam ativas e com o cadastro guiado concluído.
-- Idempotente.

BEGIN;

-- 1. Administradoras ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plataforma_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_admins FROM anon, authenticated;
GRANT ALL ON public.plataforma_admins TO service_role;

-- A dona da confeitaria mais antiga (a conta que já usa o sistema) é a administradora.
INSERT INTO public.plataforma_admins (user_id)
SELECT c.user_id FROM public.confeitarias c
WHERE NOT EXISTS (SELECT 1 FROM public.plataforma_admins)
ORDER BY c.created_at, c.id
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public._eh_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.plataforma_admins a WHERE a.user_id = auth.uid())
$function$;
REVOKE ALL ON FUNCTION public._eh_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._eh_admin() TO authenticated, service_role;

-- 2. Situação de acesso, termos e cadastro guiado ------------------------------
ALTER TABLE public.confeitarias
  ADD COLUMN IF NOT EXISTS acesso text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS acesso_atualizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_concluido_em timestamptz,
  ADD COLUMN IF NOT EXISTS termos_versao text,
  ADD COLUMN IF NOT EXISTS termos_aceitos_em timestamptz;
ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitarias_acesso_valido;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_acesso_valido
  CHECK (acesso IN ('pendente', 'ativo', 'bloqueado'));
ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitarias_termos_versao_tamanho;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_termos_versao_tamanho
  CHECK (termos_versao IS NULL OR char_length(termos_versao) <= 20);

-- Quem já usa o sistema não passa pelo cadastro guiado.
UPDATE public.confeitarias SET onboarding_concluido_em = coalesce(created_at, now())
WHERE onboarding_concluido_em IS NULL;

-- A dona só altera os dados da própria confeitaria; acesso e termos ficam com as funções abaixo.
REVOKE INSERT, UPDATE ON public.confeitarias FROM authenticated;
GRANT INSERT (user_id, nome, slogan, whatsapp, slug, logo_url, catalogo_ativo, catalogo_aviso,
              aceita_retirada, aceita_entrega, taxa_entrega, pedido_minimo, endereco_retirada,
              limite_pedidos_dia, cidade, onboarding_concluido_em)
  ON public.confeitarias TO authenticated;
GRANT UPDATE (user_id, nome, slogan, whatsapp, slug, logo_url, catalogo_ativo, catalogo_aviso,
              aceita_retirada, aceita_entrega, taxa_entrega, pedido_minimo, endereco_retirada,
              limite_pedidos_dia, cidade, onboarding_concluido_em)
  ON public.confeitarias TO authenticated;

-- Confeitaria pendente ou bloqueada não publica catálogo.
CREATE OR REPLACE FUNCTION public._catalogo_so_com_acesso()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.acesso <> 'ativo' THEN
    NEW.catalogo_ativo := false;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_catalogo_so_com_acesso ON public.confeitarias;
CREATE TRIGGER trg_catalogo_so_com_acesso BEFORE INSERT OR UPDATE ON public.confeitarias
  FOR EACH ROW EXECUTE FUNCTION public._catalogo_so_com_acesso();

-- Acesso liberado: administradora, ou confeitaria ativa (sem cadastro = liberado,
-- para nunca trancar uma conta antiga por falta da linha).
CREATE OR REPLACE FUNCTION public._acesso_liberado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT NOT EXISTS (
      SELECT 1 FROM public.confeitarias c WHERE c.user_id = auth.uid() AND c.acesso <> 'ativo'
    )
    OR EXISTS (SELECT 1 FROM public.plataforma_admins a WHERE a.user_id = auth.uid())
$function$;
REVOKE ALL ON FUNCTION public._acesso_liberado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._acesso_liberado() TO authenticated, service_role;

-- Política RESTRICTIVE em todas as tabelas da confeitaria: soma-se à política
-- do dono (auth.uid() = user_id); conta pendente ou bloqueada não lê nem grava.
DO $politicas$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'user_id' AND NOT a.attisdropped)
      AND c.relname NOT IN ('confeitarias', 'plataforma_admins', 'plataforma_contas')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS acesso_liberado ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY acesso_liberado ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()))', t);
  END LOOP;
END
$politicas$;

-- Fotos e vídeos do catálogo: só confeitaria com acesso liberado envia arquivos.
DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_acesso_liberado ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_acesso_liberado ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (bucket_id <> 'catalogo' OR (SELECT public._acesso_liberado()))$p$;
END
$storage$;

-- 3. Configuração da plataforma e controle das contas --------------------------
ALTER TABLE public.plataforma_config
  ADD COLUMN IF NOT EXISTS aprovacao_manual boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS empresa_nome text,
  ADD COLUMN IF NOT EXISTS empresa_documento text,
  ADD COLUMN IF NOT EXISTS contato_email text,
  ADD COLUMN IF NOT EXISTS contato_whatsapp text;
ALTER TABLE public.plataforma_config DROP CONSTRAINT IF EXISTS plataforma_config_textos;
ALTER TABLE public.plataforma_config ADD CONSTRAINT plataforma_config_textos CHECK (
  (empresa_nome IS NULL OR char_length(empresa_nome) <= 120)
  AND (empresa_documento IS NULL OR char_length(empresa_documento) <= 30)
  AND (contato_email IS NULL OR char_length(contato_email) <= 120)
  AND (contato_whatsapp IS NULL OR char_length(contato_whatsapp) <= 30)
);

-- Anotações da administradora sobre cada conta (a confeitaria não vê).
CREATE TABLE IF NOT EXISTS public.plataforma_contas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pago_ate date,
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_contas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_contas FROM anon, authenticated;
GRANT ALL ON public.plataforma_contas TO service_role;

-- Endereços de páginas novas não podem virar endereço de catálogo.
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
    'termos', 'privacidade', 'www', 'assets', 'static', 'catalogo', 'loja', 'planos', 'precos',
    'plataforma', 'comecar'
  ])
$function$;

-- 4. Novo cadastro -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_confeitaria_novo_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_cfg public.plataforma_config%ROWTYPE;
  v_primeira boolean;
  v_meta jsonb := coalesce(to_jsonb(NEW)->'raw_user_meta_data', '{}'::jsonb);
  v_nome text;
  v_whatsapp text;
  v_termos text;
BEGIN
  -- Serializa cadastros simultâneos para a regra da primeira conta valer.
  PERFORM pg_advisory_xact_lock(hashtextextended('cadastro_confeitaria', 0));

  SELECT * INTO v_cfg FROM public.plataforma_config WHERE id;
  v_primeira := NOT EXISTS (SELECT 1 FROM public.confeitarias c WHERE c.user_id <> NEW.id);

  -- A primeira conta de uma instalação nova sempre pode ser criada.
  IF NOT v_primeira AND NOT coalesce(v_cfg.cadastro_aberto, false) THEN
    RAISE EXCEPTION 'CADASTRO_FECHADO: o cadastro de novas confeitarias está fechado.';
  END IF;

  v_nome := left(regexp_replace(btrim(coalesce(v_meta->>'nome_confeitaria', '')), '\s+', ' ', 'g'), 80);
  v_whatsapp := nullif(left(btrim(coalesce(v_meta->>'whatsapp', '')), 30), '');
  v_termos := nullif(left(btrim(coalesce(v_meta->>'termos_versao', '')), 20), '');

  INSERT INTO public.confeitarias (user_id, nome, whatsapp, acesso, acesso_atualizado_em, termos_versao, termos_aceitos_em, onboarding_concluido_em)
  VALUES (
    NEW.id,
    CASE WHEN char_length(v_nome) >= 1 THEN v_nome ELSE 'Minha confeitaria' END,
    v_whatsapp,
    CASE WHEN v_primeira OR NOT coalesce(v_cfg.aprovacao_manual, true) THEN 'ativo' ELSE 'pendente' END,
    now(),
    v_termos,
    CASE WHEN v_termos IS NOT NULL THEN now() END,
    NULL
  )
  ON CONFLICT (user_id) DO NOTHING;

  IF v_primeira THEN
    INSERT INTO public.plataforma_admins (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.criar_confeitaria_novo_usuario() FROM PUBLIC, anon, authenticated;

-- 5. Funções da confeitaria e públicas -----------------------------------------
CREATE OR REPLACE FUNCTION public.eh_admin_plataforma()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT public._eh_admin()
$function$;
REVOKE ALL ON FUNCTION public.eh_admin_plataforma() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_admin_plataforma() TO authenticated;

CREATE OR REPLACE FUNCTION public.aceitar_termos(p_versao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'TERMOS: faça login novamente.'; END IF;
  IF p_versao IS NULL OR p_versao !~ '^[0-9A-Za-z.-]{1,20}$' THEN RAISE EXCEPTION 'TERMOS: versão inválida.'; END IF;
  UPDATE public.confeitarias SET termos_versao = p_versao, termos_aceitos_em = now()
  WHERE user_id = auth.uid();
END;
$function$;
REVOKE ALL ON FUNCTION public.aceitar_termos(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceitar_termos(text) TO authenticated;

-- Dados públicos da plataforma (página de termos, tela de login).
CREATE OR REPLACE FUNCTION public.plataforma_publica()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'cadastro_aberto', coalesce(c.cadastro_aberto, false),
    'aprovacao_manual', coalesce(c.aprovacao_manual, true),
    'empresa_nome', c.empresa_nome,
    'empresa_documento', c.empresa_documento,
    'contato_email', c.contato_email,
    'contato_whatsapp', c.contato_whatsapp
  )
  FROM public.plataforma_config c WHERE c.id
$function$;
REVOKE ALL ON FUNCTION public.plataforma_publica() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plataforma_publica() TO anon, authenticated;

-- 6. Painel da plataforma (somente administradoras) ------------------------------
CREATE OR REPLACE FUNCTION public.admin_listar_confeitarias()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(linha ORDER BY ordem, criado DESC)
    FROM (
      SELECT
        CASE c.acesso WHEN 'pendente' THEN 0 WHEN 'bloqueado' THEN 2 ELSE 1 END AS ordem,
        c.created_at AS criado,
        jsonb_build_object(
          'user_id', c.user_id,
          'nome', c.nome,
          'email', to_jsonb(u)->>'email',
          'whatsapp', c.whatsapp,
          'cidade', c.cidade,
          'slug', c.slug,
          'catalogo_ativo', c.catalogo_ativo,
          'acesso', c.acesso,
          'acesso_atualizado_em', c.acesso_atualizado_em,
          'criado_em', c.created_at,
          'ultimo_acesso', to_jsonb(u)->>'last_sign_in_at',
          'email_confirmado', (to_jsonb(u)->>'email_confirmed_at') IS NOT NULL,
          'onboarding_concluido', c.onboarding_concluido_em IS NOT NULL,
          'termos_aceitos_em', c.termos_aceitos_em,
          'admin', EXISTS (SELECT 1 FROM public.plataforma_admins a WHERE a.user_id = c.user_id),
          'pedidos_total', (SELECT count(*) FROM public.pedidos p WHERE p.user_id = c.user_id),
          'pedidos_30d', (SELECT count(*) FROM public.pedidos p WHERE p.user_id = c.user_id AND p.created_at > now() - interval '30 days'),
          'produtos', (SELECT count(*) FROM public.produtos p WHERE p.user_id = c.user_id),
          'pago_ate', pc.pago_ate,
          'observacao', pc.observacao
        ) AS linha
      FROM public.confeitarias c
      LEFT JOIN auth.users u ON u.id = c.user_id
      LEFT JOIN public.plataforma_contas pc ON pc.user_id = c.user_id
    ) x
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_listar_confeitarias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_confeitarias() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_atualizar_confeitaria(
  p_user_id uuid,
  p_acesso text,
  p_pago_ate date,
  p_observacao text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_obs text := nullif(left(btrim(coalesce(p_observacao, '')), 500), '');
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  IF p_acesso IS NULL OR p_acesso NOT IN ('pendente', 'ativo', 'bloqueado') THEN RAISE EXCEPTION 'ADMIN: situação inválida.'; END IF;
  IF p_user_id = auth.uid() AND p_acesso <> 'ativo' THEN RAISE EXCEPTION 'ADMIN: você não pode bloquear a sua própria conta.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.confeitarias WHERE user_id = p_user_id) THEN RAISE EXCEPTION 'ADMIN: confeitaria não encontrada.'; END IF;

  UPDATE public.confeitarias
  SET acesso = p_acesso,
      acesso_atualizado_em = CASE WHEN acesso IS DISTINCT FROM p_acesso THEN now() ELSE acesso_atualizado_em END
  WHERE user_id = p_user_id;

  INSERT INTO public.plataforma_contas (user_id, pago_ate, observacao, updated_at)
  VALUES (p_user_id, p_pago_ate, v_obs, now())
  ON CONFLICT (user_id) DO UPDATE SET pago_ate = EXCLUDED.pago_ate, observacao = EXCLUDED.observacao, updated_at = now();
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_atualizar_confeitaria(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_atualizar_confeitaria(uuid, text, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_salvar_plataforma(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p->'cadastro_aberto') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p->'aprovacao_manual') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'ADMIN: dados inválidos.';
  END IF;
  UPDATE public.plataforma_config SET
    cadastro_aberto = (p->>'cadastro_aberto')::boolean,
    aprovacao_manual = (p->>'aprovacao_manual')::boolean,
    empresa_nome = nullif(left(btrim(coalesce(p->>'empresa_nome', '')), 120), ''),
    empresa_documento = nullif(left(btrim(coalesce(p->>'empresa_documento', '')), 30), ''),
    contato_email = nullif(left(btrim(coalesce(p->>'contato_email', '')), 120), ''),
    contato_whatsapp = nullif(left(btrim(coalesce(p->>'contato_whatsapp', '')), 30), ''),
    updated_at = now()
  WHERE id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_salvar_plataforma(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_plataforma(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
