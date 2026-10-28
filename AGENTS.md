<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Ingredient costs use precise package price/quantity and explicit recipe units through the shared pure conversion module; legacy numeric projections remain for compatibility, and database triggers validate dimensions and flag affected recipes without touching order snapshots.
- Keep private pages under the authenticated layout and prefill TanStack Query caches in loaders; private reads remain scoped by database RLS.
- Save orders and recipe ingredients through transactional, invoker-security database RPCs; partial saves must never delete previous items.
- Preserve order item cost snapshots when ingredient prices change; historical profitability must not change with current supplier prices.
- Multi-bakery model: each owner account is one bakery (tenant = `user_id`). Every table keeps owner RLS (`auth.uid() = user_id`) and every SECURITY DEFINER RPC must filter every row it reads or writes by `auth.uid()`; `tests/db/multiempresa-isolation-smoke.sql` must keep passing. Bakery profile lives in `public.confeitarias` (one row per owner, created by the `trg_criar_confeitaria` trigger). New signups are gated by `public.plataforma_config.cadastro_aberto` (closed by default; only admins change it). Enforce relationship ownership in the database; frontend checks are not security boundaries.
- Never hardcode a bakery's name, slogan or Pix key in the code; read them from `confeitarias`/`configuracoes`.
- Public catalog (`/c/$slug`, `/pedido/$codigo`): anonymous visitors never read tables. They only call `catalogo_publico`, `criar_pedido_catalogo`, `acompanhar_pedido_catalogo` and `informar_pagamento_catalogo` (SECURITY DEFINER). Prices, delivery fee and item cost snapshots are computed on the server; never trust values sent by the browser, never return cost, recipe, margin or other customers' data. `tests/db/catalogo-smoke.sql` must keep passing.
- Short public links: catalog at `/$slug` (also `/c/$slug`) and order tracking at `/p/$codigo` (10-char `pedidos.codigo_curto`; `/pedido/<uuid>` keeps working). Any new top-level page path must be added to both `public._slug_reservado()` and `SLUGS_RESERVADOS` in `src/lib/catalogo.ts`.
- Product variations live in `produtos.opcoes` (validated by `_opcoes_validas`); catalog orders send `opcoes` per item and `_aplicar_opcoes` computes price, cost and description on the server. Never expose option `custo` publicly.
- Platform access: `confeitarias.acesso` (`pendente`/`ativo`/`bloqueado`) is enforced in the database by the RESTRICTIVE policy `acesso_liberado` (`_acesso_liberado()`) on every table that has `user_id`. Any new tenant table must get that policy too; `tests/db/plataforma-smoke.sql` fails otherwise. Owners update `confeitarias` only through column grants: add new owner-editable columns to the `GRANT INSERT/UPDATE (...)` list; never grant `acesso` or `termos_*`. Platform admins are login-only accounts (no `confeitarias` row) whose e-mail is in `plataforma_admin_emails`; they use the separate admin site in `admin/` (static Vite app on GitHub Pages, own Supabase session) and every admin RPC checks `_eh_admin()`. Never put platform administration back inside the bakery app. New accounts follow `plataforma_config.cadastro_aberto`/`aprovacao_manual`. Bump `TERMOS_VERSAO` in `src/lib/termos.ts` when the terms change materially.
- Plans and subscriptions: `planos` (price, limits, `recursos` among custos/estoque/financeiro/recorrentes/catalogo/ia) and `assinaturas` (teste/ativa/cortesia/cancelada; effective status via `_situacao_assinatura` adds atrasada/suspensa after `plataforma_config.dias_tolerancia`). Suspended or cancelled subscriptions are blocked by `_acesso_liberado()`; the catalog requires `_catalogo_liberado()`; product and monthly order limits are enforced by triggers (`PLANO:` errors). In the app, gate pages with `recursoDaPagina` and sections with `useRecurso`/`RecursoBloqueado`. Subscription tables (`assinaturas`, `assinatura_pagamentos`, `plataforma_contas`) are readable by the owner but written only by admin RPCs.
- Performance: the QueryClient caches for 60s (`staleTime`) and the router preloads on intent with a pending skeleton; never put writes inside a `queryFn` (the daily "em produção" transition runs in `avancarPedidosDoDia`); the authenticated layout reads the session locally (`getSession`). For quick actions on orders use `otimista`/`alterarPedido`/`alterarItem` from `src/lib/cache-pedidos.ts` (update the cache, write, roll back on error) instead of awaiting a full refetch.
- Product photos/videos live in `produto_midias` (max 10, saved through `salvar_midias_produto`, first photo = `produtos.imagem_url` cover); files go to the `catalogo` bucket under `<user_id>/`.

- Expose read-only MCP tools through the SDK TanStack plugin with OAuth caller tokens and a shared RLS client; agents must never bypass owner isolation.
- Preserve canonical same-origin OAuth consent return paths through login and signup so external authorization can complete safely.

- Interpret order messages through an authenticated server function with strict structured output and server-scoped product matching; apply only after review and save through the existing transactional order RPC.
