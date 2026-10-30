# Migrações de banco

## Como o repositório organiza as migrações

- `drizzle/migrations/NNNN_*.sql`: fonte principal. O CI aplica **todas, em ordem**, em um banco descartável e roda os testes de `tests/db/`.
- `supabase/migrations/`: migrações antigas, aplicadas por outro caminho. Não crie novas aqui.
- Em produção, o histórico oficial do migrador (`drizzle.__drizzle_migrations`) **não reflete** todas as migrações: algumas foram aplicadas direto no banco (por exemplo, `0033` e `0035` ficam fora do `_journal.json`). Por isso **não execute `drizzle-kit migrate` em produção**. Contexto: `docs/reconciliar-historico-migracoes.md` e `docs/audits/`.

## Regras para escrever uma migração

1. Arquivo novo com o próximo número livre (`NNNN_descricao.sql`). Não edite migrações já aplicadas.
2. Idempotente quando possível (`IF NOT EXISTS`, `CREATE OR REPLACE`) e transacional.
3. Nova tabela: habilite RLS, adicione a política tenant e a política `acesso_liberado` (o teste `plataforma-smoke.sql` falha sem ela) e **não** conceda nada ao papel anônimo sem justificativa.
4. Função `SECURITY DEFINER`: filtre toda leitura e escrita pela confeitaria (`_tenant()`).
5. Mudou regra de dados? Adicione ou atualize um teste em `tests/db/` e inclua-o em `.github/workflows/quality.yml`.
6. Nunca recalcule custos de pedidos antigos.

## Como aplicar em produção (uma de cada vez)

Antes:
1. Confirme que o banco aberto é o projeto **Minhaconfeitaria** (produção).
2. Faça um backup/cópia e confirme que ele existe (ver `backup-e-recuperacao.md`).
3. Leia a migração inteira. Se ela apaga ou altera dados existentes, valide em uma cópia antes.
4. Anote contagens de conferência das tabelas afetadas.

Aplicando:
5. Execute o arquivo **uma única vez**, inteiro, no editor SQL do banco.
6. Se terminar com erro, a transação reverte; não tente "consertar" executando partes soltas.

Depois:
7. Rode as consultas de conferência (as contagens antes/depois devem bater, exceto o que a migração muda por design).
8. Abra o sistema e teste um fluxo afetado (por exemplo, salvar um pedido).
9. Registre abaixo.
10. Só então faça o merge do PR que depende da migração, quando aplicável.

## Registro de migrações aplicadas em produção

Mantenha esta tabela atualizada a cada aplicação. Ela é a lista que falta hoje para saber, sem adivinhar, o estado do banco.

| Migração | Aplicada em | Por quem | Conferência feita |
|---|---|---|---|
| 0047 salvar_pedido preserva recebimentos | out/2026 (etapa C da auditoria) | não registrado | ver `docs/avaliacao-comercial-e-piloto.md` |
| _demais: preencher a partir do banco (`select * from drizzle.__drizzle_migrations` + conferência de objetos)_ | | | |
