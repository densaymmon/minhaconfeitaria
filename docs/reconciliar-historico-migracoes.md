# Reconciliar o histórico de migrações do Doce Gestão

## Por que existe este procedimento

Na auditoria de 19/10/2026, o banco Lovable Cloud tinha as estruturas das migrações de estoque, produção, compras, pagamentos e recebimentos, mas `drizzle.__drizzle_migrations` registrava apenas `0000` a `0003`. O journal também não listava as migrações `0013` a `0018`, e há dois arquivos com prefixo `0013` e dois com prefixo `0014`.

Se o migrador Drizzle for executado diretamente com esse histórico, poderá tentar reaplicar migrações antigas sobre tabelas já existentes. Não execute `drizzle-kit migrate` antes da reconciliação.

## Procedimento seguro

1. Faça um backup do banco e confirme que está conectado ao projeto **Minhaconfeitaria** correto.
2. Confira se o histórico contém exatamente o baseline conhecido `0000`–`0003` e se as tabelas recorrentes ainda não existem.
3. Execute `scripts/reconcile-drizzle-history.sql` uma única vez no banco ativo.
4. O script verifica hashes/timestamps do baseline, confere tabelas, colunas e funções esperadas, recria somente a função sem efeitos colaterais `recalcular_custos_historicos()` que estava ausente e registra como já representadas as migrações `0004`–`0020`.
5. Só se o script terminar com `COMMIT`, execute o migrador normal. A próxima migração pendente deve ser `0021`, seguida de `0022`, `0023` e `0024`.
6. Rode os testes de fumaça de estoque, produção, recebimentos e pedidos recorrentes.

## Proteções do script

- Tudo é transacional: uma falha provoca rollback.
- Não altera pedidos, itens, pagamentos, compras, movimentos de estoque nem saldos.
- Interrompe se os hashes/timestamps do baseline não corresponderem, se houver conflito no histórico, se o schema estiver incompleto, se houver registros posteriores a `0020` ou se as tabelas recorrentes já existirem.
- Reconhece o subsistema atual de contas a pagar por ledger/RPC, que substituiu o antigo modelo de gravação direta da migração `0014`.
- Não marca `0021`–`0024` como aplicadas; elas devem ser executadas normalmente depois da reconciliação.

**Não execute este procedimento em outro banco ou em uma instalação limpa.** A validação no CI reproduz o estado legado antes de considerar a implantação.
