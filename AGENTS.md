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
- Keep private pages under the authenticated layout and prefill TanStack Query caches in loaders; private reads remain scoped by database RLS.
- Save orders and recipe ingredients through transactional, invoker-security database RPCs; partial saves must never delete previous items.
- Preserve order item cost snapshots when ingredient prices change; historical profitability must not change with current supplier prices.
- Enforce singleton ownership and relationship ownership in the database; frontend checks are not security boundaries.
