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

- Expose read-only MCP tools through the SDK TanStack plugin with OAuth caller tokens and a shared RLS client; agents must never bypass owner isolation.
- Preserve canonical same-origin OAuth consent return paths through login and signup so external authorization can complete safely.

- Interpret order messages through an authenticated server function with strict structured output and server-scoped product matching; apply only after review and save through the existing transactional order RPC.
