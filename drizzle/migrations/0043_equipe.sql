-- Vários usuários por confeitaria (equipe).
--
-- Cada confeitaria continua sendo identificada pelo id da conta dona (user_id). Um membro
-- da equipe enxerga e grava os dados da confeitaria da qual faz parte: tudo que antes usava
-- auth.uid() como "a confeitaria" passa a usar public._tenant(), que devolve o id da dona
-- para membros e o próprio id para quem não é membro (comportamento antigo, sem mudança).
--
-- Papéis: dono (conta que criou a confeitaria), gerente (tudo, menos gerir a equipe) e
-- producao (pedidos, produção, produtos e clientes; sem financeiro, compras, cupons e
-- configurações — bloqueado também no banco).
--
-- A reescrita de políticas, padrões de coluna e funções é automática e idempotente: só
-- toca o que ainda usa auth.uid(). Migrações futuras devem usar public._tenant().

BEGIN;

-- 1. Tabelas da equipe --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.equipe_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) <= 200),
  nome text CHECK (nome IS NULL OR char_length(nome) <= 80),
  papel text NOT NULL CHECK (papel IN ('gerente', 'producao')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipe_membro_nao_e_dono CHECK (dono_id <> membro_id)
);
CREATE INDEX IF NOT EXISTS equipe_membros_dono_idx ON public.equipe_membros (dono_id);

CREATE TABLE IF NOT EXISTS public.equipe_convites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dono_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 200),
  papel text NOT NULL CHECK (papel IN ('gerente', 'producao')),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT now() + interval '7 days',
  aceito_em timestamptz,
  cancelado_em timestamptz
);
CREATE INDEX IF NOT EXISTS equipe_convites_dono_idx ON public.equipe_convites (dono_id);

-- 2. Quem é a confeitaria e qual o papel de quem está logado ---------------------------
CREATE OR REPLACE FUNCTION public._tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT coalesce((SELECT m.dono_id FROM public.equipe_membros m WHERE m.membro_id = auth.uid()), auth.uid())
$function$;
REVOKE ALL ON FUNCTION public._tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._tenant() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._papel()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT coalesce((SELECT m.papel FROM public.equipe_membros m WHERE m.membro_id = auth.uid()), 'dono')
$function$;
REVOKE ALL ON FUNCTION public._papel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._papel() TO anon, authenticated, service_role;

-- Operações de dinheiro: a produção não faz (erro claro em vez de gravar).
CREATE OR REPLACE FUNCTION public._tenant_financeiro()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF public._papel() = 'producao' THEN
    RAISE EXCEPTION 'EQUIPE: seu acesso é de produção. Peça para a dona ou a gerência fazer esta operação.';
  END IF;
  RETURN public._tenant();
END;
$function$;
REVOKE ALL ON FUNCTION public._tenant_financeiro() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._tenant_financeiro() TO authenticated, service_role;

-- 3. Reescrita: políticas, padrões de coluna e funções passam a usar a confeitaria ------
DO $reescrita$
DECLARE
  r record;
  v_using text;
  v_check text;
  v_def text;
  v_financeiras text[] := ARRAY[
    'registrar_recebimento_pedido', 'editar_recebimento_pedido', 'corrigir_valor_pago_pedido_com_producao',
    'editar_valores_pedido_com_producao', 'salvar_compra', 'cancelar_compra', 'excluir_compra',
    'editar_conta_pagar_parcelada', 'registrar_local_compra', 'registrar_conta_pagar_parcelada', 'salvar_conta_pagar',
    'cancelar_conta_pagar', 'estornar_pagamento_conta_pagar', 'excluir_conta_pagar_cancelada', 'registrar_pagamento_conta_pagar',
    'registrar_pagamento_compra', 'reconciliar_compra_com_pagamentos'];
  -- Estas tratam da pessoa (administração da plataforma, aceite dos termos), não da confeitaria.
  v_pessoais text[] := ARRAY['_eh_admin', 'eh_admin_plataforma', 'aceitar_termos', '_tenant', '_papel', '_tenant_financeiro'];
BEGIN
  -- Políticas (tabelas públicas e, quando existir, o armazenamento de fotos).
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (coalesce(qual, '') LIKE '%auth.uid()%' OR coalesce(with_check, '') LIKE '%auth.uid()%')
      AND tablename NOT IN ('equipe_membros', 'equipe_convites', 'plataforma_admins')
  LOOP
    v_using := replace(r.qual, 'auth.uid()', '( SELECT public._tenant() )');
    v_check := replace(r.with_check, 'auth.uid()', '( SELECT public._tenant() )');
    EXECUTE format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename)
      || CASE WHEN v_using IS NOT NULL THEN format(' USING (%s)', v_using) ELSE '' END
      || CASE WHEN v_check IS NOT NULL THEN format(' WITH CHECK (%s)', v_check) ELSE '' END;
  END LOOP;

  -- Valor padrão de user_id: registros criados por membros pertencem à confeitaria.
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_default LIKE '%auth.uid()%'
      AND table_name NOT IN ('equipe_membros', 'equipe_convites', 'plataforma_admins')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT public._tenant()', r.table_name, r.column_name);
  END LOOP;

  -- Funções: auth.uid() -> _tenant() (ou _tenant_financeiro() nas operações de dinheiro).
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
      AND p.prosrc LIKE '%auth.uid()%'
      AND NOT (p.proname = ANY (v_pessoais))
      AND p.proname NOT LIKE 'admin\_%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'auth.uid()',
      CASE WHEN r.proname = ANY (v_financeiras) THEN 'public._tenant_financeiro()' ELSE 'public._tenant()' END);
    EXECUTE v_def;
  END LOOP;
END
$reescrita$;

-- 4. Papel "produção": sem financeiro, compras, cupons e configurações -------------------
DO $papeis$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['despesas', 'contas_pagar', 'contas_pagar_pagamentos', 'contas_pagar_estornos', 'contas_pagar_exclusoes',
                           'contas_pagar_operacoes', 'contas_pagar_auditoria', 'compras', 'compra_itens', 'cupons',
                           'pedido_pagamentos', 'assinatura_pagamentos'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS papel_financeiro ON public.%I', t);
    EXECUTE format('CREATE POLICY papel_financeiro ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT public._papel()) <> ''producao'') WITH CHECK ((SELECT public._papel()) <> ''producao'')', t);
  END LOOP;
  -- Configurações e dados da loja: a produção lê (preços, Pix no aviso), mas não altera.
  FOREACH t IN ARRAY ARRAY['configuracoes', 'confeitarias'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS papel_altera_ins ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS papel_altera_upd ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS papel_altera_del ON public.%I', t);
    EXECUTE format('CREATE POLICY papel_altera_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK ((SELECT public._papel()) <> ''producao'')', t);
    EXECUTE format('CREATE POLICY papel_altera_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
      USING ((SELECT public._papel()) <> ''producao'')', t);
    EXECUTE format('CREATE POLICY papel_altera_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((SELECT public._papel()) <> ''producao'')', t);
  END LOOP;
END
$papeis$;

-- 5. Leitura da equipe e dos convites ----------------------------------------------------
ALTER TABLE public.equipe_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_convites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipe_membros, public.equipe_convites FROM anon, authenticated;
GRANT SELECT ON public.equipe_membros, public.equipe_convites TO authenticated;
GRANT ALL ON public.equipe_membros, public.equipe_convites TO service_role;
DROP POLICY IF EXISTS equipe_membros_ver ON public.equipe_membros;
CREATE POLICY equipe_membros_ver ON public.equipe_membros FOR SELECT TO authenticated
  USING (dono_id = (SELECT public._tenant()));
DROP POLICY IF EXISTS equipe_convites_ver ON public.equipe_convites;
CREATE POLICY equipe_convites_ver ON public.equipe_convites FOR SELECT TO authenticated
  USING (dono_id = (SELECT public._tenant()) AND (SELECT public._papel()) = 'dono');
DROP POLICY IF EXISTS acesso_liberado ON public.equipe_membros;
CREATE POLICY acesso_liberado ON public.equipe_membros AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado()));
DROP POLICY IF EXISTS acesso_liberado ON public.equipe_convites;
CREATE POLICY acesso_liberado ON public.equipe_convites AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado()));

-- 6. Operações da equipe -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_papel()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
    'papel', public._papel(),
    'confeitaria_id', public._tenant(),
    'confeitaria', (SELECT c.nome FROM public.confeitarias c WHERE c.user_id = public._tenant())
  ) END
$function$;
REVOKE ALL ON FUNCTION public.meu_papel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meu_papel() TO authenticated;

CREATE OR REPLACE FUNCTION public._exigir_dono()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'EQUIPE: entre na sua conta.'; END IF;
  IF public._papel() <> 'dono' OR NOT EXISTS (SELECT 1 FROM public.confeitarias WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'EQUIPE: só a conta dona da confeitaria gerencia a equipe.';
  END IF;
  IF NOT public._acesso_liberado() THEN RAISE EXCEPTION 'EQUIPE: acesso da confeitaria não liberado.'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._exigir_dono() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.convidar_membro(p_email text, p_papel text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_convite public.equipe_convites%ROWTYPE;
BEGIN
  PERFORM public._exigir_dono();
  IF p_papel IS NULL OR p_papel NOT IN ('gerente', 'producao') THEN RAISE EXCEPTION 'EQUIPE: escolha o papel (gerente ou produção).'; END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' OR char_length(v_email) > 200 THEN
    RAISE EXCEPTION 'EQUIPE: informe um e-mail válido.';
  END IF;
  IF v_email = lower(coalesce(auth.jwt()->>'email', '')) THEN RAISE EXCEPTION 'EQUIPE: este é o seu próprio e-mail.'; END IF;
  IF EXISTS (SELECT 1 FROM public.equipe_membros WHERE dono_id = auth.uid() AND lower(email) = v_email) THEN
    RAISE EXCEPTION 'EQUIPE: esta pessoa já faz parte da equipe.';
  END IF;
  IF (SELECT count(*) FROM public.equipe_membros WHERE dono_id = auth.uid())
     + (SELECT count(*) FROM public.equipe_convites WHERE dono_id = auth.uid() AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > now() AND email <> v_email) >= 10 THEN
    RAISE EXCEPTION 'EQUIPE: a equipe pode ter até 10 pessoas (contando convites pendentes).';
  END IF;
  -- Um convite válido por e-mail: o novo substitui o anterior.
  UPDATE public.equipe_convites SET cancelado_em = now()
  WHERE dono_id = auth.uid() AND email = v_email AND aceito_em IS NULL AND cancelado_em IS NULL;
  INSERT INTO public.equipe_convites (dono_id, email, papel) VALUES (auth.uid(), v_email, p_papel)
  RETURNING * INTO v_convite;
  RETURN jsonb_build_object('id', v_convite.id, 'token', v_convite.token, 'expira_em', v_convite.expira_em);
END;
$function$;
REVOKE ALL ON FUNCTION public.convidar_membro(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convidar_membro(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_convite(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public._exigir_dono();
  UPDATE public.equipe_convites SET cancelado_em = now()
  WHERE id = p_id AND dono_id = auth.uid() AND aceito_em IS NULL AND cancelado_em IS NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.cancelar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_convite(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.alterar_membro(p_id uuid, p_papel text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public._exigir_dono();
  IF p_papel IS NULL THEN
    DELETE FROM public.equipe_membros WHERE id = p_id AND dono_id = auth.uid();
  ELSIF p_papel IN ('gerente', 'producao') THEN
    UPDATE public.equipe_membros SET papel = p_papel WHERE id = p_id AND dono_id = auth.uid();
  ELSE
    RAISE EXCEPTION 'EQUIPE: papel inválido.';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'EQUIPE: pessoa não encontrada na sua equipe.'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.alterar_membro(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alterar_membro(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sair_da_equipe()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  DELETE FROM public.equipe_membros WHERE membro_id = auth.uid()
$function$;
REVOKE ALL ON FUNCTION public.sair_da_equipe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sair_da_equipe() TO authenticated;

-- Página pública do convite: nome da confeitaria, papel e e-mail convidado.
CREATE OR REPLACE FUNCTION public.ver_convite(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'confeitaria', c.nome,
    'papel', v.papel,
    'email', v.email,
    'valido', v.aceito_em IS NULL AND v.cancelado_em IS NULL AND v.expira_em > now() AND c.acesso = 'ativo',
    'aceito', v.aceito_em IS NOT NULL)
  FROM public.equipe_convites v JOIN public.confeitarias c ON c.user_id = v.dono_id
  WHERE v.token = p_token
$function$;
REVOKE ALL ON FUNCTION public.ver_convite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ver_convite(uuid) TO anon, authenticated;

-- Liga a pessoa à confeitaria (usado no aceite e no cadastro pelo link do convite).
CREATE OR REPLACE FUNCTION public._entrar_na_equipe(p_convite public.equipe_convites, p_membro uuid, p_email text, p_nome text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_convite.id IS NULL OR p_convite.aceito_em IS NOT NULL OR p_convite.cancelado_em IS NOT NULL OR p_convite.expira_em <= now() THEN
    RAISE EXCEPTION 'EQUIPE: convite inválido ou expirado. Peça um novo link.';
  END IF;
  IF lower(coalesce(p_email, '')) <> p_convite.email THEN
    RAISE EXCEPTION 'EQUIPE: este convite foi enviado para %. Entre com esse e-mail.', p_convite.email;
  END IF;
  IF p_membro = p_convite.dono_id THEN RAISE EXCEPTION 'EQUIPE: você já é a dona desta confeitaria.'; END IF;
  IF EXISTS (SELECT 1 FROM public.equipe_membros WHERE membro_id = p_membro) THEN
    RAISE EXCEPTION 'EQUIPE: esta conta já faz parte de uma equipe. Saia dela antes de aceitar.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.equipe_membros WHERE dono_id = p_membro) THEN
    RAISE EXCEPTION 'EQUIPE: esta conta tem uma equipe própria e não pode entrar em outra.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos WHERE user_id = p_membro) OR EXISTS (SELECT 1 FROM public.produtos WHERE user_id = p_membro)
     OR EXISTS (SELECT 1 FROM public.clientes WHERE user_id = p_membro) THEN
    RAISE EXCEPTION 'EQUIPE: esta conta já tem uma confeitaria com dados. Use outro e-mail para entrar na equipe.';
  END IF;
  -- Conta sem dados: a confeitaria vazia dela some e ela passa a ver a da equipe.
  DELETE FROM public.assinaturas WHERE user_id = p_membro;
  DELETE FROM public.configuracoes WHERE user_id = p_membro;
  DELETE FROM public.confeitarias WHERE user_id = p_membro;
  INSERT INTO public.equipe_membros (dono_id, membro_id, email, nome, papel)
  VALUES (p_convite.dono_id, p_membro, p_convite.email, nullif(left(btrim(coalesce(p_nome, '')), 80), ''), p_convite.papel);
  UPDATE public.equipe_convites SET aceito_em = now() WHERE id = p_convite.id;
END;
$function$;
REVOKE ALL ON FUNCTION public._entrar_na_equipe(public.equipe_convites, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aceitar_convite(p_token uuid, p_nome text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_convite public.equipe_convites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'EQUIPE: entre na sua conta para aceitar o convite.'; END IF;
  SELECT * INTO v_convite FROM public.equipe_convites WHERE token = p_token FOR UPDATE;
  PERFORM public._entrar_na_equipe(v_convite, auth.uid(), auth.jwt()->>'email', p_nome);
  RETURN public.meu_papel();
END;
$function$;
REVOKE ALL ON FUNCTION public.aceitar_convite(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aceitar_convite(uuid, text) TO authenticated;

-- 7. Cadastro pelo link do convite: entra direto na equipe, mesmo com cadastro fechado ----
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
  v_convite public.equipe_convites%ROWTYPE;
BEGIN
  -- E-mail de administração: conta só do painel, sem confeitaria.
  IF v_email <> '' AND EXISTS (SELECT 1 FROM public.plataforma_admin_emails e WHERE e.email = v_email) THEN
    INSERT INTO public.plataforma_admins (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Convite de equipe válido para este e-mail: a conta entra na confeitaria que convidou.
  IF coalesce(v_meta->>'convite_token', '') ~ '^[0-9a-fA-F-]{36}$' THEN
    SELECT * INTO v_convite FROM public.equipe_convites
    WHERE token = (v_meta->>'convite_token')::uuid AND email = v_email
      AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > now()
    FOR UPDATE;
    IF FOUND THEN
      PERFORM public._entrar_na_equipe(v_convite, NEW.id, v_email, v_meta->>'nome');
      RETURN NEW;
    END IF;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
