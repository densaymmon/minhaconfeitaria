\set ON_ERROR_STOP on
-- Endereço próprio do cardápio (0051): validação e leitura pública.
BEGIN;

UPDATE public.plataforma_config SET cadastro_aberto = true, aprovacao_manual = false;
INSERT INTO auth.users(id) VALUES
  ('c3333333-3333-4333-8333-333333333333'),
  ('d4444444-4444-4444-8444-444444444444');

UPDATE public.confeitarias SET slug = 'loja-com-site', catalogo_ativo = true,
  endereco_cardapio = 'https://site-da-loja.test'
WHERE user_id = 'c3333333-3333-4333-8333-333333333333';
UPDATE public.confeitarias SET slug = 'loja-sem-site', catalogo_ativo = true
WHERE user_id = 'd4444444-4444-4444-8444-444444444444';

-- Endereço inválido é recusado pelo banco.
DO $t$
BEGIN
  BEGIN
    UPDATE public.confeitarias SET endereco_cardapio = 'javascript:alert(1)'
    WHERE user_id = 'c3333333-3333-4333-8333-333333333333';
    RAISE EXCEPTION 'TESTE_FALHOU: endereço inválido aceito.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $t$;

-- O visitante anônimo lê só o endereço, pela função.
SET LOCAL ROLE anon;
DO $t$
BEGIN
  IF public.endereco_cardapio_publico('loja-com-site') IS DISTINCT FROM 'https://site-da-loja.test' THEN
    RAISE EXCEPTION 'TESTE_FALHOU: endereço próprio não retornado.';
  END IF;
  IF public.endereco_cardapio_publico('loja-sem-site') IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: loja sem site retornou endereço.';
  END IF;
  IF public.endereco_cardapio_publico('nao-existe') IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: endereço inexistente retornou valor.';
  END IF;
END $t$;
RESET ROLE;

-- Catálogo desligado: sem redirecionamento.
UPDATE public.confeitarias SET catalogo_ativo = false
WHERE user_id = 'c3333333-3333-4333-8333-333333333333';
SET LOCAL ROLE anon;
DO $t$
BEGIN
  IF public.endereco_cardapio_publico('loja-com-site') IS NOT NULL THEN
    RAISE EXCEPTION 'TESTE_FALHOU: catálogo desligado ainda redireciona.';
  END IF;
END $t$;
RESET ROLE;

ROLLBACK;
