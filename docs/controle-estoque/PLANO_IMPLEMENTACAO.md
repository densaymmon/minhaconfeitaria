# Controle de estoque — proposta para revisão

## Escopo desta branch

Esta branch é uma proposta isolada, derivada de `main`. Nenhuma SQL foi executada no banco ativo, nenhum dado foi alterado e nada foi mesclado em `main`.

A migração `0004_controle_estoque.sql` cria a fundação do ledger. A migração `0005_compras_estoque_atomico.sql` prepara uma RPC transacional/idempotente para salvar compras e registrar movimentos de entrada, além de manter compras antigas fora do saldo até reconciliação física. A tela de compras foi alterada nesta branch para chamar essa RPC. **Nenhuma dessas migrações foi aplicada nem testada em banco isolado**, portanto o código continua sendo uma proposta para revisão, não está pronto para produção.

## Regras de integridade

- O histórico é append-only: correções usam movimentos compensatórios; nunca editar/apagar movimentos contabilizados.
- Cada operação recebe um UUID idempotente em `estoque_eventos`; um evento pode gerar vários movimentos para o mesmo insumo, incluindo estornos e reposições.
- O saldo é a soma de `quantidade_delta_base`; saldo negativo é permitido e precisa gerar alerta na interface.
- Unidades-base são somente `g`, `ml` e `un`. Não converter massa em volume. Pacotes só podem ser convertidos quando a quantidade e a unidade do conteúdo forem conhecidas.
- A tabela tem RLS de leitura por proprietário e nega escrita direta ao cliente autenticado. A gravação será feita por RPCs controladas, com validação de `auth.uid()`.
- Não importar compras antigas automaticamente. A importação deve passar por revisão e confirmação do estoque físico real.

## Próximas alterações de código propostas

1. **Em implementação nesta branch:** RPC `salvar_compra` grava/edita os itens e seus movimentos na mesma transação. Ainda falta validar a migração e os cenários no banco isolado, testar a implantação coordenada com a interface e decidir o fluxo de exclusão integral da compra.
2. Criar RPC transacional para ajustar a quantidade produzida e registrar o consumo de todos os insumos da receita em uma única transação. O fluxo atual atualiza cada item em chamadas separadas.
3. Definir snapshots/versionamento da receita usada no evento de produção, para que edições futuras de receita não alterem retroativamente o consumo histórico.
4. Criar operação de estorno e idempotência que diferencie eventos de produção, ingredientes e compensações. Não usar apenas `pedido_item_id` como chave única vitalícia.
5. Adicionar tela de estoque com saldo por insumo, unidade-base, alerta de negativo, histórico e fluxo revisável de inventário inicial.
6. Atualizar os tipos gerados do banco e invalidar consultas de estoque após cada operação bem-sucedida.

## Revisões necessárias antes de ativar

- Confirmar que a plataforma aceita e executa a migração proposta no ambiente de teste.
- Testar política RLS e privilégios de gravação, incluindo tentativas de escrita direta pelo cliente.
- Testar conversões e limites numéricos, concorrência, idempotência, estornos, exclusões e rollback integral em caso de falha.
- A implantação deve coordenar migração e front-end: a RPC precisa existir antes que a tela nova seja publicada, e a tela nova deve estar pronta antes de revogar escrita direta. Confirmar a ordem de deploy no ambiente de teste; não aplicar diretamente no banco ativo nesta fase.

## Cenários mínimos de teste

- Compra de 2 kg de farinha = +2.000 g.
- Compra de 1 L de leite = +1.000 ml.
- Pacote de 500 g = +500 g apenas se o conteúdo estiver cadastrado e validado.
- Repetição do mesmo evento não duplica movimentos.
- Edição/remoção de compra gera compensação, sem apagar o registro original.
- Produção parcial baixa apenas o consumo correspondente à diferença efetivamente produzida.
- Redução de produção gera estorno; erro no meio da operação faz rollback de todas as alterações.
- Edição de pedido não cria baixa duplicada, mesmo que os itens sejam excluídos e recriados pela função atual.
- Saldo negativo aparece como alerta.
- Um usuário não lê nem altera os movimentos de outro.
- Compras históricas não mudam o saldo até revisão e confirmação do inventário físico.


## Status técnico da etapa de compras (branch de rascunho)

- Adicionada `0005_compras_estoque_atomico.sql` com `salvar_compra(payload, itens, registro_id, evento_id)`.
- A RPC usa chave idempotente por usuário/evento, bloqueio da compra durante edição, validação de proprietário/unidades, transação única e movimentos compensatórios para compras que já estejam integradas.
- A coluna `compras.estoque_integrado` nasce como `false` para registros existentes; compra nova criada pela RPC entra como integrada. Editar uma compra histórica não adiciona automaticamente sua quantidade ao estoque.
- A interface chama a RPC e mantém o mesmo UUID de evento ao repetir a mesma submissão após erro de rede.
- Tipos Supabase atualizados para a RPC e a coluna nova.
- Ainda não existe baixa de produção, tela de saldo, importação de inventário físico nem exclusão integral de compra integrada.
- **Verificação pendente:** executar migrations `0000` a `0005` em banco isolado, testar permissões/rollback/idempotência/conversões e compilar o app. Nenhum teste de execução foi realizado por esta alteração remota.
