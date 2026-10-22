-- Smoke tests for docs/deploy/contas-pagar-rpcs.sql.
-- Must run only against a disposable PostgreSQL database with the minimal Supabase auth shim.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

DO $test$
DECLARE
  v_conta uuid;
  v_conta_retry uuid;
  v_conta_sem_movimento uuid;
  v_exclusao uuid;
  v_pagamento1 uuid;
  v_pagamento2 uuid;
  v_estorno uuid;
  v_valor_pago numeric;
  v_status text;
  v_falhou boolean;
  v_count integer;
  v_payload jsonb := jsonb_build_object(
    'descricao','Conta de teste',
    'fornecedor','Fornecedor de teste',
    'data_emissao','2026-10-15',
    'data_vencimento','2026-10-20',
    'valor',100.00,
    'compra_id',NULL,
    'observacoes','Teste automatizado'
  );
BEGIN
  v_conta := public.salvar_conta_pagar(v_payload, NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  SELECT status, valor_pago INTO v_status, v_valor_pago FROM public.contas_pagar WHERE id=v_conta;
  IF v_status <> 'pendente' OR v_valor_pago <> 0 THEN RAISE EXCEPTION 'Falha: estado inicial incorreto.'; END IF;

  v_conta_retry := public.salvar_conta_pagar(v_payload, NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  IF v_conta_retry <> v_conta THEN RAISE EXCEPTION 'Falha: retry de criação não retornou a mesma conta.'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.salvar_conta_pagar(v_payload || jsonb_build_object('descricao','Payload diferente'), NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Conflito de idempotência:%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: conflito de idempotência não foi rejeitado.'; END IF;

  -- Edição e retry idempotente: mesmo payload retorna a mesma conta sem duplicar auditoria.
  v_payload := v_payload || jsonb_build_object('descricao','Conta editada');
  v_conta_retry := public.salvar_conta_pagar(v_payload, v_conta, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  IF v_conta_retry <> v_conta THEN RAISE EXCEPTION 'Falha: edição não retornou a conta original.'; END IF;
  PERFORM public.salvar_conta_pagar(v_payload, v_conta, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  SELECT count(*) INTO v_count FROM public.contas_pagar_auditoria
    WHERE conta_id=v_conta AND operacao_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Falha: retry de edição duplicou auditoria.'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.salvar_conta_pagar(v_payload || jsonb_build_object('fornecedor','Outro fornecedor'), v_conta, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Conflito de idempotência:%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: payload alterado no retry de edição não foi rejeitado.'; END IF;

  -- Um identificador não pode ser reutilizado em outra classe de operação.
  v_falhou := false;
  BEGIN
    PERFORM public.registrar_pagamento_conta_pagar(
      v_conta,1,'2026-10-15','pix',NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Conflito de idempotência:%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: identificador de operação foi reutilizado entre RPCs.'; END IF;

  v_pagamento1 := public.registrar_pagamento_conta_pagar(
    v_conta,40,'2026-10-15','pix','Parcela 1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  );
  IF public.registrar_pagamento_conta_pagar(
    v_conta,40,'2026-10-15','pix','Parcela 1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
  ) <> v_pagamento1 THEN RAISE EXCEPTION 'Falha: retry de pagamento não idempotente.'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.registrar_pagamento_conta_pagar(
      v_conta,39,'2026-10-15','pix','Parcela 1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Conflito de idempotência:%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: retry de pagamento com parâmetros alterados não foi rejeitado.'; END IF;
  SELECT status,valor_pago INTO v_status,v_valor_pago FROM public.contas_pagar WHERE id=v_conta;
  IF v_status <> 'parcial' OR v_valor_pago <> 40 THEN RAISE EXCEPTION 'Falha: pagamento parcial.'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.registrar_pagamento_conta_pagar(
      v_conta,70,'2026-10-15','pix',NULL,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'O pagamento excede%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: pagamento acima do saldo não foi bloqueado.'; END IF;

  v_pagamento2 := public.registrar_pagamento_conta_pagar(
    v_conta,60,'2026-10-15','transferencia','Quitação','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
  );
  SELECT status,valor_pago INTO v_status,v_valor_pago FROM public.contas_pagar WHERE id=v_conta;
  IF v_status <> 'pago' OR v_valor_pago <> 100 THEN RAISE EXCEPTION 'Falha: quitação total.'; END IF;

  v_estorno := public.estornar_pagamento_conta_pagar(
    v_pagamento1,10,'Correção parcial','cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  );
  SELECT status,valor_pago INTO v_status,v_valor_pago FROM public.contas_pagar WHERE id=v_conta;
  IF v_status <> 'parcial' OR v_valor_pago <> 90 THEN RAISE EXCEPTION 'Falha: estorno não recalculou o saldo.'; END IF;
  IF public.estornar_pagamento_conta_pagar(
    v_pagamento1,10,'Correção parcial','cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  ) <> v_estorno THEN RAISE EXCEPTION 'Falha: retry de estorno não retornou o mesmo registro.'; END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.estornar_pagamento_conta_pagar(
      v_pagamento1,9,'Motivo diferente','cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Conflito de idempotência:%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: retry de estorno alterado não foi rejeitado.'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.estornar_pagamento_conta_pagar(
      v_pagamento1,31,'Excede saldo','cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'O estorno excede%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: estorno acima do saldo do pagamento não foi bloqueado.'; END IF;

  v_falhou := false;
  BEGIN
    PERFORM public.cancelar_conta_pagar(v_conta,'Teste','dddddddd-dddd-4ddd-8ddd-ddddddddddd1');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Estorne os pagamentos ativos%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: cancelamento com pagamentos ativos foi permitido.'; END IF;

  PERFORM public.estornar_pagamento_conta_pagar(
    v_pagamento1,30,'Estorno restante','cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
  );
  PERFORM public.estornar_pagamento_conta_pagar(
    v_pagamento2,60,'Estorno da quitação','cccccccc-cccc-4ccc-8ccc-ccccccccccc4'
  );
  SELECT status,valor_pago INTO v_status,v_valor_pago FROM public.contas_pagar WHERE id=v_conta;
  IF v_status <> 'pendente' OR v_valor_pago <> 0 THEN RAISE EXCEPTION 'Falha: estorno integral.'; END IF;
  PERFORM public.cancelar_conta_pagar(v_conta,'Obrigação cancelada','dddddddd-dddd-4ddd-8ddd-ddddddddddd2');
  SELECT status INTO v_status FROM public.contas_pagar WHERE id=v_conta;
  IF v_status <> 'cancelado' THEN RAISE EXCEPTION 'Falha: cancelamento permitido não foi registrado.'; END IF;

  -- Mesmo cancelada, uma conta com histórico de pagamentos/estornos não pode ser apagada.
  v_falhou := false;
  BEGIN
    PERFORM public.excluir_conta_pagar_cancelada(v_conta,'ffffffff-ffff-4fff-8fff-fffffffffff1');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'A conta possui movimentação financeira%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: conta com movimentações foi excluída.'; END IF;

  -- Conta cancelada sem nenhum pagamento pode ser excluída com snapshot de auditoria.
  v_payload := jsonb_build_object(
    'descricao','Conta cancelada sem movimentação',
    'fornecedor','Fornecedor de teste',
    'data_emissao','2026-10-15',
    'data_vencimento','2026-10-20',
    'valor',20.00,
    'compra_id',NULL,
    'observacoes','Teste de exclusão segura'
  );
  v_conta_sem_movimento := public.salvar_conta_pagar(v_payload,NULL,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');
  PERFORM public.cancelar_conta_pagar(v_conta_sem_movimento,'Lançamento cancelado sem movimentação','dddddddd-dddd-4ddd-8ddd-ddddddddddd3');
  v_exclusao := public.excluir_conta_pagar_cancelada(v_conta_sem_movimento,'ffffffff-ffff-4fff-8fff-fffffffffff2');
  IF EXISTS (SELECT 1 FROM public.contas_pagar WHERE id=v_conta_sem_movimento) THEN
    RAISE EXCEPTION 'Falha: conta cancelada sem movimentação continua ativa.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contas_pagar_exclusoes
    WHERE id=v_exclusao AND conta_id=v_conta_sem_movimento
      AND snapshot->'conta'->>'status'='cancelado'
      AND (snapshot->'conta'->>'valor')::numeric=20.00
  ) THEN RAISE EXCEPTION 'Falha: snapshot de exclusão não foi preservado.'; END IF;
  IF public.excluir_conta_pagar_cancelada(v_conta_sem_movimento,'ffffffff-ffff-4fff-8fff-fffffffffff2') <> v_exclusao THEN
    RAISE EXCEPTION 'Falha: retry de exclusão não foi idempotente.';
  END IF;

  v_falhou := false;
  BEGIN
    UPDATE public.contas_pagar SET valor_pago=1 WHERE id=v_conta;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: escrita direta em campos financeiros protegidos foi permitida.'; END IF;

  v_falhou := false;
  BEGIN
    INSERT INTO public.contas_pagar_auditoria(user_id,conta_id,operacao_id,evento,dados)
    VALUES('11111111-1111-4111-8111-111111111111',v_conta,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2','fraude','{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: INSERT direto na auditoria foi permitido.'; END IF;

  v_falhou := false;
  BEGIN
    UPDATE public.contas_pagar_auditoria SET evento='adulterado' WHERE conta_id=v_conta;
  EXCEPTION WHEN insufficient_privilege THEN v_falhou := true;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: escrita direta na auditoria não foi bloqueada.'; END IF;

  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  IF EXISTS (SELECT 1 FROM public.contas_pagar WHERE id=v_conta) THEN
    RAISE EXCEPTION 'Falha: outro usuário conseguiu ler a conta.';
  END IF;
  v_falhou := false;
  BEGIN
    PERFORM public.registrar_pagamento_conta_pagar(
      v_conta,1,'2026-10-15','pix',NULL,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Conta a pagar não encontrada%' THEN v_falhou := true; ELSE RAISE; END IF;
  END;
  IF NOT v_falhou THEN RAISE EXCEPTION 'Falha: outro usuário conseguiu operar a conta.'; END IF;
END
$test$;

ROLLBACK;
