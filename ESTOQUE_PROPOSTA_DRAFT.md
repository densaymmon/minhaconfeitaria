# Controle de estoque — rascunho

Branch isolada: feat/controle-estoque-draft.

Nenhuma alteração foi aplicada ao banco ativo. Esta proposta deve ser revisada antes de ativar a migração. O ledger precisa ser append-only, com idempotência, RLS por proprietário, movimentos compensatórios para estornos, conversão apenas entre unidades compatíveis e confirmação explícita do inventário físico antes de importar compras antigas.

A integração de compras e produção deve ser transacional. A tela atual de compras faz várias gravações separadas; a tela de produção atualiza os itens individualmente. Não ativar triggers automáticos até substituir esses fluxos por RPCs atômicas e testar rollback, concorrência e repetição de chamadas.
