import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/.lovable/oauth/consent')({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s['authorization_id'] === 'string' ? s['authorization_id'] : '' }),
  head: () => ({ meta: [
    { title: 'Autorizar agente — Confeitaria Maestro' },
    { name: 'description', content: 'Autorize ou recuse o acesso de um agente aos dados da sua confeitaria.' },
    { property: 'og:title', content: 'Autorizar agente — Confeitaria Maestro' },
    { property: 'og:description', content: 'Acesso protegido de agentes aos dados da confeitaria.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error('Solicitação de autorização ausente. Inicie a conexão novamente.');
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error('Não foi possível verificar seu login. Tente novamente.');
    if (!data.session) throw redirect({ to: '/auth', search: { next: location.pathname + location.searchStr } });
  },
  loaderDeps: ({ search }) => ({ authorization_id: search.authorization_id }),
  loader: async ({ deps }) => {
    const id = deps.authorization_id;
    if (!id) throw new Error('Solicitação de autorização ausente.');
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) throw new Error('Esta solicitação expirou ou não é válida. Inicie a conexão novamente.');
    if ('redirect_url' in data) throw redirect({ href: data.redirect_url });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => <main className="mx-auto max-w-md px-5 py-16"><h1 className="text-xl font-semibold">Autorização indisponível</h1><p role="alert" className="mt-4 text-muted-foreground">{error instanceof Error ? error.message : "Não foi possível carregar a autorização."}</p></main>,
});
function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorization_id, { skipBrowserRedirect: true });
      if (result.error) throw new Error('Não foi possível registrar sua decisão. Tente novamente.');
      if (!result.data?.redirect_url) throw new Error('O agente não informou um endereço de retorno.');
      window.location.assign(result.data.redirect_url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a autorização.'); setBusy(false); }
  }
  return <main className="mx-auto max-w-md px-5 py-16">
    <ShieldCheck className="mb-5 size-10 text-primary" />
    <h1 className="text-2xl font-semibold">Autorizar {details.client.name || 'agente'}</h1>
    <p className="mt-4 text-muted-foreground">Este agente poderá consultar seus clientes, pedidos, receitas e despesas na Confeitaria Maestro. Não poderá alterar ou excluir registros.</p>
    <p className="mt-3 text-sm text-muted-foreground">Autorize somente agentes em que você confia.</p>
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    <div className="mt-8 flex flex-wrap gap-3"><Button disabled={busy} onClick={() => decide(true)}>Autorizar acesso</Button><Button variant="outline" disabled={busy} onClick={() => decide(false)}>Recusar</Button></div>
  </main>;
}
