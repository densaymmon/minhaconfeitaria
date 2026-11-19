-- 0056: realinha o banco publicado com as migrações do repositório.
--
-- A auditoria de segurança de 19/11/2026 comparou o banco publicado com o banco montado a partir
-- das migrações e encontrou três funções em versões antigas (provavelmente migrações anteriores
-- reaplicadas depois da 0043):
--   * registrar_recebimento_pedido: sem a 0031, o saldo do pedido considerava só valor_entrada e
--     ignorava o histórico de pedido_pagamentos ao validar um novo recebimento.
--   * corrigir_valor_pago_pedido_com_producao e excluir_pedidos_recorrentes: ainda usavam auth.uid(),
--     então gerentes da equipe recebiam "não encontrado" (sem vazamento: a regra era mais restrita).
-- E as políticas de fotos do catálogo (storage) no repositório ainda usavam auth.uid(), enquanto o
-- banco publicado já usa _tenant() (pasta da confeitaria; membros da equipe enviam fotos nela).
-- Aqui ficam as versões finais (iguais às do banco montado pelas migrações 0001–0055).
-- Aplicada em produção em 19/11/2026 (cópia das versões anteriores em
-- docs/audits/2026-11-19-backup-antes-0056.sql). Idempotente: pode ser aplicada mais de uma vez.
BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_recebimento_pedido(p_pedido_id uuid, p_valor numeric, p_data_pagamento date, p_forma_pagamento text, p_observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  uid uuid := public._tenant_financeiro();
  pedido public.pedidos%ROWTYPE;
  total_pedido numeric(12,2);
  valor_ja_pago numeric(12,2);
  novo_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_pedido_id IS NULL OR p_valor IS NULL OR p_valor <= 0
     OR p_valor::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Informe um valor de recebimento válido.';
  END IF;
  IF p_data_pagamento IS NULL OR p_data_pagamento > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do recebimento é inválida.';
  END IF;
  IF p_forma_pagamento NOT IN ('pix','dinheiro','debito','credito','transferencia','outros') THEN
    RAISE EXCEPTION 'Selecione uma forma de pagamento válida.';
  END IF;

  SELECT * INTO pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.';
  END IF;
  IF pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível registrar recebimento em pedido cancelado.';
  END IF;

  SELECT GREATEST(0, ROUND(
    COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0)
    + COALESCE(pedido.taxa_entrega, 0)
    - COALESCE(pedido.desconto, 0), 2
  )) INTO total_pedido
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;

  -- Legacy value and detailed receipts may diverge after historical/manual edits.
  -- Use the greater value so neither source can cause the same balance to be
  -- collected twice. The locked pedido row serializes concurrent receipt attempts.
  SELECT GREATEST(
    GREATEST(0, COALESCE(pedido.valor_entrada, 0)),
    COALESCE(SUM(pp.valor), 0)
  )
  INTO valor_ja_pago
  FROM public.pedido_pagamentos pp
  WHERE pp.pedido_id = pedido.id AND pp.user_id = uid;

  IF pedido.saldo_quitado THEN
    valor_ja_pago := total_pedido;
  END IF;

  IF ROUND(p_valor, 2) > GREATEST(0, total_pedido - valor_ja_pago) THEN
    RAISE EXCEPTION 'O recebimento excede o saldo do pedido. Saldo disponível: %.', GREATEST(0, total_pedido - valor_ja_pago);
  END IF;

  INSERT INTO public.pedido_pagamentos (
    pedido_id, user_id, valor, data_pagamento, forma_pagamento, observacoes
  ) VALUES (
    pedido.id, uid, ROUND(p_valor, 2), p_data_pagamento,
    p_forma_pagamento, NULLIF(btrim(p_observacoes), '')
  ) RETURNING id INTO novo_id;

  UPDATE public.pedidos
  SET valor_entrada = LEAST(total_pedido, valor_ja_pago + ROUND(p_valor, 2)),
      saldo_quitado = (valor_ja_pago + ROUND(p_valor, 2) >= total_pedido)
  WHERE id = pedido.id AND user_id = uid;

  RETURN novo_id;
END;
$function$

;
REVOKE ALL ON FUNCTION public.registrar_recebimento_pedido(uuid,numeric,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento_pedido(uuid,numeric,date,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.corrigir_valor_pago_pedido_com_producao(p_pedido_id uuid, p_valor_pago numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  uid uuid := public._tenant_financeiro();
  pedido public.pedidos%ROWTYPE;
  total_pedido numeric(12,2);
  valor_pago numeric(12,2);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF p_pedido_id IS NULL OR p_valor_pago IS NULL
     OR p_valor_pago < 0
     OR p_valor_pago::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Informe um valor pago válido, igual ou maior que zero.';
  END IF;

  SELECT * INTO pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id AND p.user_id = uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou sem permissão.';
  END IF;
  IF pedido.status = 'cancelado' THEN
    RAISE EXCEPTION 'Não é possível corrigir o pagamento de um pedido cancelado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pedido_itens pi
    WHERE pi.pedido_id = pedido.id AND pi.user_id = uid
      AND COALESCE(pi.quantidade_produzida, 0) > 0
  ) THEN
    RAISE EXCEPTION 'Esta função é destinada a pedidos com produção registrada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pedido_pagamentos pp
    WHERE pp.pedido_id = pedido.id AND pp.user_id = uid
  ) THEN
    RAISE EXCEPTION 'Este pedido possui pagamentos no histórico. Edite o recebimento correspondente no histórico de pagamentos.';
  END IF;

  SELECT GREATEST(0, ROUND(
    COALESCE(SUM(pi.quantidade * pi.preco_unitario), 0)
    + COALESCE(pedido.taxa_entrega, 0)
    - COALESCE(pedido.desconto, 0), 2
  )) INTO total_pedido
  FROM public.pedido_itens pi
  WHERE pi.pedido_id = pedido.id AND pi.user_id = uid;

  valor_pago := ROUND(p_valor_pago, 2);
  IF valor_pago > total_pedido + 0.009 THEN
    RAISE EXCEPTION 'O valor pago não pode ser maior que o total do pedido (%).', total_pedido;
  END IF;

  UPDATE public.pedidos
  SET valor_entrada = valor_pago,
      saldo_quitado = (valor_pago >= total_pedido - 0.009)
  WHERE id = pedido.id AND user_id = uid;

  RETURN jsonb_build_object(
    'pedido_id', pedido.id,
    'total', total_pedido,
    'valor_pago', valor_pago,
    'saldo_quitado', valor_pago >= total_pedido - 0.009
  );
END;
$function$

;
REVOKE ALL ON FUNCTION public.corrigir_valor_pago_pedido_com_producao(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corrigir_valor_pago_pedido_com_producao(uuid,numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.excluir_pedidos_recorrentes(p_recorrencia_id uuid DEFAULT NULL::uuid, p_cliente_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_cliente_id uuid;
  v_total integer := 0;
BEGIN
  IF public._tenant() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado.';
  END IF;
  IF (p_recorrencia_id IS NULL) = (p_cliente_id IS NULL) THEN
    RAISE EXCEPTION 'Informe uma recorrência ou um cliente, mas não ambos.';
  END IF;

  IF p_recorrencia_id IS NOT NULL THEN
    SELECT r.cliente_id INTO v_cliente_id
    FROM public.pedidos_recorrentes r
    WHERE r.id = p_recorrencia_id AND r.user_id = public._tenant() AND NOT r.excluida
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada ou já excluída.'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = p_cliente_id AND c.user_id = public._tenant()
    ) THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
    v_cliente_id := p_cliente_id;
  END IF;

  -- Oculta a recorrência e interrompe novas entregas. Pedidos já confirmados
  -- e suas ocorrências vinculadas permanecem intactos para preservar o histórico.
  UPDATE public.pedidos_recorrentes
  SET excluida = true, ativa = false, updated_at = now()
  WHERE user_id = public._tenant()
    AND cliente_id = v_cliente_id
    AND NOT excluida
    AND (p_recorrencia_id IS NULL OR id = p_recorrencia_id);
  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE public.pedidos_recorrentes_ocorrencias o
  SET status = 'cancelada', updated_at = now()
  FROM public.pedidos_recorrentes r
  WHERE o.recorrencia_id = r.id
    AND r.user_id = public._tenant()
    AND r.cliente_id = v_cliente_id
    AND r.excluida
    AND o.user_id = public._tenant()
    AND o.status = 'pendente'
    AND o.pedido_id IS NULL
    AND (p_recorrencia_id IS NULL OR r.id = p_recorrencia_id);

  RETURN v_total;
END;
$function$

;
REVOKE ALL ON FUNCTION public.excluir_pedidos_recorrentes(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_pedidos_recorrentes(uuid,uuid) TO authenticated, service_role;

-- Fotos do catálogo: pasta da confeitaria (_tenant()), como no banco publicado.
DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_insert ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = (SELECT public._tenant())::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_update ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = (SELECT public._tenant())::text)
    WITH CHECK (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = (SELECT public._tenant())::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_delete ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = (SELECT public._tenant())::text)$p$;
  EXECUTE 'DROP POLICY IF EXISTS catalogo_fotos_select_dono ON storage.objects';
  EXECUTE $p$CREATE POLICY catalogo_fotos_select_dono ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'catalogo' AND (storage.foldername(name))[1] = (SELECT public._tenant())::text)$p$;
END
$storage$;

NOTIFY pgrst, 'reload schema';

COMMIT;
