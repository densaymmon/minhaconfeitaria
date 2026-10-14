# Controle de estoque — proposta para revisão

## Escopo desta branch

Esta branch é uma proposta isolada, derivada de `main`. Nenhuma SQL foi executada no banco ativo, nenhum dado foi alterado e nada foi mesclado em `main`.

A migração `0004_controle_estoque.sql` cria somente a fundação do ledger: tabela de movimentos imutáveis, índices, RLS e consulta de saldo. Ela **não** ativa entradas automáticas de compras nem baixas de produção. Isso é intencional: a integração só deve entrar após implementar operações transacionais e testar os fluxos atuais da aplicação.

## Regras de integridade

- O histórico é append-only: correções usam movimentos compensatórios; nunca editar/apagar movimentos contabilizados.
- Cada evento recebe um UUID idempotente; o banco limita um movimento por insumo dentro do mesmo evento.
- O saldo é a soma de `quantidade_delta_base`; saldo negativo é permitido e precisa gerar alerta na interface.
- Unidades-base são somente `g`, `ml` e `un`. Não converter massa em volume. Pacotes só podem ser convertidos quando a quantidade e a unidade do conteúdo forem conhecidas.
- A tabela tem RLS de leitura por proprietário e nega escrita direta ao cliente autenticado. A gravação será feita por RPCs controladas, com validação de `auth.uid()`.
- Não importar compras antigas automaticamente. A importação deve passar por revisão e confirmação do estoque físico real.

## Próximas alterações de código propostas

1. Criar RPC transacional de compra para registrar/editar/remover itens e movimentos correspondentes em uma única transação. A UI atual faz várias gravações separadas, então não basta adicionar triggers sem rever o fluxo.
2. Criar RPC transacional para ajustar a quantidade produzida e registrar o consumo de todos os insumos da receita em uma única transação. O fluxo atual atualiza cada item em chamadas separadas.
3. Definir snapshots/versionamento da receita usada no evento de produção, para que edições futuras de receita não alterem retroativamente o consumo histórico.
4. Criar operação de estorno e idempotência que diferencie eventos de produção, ingredientes e compensações. Não usar apenas `pedido_item_id` como chave única vitalícia.
5. Adicionar tela de estoque com saldo por insumo, unidade-base, alerta de negativo, histórico e fluxo revisável de inventário inicial.
6. Atualizar os tipos gerados do banco e invalidar consultas de estoque após cada operação bem-sucedida.

## Revisões necessárias antes de ativar

- Confirmar que a plataforma aceita e executa a migração proposta no ambiente de teste.
- Testar política RLS e privilégios de gravação, incluindo tentativas de escrita direta pelo cliente.
- Testar conversões e limites numéricos, concorrência, idempotência, estornos, exclusões e rollback integral em caso de falha.
- Só depois preparar migração seguinte ou completar esta com RPCs e integração de interface. Não aplicar diretamente no banco ativo nesta fase.

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
