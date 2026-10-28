-- Notificações de pedido novo com o sistema fechado (Web Push):
--   push_inscricoes: aparelhos da confeitaria que aceitaram receber avisos;
--   plataforma_segredos: chaves VAPID (só o servidor lê; o valor nunca vai para o código);
--   pedidos.push_avisado_em: garante um único aviso por pedido.
-- Aditiva e idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND char_length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 100),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 16 AND 40),
  aparelho text CHECK (aparelho IS NULL OR char_length(aparelho) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_em timestamptz
);
CREATE INDEX IF NOT EXISTS push_inscricoes_user_idx ON public.push_inscricoes (user_id);
ALTER TABLE public.push_inscricoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_inscricoes FROM anon;
GRANT SELECT, DELETE ON public.push_inscricoes TO authenticated;
GRANT ALL ON public.push_inscricoes TO service_role;
DROP POLICY IF EXISTS push_inscricoes_dono ON public.push_inscricoes;
CREATE POLICY push_inscricoes_dono ON public.push_inscricoes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS acesso_liberado ON public.push_inscricoes;
CREATE POLICY acesso_liberado ON public.push_inscricoes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado())) WITH CHECK ((SELECT public._acesso_liberado()));

-- Um navegador pertence a quem está logado nele: a inscrição troca de dono se outra conta entrar.
CREATE OR REPLACE FUNCTION public.salvar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text, p_aparelho text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.'; END IF;
  IF NOT public._acesso_liberado() THEN RAISE EXCEPTION 'Acesso não liberado.'; END IF;
  IF (SELECT count(*) FROM public.push_inscricoes WHERE user_id = auth.uid() AND endpoint <> p_endpoint) >= 20 THEN
    DELETE FROM public.push_inscricoes WHERE id = (
      SELECT id FROM public.push_inscricoes WHERE user_id = auth.uid() ORDER BY created_at LIMIT 1);
  END IF;
  INSERT INTO public.push_inscricoes (user_id, endpoint, p256dh, auth, aparelho)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(left(btrim(coalesce(p_aparelho, '')), 120), ''))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho, created_at = now();
END;
$function$;
REVOKE ALL ON FUNCTION public.salvar_inscricao_push(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_inscricao_push(text, text, text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.plataforma_segredos (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plataforma_segredos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_segredos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.plataforma_segredos TO service_role;

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS push_avisado_em timestamptz;

-- Endereço /icons (ícones do app instalado) fica reservado.
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
    'plataforma', 'comecar', 'resumo-mes', 'equipe', 'convite', 'sw', 'manifest', 'fonts', 'encomenda', 'icons'
  ])
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
