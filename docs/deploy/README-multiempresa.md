# Implantação: base multiempresa (migração 0033)

## O que a migração faz
- Cria `public.confeitarias` (uma por conta de proprietária) e `public.plataforma_config`.
- Cria a confeitaria das contas existentes com a marca atual ("O Casal do Bolo — Amor em cada pedaço").
- Remove os gatilhos de proprietária única (`trg_proprietario_unico`, `release_owner_claim`). A tabela `owner_claim` é mantida intacta.
- Cria o gatilho `trg_criar_confeitaria`: cada novo cadastro ganha uma confeitaria; com `cadastro_aberto = false` (padrão), novos cadastros são recusados.
- Não altera pedidos, itens, pagamentos, compras, estoque, contas nem configurações.

## Por que aplicar o arquivo diretamente
O histórico do Drizzle em produção termina em `0026` e as migrações `0027`–`0032` foram aplicadas por outro caminho (ver `docs/audits/resultado-etapas-reconciliacao-2026-10-27.md`). Por isso `0033` **não** entra no `_journal.json` e **não** deve ser aplicada com `drizzle-kit migrate`, que tentaria reaplicar `0027`/`0028`.

A `0033` é autocontida (não depende de `0027`–`0032`), transacional (`BEGIN`/`COMMIT`) e idempotente.

## Passo a passo
1. Faça um backup do banco (Lovable Cloud) e confirme que é o projeto **Minhaconfeitaria**.
2. Execute o conteúdo de `drizzle/migrations/0033_base_multiempresa.sql` uma vez no banco.
3. Confira:
   ```sql
   select user_id, nome, slogan from public.confeitarias;          -- 1 linha: O Casal do Bolo
   select cadastro_aberto from public.plataforma_config;            -- false
   select tgname from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal;    -- só trg_criar_confeitaria
   ```
4. Só então faça o merge do PR no `main` (o frontend lê `confeitarias`; antes da migração ele funciona, mas sem o nome da confeitaria nos recibos).

## Abrir ou fechar novos cadastros
```sql
update public.plataforma_config set cadastro_aberto = true,  updated_at = now();  -- abrir
update public.plataforma_config set cadastro_aberto = false, updated_at = now();  -- fechar
```
Usuários comuns não conseguem ler nem alterar essa tabela.

## Reverter (se necessário)
```sql
begin;
drop trigger if exists trg_criar_confeitaria on auth.users;
create trigger trg_proprietario_unico before insert on auth.users
  for each row execute function public.limitar_proprietario_unico();
create trigger release_owner_claim after delete on auth.users
  for each row execute function public.release_owner_claim();
commit;
```
As tabelas `confeitarias` e `plataforma_config` podem permanecer; o frontend continua funcionando.
