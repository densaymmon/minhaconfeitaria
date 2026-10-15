# Implantação isolada: Contas a pagar

Este módulo usa uma linha de implantação administrativa separada do executor Drizzle do projeto.

## Arquivos
- `docs/deploy/contas-pagar-rpcs.sql`: DDL e funções RPC; ainda não aplicada.
- `tests/db/contas-pagar-rpcs-smoke.sql`: testes funcionais e de isolamento em banco descartável.
- `tests/db/contas-pagar-concurrency.sh`: teste de duas tentativas concorrentes de pagamento.
- `.github/workflows/test-contas-pagar-rpcs.yml`: executa a suíte em PostgreSQL 17 descartável.

## Segurança de implantação
1. Não execute `drizzle-kit migrate` para implantar somente este módulo: o journal existente tem migrations pendentes de estoque/produção.
2. Não mova o SQL para `drizzle/migrations` e não edite o journal para marcar migrations como aplicadas.
3. A migration tem preflight que interrompe a execução se `public.contas_pagar` já existir. Se isso acontecer, investigue o esquema real antes de qualquer tentativa.
4. Execute a suíte CI primeiro e revise o SQL e as assinaturas RPC.
5. Somente após aprovação explícita, planeje a aplicação pelo mecanismo administrativo de migration do Lovable Cloud, com confirmação de transação atômica e papel proprietário das funções.
6. Não execute este arquivo diretamente no banco de produção sem essa aprovação. Esta branch não executa SQL em nenhum banco remoto.

## Interface
A tela foi alterada para gravar por `salvar_conta_pagar`, `registrar_pagamento_conta_pagar`, `estornar_pagamento_conta_pagar` e `cancelar_conta_pagar`. Até que a migração seja aplicada ao backend correto, essas ações não funcionarão no ambiente que ainda não possui as tabelas e funções. Isso é intencional: não há fallback para escrita direta insegura.
