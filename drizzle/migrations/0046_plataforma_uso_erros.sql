-- Plataforma:
--   1. métricas de uso para a administração (pedidos, faturamento, atividade, cadastros por mês)
--      e lista de risco de cancelamento;
--   2. monitoramento de erros: o app e o catálogo registram erros de tela; a administração
--      vê os erros agrupados.
-- Aditiva e idempotente.

BEGIN;

-- 1. Métricas de uso ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_metricas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_hoje date := public._hoje_confeitaria();
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN jsonb_build_object(
    'pedidos_30_dias', (SELECT count(*) FROM public.pedidos WHERE created_at > now() - interval '30 days' AND status <> 'cancelado'),
    'faturamento_30_dias', (
      SELECT coalesce(sum(i.quantidade * i.preco_unitario), 0)
      FROM public.pedido_itens i JOIN public.pedidos p ON p.id = i.pedido_id AND p.user_id = i.user_id
      WHERE p.created_at > now() - interval '30 days' AND p.status <> 'cancelado'),
    'pedidos_catalogo_30_dias', (SELECT count(*) FROM public.pedidos WHERE created_at > now() - interval '30 days' AND status <> 'cancelado' AND origem = 'catalogo'),
    'ativas_7_dias', (SELECT count(DISTINCT user_id) FROM public.pedidos WHERE created_at > now() - interval '7 days'),
    'catalogos_no_ar', (SELECT count(*) FROM public.confeitarias WHERE catalogo_ativo AND slug IS NOT NULL),
    'membros_equipe', (SELECT count(*) FROM public.equipe_membros),
    'cadastros_por_mes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'novos', (
        SELECT count(*) FROM public.confeitarias c WHERE date_trunc('month', c.created_at AT TIME ZONE 'America/Sao_Paulo') = m)) ORDER BY m), '[]'::jsonb)
      FROM generate_series(date_trunc('month', v_hoje::timestamp) - interval '5 months', date_trunc('month', v_hoje::timestamp), interval '1 month') m),
    -- Uso por confeitaria (a situação da assinatura vem de admin_listar_confeitarias).
    'uso', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', c.user_id,
        'pedidos_30_dias', (SELECT count(*) FROM public.pedidos p WHERE p.user_id = c.user_id AND p.created_at > now() - interval '30 days' AND p.status <> 'cancelado'),
        'pedidos_total', (SELECT count(*) FROM public.pedidos p WHERE p.user_id = c.user_id),
        'ultimo_pedido', (SELECT max(p.created_at) FROM public.pedidos p WHERE p.user_id = c.user_id),
        'produtos', (SELECT count(*) FROM public.produtos p WHERE p.user_id = c.user_id AND p.ativo),
        'catalogo', c.catalogo_ativo AND c.slug IS NOT NULL,
        'equipe', (SELECT count(*) FROM public.equipe_membros m WHERE m.dono_id = c.user_id),
        'cadastro', c.created_at))
      FROM public.confeitarias c), '[]'::jsonb)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_metricas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_metricas() TO authenticated;

-- 2. Erros do app ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erros_app (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  confeitaria_id uuid,
  origem text NOT NULL CHECK (origem IN ('app', 'catalogo', 'admin')),
  mensagem text NOT NULL CHECK (char_length(mensagem) <= 500),
  detalhe text CHECK (detalhe IS NULL OR char_length(detalhe) <= 4000),
  url text CHECK (url IS NULL OR char_length(url) <= 500),
  agente text CHECK (agente IS NULL OR char_length(agente) <= 300),
  vezes integer NOT NULL DEFAULT 1,
  primeiro_em timestamptz NOT NULL DEFAULT now(),
  ultimo_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erros_app_ultimo_idx ON public.erros_app (ultimo_em DESC);
ALTER TABLE public.erros_app ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erros_app FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.erros_app TO service_role;
-- Ninguém lê direto (só pelas funções da administração); a trava padrão vale também aqui.
DROP POLICY IF EXISTS acesso_liberado ON public.erros_app;
CREATE POLICY acesso_liberado ON public.erros_app AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public._acesso_liberado()));

-- Registra (ou soma à repetição recente) um erro de tela. Aceita visitante do catálogo.
CREATE OR REPLACE FUNCTION public.registrar_erro(p_origem text, p_mensagem text, p_detalhe text, p_url text, p_agente text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_msg text := left(btrim(coalesce(p_mensagem, '')), 500);
  v_url text := left(regexp_replace(coalesce(p_url, ''), '[?#].*$', ''), 500);
  v_id uuid;
BEGIN
  IF v_msg = '' OR p_origem IS NULL OR p_origem NOT IN ('app', 'catalogo', 'admin') THEN RETURN; END IF;
  -- Proteção contra enxurrada: no máximo 200 registros novos por hora na plataforma.
  IF (SELECT count(*) FROM public.erros_app WHERE primeiro_em > now() - interval '1 hour') >= 200 THEN RETURN; END IF;
  SELECT id INTO v_id FROM public.erros_app
  WHERE mensagem = v_msg AND coalesce(url, '') = v_url AND user_id IS NOT DISTINCT FROM auth.uid() AND ultimo_em > now() - interval '1 hour'
  ORDER BY ultimo_em DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.erros_app SET vezes = vezes + 1, ultimo_em = now() WHERE id = v_id;
  ELSE
    INSERT INTO public.erros_app (user_id, confeitaria_id, origem, mensagem, detalhe, url, agente)
    VALUES (auth.uid(), CASE WHEN auth.uid() IS NOT NULL THEN public._tenant() END, p_origem, v_msg,
            nullif(left(coalesce(p_detalhe, ''), 4000), ''), nullif(v_url, ''), nullif(left(coalesce(p_agente, ''), 300), ''));
  END IF;
  -- Guarda só os últimos 30 dias.
  DELETE FROM public.erros_app WHERE ultimo_em < now() - interval '30 days';
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_erro(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_erro(text, text, text, text, text) TO anon, authenticated;

-- Erros agrupados por mensagem para a administração.
CREATE OR REPLACE FUNCTION public.admin_listar_erros(p_dias integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(g ORDER BY g->>'ultimo_em' DESC) FROM (
      SELECT jsonb_build_object(
        'mensagem', e.mensagem,
        'origem', min(e.origem),
        'vezes', sum(e.vezes),
        'pessoas', count(DISTINCT coalesce(e.user_id::text, e.agente)),
        'confeitarias', (SELECT coalesce(jsonb_agg(DISTINCT c.nome), '[]'::jsonb) FROM public.erros_app x JOIN public.confeitarias c ON c.user_id = x.confeitaria_id
                         WHERE x.mensagem = e.mensagem AND x.ultimo_em > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30)))),
        'urls', (SELECT coalesce(jsonb_agg(DISTINCT x.url), '[]'::jsonb) FROM public.erros_app x
                 WHERE x.mensagem = e.mensagem AND x.url IS NOT NULL AND x.ultimo_em > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30)))),
        'detalhe', (array_agg(e.detalhe ORDER BY e.ultimo_em DESC) FILTER (WHERE e.detalhe IS NOT NULL))[1],
        'agente', (array_agg(e.agente ORDER BY e.ultimo_em DESC))[1],
        'primeiro_em', min(e.primeiro_em),
        'ultimo_em', max(e.ultimo_em)) AS g
      FROM public.erros_app e
      WHERE e.ultimo_em > now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30)))
      GROUP BY e.mensagem
      LIMIT 200
    ) t
  ), '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_listar_erros(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_erros(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_limpar_erro(p_mensagem text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT public._eh_admin() THEN RAISE EXCEPTION 'ADMIN: acesso restrito à administração da plataforma.'; END IF;
  DELETE FROM public.erros_app WHERE mensagem = p_mensagem;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_limpar_erro(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_limpar_erro(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
