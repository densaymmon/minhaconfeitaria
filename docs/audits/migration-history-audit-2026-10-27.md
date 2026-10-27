# Auditoria inicial do histórico de migrações

**Data:** 2026-10-27  
**Escopo:** leitura do repositório e endurecimento dos testes em banco descartável. Nenhuma alteração foi executada no banco de produção.

## Constatações verificadas

1. `drizzle/migrations/meta/_journal.json` termina na entrada `0028_corrigir_valor_pago_pedido_com_producao`. Existe pelo menos um arquivo SQL posterior, `drizzle/migrations/0032_editar_total_parcelamento_manual.sql`, que não aparece no journal. Portanto, a lista de migrações e o journal não podem ser considerados sincronizados.
2. O workflow de qualidade aplicava o conjunto completo de arquivos numa base PostgreSQL limpa, mas o cenário de reconciliação aplicava somente as migrações 0021–0026 depois de reparar o histórico. Assim, migrações posteriores não eram verificadas nesse cenário.
3. `scripts/reconcile-drizzle-history.sql` é um reparo condicionado a um estado específico: exige que o histórico base 0000–0003 corresponda aos hashes esperados, verifica tabelas/colunas/funções e interrompe se detectar tabelas de pedidos recorrentes. O script também cria ou substitui a função `recalcular_custos_historicos()` e registra hashes/timestamps no histórico. Não é um reparo genérico nem deve ser executado na produção sem comparar o esquema e o ledger reais com todas as pré-condições.
4. O journal tem tags numéricas repetidas (0013 e 0014), embora os nomes completos das migrações sejam distintos. Não renomear nem reordenar esses arquivos automaticamente: isso pode mudar a identidade e a ordem esperada pelo histórico.
5. O workflow verifica a aplicação de SQL em PostgreSQL descartável, mas esse teste, por si só, não prova que a base Lovable de produção esteja no mesmo estado.

## Alteração desta etapa

O teste de reconciliação passa a aplicar **todos os arquivos de migração posteriores ao baseline reparado**, em vez de parar na 0026. Também executa novamente os testes de recorrências e de pagamentos parcelados após a aplicação desse conjunto. Isso aumenta a cobertura para mudanças posteriores sem alterar o banco real.

## Bloqueios antes de reconciliar produção

- Obter a lista real de arquivos SQL versionados e comparar cada arquivo com o journal, inclusive os arquivos após 0028.
- Comparar os hashes/timestamps do ledger de produção com os arquivos exatos e verificar o esquema vivo antes de qualquer registro manual.
- Identificar quais migrações foram aplicadas por fora do journal e se a função de correção de parcelamento já está instalada.
- Preparar um plano de reconciliação idempotente e reversível, com backup verificado e teste em cópia/restauração da base.

**Não execute `scripts/reconcile-drizzle-history.sql` em produção com base apenas neste documento.** Esta PR não altera tabelas nem dados comerciais, e não declara o histórico de produção reconciliado.
