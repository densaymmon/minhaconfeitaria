# Plano seguro de reconciliação do histórico de migrações

**Data:** 2026-10-27  
**Ambiente consultado:** banco Lovable ativo do projeto Minhaconfeitaria  
**Status:** plano de execução; nenhuma alteração de produção autorizada ou realizada.

## Evidências verificadas

- O ledger `drizzle.__drizzle_migrations` contém 29 registros, com `max(created_at = 1792400000002)`, correspondente ao timestamp de 0026.
- O journal contém entradas até 0028, com timestamps 1792400000003 (0027) e 1792400000004 (0028).
- Os arquivos 0029–0032 existem no repositório, mas não constam no journal.
- O banco possui objetos compatíveis com 0027, 0028 e 0030–0032: `pedidos_recorrentes.excluida`, funções `excluir_pedidos_recorrentes`, `corrigir_valor_pago_pedido_com_producao`, `excluir_insumo_se_sem_receita`, `registrar_recebimento_pedido`, colunas de parcelamento, índice único parcial e função `editar_conta_pagar_parcelada`.
- A migração 0029 é um no-op (`SELECT 1`) e não implementa conciliação de estorno.

## Por que não corrigir o ledger imediatamente

A presença de objetos não comprova equivalência integral de todas as instruções SQL, privilégios, triggers, constraints, comentários e políticas RLS. O ledger também não contém hashes de conteúdo por padrão. Inserir registros sem validação poderia declarar como aplicada uma migração parcialmente aplicada. Executar os arquivos novamente sem revisão poderia causar efeitos colaterais.

## Plano de correção controlada

### Fase A — cópia isolada e pré-condições

1. Criar e verificar backup/restauração da base, ou uma cópia isolada com os mesmos objetos e dados anonimizados.
2. Capturar o estado do ledger e o hash SHA-256 de cada arquivo SQL versionado.
3. Na cópia, coletar definições integrais de funções, grants efetivos, índices, constraints, triggers, políticas RLS, comentários e dependências para os objetos tocados por 0027–0032.
4. Comparar as definições com o SQL versionado. Diferença não explicada bloqueia a reconciliação.

### Fase B — testes

1. Aplicar todas as migrações em PostgreSQL descartável a partir do baseline aprovado.
2. Testar as migrações 0027–0032, incluindo execução repetida apenas para operações explicitamente idempotentes.
3. Executar testes de pedidos recorrentes, recebimentos detalhados, exclusão/inativação de insumos, criação e edição de parcelamentos e estornos.
4. Na cópia restaurada, testar o script de reconciliação e confirmar que ele não muda dados comerciais nem recria objetos de forma destrutiva.

### Fase C — plano final

1. Gerar script de reconciliação específico, com transação quando viável, verificações explícitas e falha fechada se qualquer precondição divergir.
2. Não alterar nem renumerar automaticamente tags duplicadas 0013/0014.
3. Não registrar 0029 como correção funcional: o arquivo atual é no-op. Sua posição histórica deve ser tratada como migração neutra.
4. Revisar o script em PR e exigir CI verde.
5. Só executar em produção com backup verificado, janela de manutenção aprovada e plano de rollback.
6. Depois, conferir ledger, funções, privilégios, RLS e smoke tests sem modificar registros comerciais.

## Critérios para considerar concluído

- Todas as definições de objetos 0027–0032 foram comparadas integralmente.
- A reconciliação foi testada em cópia restaurada.
- Backup e recuperação foram verificados.
- O script final falha com segurança diante de qualquer estado inesperado.
- CI passa; PR revisada.
- Execução controlada e validação pós-execução registradas separadamente.

## Estado atual

A auditoria de leitura foi realizada, mas as ferramentas disponíveis nesta etapa não fornecem confirmação de backup/restauração nem uma cópia isolada de produção. Por isso, este documento não afirma que a reconciliação foi executada e não autoriza alterações no banco real.
