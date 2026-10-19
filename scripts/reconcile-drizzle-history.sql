-- Reconcile the existing Lovable Cloud database's Drizzle history safely.
-- This script is intentionally specific to the verified Minhaconfeitaria schema.
-- It does not modify order, payment, production, purchase, or stock data.
-- Run once before Drizzle migration execution, after taking a database backup.
-- It stamps only migrations 0004-0020, whose schema is already represented in the
-- live database. Migrations 0021-0024 remain pending and must be applied normally.
BEGIN;

-- This migration file was omitted from the old journal and was never installed in
-- the live database. Creating the function has no data side effects.
CREATE OR REPLACE FUNCTION public.recalcular_custos_historicos()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_atualizados integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário estar autenticado para recalcular os custos.';
  END IF;

  WITH custos_produto AS (
    SELECT p.id AS produto_id, p.user_id,
      (
        COALESCE(SUM(
          CASE
            WHEN public.medida_base(COALESCE(i.unidade_embalagem, i.unidade, 'un'))
               = public.medida_base(COALESCE(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
            THEN
              (COALESCE(i.preco_embalagem, i.preco_unidade, 0)
                / NULLIF(COALESCE(i.quantidade_embalagem, 1) * public.medida_fator(COALESCE(i.unidade_embalagem, i.unidade, 'un')), 0))
              * COALESCE(ri.quantidade_utilizada, ri.quantidade, 0)
              * public.medida_fator(COALESCE(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
            ELSE NULL
          END
        ), 0)
        + COALESCE(p.custo_gas, 0)
        + COALESCE(p.custo_energia, 0)
        + COALESCE(p.custo_mao_obra, 0)
      ) / CASE WHEN COALESCE(p.rendimento, 0) > 0 THEN p.rendimento ELSE 1 END AS custo_unitario
    FROM public.produtos p
    LEFT JOIN public.receita_itens ri ON ri.produto_id = p.id AND ri.user_id = p.user_id
    LEFT JOIN public.insumos i ON i.id = ri.insumo_id AND i.user_id = p.user_id
    WHERE p.user_id = auth.uid()
      AND (
        EXISTS (SELECT 1 FROM public.receita_itens rx WHERE rx.produto_id = p.id AND rx.user_id = p.user_id)
        OR COALESCE(p.custo_gas, 0) > 0
        OR COALESCE(p.custo_energia, 0) > 0
        OR COALESCE(p.custo_mao_obra, 0) > 0
      )
    GROUP BY p.id, p.user_id, p.custo_gas, p.custo_energia, p.custo_mao_obra, p.rendimento
    HAVING COUNT(*) FILTER (
      WHERE ri.id IS NOT NULL
        AND public.medida_base(COALESCE(i.unidade_embalagem, i.unidade, 'un'))
            IS DISTINCT FROM public.medida_base(COALESCE(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
    ) = 0
  )
  UPDATE public.pedido_itens pi
  SET custo_unitario = ROUND(cp.custo_unitario, 4)
  FROM custos_produto cp
  WHERE pi.produto_id = cp.produto_id
    AND pi.user_id = auth.uid()
    AND pi.custo_unitario IS DISTINCT FROM ROUND(cp.custo_unitario, 4);

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  RETURN v_atualizados;
END;
$function$;

REVOKE ALL ON FUNCTION public.recalcular_custos_historicos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_custos_historicos() TO authenticated;

DO $reconcile$
DECLARE
  missing text[] := ARRAY[]::text[];
  item record;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'Histórico Drizzle não encontrado; interrompendo sem registrar migrações.';
  END IF;

  -- Do not overwrite conflicting hashes/timestamps in a partially repaired ledger.
  FOR item IN
    SELECT hash, created_at FROM (VALUES
      ('ba320dfbdad2a6c30b714f9576c345c6d16461155be1b961d45ae86418f5496b',1791939312445::bigint),
      ('19685eac64f251f1cf4f5261c9ffa34c4fd577d25f618c8b8a2f69931c1a6454',1791942000000::bigint),
      ('dc3b90c9876d1661a9dec625279ae3698e1db756eb0b0052acd125c70ea5273d',1791942000001::bigint),
      ('b43c48eed337e5a2bfa2f8a22933e4ef105802dc7382bc715faa8c4fca4009457',1791942000002::bigint),
      ('16e4ad5359628413ad1ec94d7ff4455e291e9c9a9be875c874d880d157d7a13d',1791942000003::bigint),
      ('5f544c051d55350298fb3cf0c55709c131a6cfcbfd5bd272a408408ae0c2892c',1791942000004::bigint),
      ('ac22321b726e6e86add4c2a5d8859386db692341fad42df325e713458dbfac0c',1791942000005::bigint),
      ('361f5eb4fb793bace3155e33e337c731ac43ea27fa339c716cc6ffab77dacbdc',1791942000006::bigint),
      ('d8a4578334fda3648dc36acbfd308cbfe5e1399c477d601dc42edfd27a1f444d',1791942000007::bigint),
      ('cdde655dd56bef4ad2b110b9d0cc3d3d14cd9e99de0de786eba2ac14646896a1',1791942000008::bigint),
      ('c336c8a8f7d469d695e498f026e8c2a0de15730f8e11470fc6adf21acde759e4',1791942000009::bigint),
      ('8ed83c23b39f0a352bb5169e5eb1b750a52ab6bf03a0ba9582510ed4fb1b2c1d',1791942000010::bigint),
      ('5be4aa787cb451257443e0f87862d62e12f07720aa17e151f005d21fa1646732',1791942000011::bigint),
      ('6bb07652760f3073f781a159ce599154a7d6034e5a87f7ddec749ae2ee736cfb',1791942000012::bigint),
      ('362aadfd4158106f4e46b99883943faa11f6aac2ea4cc81601d59bf81bf12988',1791942000013::bigint),
      ('28a7b63ca21487de746a63eea77d41d07b73afb72ae709044b47c291de632031',1791942000014::bigint),
      ('eb9c7319dd74aacc7963b4be6b9e9b7536fd9ead42da49360073720c6177bead',1791942000015::bigint),
      ('1250f56244a7b8aebee2c4e06546f1bcaf58cc59f3c3a6545171c60d7ecee213',1792360800000::bigint),
      ('126f5173336599e07aa3c1638dd0d3d7f15bf935acb082c01eb793e2773b49c9',1792364400000::bigint)
    ) AS expected(hash, created_at)
  LOOP
    IF EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations m WHERE m.created_at = item.created_at AND m.hash <> item.hash)
       OR EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations m WHERE m.hash = item.hash AND m.created_at <> item.created_at) THEN
      RAISE EXCEPTION 'Conflito no histórico Drizzle para created_at %, interrompendo sem registrar novas migrações.', item.created_at;
    END IF;
  END LOOP;

  -- Verify the known applied baseline before repairing its missing history.
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '0a3873f4ae3dba406069cec5826256a3c7bd6f5a8513e2b102d31906f1565f2c' AND created_at = 1791649342182)
     OR NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'c4fb68d48f9ef4ce8dc8c633eeeb33463390f79a51df789d03eceffc4428e37a' AND created_at = 1791651273207)
     OR NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'e4ff100c08e4b13387bf0f3af83f79593b6023924cb5985bb7c5bcc5758d3bbe' AND created_at = 1791713222554)
     OR NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '1e89567d6c3873b501aa3f264b73fdbe157845901309070e3d85b7a58c05951f' AND created_at = 1791914692295) THEN
    RAISE EXCEPTION 'O histórico 0000-0003 não corresponde ao baseline auditado; nenhum histórico novo será registrado.';
  END IF;

  IF EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at > 1792364400000) THEN
    RAISE EXCEPTION 'Há registros posteriores a 0020. Não execute este reparo; investigue o estado das migrações 0021-0024.';
  END IF;

  IF to_regclass('public.pedidos_recorrentes') IS NOT NULL
     OR to_regclass('public.pedidos_recorrentes_ocorrencias') IS NOT NULL THEN
    RAISE EXCEPTION 'As tabelas recorrentes já existem. Este reparo é somente para o estado anterior à migração 0024.';
  END IF;

  FOR item IN
    SELECT table_name FROM (VALUES
      ('estoque_movimentos'),('estoque_eventos'),('producao_eventos'),
      ('inventario_eventos'),('contas_pagar'),('contas_pagar_pagamentos'),
      ('contas_pagar_auditoria'),('contas_pagar_estornos'),
      ('contas_pagar_operacoes'),('pedido_pagamentos')
    ) AS required(table_name)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN
      missing := array_append(missing, 'tabela public.' || item.table_name);
    END IF;
  END LOOP;

  FOR item IN
    SELECT * FROM (VALUES
      ('compras','estoque_integrado'),('compras','cancelada_em'),('compras','local_compra'),
      ('compras','forma_pagamento_compra'),('compras','numero_parcelas'),('compras','primeiro_vencimento'),
      ('insumos','preco_embalagem'),('insumos','quantidade_embalagem'),('insumos','unidade_embalagem'),('insumos','ativo'),
      ('pedido_itens','custo_unitario'),('pedido_itens','quantidade_produzida'),
      ('estoque_movimentos','pedido_id'),('estoque_movimentos','pedido_numero'),('estoque_movimentos','produto_id'),('estoque_movimentos','descricao_snapshot'),
      ('producao_eventos','pedido_id'),('producao_eventos','pedido_numero'),('producao_eventos','produto_id'),
      ('producao_eventos','descricao_snapshot'),('producao_eventos','quantidade_pedida_snapshot'),('producao_eventos','receita_snapshot'),
      ('contas_pagar','status'),('contas_pagar','valor_pago'),('contas_pagar','gerada_automaticamente'),
      ('contas_pagar','compra_parcela_numero'),('contas_pagar','compra_parcelas_total'),
      ('pedido_pagamentos','valor'),('pedido_pagamentos','data_pagamento'),('pedido_pagamentos','forma_pagamento')
    ) AS required(table_name,column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=item.table_name AND c.column_name=item.column_name
    ) THEN
      missing := array_append(missing, 'coluna public.' || item.table_name || '.' || item.column_name);
    END IF;
  END LOOP;

  FOR item IN
    SELECT signature FROM (VALUES
      ('public.saldo_estoque()'),
      ('public.salvar_compra(jsonb,jsonb,uuid,uuid)'),
      ('public.ajustar_producao(uuid,uuid,numeric)'),
      ('public.registrar_inventario_fisico(jsonb,uuid)'),
      ('public.cancelar_compra(uuid,uuid)'),
      ('public.excluir_compra(uuid,uuid)'),
      ('public.excluir_insumo_se_sem_receita(uuid)'),
      ('public.registrar_local_compra(uuid,text)'),
      ('public.registrar_recebimento_pedido(uuid,numeric,date,text,text)'),
      ('public.editar_recebimento_pedido(uuid,numeric,date,text,text)'),
      ('public.editar_valores_pedido_com_producao(uuid,jsonb,numeric,numeric)'),
      ('public.salvar_pedido(jsonb,jsonb,uuid)'),
      ('public.salvar_conta_pagar(jsonb,uuid,uuid)'),
      ('public.registrar_pagamento_conta_pagar(uuid,numeric,date,text,text,uuid)'),
      ('public.cancelar_conta_pagar(uuid,text,uuid)'),
      ('public.estornar_pagamento_conta_pagar(uuid,numeric,text,uuid)'),
      ('public.recalcular_custos_historicos()')
    ) AS required(signature)
  LOOP
    IF to_regprocedure(item.signature) IS NULL THEN
      missing := array_append(missing, 'função ' || item.signature);
    END IF;
  END LOOP;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'Schema incompleto para reconciliar o histórico. Migrações não registradas: %', array_to_string(missing, '; ');
  END IF;
END
$reconcile$;

-- These hashes were computed from the exact committed migration file contents.
-- The current database already contains these schema changes, except the
-- recalcular_custos_historicos function installed above. No business rows change.
INSERT INTO drizzle.__drizzle_migrations(hash, created_at)
SELECT v.hash, v.created_at
FROM (VALUES
  ('ba320dfbdad2a6c30b714f9576c345c6d16461155be1b961d45ae86418f5496b',1791939312445::bigint),
  ('19685eac64f251f1cf4f5261c9ffa34c4fd577d25f618c8b8a2f69931c1a6454',1791942000000::bigint),
  ('dc3b90c9876d1661a9dec625279ae3698e1db756eb0b0052acd125c70ea5273d',1791942000001::bigint),
  ('b43c48eed337e5a2bfa2f8a22933e4ef105802dc7382bc715faa8c4fca4009457',1791942000002::bigint),
  ('16e4ad5359628413ad1ec94d7ff4455e291e9c9a9be875c874d880d157d7a13d',1791942000003::bigint),
  ('5f544c051d55350298fb3cf0c55709c131a6cfcbfd5bd272a408408ae0c2892c',1791942000004::bigint),
  ('ac22321b726e6e86add4c2a5d8859386db692341fad42df325e713458dbfac0c',1791942000005::bigint),
  ('361f5eb4fb793bace3155e33e337c731ac43ea27fa339c716cc6ffab77dacbdc',1791942000006::bigint),
  ('d8a4578334fda3648dc36acbfd308cbfe5e1399c477d601dc42edfd27a1f444d',1791942000007::bigint),
  ('cdde655dd56bef4ad2b110b9d0cc3d3d14cd9e99de0de786eba2ac14646896a1',1791942000008::bigint),
  ('c336c8a8f7d469d695e498f026e8c2a0de15730f8e11470fc6adf21acde759e4',1791942000009::bigint),
  ('8ed83c23b39f0a352bb5169e5eb1b750a52ab6bf03a0ba9582510ed4fb1b2c1d',1791942000010::bigint),
  ('5be4aa787cb451257443e0f87862d62e12f07720aa17e151f005d21fa1646732',1791942000011::bigint),
  ('6bb07652760f3073f781a159ce599154a7d6034e5a87f7ddec749ae2ee736cfb',1791942000012::bigint),
  ('362aadfd4158106f4e46b99883943faa11f6aac2ea4cc81601d59bf81bf12988',1791942000013::bigint),
  ('28a7b63ca21487de746a63eea77d41d07b73afb72ae709044b47c291de632031',1791942000014::bigint),
  ('eb9c7319dd74aacc7963b4be6b9e9b7536fd9ead42da49360073720c6177bead',1791942000015::bigint),
  ('1250f56244a7b8aebee2c4e06546f1bcaf58cc59f3c3a6545171c60d7ecee213',1792360800000::bigint),
  ('126f5173336599e07aa3c1638dd0d3d7f15bf935acb082c01eb793e2773b49c9',1792364400000::bigint)
) AS v(hash,created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations m
  WHERE m.hash = v.hash OR m.created_at = v.created_at
);

-- Confirm that the repaired history ends exactly at 0020; normal migration
-- execution should then apply 0021, 0022, 0023, and 0024 in order.
DO $finish$
BEGIN
  IF (SELECT max(created_at) FROM drizzle.__drizzle_migrations) <> 1792364400000 THEN
    RAISE EXCEPTION 'Histórico Drizzle não terminou em 0020 como esperado. Não prossiga com migrações automáticas.';
  END IF;
END
$finish$;

COMMIT;
