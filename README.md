# Doce Gestão

Sistema web de gestão para confeitarias: pedidos, produção, receitas e custos, estoque e compras, financeiro, clientes, catálogo online com Pix e notificações. Em português do Brasil, pensado para uso no celular.

O repositório contém dois aplicativos:

| Aplicativo | Onde fica | O que é |
|---|---|---|
| Sistema da confeitaria | raiz (`src/`) | App usado pelas confeitarias e pelo catálogo público dos clientes |
| Painel de administração da plataforma | `admin/` | Site separado (Vite estático, publicado no GitHub Pages) para quem vende o sistema: empresas, planos, assinaturas e erros |

Endereço atual em produção: https://minhaconfeitaria.lovable.app (domínio próprio ainda não configurado; ver `docs/checklist-lancamento-comercial.md`).

## Tecnologias

- TanStack Start + TanStack Router e Query, React 19, TypeScript, Tailwind CSS 4, componentes shadcn/ui.
- Banco e autenticação: Supabase (PostgreSQL com RLS), hospedado no Lovable Cloud.
- Migrações SQL em `drizzle/migrations/` (arquivos numerados, ver `docs/operacao/migracoes.md`).
- Testes: Vitest (`src/**/*.test.ts`) e testes de fumaça em SQL (`tests/db/`).
- Gerenciador de pacotes: Bun (`bun.lock`).
- O projeto é sincronizado com o Lovable: o que entra em `main` aparece no editor deles.

## Como rodar localmente

Requisitos: [Bun](https://bun.sh) e um projeto Supabase de **desenvolvimento** (nunca use o de produção).

```sh
bun install
cp .env.example .env     # preencha com os dados do projeto de desenvolvimento
bun run dev
```

## Comandos

| Comando | Para quê |
|---|---|
| `bun run dev` | Servidor de desenvolvimento |
| `bun run build` | Build de produção do sistema |
| `bunx vite build --config admin/vite.config.ts` | Build do painel de administração |
| `bun run test` | Testes unitários (Vitest) |
| `bun run lint` | Lint (ESLint) |
| `bunx tsc --noEmit` | Checagem de tipos |
| `bun run format` | Formata o código (Prettier) |

O CI (`.github/workflows/quality.yml`) roda lint, tipos, testes, build dos dois aplicativos e, em um PostgreSQL descartável, aplica todas as migrações e executa os testes de `tests/db/`. Um PR só é mesclado automaticamente depois que todos os checks passam.

## Estrutura

```
src/routes/            Telas e rotas (privadas em _authenticated/, catálogo público em $slug, c.$slug, p.$codigo)
src/components/        Componentes (app/ = do sistema, ui/ = base shadcn)
src/lib/               Regras de negócio puras e testadas (custos, financeiro, gestão, catálogo, planos…)
src/integrations/      Cliente Supabase e middlewares de autenticação
admin/                 Painel de administração da plataforma
drizzle/migrations/    Migrações do banco (fonte usada pelo CI)
supabase/migrations/   Migrações antigas aplicadas por outro caminho (histórico)
tests/db/              Testes de fumaça em SQL (isolamento, catálogo, financeiro, estoque…)
docs/                  Documentação (índice abaixo)
```

## Documentação

- `docs/arquitetura.md` — visão geral, modelo multiempresa, segurança e decisões importantes.
- `docs/operacao/` — procedimentos: backup e restauração, migrações, resposta a incidentes.
- `docs/checklist-lancamento-comercial.md` — o que falta para vender, com responsável e situação.
- `docs/avaliacao-comercial-e-piloto.md` — avaliação de prontidão e critérios do piloto.
- `docs/auditoria-e-plano-de-melhorias.md` — auditoria técnica (etapas A–H).
- `docs/formulas-financeiras.md` — fórmulas de contas a pagar.
- `docs/deploy/` — guias de implantação de migrações específicas.
- `AGENTS.md` — regras de desenvolvimento do projeto (também seguidas por ferramentas de IA).
- `SECURITY.md` — como reportar vulnerabilidades.
- `CHANGELOG.md` — histórico de mudanças.

## Regras que não podem ser quebradas

As principais estão em `AGENTS.md`. Em resumo: toda tabela tem RLS por confeitaria; o visitante anônimo nunca lê tabelas (só funções específicas do catálogo); preços e custos do catálogo são calculados no servidor; recebimentos só mudam por funções próprias; custos gravados em pedidos antigos nunca são recalculados. Os testes de `tests/db/` garantem essas regras e devem continuar passando.

## Contribuindo

1. Crie um branch a partir de `main` (não reescreva histórico já publicado: o repositório é sincronizado com o Lovable).
2. Faça a mudança com testes. Mudança de banco = nova migração numerada + teste em `tests/db/` quando tocar em regra de dados.
3. Abra um PR. O CI precisa passar. Não coloque segredos no repositório.
