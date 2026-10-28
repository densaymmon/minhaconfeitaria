-- Planos e assinaturas; administração separada das confeitarias.
--   1. planos (Essencial, Confeitaria, Vitrine) com preço, limites e recursos;
--   2. assinatura de cada confeitaria: teste grátis, ativa, cortesia ou cancelada,
--      com situação calculada (atrasada após o vencimento; suspensa após a tolerância);
--   3. bloqueio automático: assinatura suspensa ou cancelada entra na política acesso_liberado;
--   4. limites do plano (pedidos por mês, produtos) e catálogo só nos planos com "catalogo";
--   5. administradoras por e-mail, sem confeitaria (login do painel separado);
--   6. funções do painel: resumo, empresas, pagamentos, planos e configurações.
-- Confeitarias existentes recebem o plano Vitrine em cortesia. Não altera pedidos,
-- itens, pagamentos de pedidos, produtos, clientes nem estoque. Idempotente.

BEGIN;

-- 1. Planos --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.planos (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,30}$'),
  nome text NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 40),
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 300),
  preco_mensal numeric(10,2) NOT NULL DEFAULT 0 CHECK (preco_mensal >= 0 AND preco_mensal <= 100000),
  preco_anual numeric(10,2) CHECK (preco_anual IS NULL OR (preco_anual >= 0 AND preco_anual <= 1000000)),
  limite_pedidos_mes integer CHECK (limite_pedidos_mes IS NULL OR limite_pedidos_mes BETWEEN 1 AND 1000000),
  limite_produtos integer CHECK (limite_produtos IS NULL OR limite_produtos BETWEEN 1 AND 1000000),
  recursos text[] NOT NULL DEFAULT '{}'
    CHECK (recursos <@ ARRAY['custos', 'estoque', 'financeiro', 'recorrentes', 'catalogo', 'ia']::text[]),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planos FROM anon, authenticated;
GRANT SELECT ON public.planos TO anon, authenticated;
GRANT ALL ON public.planos TO service_role;
DROP POLICY IF EXISTS planos_leitura ON public.planos;
CREATE POLICY planos_leitura ON public.planos FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.planos (id, nome, descricao, preco_mensal, preco_anual, limite_pedidos_mes, limite_produtos, recursos, ordem) VALUES
  ('essencial', 'Essencial', 'Para quem está começando e vende pelo WhatsApp: pedidos, clientes, produção e Pix.', 29.90, 299.00, 60, 30, '{}', 1),
  ('confeitaria', 'Confeitaria', 'Para saber o lucro real: ficha técnica, custos, estoque, compras e financeiro.', 59.90, 599.00, NULL, NULL,
   '{custos,estoque,financeiro,recorrentes}', 2),
  ('vitrine', 'Vitrine', 'Para vender on-line: tudo do Confeitaria mais catálogo com pedido e Pix, fotos, variações e IA.', 89.90, 899.00, NULL, NULL,
   '{custos,estoque,financeiro,recorrentes,catalogo,ia}', 3)
ON CONFLICT (id) DO NOTHING;

-- 2. Assinaturas -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assinaturas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plano_id text NOT NULL REFERENCES public.planos(id),
  ciclo text NOT NULL DEFAULT 'mensal' CHECK (ciclo IN ('mensal', 'anual')),
  situacao text NOT NULL DEFAULT 'teste' CHECK (situacao IN ('teste', 'ativa', 'cortesia', 'cancelada')),
  teste_ate date,
  pago_ate date,
  valor numeric(10,2) CHECK (valor IS NULL OR (valor >= 0 AND valor <= 1000000)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assinaturas FROM anon, authenticated;
GRANT SELECT ON public.assinaturas TO authenticated;
GRANT ALL ON public.assinaturas TO service_role;
DROP POLICY IF EXISTS assinaturas_dono ON public.assinaturas;
CREATE POLICY assinaturas_dono ON public.assinaturas FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.assinatura_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor numeric(10,2) NOT NULL CHECK (valor >= 0 AND valor <= 1000000),
  pago_em date NOT NULL,
  meses integer NOT NULL CHECK (meses BETWEEN 1 AND 36),
  plano_id text REFERENCES public.planos(id),
  pago_ate_anterior date,
  pago_ate_novo date NOT NULL,
  forma text CHECK (forma IS NULL OR char_length(forma) <= 30),
  observacao text CHECK (observacao IS NULL OR char_length(observacao) <= 300),
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assinatura_pagamentos_user_idx ON public.assinatura_pagamentos (user_id, pago_em DESC);
ALTER TABLE public.assinatura_pagamentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assinatura_pagamentos FROM anon, authenticated;
GRANT SELECT ON public.assinatura_pagamentos TO authenticated;
GRANT ALL ON public.assinatura_pagamentos TO service_role;
DROP POLICY IF EXISTS assinatura_pagamentos_dono ON public.assinatura_pagamentos;
CREATE POLICY assinatura_pagamentos_dono ON public.assinatura_pagamentos FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.plataforma_config
  ADD COLUMN IF NOT EXISTS dias_teste integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS dias_tolerancia integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS plano_teste text NOT NULL DEFAULT 'vitrine';
ALTER TABLE public.plataforma_config DROP CONSTRAINT IF EXISTS plataforma_config_prazos;
ALTER TABLE public.plataforma_config ADD CONSTRAINT plataforma_config_prazos
  CHECK (dias_teste BETWEEN 0 AND 90 AND dias_tolerancia BETWEEN 0 AND 60);

-- Confeitarias existentes: plano Vitrine em cortesia (sem cobrança).
INSERT INTO public.assinaturas (user_id, plano_id, situacao)
SELECT c.user_id, 'vitrine', 'cortesia' FROM public.confeitarias c
ON CONFLICT (user_id) DO NOTHING;

-- Situação efetiva, considerando vencimento e tolerância.
CREATE OR REPLACE FUNCTION public._situacao_assinatura(p_situacao text, p_teste_ate date, p_pago_ate date, p_hoje date, p_tolerancia integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN p_situacao IN ('cortesia', 'cancelada') THEN p_situacao
    WHEN coalesce(CASE WHEN p_situacao = 'teste' THEN p_teste_ate ELSE p_pago_ate END, p_hoje) >= p_hoje
      THEN p_situacao
    WHEN p_hoje <= coalesce(CASE WHEN p_situacao = 'teste' THEN p_teste_ate ELSE p_pago_ate END, p_hoje) + p_tolerancia
      THEN 'atrasada'
    ELSE 'suspensa'
  END
$function$;

CREATE OR REPLACE FUNCTION public._situacao_atual(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT public._situacao_assinatura(a.situacao, a.teste_ate, a.pago_ate, public._hoje_confeitaria(),
           coalesce((SELECT dias_tolerancia FROM public.plataforma_config WHERE id), 7))
  FROM public.assinaturas a WHERE a.user_id = p_user_id
$function$;
REVOKE ALL ON FUNCTION public._situacao_atual(uuid) FROM PUBLIC, anon, authenticated;

-- Sem assinatura (contas antigas) = liberada, para nunca trancar por falta da linha.
CREATE OR REPLACE FUNCTION public._assinatura_liberada(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT coalesce(public._situacao_atual(p_user_id) NOT IN ('suspensa', 'cancelada'), true)
$function$;
REVOKE ALL ON FUNCTION public._assinatura_liberada(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._plano_tem(p_user_id uuid, p_recurso text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT coalesce((
    SELECT p_recurso = ANY (p.recursos)
    FROM public.assinaturas a JOIN public.planos p ON p.id = a.plano_id
    WHERE a.user_id = p_user_id
  ), true)
$function$;
REVOKE ALL ON FUNCTION public._plano_tem(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._catalogo_liberado(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.confeitarias c WHERE c.user_id = p_user_id AND c.acesso = 'ativo')
    AND public._assinatura_liberada(p_user_id)
    AND public._plano_tem(p_user_id, 'catalogo')
$function$;
REVOKE ALL ON FUNCTION public._catalogo_liberado(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Bloqueio automático por assinatura -------------------------------------------
CREATE OR REPLACE FUNCTION public._acesso_liberado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT (
      NOT EXISTS (SELECT 1 FROM public.confeitarias c WHERE c.user_id = auth.uid() AND c.acesso <> 'ativo')
      AND public._assinatura_liberada(auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.plataforma_admins a WHERE a.user_id = auth.uid())
$function$;

-- 4. Limites do plano --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._limite_plano_produtos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_limite integer;
  v_plano text;
BEGIN
  SELECT p.limite_produtos, p.nome INTO v_limite, v_plano
  FROM public.assinaturas a JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id;
  IF v_limite IS NOT NULL AND (SELECT count(*) FROM public.produtos WHERE user_id = NEW.user_id) >= v_limite THEN
    RAISE EXCEPTION 'PLANO: o plano % permite até % produtos. Mude de plano para cadastrar mais.', v_plano, v_limite
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_limite_plano_produtos ON public.produtos;
CREATE TRIGGER trg_limite_plano_produtos BEFORE INSERT ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public._limite_plano_produtos();

CREATE OR REPLACE FUNCTION public._limite_plano_pedidos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_limite integer;
  v_plano text;
  v_inicio timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
  SELECT p.limite_pedidos_mes, p.nome INTO v_limite, v_plano
  FROM public.assinaturas a JOIN public.planos p ON p.id = a.plano_id
  WHERE a.user_id = NEW.user_id;
  IF v_limite IS NOT NULL AND (
    SELECT count(*) FROM public.pedidos WHERE user_id = NEW.user_id AND created_at >= v_inicio
  ) >= v_limite THEN
    RAISE EXCEPTION 'PLANO: o plano % permite até % pedidos por mês. Mude de plano para registrar mais.', v_plano, v_limite
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_limite_plano_pedidos ON public.pedidos;
CREATE TRIGGER trg_limite_plano_pedidos BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public._limite_plano_pedidos();

-- 5. Administradoras por e-mail, fora das confeitarias ------------------------------
CREATE TABLE IF NOT EXISTS public.plataforma_admin_emails (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_admin_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_admin_emails FROM anon, authenticated;
GRANT ALL ON public.plataforma_admin_emails TO service_role;
INSERT INTO public.plataforma_admin_emails (email) VALUES ('dennys.saymmon@gmail.com') ON CONFLICT DO NOTHING;

-- Contas que já existam com e-mail de administração viram administradoras.
INSERT INTO public.plataforma_admins (user_id)
SELECT u.id FROM auth.users u
WHERE lower(to_jsonb(u)->>'email') IN (SELECT email FROM public.plataforma_admin_emails)
ON CONFLICT (user_id) DO NOTHING;
-- Donas de confeitaria deixam de administrar a plataforma (a administração é um login separado).
DELETE FROM public.plataforma_admins a
WHERE EXISTS (SELECT 1 FROM public.confeitarias c WHERE c.user_id = a.user_id)
  AND EXISTS (SELECT 1 FROM public.plataforma_admin_emails);

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
  v_email text := lower(btrim(coalesce(to_jsonb(NEW)->>'email', '')));
  v_nome text;
  v_whatsapp text;
  v_termos text;
  v_plano text;
BEGIN
  -- E-mail de administração: conta só do painel, sem confeitaria.
  IF v_email <> '' AND EXISTS (SELECT 1 FROM public.plataforma_admin_emails e WHERE e.email = v_email) THEN
    INSERT INTO public.plataforma_admins (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END IF;

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

  -- Teste grátis no plano configurado.
  v_plano := coalesce((SELECT id FROM public.planos WHERE id = v_cfg.plano_teste), (SELECT id FROM public.planos ORDER BY ordem DESC LIMIT 1));
  IF v_plano IS NOT NULL THEN
    INSERT INTO public.assinaturas (user_id, plano_id, situacao, teste_ate)
    VALUES (NEW.id, v_plano, 'teste', public._hoje_confeitaria() + coalesce(v_cfg.dias_teste, 14))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Instalação nova sem e-mail de administração: a primeira conta administra.
  IF v_primeira AND NOT EXISTS (SELECT 1 FROM public.plataforma_admin_emails)
     AND NOT EXISTS (SELECT 1 FROM public.plataforma_admins) THEN
    INSERT INTO public.plataforma_admins (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.criar_confeitaria_novo_usuario() FROM PUBLIC, anon, authenticated;

-- 6. Funções da confeitaria ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minha_assinatura()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  a public.assinaturas%ROWTYPE;
  p public.planos%ROWTYPE;
  v_tol integer := coalesce((SELECT dias_tolerancia FROM public.plataforma_config WHERE id), 7);
  v_hoje date := public._hoje_confeitaria();
  v_venc date;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.assinaturas WHERE user_id = auth.uid();
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.planos WHERE id = a.plano_id;
  v_venc := CASE WHEN a.situacao = 'teste' THEN a.teste_ate WHEN a.situacao = 'ativa' THEN a.pago_ate END;
  RETURN jsonb_build_object(
    'plano', jsonb_build_object('id', p.id, 'nome', p.nome, 'recursos', to_jsonb(p.recursos),
      'limite_pedidos_mes', p.limite_pedidos_mes, 'limite_produtos', p.limite_produtos,
      'preco_mensal', p.preco_mensal, 'preco_anual', p.preco_anual),
    'situacao', public._situacao_assinatura(a.situacao, a.teste_ate, a.pago_ate, v_hoje, v_tol),
    'situacao_cadastrada', a.situacao,
    'ciclo', a.ciclo,
    'valor', coalesce(a.valor, CASE WHEN a.ciclo = 'anual' THEN p.preco_anual ELSE p.preco_mensal END),
    'vencimento', v_venc,
    'bloqueio_em', CASE WHEN v_venc IS NOT NULL THEN v_venc + v_tol + 1 END,
    'hoje', v_hoje,
    'uso', jsonb_build_object(
      'produtos', (SELECT count(*) FROM public.produtos WHERE user_id = auth.uid()),
      'pedidos_mes', (SELECT count(*) FROM public.pedidos WHERE user_id = auth.uid()
        AND created_at >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.minha_assinatura() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minha_assinatura() TO authenticated;

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
    'contato_whatsapp', c.contato_whatsapp,
    'dias_teste', c.dias_teste,
    'dias_tolerancia', c.dias_tolerancia
  )
  FROM public.plataforma_config c WHERE c.id
$function$;

-- 7. Painel da plataforma (somente administradoras) -----------------------------------
CREATE OR REPLACE FUNCTION public.admin_listar_confeitarias()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tol integer := coalesce((SELECT dias_tolerancia FROM public.plataforma_config WHERE id), 7);
  v_hoje date := public._hoje_confeitaria();
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(linha ORDER BY ordem, criado DESC)
    FROM (
      SELECT
        CASE c.acesso WHEN 'pendente' THEN 0 WHEN 'bloqueado' THEN 3 ELSE
          CASE public._situacao_assinatura(a.situacao, a.teste_ate, a.pago_ate, v_hoje, v_tol)
            WHEN 'suspensa' THEN 1 WHEN 'atrasada' THEN 1 ELSE 2 END END AS ordem,
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
          'criado_em', c.created_at,
          'ultimo_acesso', to_jsonb(u)->>'last_sign_in_at',
          'email_confirmado', (to_jsonb(u)->>'email_confirmed_at') IS NOT NULL,
          'onboarding_concluido', c.onboarding_concluido_em IS NOT NULL,
          'termos_aceitos_em', c.termos_aceitos_em,
          'pedidos_total', (SELECT count(*) FROM public.pedidos p WHERE p.user_id = c.user_id),
          'pedidos_30d', (SELECT count(*) FROM public.pedidos p WHERE p.user_id = c.user_id AND p.created_at > now() - interval '30 days'),
          'produtos', (SELECT count(*) FROM public.produtos p WHERE p.user_id = c.user_id),
          'observacao', pc.observacao,
          'plano_id', a.plano_id,
          'plano_nome', pl.nome,
          'ciclo', a.ciclo,
          'situacao_cadastrada', a.situacao,
          'situacao', public._situacao_assinatura(a.situacao, a.teste_ate, a.pago_ate, v_hoje, v_tol),
          'teste_ate', a.teste_ate,
          'pago_ate', a.pago_ate,
          'valor', a.valor,
          'valor_efetivo', coalesce(a.valor, CASE WHEN a.ciclo = 'anual' THEN pl.preco_anual ELSE pl.preco_mensal END),
          'ultimo_pagamento', (SELECT max(pg.pago_em) FROM public.assinatura_pagamentos pg WHERE pg.user_id = c.user_id)
        ) AS linha
      FROM public.confeitarias c
      LEFT JOIN auth.users u ON u.id = c.user_id
      LEFT JOIN public.plataforma_contas pc ON pc.user_id = c.user_id
      LEFT JOIN public.assinaturas a ON a.user_id = c.user_id
      LEFT JOIN public.planos pl ON pl.id = a.plano_id
    ) x
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resumo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_tol integer := coalesce((SELECT dias_tolerancia FROM public.plataforma_config WHERE id), 7);
  v_hoje date := public._hoje_confeitaria();
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN (
    WITH s AS (
      SELECT c.user_id, c.acesso, a.ciclo, a.situacao AS cadastrada,
        public._situacao_assinatura(a.situacao, a.teste_ate, a.pago_ate, v_hoje, v_tol) AS situacao,
        CASE WHEN a.situacao = 'teste' THEN a.teste_ate WHEN a.situacao = 'ativa' THEN a.pago_ate END AS vencimento,
        coalesce(a.valor, CASE WHEN a.ciclo = 'anual' THEN pl.preco_anual ELSE pl.preco_mensal END) AS valor
      FROM public.confeitarias c
      LEFT JOIN public.assinaturas a ON a.user_id = c.user_id
      LEFT JOIN public.planos pl ON pl.id = a.plano_id
    )
    SELECT jsonb_build_object(
      'total', count(*),
      'pendentes', count(*) FILTER (WHERE acesso = 'pendente'),
      'bloqueadas', count(*) FILTER (WHERE acesso = 'bloqueado'),
      'em_teste', count(*) FILTER (WHERE acesso = 'ativo' AND situacao = 'teste'),
      'ativas', count(*) FILTER (WHERE acesso = 'ativo' AND situacao = 'ativa'),
      'cortesia', count(*) FILTER (WHERE acesso = 'ativo' AND situacao = 'cortesia'),
      'atrasadas', count(*) FILTER (WHERE acesso = 'ativo' AND situacao = 'atrasada'),
      'suspensas', count(*) FILTER (WHERE acesso = 'ativo' AND situacao IN ('suspensa', 'cancelada')),
      'vencem_7_dias', count(*) FILTER (WHERE acesso = 'ativo' AND situacao IN ('teste', 'ativa') AND vencimento BETWEEN v_hoje AND v_hoje + 7),
      'receita_mensal', coalesce(sum(CASE WHEN ciclo = 'anual' THEN valor / 12 ELSE valor END)
                          FILTER (WHERE acesso = 'ativo' AND cadastrada = 'ativa' AND situacao IN ('ativa', 'atrasada')), 0),
      'recebido_30_dias', (SELECT coalesce(sum(valor), 0) FROM public.assinatura_pagamentos WHERE pago_em > v_hoje - 30),
      'recebido_mes', (SELECT coalesce(sum(valor), 0) FROM public.assinatura_pagamentos WHERE pago_em >= date_trunc('month', v_hoje)::date)
    )
    FROM s
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resumo() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_salvar_empresa(p_user_id uuid, p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  c public.confeitarias%ROWTYPE;
  v_acesso text := p->>'acesso';
  v_plano text := p->>'plano_id';
  v_ciclo text := coalesce(p->>'ciclo', 'mensal');
  v_situacao text := p->>'situacao';
  v_teste date;
  v_pago date;
  v_valor numeric;
  v_dias_teste integer := coalesce((SELECT dias_teste FROM public.plataforma_config WHERE id), 14);
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  SELECT * INTO c FROM public.confeitarias WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN: empresa não encontrada.'; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'ADMIN: dados inválidos.'; END IF;
  IF v_acesso IS NULL OR v_acesso NOT IN ('pendente', 'ativo', 'bloqueado') THEN RAISE EXCEPTION 'ADMIN: situação de acesso inválida.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.planos WHERE id = v_plano) THEN RAISE EXCEPTION 'ADMIN: escolha um plano.'; END IF;
  IF v_ciclo NOT IN ('mensal', 'anual') THEN RAISE EXCEPTION 'ADMIN: ciclo inválido.'; END IF;
  IF v_situacao IS NULL OR v_situacao NOT IN ('teste', 'ativa', 'cortesia', 'cancelada') THEN RAISE EXCEPTION 'ADMIN: situação da assinatura inválida.'; END IF;
  BEGIN
    v_teste := nullif(p->>'teste_ate', '')::date;
    v_pago := nullif(p->>'pago_ate', '')::date;
    v_valor := nullif(p->>'valor', '')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ADMIN: confira as datas e o valor.';
  END;
  IF v_valor IS NOT NULL AND (v_valor < 0 OR v_valor > 1000000) THEN RAISE EXCEPTION 'ADMIN: valor inválido.'; END IF;
  IF v_situacao = 'teste' AND v_teste IS NULL THEN RAISE EXCEPTION 'ADMIN: informe até quando vai o teste grátis.'; END IF;
  IF v_situacao = 'ativa' AND v_pago IS NULL THEN RAISE EXCEPTION 'ADMIN: informe até quando a mensalidade está paga.'; END IF;

  -- Ao liberar uma conta pendente em teste, o teste grátis começa na liberação.
  IF c.acesso = 'pendente' AND v_acesso = 'ativo' AND v_situacao = 'teste'
     AND v_teste IS NOT DISTINCT FROM (SELECT teste_ate FROM public.assinaturas WHERE user_id = p_user_id) THEN
    v_teste := greatest(v_teste, public._hoje_confeitaria() + v_dias_teste);
  END IF;

  UPDATE public.confeitarias
  SET acesso = v_acesso,
      acesso_atualizado_em = CASE WHEN acesso IS DISTINCT FROM v_acesso THEN now() ELSE acesso_atualizado_em END
  WHERE user_id = p_user_id;

  INSERT INTO public.assinaturas (user_id, plano_id, ciclo, situacao, teste_ate, pago_ate, valor, updated_at)
  VALUES (p_user_id, v_plano, v_ciclo, v_situacao, v_teste, v_pago, v_valor, now())
  ON CONFLICT (user_id) DO UPDATE SET plano_id = EXCLUDED.plano_id, ciclo = EXCLUDED.ciclo, situacao = EXCLUDED.situacao,
    teste_ate = EXCLUDED.teste_ate, pago_ate = EXCLUDED.pago_ate, valor = EXCLUDED.valor, updated_at = now();

  INSERT INTO public.plataforma_contas (user_id, observacao, updated_at)
  VALUES (p_user_id, nullif(left(btrim(coalesce(p->>'observacao', '')), 500), ''), now())
  ON CONFLICT (user_id) DO UPDATE SET observacao = EXCLUDED.observacao, updated_at = now();
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_salvar_empresa(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_empresa(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_registrar_pagamento(
  p_user_id uuid, p_valor numeric, p_pago_em date, p_meses integer, p_forma text, p_observacao text
) RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  a public.assinaturas%ROWTYPE;
  v_base date;
  v_novo date;
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  IF p_valor IS NULL OR p_valor < 0 OR p_valor > 1000000 THEN RAISE EXCEPTION 'ADMIN: valor inválido.'; END IF;
  IF p_pago_em IS NULL OR p_pago_em > public._hoje_confeitaria() + 1 THEN RAISE EXCEPTION 'ADMIN: data do pagamento inválida.'; END IF;
  IF p_meses IS NULL OR p_meses NOT BETWEEN 1 AND 36 THEN RAISE EXCEPTION 'ADMIN: o pagamento deve cobrir de 1 a 36 meses.'; END IF;
  SELECT * INTO a FROM public.assinaturas WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ADMIN: empresa sem assinatura. Escolha um plano antes.'; END IF;

  -- O período pago começa no fim do teste, no vencimento atual (se ainda recente) ou na data do pagamento.
  v_base := CASE
    WHEN a.situacao = 'teste' THEN greatest(coalesce(a.teste_ate, p_pago_em), p_pago_em)
    WHEN a.pago_ate IS NULL OR a.pago_ate < p_pago_em - 31 THEN p_pago_em
    ELSE a.pago_ate
  END;
  v_novo := (v_base + make_interval(months => p_meses))::date;

  INSERT INTO public.assinatura_pagamentos (user_id, valor, pago_em, meses, plano_id, pago_ate_anterior, pago_ate_novo, forma, observacao, registrado_por)
  VALUES (p_user_id, round(p_valor, 2), p_pago_em, p_meses, a.plano_id, a.pago_ate, v_novo,
          nullif(left(btrim(coalesce(p_forma, '')), 30), ''), nullif(left(btrim(coalesce(p_observacao, '')), 300), ''), auth.uid());

  UPDATE public.assinaturas
  SET pago_ate = v_novo,
      situacao = CASE WHEN situacao = 'cortesia' THEN 'cortesia' ELSE 'ativa' END,
      updated_at = now()
  WHERE user_id = p_user_id;
  RETURN v_novo;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_registrar_pagamento(uuid, numeric, date, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_registrar_pagamento(uuid, numeric, date, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_listar_pagamentos(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', pg.id, 'valor', pg.valor, 'pago_em', pg.pago_em, 'meses', pg.meses, 'plano_id', pg.plano_id,
      'pago_ate_novo', pg.pago_ate_novo, 'forma', pg.forma, 'observacao', pg.observacao,
      'empresa', c.nome, 'user_id', pg.user_id
    ) ORDER BY pg.pago_em DESC, pg.created_at DESC)
    FROM public.assinatura_pagamentos pg
    LEFT JOIN public.confeitarias c ON c.user_id = pg.user_id
    WHERE p_user_id IS NULL OR pg.user_id = p_user_id
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_listar_pagamentos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_pagamentos(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_salvar_plano(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_id text := lower(btrim(coalesce(p->>'id', '')));
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  IF v_id !~ '^[a-z0-9-]{2,30}$' THEN RAISE EXCEPTION 'ADMIN: código do plano inválido (2 a 30 letras minúsculas, números ou hífens).'; END IF;
  IF jsonb_typeof(p->'recursos') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ADMIN: recursos inválidos.'; END IF;
  BEGIN
    INSERT INTO public.planos (id, nome, descricao, preco_mensal, preco_anual, limite_pedidos_mes, limite_produtos, recursos, ordem, ativo, updated_at)
    VALUES (
      v_id,
      btrim(p->>'nome'),
      nullif(btrim(coalesce(p->>'descricao', '')), ''),
      (p->>'preco_mensal')::numeric,
      nullif(p->>'preco_anual', '')::numeric,
      nullif(p->>'limite_pedidos_mes', '')::integer,
      nullif(p->>'limite_produtos', '')::integer,
      ARRAY(SELECT jsonb_array_elements_text(p->'recursos')),
      coalesce(nullif(p->>'ordem', '')::integer, 0),
      coalesce((p->>'ativo')::boolean, true),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, preco_mensal = EXCLUDED.preco_mensal,
      preco_anual = EXCLUDED.preco_anual, limite_pedidos_mes = EXCLUDED.limite_pedidos_mes, limite_produtos = EXCLUDED.limite_produtos,
      recursos = EXCLUDED.recursos, ordem = EXCLUDED.ordem, ativo = EXCLUDED.ativo, updated_at = now();
  EXCEPTION
    WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'ADMIN: confira nome, preços, limites e recursos do plano.';
  END;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_salvar_plano(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salvar_plano(jsonb) TO authenticated;

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
  BEGIN
    UPDATE public.plataforma_config SET
      cadastro_aberto = (p->>'cadastro_aberto')::boolean,
      aprovacao_manual = (p->>'aprovacao_manual')::boolean,
      empresa_nome = nullif(left(btrim(coalesce(p->>'empresa_nome', '')), 120), ''),
      empresa_documento = nullif(left(btrim(coalesce(p->>'empresa_documento', '')), 30), ''),
      contato_email = nullif(left(btrim(coalesce(p->>'contato_email', '')), 120), ''),
      contato_whatsapp = nullif(left(btrim(coalesce(p->>'contato_whatsapp', '')), 30), ''),
      dias_teste = coalesce(nullif(p->>'dias_teste', '')::integer, dias_teste),
      dias_tolerancia = coalesce(nullif(p->>'dias_tolerancia', '')::integer, dias_tolerancia),
      plano_teste = coalesce((SELECT id FROM public.planos WHERE id = p->>'plano_teste'), plano_teste),
      updated_at = now()
    WHERE id;
  EXCEPTION WHEN check_violation OR invalid_text_representation THEN
    RAISE EXCEPTION 'ADMIN: o teste grátis deve ter de 0 a 90 dias e a tolerância de 0 a 60 dias.';
  END;
END;
$function$;

-- Configuração completa para o painel (inclui plano do teste).
CREATE OR REPLACE FUNCTION public.admin_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN (SELECT to_jsonb(c) - 'id' FROM public.plataforma_config c WHERE c.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_config() TO authenticated;

-- A função antiga do painel dentro da confeitaria deixa de existir.
DROP FUNCTION IF EXISTS public.admin_atualizar_confeitaria(uuid, text, date, text);

-- 8. Catálogo só com acesso liberado, assinatura em dia e plano com catálogo ----------
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
