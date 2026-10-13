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
- Enforce singleton ownership and relationship ownership in the database; frontend checks are not security boundaries.
- Never leave routes, queries or links pointing at database tables that do not exist yet; an unfinished feature stays out of the app until its migration lands, because half-applied screens break the build and crash at runtime.

- Expose read-only MCP tools through the SDK TanStack plugin with OAuth caller tokens and a shared RLS client; agents must never bypass owner isolation.
- Preserve canonical same-origin OAuth consent return paths through login and signup so external authorization can complete safely.

- Interpret order messages through an authenticated server function with strict structured output and server-scoped product matching; apply only after review and save through the existing transactional order RPC.
