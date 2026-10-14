# Relatório de validação preliminar — controle de estoque

Data: 2026-10-13
Branch: `feat/controle-estoque-draft`

## Escopo executado

Revisão estática dos arquivos `0003_compras_insumos.sql`, `0004_controle_estoque.sql`, `0005_compras_estoque_atomico.sql`, `src/routes/_authenticated/compras.tsx` e dos tipos Supabase.

## Correções feitas durante a revisão

1. A RPC `salvar_compra` agora define `search_path = pg_catalog, public`, reduzindo o risco de resolução de nomes inesperados em uma função `SECURITY DEFINER`.
2. A validação do JSON de itens foi dividida em duas etapas: primeiro confirma que o valor é um array; só depois chama `jsonb_array_length`. Isso evita depender de curto-circuito da expressão para JSON que não seja array.

## Resultados da revisão estática

- A migração 0005 depende da tabela `estoque_movimentos` criada na 0004 e das tabelas/funções anteriores; precisa ser executada na ordem 0000–0005 em ambiente descartável.
- O front-end chama `salvar_compra` e mantém o UUID do evento durante uma nova tentativa com a mesma assinatura.
- A RPC valida o usuário via `auth.uid()`, verifica a propriedade do insumo e usa uma transação PostgreSQL.
- Compras existentes recebem `estoque_integrado = false`, evitando importação automática de compras históricas.
- A edição de compras integradas grava estornos compensatórios e novas entradas na mesma transação.
- A migração revoga gravação direta de `authenticated` nas tabelas de compras; por isso a RPC e a versão compatível da interface precisam ser implantadas juntas.
- A baixa de produção, exclusão integral de compra, reconciliação do inventário físico, testes automatizados e UI de saldo ainda não estão implementados.

## Estado dos testes

**Não foram executados testes de banco, build, lint ou suíte de testes.** Não há ambiente de teste isolado confirmado acessível nesta etapa, e a conexão GitHub não reportou status checks nem execuções de CI para o commit revisado. A revisão estática não prova que o SQL compila ou que as migrações funcionam na prática.

## Plano obrigatório para validar em ambiente isolado

1. Aplicar as migrações 0000–0005 somente num banco descartável com schema de base correspondente.
2. Testar compra nova, edição, múltiplas linhas do mesmo insumo, repetição do mesmo evento e duas edições concorrentes.
3. Forçar erro depois da inserção do cabeçalho e depois de inserir um movimento; confirmar rollback completo.
4. Confirmar que usuário A não lê/edita registros de usuário B e que clientes não conseguem gravar diretamente no ledger.
5. Testar conversões kg/g, L/ml, dúzia/unidade e rejeição de pacote sem conteúdo configurado.
6. Executar build, lint e testes do projeto.
7. Só então rever a PR; não mesclar nem aplicar no banco ativo antes da aprovação explícita.
