# Arquitetura do Doce Gestão

Este documento resume como o sistema é organizado e por que algumas decisões foram tomadas. As regras detalhadas de desenvolvimento estão em `AGENTS.md`; aqui está o panorama.

## Visão geral

```
Navegador (confeitaria / equipe)        Navegador (cliente do catálogo)        Navegador (administrador da plataforma)
        │                                          │                                          │
  Sistema (TanStack Start)                Catálogo público (/$slug, /p/$codigo)      admin/ (site estático, GitHub Pages)
        │  sessão do usuário                       │  sem login                               │  sessão própria
        ▼                                          ▼                                          ▼
                    Supabase: PostgreSQL + Auth + Storage (RLS em todas as tabelas)
                              ▲
              Funções de servidor (IA, notificações push, tarefas agendadas)
```

- **Sistema da confeitaria** (`src/`): telas privadas ficam em `src/routes/_authenticated/`. As leituras passam pelo banco com a sessão do usuário, então a RLS decide o que cada pessoa vê.
- **Catálogo público**: visitantes anônimos não leem tabelas. Chamam somente funções específicas (`catalogo_publico`, `criar_pedido_catalogo`, `acompanhar_pedido_catalogo`, `informar_pagamento_catalogo` e afins), que rodam com privilégio controlado e devolvem apenas o necessário.
- **Painel de administração** (`admin/`): aplicativo separado, com login de administrador próprio. Toda função administrativa confere se o usuário é administrador (`_eh_admin()`). Administração nunca deve voltar para dentro do app das confeitarias.
- **Funções de servidor**: leitura de documentos e rascunho de pedido por IA (conferem plano e assinatura no servidor), envio de notificações push e tarefas agendadas, autenticadas por segredo (`LOVABLE_CRON_SECRET`).

## Modelo multiempresa

- Cada confeitaria é identificada pelo id da conta da dona (`user_id` é o "tenant").
- Membros da equipe (papéis `gerente` e `producao`) trabalham dentro da confeitaria da dona. Por isso o código de banco usa `public._tenant()` e não `auth.uid()`.
- O papel `producao` não vê dinheiro, compras, catálogo nem configurações (bloqueado no banco por políticas RESTRICTIVE e na navegação).
- A confeitaria só usa o sistema se estiver com acesso liberado e assinatura em dia (`_acesso_liberado()`, política RESTRICTIVE em toda tabela com `user_id`).
- Novos cadastros seguem `plataforma_config.cadastro_aberto` (fechado por padrão) e aprovação manual.

## Planos e assinaturas

Planos definem preço, limites e recursos (custos, estoque, financeiro, recorrentes, catálogo, IA). A situação efetiva da assinatura (teste, ativa, cortesia, cancelada, atrasada, suspensa) é calculada no banco. Limites de produtos e de pedidos por mês são aplicados por gatilhos (erros com prefixo `PLANO:`), e recursos pagos são conferidos também no servidor, não só escondidos na tela.

## Dados financeiros e de custos

- Custos de ingredientes usam preço e quantidade da embalagem com unidades explícitas (`src/lib/ingredient-cost.ts`).
- O custo de cada item de pedido é **gravado** no momento da venda e nunca recalculado com preços atuais.
- Pedido e receita são salvos por funções transacionais (`salvar_pedido`, `salvar_produto`), nunca apagando itens antigos em falha parcial.
- Recebimentos só mudam por `registrar_recebimento_pedido` e `editar_recebimento_pedido`; salvar o pedido preserva o que já foi recebido.
- Receita só pode ser alterada quando não há pedido em aberto com produção iniciada para o produto (gatilho no banco). Para variações, crie um novo produto: duplicar um produto cria uma cópia independente.
- Fórmulas de contas a pagar: `docs/formulas-financeiras.md`.

## Observabilidade

- Erros de tela são enviados por `registrar_erro` (deduplicados por hora, limite de 200 novos registros por hora, guardados 30 dias) e lidos só pelo painel de administração.
- Há histórico de quem alterou pedidos, pagamentos e preços (`historico`, escrito apenas por gatilhos).
- Ainda **não há** monitoramento de disponibilidade externo nem alerta automático de falha (ver checklist).

## Testes

- `src/lib/*.test.ts`: regras puras (Vitest).
- `tests/db/*-smoke.sql`: regras no banco, executadas no CI em um PostgreSQL descartável depois de aplicar todas as migrações. Cobrem isolamento entre confeitarias, acesso anônimo, catálogo, financeiro, estoque, equipe, planos e histórico.
- Não há ainda testes automáticos de interface (telas em navegador). É uma lacuna conhecida.

## Implantação

O sistema roda no Lovable Cloud e é sincronizado com este repositório (`main`). O painel de administração é publicado no GitHub Pages por `.github/workflows/admin-pages.yml`. Migrações de banco são aplicadas manualmente, uma de cada vez: ver `docs/operacao/migracoes.md`.
