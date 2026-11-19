-- 0057: protege os dados dos clientes no catálogo público.
--
-- Antes, qualquer visitante podia digitar um telefone no catálogo e descobrir se aquela pessoa já
-- tinha feito pedidos na confeitaria:
--   * progresso_fidelidade(slug, telefone) dizia quantos pedidos faltavam para o desconto;
--   * validar_cupom_catalogo(..., telefone) recusava cupons "só para a primeira compra".
-- Agora:
--   * progresso_fidelidade deixa de ser pública (sem EXECUTE para PUBLIC/anon/authenticated);
--   * fidelidade_pedido(codigo) mostra o progresso só a quem tem o código do próprio pedido
--     (o mesmo código curto ou UUID da página de acompanhamento);
--   * a prévia do cupom não consulta o telefone. A regra da primeira compra continua valendo e é
--     conferida em criar_pedido_catalogo, ao fechar o pedido.
-- O desconto de fidelidade continua sendo aplicado automaticamente pelo servidor no pedido premiado.
-- Aplicada em produção em 19/11/2026 (cópia das versões anteriores em
-- docs/audits/2026-11-19-backup-antes-0057.sql). Idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION public.validar_cupom_catalogo(p_slug text, p_codigo text, p_subtotal numeric, p_telefone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
      false /*0057: a prévia não consulta o telefone; criar_pedido_catalogo confere a primeira compra*/);
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', regexp_replace(SQLERRM, '^CATALOGO:\s*', ''));
  END;
  RETURN jsonb_build_object('ok', true, 'codigo', v_cupom.codigo, 'desconto', v_desconto, 'tipo', v_cupom.tipo, 'valor', v_cupom.valor,
    'descricao', v_cupom.descricao, 'pedido_minimo', v_cupom.pedido_minimo);
END;
$function$
;

REVOKE ALL ON FUNCTION public.progresso_fidelidade(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.progresso_fidelidade(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fidelidade_pedido(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_texto text := lower(btrim(coalesce(p_codigo, '')));
  p public.pedidos%ROWTYPE;
  c public.confeitarias%ROWTYPE;
  v_tel text;
  v_feitos integer;
BEGIN
  IF v_texto ~ '^[a-z2-9]{10}$' THEN
    SELECT * INTO p FROM public.pedidos WHERE codigo_curto = v_texto AND origem = 'catalogo';
  ELSIF v_texto ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO p FROM public.pedidos WHERE codigo_publico = v_texto::uuid AND origem = 'catalogo';
  END IF;
  IF p.id IS NULL OR p.cliente_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.confeitarias WHERE user_id = p.user_id AND catalogo_ativo AND public._catalogo_liberado(user_id);
  IF NOT FOUND OR coalesce(c.fidelidade_a_cada, 0) = 0 OR coalesce(c.fidelidade_valor, 0) <= 0 THEN RETURN NULL; END IF;
  SELECT regexp_replace(coalesce(telefone, ''), '\D', '', 'g') INTO v_tel FROM public.clientes WHERE id = p.cliente_id AND user_id = p.user_id;
  IF char_length(v_tel) IN (12, 13) AND left(v_tel, 2) = '55' THEN v_tel := substr(v_tel, 3); END IF;
  IF char_length(coalesce(v_tel, '')) NOT IN (10, 11) THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_feitos FROM public.pedidos pe JOIN public.clientes cl ON cl.id = pe.cliente_id
  WHERE pe.user_id = p.user_id AND pe.status <> 'cancelado'
    AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel);
  RETURN jsonb_build_object(
    'a_cada', c.fidelidade_a_cada,
    'tipo', c.fidelidade_tipo,
    'valor', c.fidelidade_valor,
    'este_pedido_premiado', coalesce(p.fidelidade, false),
    'proximo_premiado', v_feitos > 0 AND v_feitos % c.fidelidade_a_cada = 0,
    'faltam', CASE WHEN v_feitos > 0 AND v_feitos % c.fidelidade_a_cada = 0 THEN 0 ELSE c.fidelidade_a_cada - (v_feitos % c.fidelidade_a_cada) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.fidelidade_pedido(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fidelidade_pedido(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
