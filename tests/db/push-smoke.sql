\set ON_ERROR_STOP on
-- Notificações push: inscrição por confeitaria, troca de dono do navegador e segredos fora do alcance.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES ('a1111111-1111-4111-8111-111111111111'), ('b2222222-2222-4222-8222-222222222222');
INSERT INTO public.plataforma_segredos (chave, valor) VALUES ('vapid_privada', 'segredo-de-teste');

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  PERFORM public.salvar_inscricao_push('https://fcm.googleapis.com/fcm/send/aparelho-1', repeat('B', 87), repeat('a', 22), 'Celular');
  PERFORM public.salvar_inscricao_push('https://fcm.googleapis.com/fcm/send/aparelho-1', repeat('C', 87), repeat('b', 22), 'Celular');
  IF (SELECT count(*) FROM public.push_inscricoes) <> 1 OR (SELECT p256dh FROM public.push_inscricoes) <> repeat('C', 87) THEN
    RAISE EXCEPTION 'TESTE_FALHOU: reinscrição duplicou ou não atualizou.';
  END IF;
  BEGIN
    INSERT INTO public.push_inscricoes (endpoint, p256dh, auth) VALUES ('https://x.com/y', repeat('B', 87), repeat('a', 22));
    RAISE EXCEPTION 'TESTE_FALHOU: insert direto permitido.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.plataforma_segredos;
    RAISE EXCEPTION 'TESTE_FALHOU: confeitaria leu segredos.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.salvar_inscricao_push('http://inseguro.com/x', repeat('B', 87), repeat('a', 22), NULL);
    RAISE EXCEPTION 'TESTE_FALHOU: endpoint sem https aceito.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  FOR i IN 1..25 LOOP
    PERFORM public.salvar_inscricao_push('https://fcm.googleapis.com/fcm/send/extra-' || i, repeat('B', 87), repeat('a', 22), NULL);
  END LOOP;
  IF (SELECT count(*) FROM public.push_inscricoes) > 21 THEN RAISE EXCEPTION 'TESTE_FALHOU: sem limite de aparelhos.'; END IF;
END $t$;
RESET ROLE;

-- B entra no mesmo navegador: a inscrição passa a ser dela e A não vê mais.
SELECT set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
SET LOCAL ROLE authenticated;
DO $t$
BEGIN
  IF (SELECT count(*) FROM public.push_inscricoes) <> 0 THEN RAISE EXCEPTION 'TESTE_FALHOU: B viu inscrições da A.'; END IF;
  PERFORM public.salvar_inscricao_push('https://fcm.googleapis.com/fcm/send/aparelho-1', repeat('D', 87), repeat('c', 22), 'Tablet');
  IF (SELECT count(*) FROM public.push_inscricoes) <> 1 THEN RAISE EXCEPTION 'TESTE_FALHOU: inscrição não passou para B.'; END IF;
  DELETE FROM public.push_inscricoes;
END $t$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $t$ BEGIN
  IF EXISTS (SELECT 1 FROM public.push_inscricoes WHERE endpoint LIKE '%aparelho-1') THEN RAISE EXCEPTION 'TESTE_FALHOU: A manteve o aparelho de B.'; END IF;
END $t$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $t$ BEGIN
  BEGIN
    PERFORM public.salvar_inscricao_push('https://fcm.googleapis.com/fcm/send/z', repeat('B', 87), repeat('a', 22), NULL);
    RAISE EXCEPTION 'TESTE_FALHOU: anônimo se inscreveu.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF public._slug_reservado('icons') IS NOT TRUE THEN RAISE EXCEPTION 'TESTE_FALHOU: /icons não reservado.'; END IF;
END $t$;
RESET ROLE;

ROLLBACK;
