-- Lembrete da véspera: registra quando o lembrete do pedido foi enviado ao cliente pelo WhatsApp.
-- Reserva endereços de páginas novas (resumo do mês, equipe, convite, app instalável).
-- Aditiva; não altera dados existentes.
BEGIN;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS lembrete_enviado_em timestamptz;

-- Nova página /resumo-mes não pode virar endereço de catálogo.
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
    'plataforma', 'comecar', 'resumo-mes', 'equipe', 'convite', 'sw', 'manifest', 'fonts', 'encomenda'
  ])
$function$;
NOTIFY pgrst, 'reload schema';
COMMIT;
