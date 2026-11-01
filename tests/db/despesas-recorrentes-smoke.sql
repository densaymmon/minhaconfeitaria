\set ON_ERROR_STOP on
-- Despesas fixas mensais (migração 0050): lançamento automático idempotente, dia 31, data final,
-- início no futuro, mês excluído não volta, validações, colunas protegidas, papel "produção" e
-- isolamento entre confeitarias.
BEGIN;

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id, email) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'dona@a.test'),
  ('b2222222-2222-4222-8222-222222222222', 'dona@b.test'),
  ('e5555555-5555-4555-8555-555555555555', 'prod@a.test');
INSERT INTO public.equipe_membros(dono_id, membro_id, email, papel)
VALUES ('a1111111-1111-4111-8111-111111111111', 'e5555555-5555-4555-8555-555555555555', 'prod@a.test', 'producao');

CREATE FUNCTION pg_temp.entrar(id uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', id::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', id)::text, true)
$$;

-- Dona A ------------------------------------------------------------------------------------
SELECT pg_temp.entrar('a1111111-1111-4111-8111-111111111111');
SET LOCAL ROLE authenticated;

DO $t$
DECLARE
  hoje date := current_date;
  mes0 date := date_trunc('month', current_date)::date;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid;
  n integer;
  antes integer;
  gerou integer;
BEGIN
  -- R1: aluguel desde o dia 1 de 3 meses atrás → 4 lançamentos (mês atual já venceu no dia 1).
  INSERT INTO public.despesas_recorrentes(descricao, categoria, valor, inicio)
  VALUES ('Aluguel', 'Aluguel', 100, (mes0 - interval '3 months')::date) RETURNING id INTO r1;
  -- R2: dia 31 de janeiro de 2024 → meses curtos caem no último dia.
  INSERT INTO public.despesas_recorrentes(descricao, categoria, valor, inicio)
  VALUES ('Mensalidade dia 31', 'Administrativo', 50, DATE '2024-01-31') RETURNING id INTO r2;
  -- R3: com data final no segundo mês anterior → só 2 lançamentos.
  INSERT INTO public.despesas_recorrentes(descricao, categoria, valor, inicio, fim)
  VALUES ('Contrato curto', 'Outros', 30, (mes0 - interval '3 months')::date, (mes0 - interval '2 months' + interval '14 days')::date) RETURNING id INTO r3;
  -- R4: começa no mês que vem → nada ainda.
  INSERT INTO public.despesas_recorrentes(descricao, categoria, valor, inicio)
  VALUES ('Começa depois', 'Outros', 20, (mes0 + interval '1 month')::date) RETURNING id INTO r4;
  -- R5: dia 28 do mês atual → só lança quando o dia 28 chegar.
  INSERT INTO public.despesas_recorrentes(descricao, categoria, valor, inicio)
  VALUES ('Dia 28', 'Outros', 10, (mes0 + 27)::date) RETURNING id INTO r5;

  n := public.gerar_despesas_recorrentes(hoje);
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r1) <> 4 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: R1 deveria ter 4 lançamentos, tem %.', (SELECT count(*) FROM public.despesas WHERE recorrente_id = r1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.despesas WHERE recorrente_id = r1 AND data = mes0 AND valor = 100 AND categoria = 'Aluguel' AND descricao = 'Aluguel') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: lançamento do mês atual da R1 ausente ou com dados errados.';
  END IF;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r3) <> 2 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: data final não respeitada (R3 tem %).', (SELECT count(*) FROM public.despesas WHERE recorrente_id = r3);
  END IF;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r4) <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: despesa com início no futuro foi lançada.';
  END IF;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r5) <> (CASE WHEN extract(day FROM hoje) >= 28 THEN 1 ELSE 0 END) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: despesa do dia 28 lançada antes (ou depois) da hora.';
  END IF;

  -- Dia 31: fevereiro (bissexto e comum) e meses de 30 dias caem no último dia; nunca em data inexistente.
  IF NOT EXISTS (SELECT 1 FROM public.despesas WHERE recorrente_id = r2 AND data = DATE '2024-01-31')
     OR NOT EXISTS (SELECT 1 FROM public.despesas WHERE recorrente_id = r2 AND data = DATE '2024-02-29')
     OR NOT EXISTS (SELECT 1 FROM public.despesas WHERE recorrente_id = r2 AND data = DATE '2024-03-31')
     OR NOT EXISTS (SELECT 1 FROM public.despesas WHERE recorrente_id = r2 AND data = DATE '2024-04-30')
     OR NOT EXISTS (SELECT 1 FROM public.despesas WHERE recorrente_id = r2 AND data = DATE '2025-02-28') THEN
    RAISE EXCEPTION 'TESTE_FALHOU: dia 31 não caiu no último dia dos meses menores.';
  END IF;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r2 AND extract(day FROM data) NOT IN (28, 29, 30, 31)) <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: R2 gerou dia fora do esperado.';
  END IF;
  IF (SELECT count(*) FROM (SELECT date_trunc('month', data) FROM public.despesas WHERE recorrente_id = r2 GROUP BY 1 HAVING count(*) > 1) x) <> 0 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: R2 lançou duas vezes no mesmo mês.';
  END IF;

  -- Idempotência: chamar de novo (clique duplo, duas abas) não duplica nada. A única exceção é a
  -- R2, que começa em 2024 e pode passar do limite de 60 meses por chamada com o passar dos anos.
  gerou := public.gerar_despesas_recorrentes(hoje);
  IF gerou <> 0 AND (SELECT count(*) FROM public.despesas WHERE recorrente_id = r2) < 60 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: segunda chamada lançou % despesa(s) a mais.', gerou;
  END IF;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r1) <> 4 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: R1 duplicou na segunda chamada.';
  END IF;

  -- Excluir um mês gerado: ele não volta.
  DELETE FROM public.despesas WHERE recorrente_id = r1 AND data = (mes0 - interval '1 month')::date;
  PERFORM public.gerar_despesas_recorrentes(hoje);
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r1) <> 3 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: mês excluído voltou.';
  END IF;

  -- Alterar o valor vale só para os próximos; os já lançados ficam como estão.
  UPDATE public.despesas_recorrentes SET valor = 120 WHERE id = r1;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id = r1 AND valor = 100) <> 3 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: alterar a regra mexeu em lançamentos antigos.';
  END IF;

  -- Data inválida.
  BEGIN PERFORM public.gerar_despesas_recorrentes(hoje + 10); RAISE EXCEPTION 'TESTE_FALHOU: aceitou data muito distante.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'DESPESA:%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.gerar_despesas_recorrentes(NULL); RAISE EXCEPTION 'TESTE_FALHOU: aceitou data nula.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'DESPESA:%' THEN RAISE; END IF; END;

  -- Validações da tabela.
  BEGIN INSERT INTO public.despesas_recorrentes(descricao, valor, inicio) VALUES ('Zero', 0, hoje); RAISE EXCEPTION 'TESTE_FALHOU: valor zero aceito.';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.despesas_recorrentes(descricao, valor, inicio) VALUES ('   ', 5, hoje); RAISE EXCEPTION 'TESTE_FALHOU: descrição vazia aceita.';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.despesas_recorrentes(descricao, valor, inicio, fim) VALUES ('Fim antes', 5, hoje, hoje - 1); RAISE EXCEPTION 'TESTE_FALHOU: fim antes do início aceito.';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- Colunas protegidas: o navegador não mexe em gerado_ate, inicio nem user_id.
  BEGIN UPDATE public.despesas_recorrentes SET gerado_ate = DATE '2000-01-01' WHERE id = r1; RAISE EXCEPTION 'TESTE_FALHOU: alterou gerado_ate.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.despesas_recorrentes SET inicio = DATE '2020-01-01' WHERE id = r1; RAISE EXCEPTION 'TESTE_FALHOU: alterou inicio.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.despesas_recorrentes(descricao, valor, inicio, user_id) VALUES ('Outro dono', 5, hoje, 'b2222222-2222-4222-8222-222222222222'); RAISE EXCEPTION 'TESTE_FALHOU: gravou em nome de outra confeitaria.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Excluir a regra mantém o que já foi lançado (sem vínculo).
  SELECT count(*) INTO antes FROM public.despesas WHERE recorrente_id = r3;
  DELETE FROM public.despesas_recorrentes WHERE id = r3;
  IF (SELECT count(*) FROM public.despesas WHERE descricao = 'Contrato curto' AND recorrente_id IS NULL) <> antes THEN
    RAISE EXCEPTION 'TESTE_FALHOU: excluir a regra apagou ou manteve vínculo dos lançamentos.';
  END IF;
END $t$;
RESET ROLE;

-- Dona B: não vê nem gera nada da A --------------------------------------------------------------
SELECT pg_temp.entrar('b2222222-2222-4222-8222-222222222222');
SET LOCAL ROLE authenticated;
DO $t$
DECLARE
  n integer;
BEGIN
  IF (SELECT count(*) FROM public.despesas_recorrentes) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B vê regras da A.'; END IF;
  IF (SELECT count(*) FROM public.despesas WHERE recorrente_id IS NOT NULL) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B vê despesas geradas da A.'; END IF;
  n := public.gerar_despesas_recorrentes(current_date);
  IF n <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B gerou % despesa(s) sem ter regras.', n; END IF;
  DELETE FROM public.despesas_recorrentes;
  UPDATE public.despesas_recorrentes SET valor = 1;
END $t$;
RESET ROLE;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.despesas_recorrentes WHERE user_id = 'a1111111-1111-4111-8111-111111111111') <> 4 THEN
    RAISE EXCEPTION 'TESTE_FALHOU: B apagou ou alterou regras da A.';
  END IF;
  IF (SELECT count(*) FROM public.despesas_recorrentes WHERE valor = 1) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B alterou valor de regra da A.'; END IF;
END $t$;

-- Papel "produção" da confeitaria A: sem financeiro --------------------------------------------
SELECT pg_temp.entrar('e5555555-5555-4555-8555-555555555555');
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF (SELECT count(*) FROM public.despesas_recorrentes) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: produção vê despesas fixas.'; END IF;
  BEGIN PERFORM public.gerar_despesas_recorrentes(current_date); RAISE EXCEPTION 'TESTE_FALHOU: produção gerou despesas.';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'EQUIPE:%' THEN RAISE; END IF; END;
  BEGIN INSERT INTO public.despesas_recorrentes(descricao, valor, inicio) VALUES ('Da produção', 5, current_date); RAISE EXCEPTION 'TESTE_FALHOU: produção criou despesa fixa.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;

-- Anônimo --------------------------------------------------------------------------------------
SET LOCAL ROLE anon;
DO $t$ BEGIN
  BEGIN PERFORM count(*) FROM public.despesas_recorrentes; RAISE EXCEPTION 'TESTE_FALHOU: anônimo leu despesas_recorrentes.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.gerar_despesas_recorrentes(current_date); RAISE EXCEPTION 'TESTE_FALHOU: anônimo executou a geração.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;

ROLLBACK;
