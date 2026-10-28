-- Produção e gestão:
--   1. etiquetas: validade do produto (dias) e alergênicos do insumo;
--   2. meta de vendas do mês;
--   3. histórico de quem fez o quê (pedidos, pagamentos e preço dos produtos);
--   4. endereços das páginas novas reservados.
-- Aditiva e idempotente.

BEGIN;

-- 1. Etiquetas ---------------------------------------------------------------------------
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS validade_dias smallint;
ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_validade_dias;
ALTER TABLE public.produtos ADD CONSTRAINT produtos_validade_dias CHECK (validade_dias IS NULL OR validade_dias BETWEEN 1 AND 365);
ALTER TABLE public.insumos ADD COLUMN IF NOT EXISTS alergenos text;
ALTER TABLE public.insumos DROP CONSTRAINT IF EXISTS insumos_alergenos;
ALTER TABLE public.insumos ADD CONSTRAINT insumos_alergenos CHECK (alergenos IS NULL OR char_length(alergenos) <= 120);

-- 2. Meta do mês -------------------------------------------------------------------------
ALTER TABLE public.confeitarias ADD COLUMN IF NOT EXISTS meta_vendas_mes numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.confeitarias DROP CONSTRAINT IF EXISTS confeitarias_meta;
ALTER TABLE public.confeitarias ADD CONSTRAINT confeitarias_meta CHECK (meta_vendas_mes BETWEEN 0 AND 10000000);
GRANT INSERT (meta_vendas_mes) ON public.confeitarias TO authenticated;
GRANT UPDATE (meta_vendas_mes) ON public.confeitarias TO authenticated;

-- 3. Histórico ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_id uuid,
  autor text NOT NULL,
  entidade text NOT NULL CHECK (entidade IN ('pedido', 'pagamento', 'produto')),
  registro_id uuid,
  pedido_numero bigint,
  acao text NOT NULL,
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS historico_user_idx ON public.historico (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS historico_registro_idx ON public.historico (registro_id);
ALTER TABLE public.historico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historico FROM anon, authenticated;
GRANT SELECT ON public.historico TO authenticated;
GRANT ALL ON public.historico TO service_role;
DROP POLICY IF EXISTS historico_ver ON public.historico;
CREATE POLICY historico_ver ON public.historico FOR SELECT TO authenticated
  USING ((SELECT public._tenant()) = user_id AND (SELECT public._papel()) <> 'producao');
DROP POLICY IF EXISTS acesso_liberado ON public.historico;
CREATE POLICY acesso_liberado ON public.historico AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado()));

-- Nome de quem fez: dona, pessoa da equipe, cliente pelo catálogo ou sistema.
CREATE OR REPLACE FUNCTION public._autor_historico(p_tenant uuid, p_catalogo boolean)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN CASE WHEN p_catalogo THEN 'Cliente (catálogo)' ELSE 'Sistema' END
    WHEN auth.uid() = p_tenant THEN 'Dona(o)'
    ELSE coalesce((SELECT coalesce(nullif(m.nome, ''), m.email) FROM public.equipe_membros m WHERE m.membro_id = auth.uid() AND m.dono_id = p_tenant), 'Equipe')
  END
$function$;
REVOKE ALL ON FUNCTION public._autor_historico(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._brl_texto(v numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT 'R$ ' || replace(to_char(coalesce(v, 0), 'FM999999990.00'), '.', ',') $function$;

CREATE OR REPLACE FUNCTION public._historico_pedido()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  r public.pedidos%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_mudancas text[] := ARRAY[]::text[];
  v_acao text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criou o pedido';
    v_mudancas := ARRAY[CASE WHEN NEW.origem = 'catalogo' THEN 'pelo catálogo' ELSE 'no sistema' END];
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'excluiu o pedido';
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN v_mudancas := v_mudancas || format('status: %s → %s', OLD.status, NEW.status); END IF;
    IF NEW.data_entrega IS DISTINCT FROM OLD.data_entrega OR NEW.hora_entrega IS DISTINCT FROM OLD.hora_entrega THEN
      v_mudancas := v_mudancas || format('entrega: %s %s → %s %s', to_char(OLD.data_entrega, 'DD/MM'), coalesce(OLD.hora_entrega, ''), to_char(NEW.data_entrega, 'DD/MM'), coalesce(NEW.hora_entrega, ''));
    END IF;
    IF NEW.desconto IS DISTINCT FROM OLD.desconto THEN v_mudancas := v_mudancas || format('desconto: %s → %s', public._brl_texto(OLD.desconto), public._brl_texto(NEW.desconto)); END IF;
    IF NEW.taxa_entrega IS DISTINCT FROM OLD.taxa_entrega THEN v_mudancas := v_mudancas || format('taxa de entrega: %s → %s', public._brl_texto(OLD.taxa_entrega), public._brl_texto(NEW.taxa_entrega)); END IF;
    IF NEW.valor_entrada IS DISTINCT FROM OLD.valor_entrada THEN v_mudancas := v_mudancas || format('entrada: %s → %s', public._brl_texto(OLD.valor_entrada), public._brl_texto(NEW.valor_entrada)); END IF;
    IF NEW.saldo_quitado IS DISTINCT FROM OLD.saldo_quitado THEN v_mudancas := v_mudancas || CASE WHEN NEW.saldo_quitado THEN 'marcou como pago' ELSE 'desmarcou o pagamento' END; END IF;
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN v_mudancas := v_mudancas || 'trocou o cliente'::text; END IF;
    IF NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN v_mudancas := v_mudancas || 'editou as observações'::text; END IF;
    -- Mudanças só de controle interno (avisos, visualização) não entram no histórico.
    IF cardinality(v_mudancas) = 0 THEN RETURN NULL; END IF;
    v_acao := 'alterou o pedido';
  END IF;
  INSERT INTO public.historico (user_id, autor_id, autor, entidade, registro_id, pedido_numero, acao, detalhe)
  VALUES (r.user_id, auth.uid(), public._autor_historico(r.user_id, r.origem = 'catalogo'), 'pedido', r.id, r.numero, v_acao,
          nullif(array_to_string(v_mudancas, '; '), ''));
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._historico_pedido() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_historico_pedido ON public.pedidos;
CREATE TRIGGER trg_historico_pedido AFTER INSERT OR UPDATE OR DELETE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public._historico_pedido();

CREATE OR REPLACE FUNCTION public._historico_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  r public.pedido_pagamentos%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  v_numero bigint;
BEGIN
  SELECT numero INTO v_numero FROM public.pedidos WHERE id = r.pedido_id AND user_id = r.user_id;
  INSERT INTO public.historico (user_id, autor_id, autor, entidade, registro_id, pedido_numero, acao, detalhe)
  VALUES (r.user_id, auth.uid(), public._autor_historico(r.user_id, false), 'pagamento', r.pedido_id, v_numero,
          CASE TG_OP WHEN 'INSERT' THEN 'registrou um pagamento' WHEN 'DELETE' THEN 'removeu um pagamento' ELSE 'alterou um pagamento' END,
          public._brl_texto(r.valor) || coalesce(' · ' || r.forma_pagamento, ''));
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._historico_pagamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_historico_pagamento ON public.pedido_pagamentos;
CREATE TRIGGER trg_historico_pagamento AFTER INSERT OR UPDATE OF valor OR DELETE ON public.pedido_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public._historico_pagamento();

CREATE OR REPLACE FUNCTION public._historico_preco()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.preco_venda IS NOT DISTINCT FROM OLD.preco_venda THEN RETURN NULL; END IF;
  INSERT INTO public.historico (user_id, autor_id, autor, entidade, registro_id, acao, detalhe)
  VALUES (NEW.user_id, auth.uid(), public._autor_historico(NEW.user_id, false), 'produto', NEW.id, 'alterou o preço',
          format('%s: %s → %s', NEW.nome, public._brl_texto(OLD.preco_venda), public._brl_texto(NEW.preco_venda)));
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._historico_preco() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_historico_preco ON public.produtos;
CREATE TRIGGER trg_historico_preco AFTER UPDATE OF preco_venda ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public._historico_preco();

-- 4. Endereços das páginas novas ------------------------------------------------------------
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
    'plataforma', 'comecar', 'resumo-mes', 'equipe', 'convite', 'sw', 'manifest', 'fonts', 'encomenda', 'icons',
    'agenda', 'lista-compras', 'entregas', 'etiquetas', 'fluxo-caixa', 'historico', 'primeiros-passos'
  ])
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
