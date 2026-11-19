-- Cópia das versões que estavam no banco publicado em 19/11/2026, antes de aplicar a migração 0057.
-- Para voltar atrás: rode este arquivo e apague public.fidelidade_pedido(text).
BEGIN;

CREATE OR REPLACE FUNCTION public.progresso_fidelidade(p_slug text, p_telefone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  c public.confeitarias%ROWTYPE;
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_feitos integer;
BEGIN
  SELECT * INTO c FROM public.confeitarias WHERE slug = lower(btrim(p_slug)) AND catalogo_ativo AND public._catalogo_liberado(user_id);
  IF NOT FOUND OR c.fidelidade_a_cada = 0 OR c.fidelidade_valor <= 0 THEN RETURN NULL; END IF;
  IF char_length(v_tel) IN (12, 13) AND left(v_tel, 2) = '55' THEN v_tel := substr(v_tel, 3); END IF;
  IF char_length(v_tel) NOT IN (10, 11) THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_feitos FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
  WHERE p.user_id = c.user_id AND p.status <> 'cancelado'
    AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel);
  RETURN jsonb_build_object(
    'a_cada', c.fidelidade_a_cada,
    'tipo', c.fidelidade_tipo,
    'valor', c.fidelidade_valor,
    'ganha_agora', v_feitos > 0 AND v_feitos % c.fidelidade_a_cada = 0,
    'faltam', CASE WHEN v_feitos > 0 AND v_feitos % c.fidelidade_a_cada = 0 THEN 0 ELSE c.fidelidade_a_cada - (v_feitos % c.fidelidade_a_cada) END);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.progresso_fidelidade(text, text) TO anon, authenticated, service_role;

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
      char_length(v_tel) IN (10, 11) AND EXISTS (
        SELECT 1 FROM public.pedidos p JOIN public.clientes cl ON cl.id = p.cliente_id
        WHERE p.user_id = c.user_id AND p.status <> 'cancelado'
          AND regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') IN (v_tel, '55' || v_tel)));
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', regexp_replace(SQLERRM, '^CATALOGO:\s*', ''));
  END;
  RETURN jsonb_build_object('ok', true, 'codigo', v_cupom.codigo, 'desconto', v_desconto, 'tipo', v_cupom.tipo, 'valor', v_cupom.valor,
    'descricao', v_cupom.descricao, 'pedido_minimo', v_cupom.pedido_minimo);
END;
$function$;

COMMIT;
