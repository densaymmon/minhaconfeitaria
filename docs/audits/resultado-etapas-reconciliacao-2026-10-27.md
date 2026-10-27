# Resultado das cinco etapas — reconciliação do histórico

**Data:** 2026-10-27  
**Projeto:** Minha Confeitaria / Lovable Cloud  
**PR de acompanhamento:** https://github.com/densaymmon/minhaconfeitaria/pull/178

## Etapa 1 — Backup e cópia isolada

- O CI criou bancos PostgreSQL descartáveis e concluiu os testes de migrações e de reparação do histórico.
- Não foi possível confirmar backup/restauração do banco Lovable de produção nem criar uma cópia restaurada do próprio ambiente de produção pelas ferramentas disponíveis.
- **Bloqueio:** não executar alterações no banco real sem backup e recuperação verificados.

## Etapa 2 — Estado do ledger e arquivos

- O ledger de produção contém 29 registros e termina no timestamp de 0026.
- O journal registra 0027 e 0028, mas o ledger não registra essas migrações.
- Os arquivos 0029–0032 existem, porém não estão no journal.
- Não renumerar tags duplicadas 0013/0014.
- 0029 é intencionalmente um no-op (SELECT 1), portanto não implementa conciliação de estorno.

## Etapa 3 — Comparação de objetos de produção

A inspeção somente leitura encontrou divergências que impedem carimbar todas as migrações como aplicadas:

- public.excluir_insumo_se_sem_receita(uuid) existe, mas sua definição de produção não é idêntica à migration 0030: a verificação de histórico da função de produção consulta compra_itens diretamente, enquanto a migration 0030 associa os itens a compras para validar a propriedade do usuário. Grants efetivos para authenticated e service_role existem; o comentário documentado na migration não aparece no objeto atual.
- public.registrar_recebimento_pedido(...) existe, mas a definição de produção usa pedido.valor_entrada como valor pago legado, enquanto a migration 0031 compara esse valor com a soma de pedido_pagamentos. **Não marcar 0031 como aplicada sem resolver e testar essa diferença**, pois ela pode afetar a validação de saldo e impedir recebimentos duplicados.
- A função de edição de parcelamento 0032 e o índice único parcial correspondente existem em produção. Isso, isoladamente, não prova equivalência integral de todos os efeitos da migration.
- A presença de funções, colunas e índices não prova equivalência de todos os grants, constraints, triggers, políticas RLS, comentários e dependências.

## Etapa 4 — Testes isolados

A execução do GitHub Actions 40561882726 concluiu com sucesso:

- Aplicação de todas as migrations em PostgreSQL descartável.
- Smoke tests de compras, cancelamento, estoque, produção, histórico, pedidos recorrentes, proteção contra confirmação duplicada, parcelas, edição, cancelamento e limites de saldo.
- Teste isolado de reparação do histórico de migrações.
- Lint, TypeScript, testes do frontend e build.

Esses resultados validam os testes automatizados do repositório, mas não substituem teste de restauração de backup nem a comparação completa da base real.

## Etapa 5 — Decisão e execução

- Não executar scripts/reconcile-drizzle-history.sql em produção: o script é condicionado a um estado histórico anterior (baseline até 0020) e rejeita o estado atual com tabelas recorrentes já presentes.
- Não inserir manualmente hashes no ledger para 0027–0032.
- A divergência identificada em 0031 precisa de correção/decisão explícita e teste; 0030 também precisa de comparação e decisão sobre a diferença de definição.
- O PR #178 permanece como documentação de auditoria; o CI da revisão atual passou.
- **Status final:** validação automatizada concluída; reconciliação de produção bloqueada por ausência de backup/restauração verificados e divergências de definições. Nenhuma alteração foi feita no banco real durante esta etapa.
