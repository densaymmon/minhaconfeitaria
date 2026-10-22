-- Implantação administrativa isolada do módulo Contas a Pagar.
-- NÃO é uma migration Drizzle: não mova este arquivo para drizzle/migrations.
-- Execute somente após revisão, no ambiente de teste primeiro e com autorização explícita para produção.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $preflight$
BEGIN
  IF to_regclass('public.contas_pagar') IS NOT NULL THEN
    RAISE EXCEPTION 'A tabela public.contas_pagar já existe. Pare e inspecione o esquema existente antes de aplicar esta migração.';
  END IF;
  IF to_regclass('public.compras') IS NULL THEN
    RAISE EXCEPTION 'A tabela public.compras não existe; a migração foi interrompida sem alterações.';
  END IF;
END
$preflight$;

CREATE TABLE public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  compra_id uuid REFERENCES public.compras(id) ON DELETE RESTRICT,
  descricao text NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 200),
  fornecedor text,
  data_emissao date NOT NULL DEFAULT current_date,
  data_vencimento date NOT NULL DEFAULT current_date,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  valor_pago numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_pago >= 0 AND valor_pago <= valor),
  data_pagamento date,
  forma_pagamento text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','parcial','pago','cancelado')),
  cancelada_em timestamptz,
  motivo_cancelamento text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (
    (status = 'cancelado' AND cancelada_em IS NOT NULL AND length(trim(coalesce(motivo_cancelamento,''))) > 0)
    OR (status <> 'cancelado' AND cancelada_em IS NULL AND motivo_cancelamento IS NULL)
  )
);

CREATE INDEX contas_pagar_user_vencimento_idx ON public.contas_pagar(user_id, data_vencimento);
CREATE INDEX contas_pagar_user_status_idx ON public.contas_pagar(user_id, status);

CREATE TABLE public.contas_pagar_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL,
  user_id uuid NOT NULL,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  data_pagamento date NOT NULL DEFAULT current_date,
  forma_pagamento text NOT NULL CHECK (length(trim(forma_pagamento)) BETWEEN 1 AND 40),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, conta_id, user_id),
  FOREIGN KEY (conta_id, user_id) REFERENCES public.contas_pagar(id, user_id) ON DELETE RESTRICT
);
CREATE INDEX contas_pagar_pagamentos_conta_idx ON public.contas_pagar_pagamentos(user_id, conta_id, data_pagamento DESC);

CREATE TABLE public.contas_pagar_estornos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pagamento_id uuid NOT NULL,
  conta_id uuid NOT NULL,
  user_id uuid NOT NULL,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  motivo text NOT NULL CHECK (length(trim(motivo)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (pagamento_id, conta_id, user_id)
    REFERENCES public.contas_pagar_pagamentos(id, conta_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (conta_id, user_id)
    REFERENCES public.contas_pagar(id, user_id) ON DELETE RESTRICT
);
CREATE INDEX contas_pagar_estornos_pagamento_idx ON public.contas_pagar_estornos(user_id, pagamento_id);

CREATE TABLE public.contas_pagar_operacoes (
  user_id uuid NOT NULL,
  operacao_id uuid NOT NULL,
  tipo_operacao text NOT NULL,
  conta_id uuid NOT NULL REFERENCES public.contas_pagar(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL,
  resultado_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operacao_id)
);

CREATE TABLE public.contas_pagar_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conta_id uuid NOT NULL REFERENCES public.contas_pagar(id) ON DELETE RESTRICT,
  operacao_id uuid NOT NULL,
  evento text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, operacao_id)
);
CREATE INDEX contas_pagar_auditoria_conta_idx ON public.contas_pagar_auditoria(user_id, conta_id, created_at DESC);

ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar_estornos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar_operacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY contas_pagar_select_owner ON public.contas_pagar FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY contas_pagar_pagamentos_select_owner ON public.contas_pagar_pagamentos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY contas_pagar_estornos_select_owner ON public.contas_pagar_estornos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY contas_pagar_operacoes_select_owner ON public.contas_pagar_operacoes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY contas_pagar_auditoria_select_owner ON public.contas_pagar_auditoria FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.contas_pagar, public.contas_pagar_pagamentos, public.contas_pagar_estornos,
  public.contas_pagar_operacoes, public.contas_pagar_auditoria FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.contas_pagar, public.contas_pagar_pagamentos, public.contas_pagar_estornos,
  public.contas_pagar_operacoes, public.contas_pagar_auditoria TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._conta_pagar_operacao_existente(
  p_user_id uuid, p_operacao_id uuid, p_tipo text, p_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE v public.contas_pagar_operacoes%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_operacao_id IS NULL THEN
    RAISE EXCEPTION 'Usuário e identificador de operação são obrigatórios.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_operacao_id::text, 0));
  SELECT * INTO v FROM public.contas_pagar_operacoes
    WHERE user_id = p_user_id AND operacao_id = p_operacao_id;
  IF FOUND THEN
    IF v.tipo_operacao <> p_tipo OR v.payload_hash <> p_hash THEN
      RAISE EXCEPTION 'Conflito de idempotência: o identificador de operação já foi usado com parâmetros diferentes.';
    END IF;
    RETURN v.resultado_id;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION public._recalcular_resumo_conta_pagar(p_conta_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE v_pago numeric(12,2); v_data date; v_forma text; v_valor numeric(12,2); v_status text;
BEGIN
  SELECT valor, status INTO v_valor, v_status
    FROM public.contas_pagar WHERE id = p_conta_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;

  SELECT COALESCE(SUM(GREATEST(p.valor - COALESCE(e.estornado, 0), 0)), 0)
    INTO v_pago
    FROM public.contas_pagar_pagamentos p
    LEFT JOIN (
      SELECT pagamento_id, SUM(valor) AS estornado
      FROM public.contas_pagar_estornos
      WHERE conta_id = p_conta_id AND user_id = p_user_id
      GROUP BY pagamento_id
    ) e ON e.pagamento_id = p.id
    WHERE p.conta_id = p_conta_id AND p.user_id = p_user_id;

  SELECT p.data_pagamento, p.forma_pagamento INTO v_data, v_forma
  FROM public.contas_pagar_pagamentos p
  LEFT JOIN (
    SELECT pagamento_id, SUM(valor) AS estornado
    FROM public.contas_pagar_estornos
    WHERE conta_id = p_conta_id AND user_id = p_user_id
    GROUP BY pagamento_id
  ) e ON e.pagamento_id = p.id
  WHERE p.conta_id = p_conta_id AND p.user_id = p_user_id
    AND p.valor > COALESCE(e.estornado, 0)
  ORDER BY p.data_pagamento DESC, p.created_at DESC LIMIT 1;

  UPDATE public.contas_pagar
  SET valor_pago = v_pago,
      data_pagamento = v_data,
      forma_pagamento = v_forma,
      status = CASE
        WHEN status = 'cancelado' THEN 'cancelado'
        WHEN v_pago = 0 THEN 'pendente'
        WHEN v_pago >= valor THEN 'pago'
        ELSE 'parcial'
      END,
      updated_at = now()
  WHERE id = p_conta_id AND user_id = p_user_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.salvar_conta_pagar(
  p_dados jsonb, p_conta_id uuid DEFAULT NULL, p_operacao_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_hash text;
  v_existente uuid;
  v_id uuid;
  v_anterior public.contas_pagar%ROWTYPE;
  v_valor numeric(12,2);
  v_compra uuid;
  v_descricao text;
  v_fornecedor text;
  v_emissao date;
  v_vencimento date;
  v_obs text;
  v_tem_pagamento boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN RAISE EXCEPTION 'Dados da conta inválidos.'; END IF;
  v_valor := NULLIF(p_dados->>'valor','')::numeric(12,2);
  v_compra := NULLIF(p_dados->>'compra_id','')::uuid;
  v_descricao := btrim(coalesce(p_dados->>'descricao',''));
  v_fornecedor := NULLIF(btrim(coalesce(p_dados->>'fornecedor','')),'');
  v_emissao := NULLIF(p_dados->>'data_emissao','')::date;
  v_vencimento := NULLIF(p_dados->>'data_vencimento','')::date;
  v_obs := NULLIF(btrim(coalesce(p_dados->>'observacoes','')),'');
  IF length(v_descricao) NOT BETWEEN 1 AND 200 OR v_valor IS NULL OR v_valor <= 0
     OR v_valor::text IN ('NaN','Infinity','-Infinity')
     OR v_emissao IS NULL OR v_vencimento IS NULL THEN
    RAISE EXCEPTION 'Informe descrição, datas e valor total válido.';
  END IF;
  IF v_compra IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.compras WHERE id = v_compra AND user_id = v_user
  ) THEN RAISE EXCEPTION 'Compra relacionada não encontrada para este usuário.'; END IF;

  v_hash := encode(digest(convert_to(jsonb_build_object(
    'tipo','salvar','conta_id',p_conta_id,'dados',p_dados
  )::text,'UTF8'),'sha256'),'hex');
  v_existente := public._conta_pagar_operacao_existente(v_user,p_operacao_id,'salvar',v_hash);
  IF v_existente IS NOT NULL THEN RETURN v_existente; END IF;

  IF p_conta_id IS NULL THEN
    INSERT INTO public.contas_pagar(user_id,compra_id,descricao,fornecedor,data_emissao,data_vencimento,valor,observacoes)
    VALUES(v_user,v_compra,v_descricao,v_fornecedor,v_emissao,v_vencimento,v_valor,v_obs)
    RETURNING id INTO v_id;
    INSERT INTO public.contas_pagar_auditoria(user_id,conta_id,operacao_id,evento,dados)
    VALUES(v_user,v_id,p_operacao_id,'criada',jsonb_build_object('depois',p_dados));
  ELSE
    SELECT * INTO v_anterior FROM public.contas_pagar
      WHERE id = p_conta_id AND user_id = v_user FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
    IF v_anterior.status = 'cancelado' THEN RAISE EXCEPTION 'Não é possível editar uma conta cancelada.'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.contas_pagar_pagamentos WHERE conta_id=p_conta_id AND user_id=v_user)
      INTO v_tem_pagamento;
    IF v_tem_pagamento AND (
      v_valor IS DISTINCT FROM v_anterior.valor OR v_compra IS DISTINCT FROM v_anterior.compra_id
      OR v_emissao IS DISTINCT FROM v_anterior.data_emissao
    ) THEN
      RAISE EXCEPTION 'Após o primeiro pagamento, valor, compra vinculada e data de emissão ficam protegidos.';
    END IF;
    UPDATE public.contas_pagar SET
      compra_id=v_compra, descricao=v_descricao, fornecedor=v_fornecedor,
      data_emissao=v_emissao, data_vencimento=v_vencimento,
      valor=CASE WHEN v_tem_pagamento THEN valor ELSE v_valor END,
      observacoes=v_obs, updated_at=now()
    WHERE id=p_conta_id AND user_id=v_user;
    v_id := p_conta_id;
    INSERT INTO public.contas_pagar_auditoria(user_id,conta_id,operacao_id,evento,dados)
    VALUES(v_user,v_id,p_operacao_id,'editada',jsonb_build_object(
      'antes',jsonb_build_object('descricao',v_anterior.descricao,'fornecedor',v_anterior.fornecedor,
        'data_emissao',v_anterior.data_emissao,'data_vencimento',v_anterior.data_vencimento,
        'valor',v_anterior.valor,'compra_id',v_anterior.compra_id,'observacoes',v_anterior.observacoes),
      'depois',p_dados));
  END IF;

  INSERT INTO public.contas_pagar_operacoes(user_id,operacao_id,tipo_operacao,conta_id,payload_hash,resultado_id)
  VALUES(v_user,p_operacao_id,'salvar',v_id,v_hash,v_id);
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.registrar_pagamento_conta_pagar(
  p_conta_id uuid, p_valor numeric, p_data_pagamento date,
  p_forma_pagamento text, p_observacoes text, p_operacao_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE v_user uuid := auth.uid(); v_hash text; v_existente uuid; v_id uuid; v_conta public.contas_pagar%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor::text IN ('NaN','Infinity','-Infinity')
     OR NULLIF(btrim(coalesce(p_forma_pagamento,'')),'') IS NULL
     OR p_data_pagamento IS NULL THEN RAISE EXCEPTION 'Informe valor, data e forma de pagamento válidos.'; END IF;
  v_hash := encode(digest(convert_to(jsonb_build_object('tipo','pagamento','conta_id',p_conta_id,
    'valor',p_valor,'data',p_data_pagamento,'forma',p_forma_pagamento,'observacoes',p_observacoes)::text,'UTF8'),'sha256'),'hex');
  v_existente := public._conta_pagar_operacao_existente(v_user,p_operacao_id,'pagamento',v_hash);
  IF v_existente IS NOT NULL THEN RETURN v_existente; END IF;
  SELECT * INTO v_conta FROM public.contas_pagar WHERE id=p_conta_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status='cancelado' THEN RAISE EXCEPTION 'Não é possível pagar uma conta cancelada.'; END IF;
  IF round(p_valor::numeric,2) > v_conta.valor - v_conta.valor_pago THEN
    RAISE EXCEPTION 'O pagamento excede o saldo devedor da conta.';
  END IF;
  INSERT INTO public.contas_pagar_pagamentos(conta_id,user_id,valor,data_pagamento,forma_pagamento,observacoes)
  VALUES(p_conta_id,v_user,round(p_valor::numeric,2),p_data_pagamento,btrim(p_forma_pagamento),NULLIF(btrim(coalesce(p_observacoes,'')),''))
  RETURNING id INTO v_id;
  PERFORM public._recalcular_resumo_conta_pagar(p_conta_id,v_user);
  INSERT INTO public.contas_pagar_operacoes(user_id,operacao_id,tipo_operacao,conta_id,payload_hash,resultado_id)
  VALUES(v_user,p_operacao_id,'pagamento',p_conta_id,v_hash,v_id);
  INSERT INTO public.contas_pagar_auditoria(user_id,conta_id,operacao_id,evento,dados)
  VALUES(v_user,p_conta_id,p_operacao_id,'pagamento_registrado',jsonb_build_object('pagamento_id',v_id,'valor',round(p_valor::numeric,2),'data_pagamento',p_data_pagamento,'forma_pagamento',p_forma_pagamento));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.estornar_pagamento_conta_pagar(
  p_pagamento_id uuid, p_valor numeric, p_motivo text, p_operacao_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user uuid := auth.uid(); v_hash text; v_existente uuid; v_id uuid;
  v_conta_id uuid; v_pagamento public.contas_pagar_pagamentos%ROWTYPE; v_estornado numeric(12,2);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_valor::text IN ('NaN','Infinity','-Infinity')
     OR length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Informe o valor e o motivo do estorno (até 500 caracteres).';
  END IF;
  v_hash := encode(digest(convert_to(jsonb_build_object('tipo','estorno','pagamento_id',p_pagamento_id,
    'valor',p_valor,'motivo',p_motivo)::text,'UTF8'),'sha256'),'hex');
  v_existente := public._conta_pagar_operacao_existente(v_user,p_operacao_id,'estorno',v_hash);
  IF v_existente IS NOT NULL THEN RETURN v_existente; END IF;
  SELECT conta_id INTO v_conta_id FROM public.contas_pagar_pagamentos
    WHERE id=p_pagamento_id AND user_id=v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento original não encontrado.'; END IF;
  PERFORM 1 FROM public.contas_pagar WHERE id=v_conta_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  SELECT * INTO v_pagamento FROM public.contas_pagar_pagamentos
    WHERE id=p_pagamento_id AND user_id=v_user FOR UPDATE;
  SELECT COALESCE(SUM(valor),0) INTO v_estornado FROM public.contas_pagar_estornos
    WHERE pagamento_id=p_pagamento_id AND user_id=v_user;
  IF round(p_valor::numeric,2) > v_pagamento.valor-v_estornado THEN
    RAISE EXCEPTION 'O estorno excede o saldo disponível do pagamento original.';
  END IF;
  INSERT INTO public.contas_pagar_estornos(pagamento_id,conta_id,user_id,valor,motivo)
  VALUES(p_pagamento_id,v_conta_id,v_user,round(p_valor::numeric,2),btrim(p_motivo))
  RETURNING id INTO v_id;
  PERFORM public._recalcular_resumo_conta_pagar(v_conta_id,v_user);
  INSERT INTO public.contas_pagar_operacoes(user_id,operacao_id,tipo_operacao,conta_id,payload_hash,resultado_id)
  VALUES(v_user,p_operacao_id,'estorno',v_conta_id,v_hash,v_id);
  INSERT INTO public.contas_pagar_auditoria(user_id,conta_id,operacao_id,evento,dados)
  VALUES(v_user,v_conta_id,p_operacao_id,'pagamento_estornado',jsonb_build_object('estorno_id',v_id,'pagamento_id',p_pagamento_id,'valor',round(p_valor::numeric,2),'motivo',p_motivo));
  RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.cancelar_conta_pagar(
  p_conta_id uuid, p_motivo text, p_operacao_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE v_user uuid := auth.uid(); v_hash text; v_existente uuid; v_conta public.contas_pagar%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  IF length(btrim(coalesce(p_motivo,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento (até 500 caracteres).'; END IF;
  v_hash := encode(digest(convert_to(jsonb_build_object('tipo','cancelar','conta_id',p_conta_id,'motivo',p_motivo)::text,'UTF8'),'sha256'),'hex');
  v_existente := public._conta_pagar_operacao_existente(v_user,p_operacao_id,'cancelar',v_hash);
  IF v_existente IS NOT NULL THEN RETURN v_existente; END IF;
  SELECT * INTO v_conta FROM public.contas_pagar WHERE id=p_conta_id AND user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status='cancelado' THEN RAISE EXCEPTION 'Esta conta já está cancelada.'; END IF;
  IF v_conta.valor_pago > 0 THEN RAISE EXCEPTION 'Estorne os pagamentos ativos antes de cancelar a conta.'; END IF;
  UPDATE public.contas_pagar SET status='cancelado',cancelada_em=now(),motivo_cancelamento=btrim(p_motivo),updated_at=now()
    WHERE id=p_conta_id AND user_id=v_user;
  INSERT INTO public.contas_pagar_operacoes(user_id,operacao_id,tipo_operacao,conta_id,payload_hash,resultado_id)
  VALUES(v_user,p_operacao_id,'cancelar',p_conta_id,v_hash,p_conta_id);
  INSERT INTO public.contas_pagar_auditoria(user_id,conta_id,operacao_id,evento,dados)
  VALUES(v_user,p_conta_id,p_operacao_id,'cancelada',jsonb_build_object('motivo',btrim(p_motivo),'valor_pago',v_conta.valor_pago));
  RETURN p_conta_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public._impedir_alteracao_historico_conta_pagar()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  RAISE EXCEPTION 'O histórico financeiro é imutável; registre um estorno ou uma nova operação.';
END
$fn$;
CREATE TRIGGER contas_pagar_pagamentos_immutables
  BEFORE UPDATE OR DELETE ON public.contas_pagar_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public._impedir_alteracao_historico_conta_pagar();
CREATE TRIGGER contas_pagar_estornos_immutables
  BEFORE UPDATE OR DELETE ON public.contas_pagar_estornos
  FOR EACH ROW EXECUTE FUNCTION public._impedir_alteracao_historico_conta_pagar();
CREATE TRIGGER contas_pagar_operacoes_immutables
  BEFORE UPDATE OR DELETE ON public.contas_pagar_operacoes
  FOR EACH ROW EXECUTE FUNCTION public._impedir_alteracao_historico_conta_pagar();
CREATE TRIGGER contas_pagar_auditoria_immutables
  BEFORE UPDATE OR DELETE ON public.contas_pagar_auditoria
  FOR EACH ROW EXECUTE FUNCTION public._impedir_alteracao_historico_conta_pagar();

CREATE TABLE public.contas_pagar_exclusoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conta_id uuid NOT NULL,
  operacao_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  motivo text NOT NULL DEFAULT 'Conta cancelada sem pagamentos ou movimentações',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, operacao_id)
);
ALTER TABLE public.contas_pagar_exclusoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY contas_pagar_exclusoes_select_owner ON public.contas_pagar_exclusoes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.contas_pagar_exclusoes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.contas_pagar_exclusoes TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.excluir_conta_pagar_cancelada(p_conta_id uuid, p_operacao_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_conta public.contas_pagar%ROWTYPE;
  v_exclusao uuid;
  v_snapshot jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.'; END IF;
  IF p_conta_id IS NULL OR p_operacao_id IS NULL THEN RAISE EXCEPTION 'Conta e identificador da operação são obrigatórios.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_operacao_id::text, 0));
  SELECT id INTO v_exclusao FROM public.contas_pagar_exclusoes
    WHERE user_id = v_user AND operacao_id = p_operacao_id;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.contas_pagar_exclusoes WHERE id = v_exclusao AND conta_id = p_conta_id) THEN
      RAISE EXCEPTION 'Conflito de idempotência: operação já usada para outra conta.';
    END IF;
    RETURN v_exclusao;
  END IF;
  SELECT * INTO v_conta FROM public.contas_pagar
    WHERE id = p_conta_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta cancelada não encontrada.'; END IF;
  IF v_conta.status <> 'cancelado' OR v_conta.cancelada_em IS NULL THEN
    RAISE EXCEPTION 'Somente contas canceladas podem ser excluídas.';
  END IF;
  IF v_conta.valor_pago <> 0 THEN RAISE EXCEPTION 'A conta possui valor pago; não pode ser excluída.'; END IF;
  IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos WHERE conta_id=p_conta_id AND user_id=v_user)
     OR EXISTS (SELECT 1 FROM public.contas_pagar_estornos WHERE conta_id=p_conta_id AND user_id=v_user) THEN
    RAISE EXCEPTION 'A conta possui movimentação financeira. O registro precisa ser mantido.';
  END IF;
  SELECT jsonb_build_object(
    'conta', to_jsonb(v_conta),
    'auditoria', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.contas_pagar_auditoria a WHERE a.conta_id=p_conta_id AND a.user_id=v_user), '[]'::jsonb),
    'operacoes', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at)
      FROM public.contas_pagar_operacoes o WHERE o.conta_id=p_conta_id AND o.user_id=v_user), '[]'::jsonb)
  ) INTO v_snapshot;
  INSERT INTO public.contas_pagar_exclusoes(user_id,conta_id,operacao_id,snapshot)
  VALUES(v_user,p_conta_id,p_operacao_id,v_snapshot) RETURNING id INTO v_exclusao;
  DELETE FROM public.contas_pagar_auditoria WHERE conta_id=p_conta_id AND user_id=v_user;
  DELETE FROM public.contas_pagar_operacoes WHERE conta_id=p_conta_id AND user_id=v_user;
  DELETE FROM public.contas_pagar WHERE id=p_conta_id AND user_id=v_user;
  RETURN v_exclusao;
END
$fn$;

REVOKE ALL ON FUNCTION public._conta_pagar_operacao_existente(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._recalcular_resumo_conta_pagar(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._impedir_alteracao_historico_conta_pagar() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.salvar_conta_pagar(jsonb,uuid,uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.registrar_pagamento_conta_pagar(uuid,numeric,date,text,text,uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.estornar_pagamento_conta_pagar(uuid,numeric,text,uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.cancelar_conta_pagar(uuid,text,uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.excluir_conta_pagar_cancelada(uuid,uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.salvar_conta_pagar(jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_pagamento_conta_pagar(uuid,numeric,date,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_conta_pagar(uuid,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_conta_pagar(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_conta_pagar_cancelada(uuid,uuid) TO authenticated;

COMMIT;
