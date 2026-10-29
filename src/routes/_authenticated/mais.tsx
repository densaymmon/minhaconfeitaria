import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { meuPapelQ } from '@/lib/queries';
import { NOME_PAPEL } from '@/lib/assinatura';
import { desativarPush } from '@/lib/push-cliente';
import { LogOut, ChevronRight, CakeSlice } from 'lucide-react';
import { gruposDoMenu } from '@/lib/navegacao';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/ui';
export const Route = createFileRoute('/_authenticated/mais')({
 head: () => ({meta:[{title:'Mais — Doce Gestão'},{name:'description',content:'Receitas, relatórios, despesas e configurações.'},{property:'og:title',content:'Mais — Doce Gestão'},{property:'og:description',content:'Receitas, relatórios, despesas e configurações.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
 component: Mais,
});
function Mais(){
 const qc=useQueryClient(); const navigate=useNavigate(); const {user}=Route.useRouteContext();
 const {data:meuPapel}=useQuery(meuPapelQ); const papel=meuPapel?.papel??'dono';
 async function sair(){await desativarPush().catch(()=>undefined);await qc.cancelQueries();qc.clear();await supabase.auth.signOut();await navigate({to:'/auth',replace:true});}
 return (
  <>
   <PageHeader title="Mais" />
   <div className="mb-6 flex items-center gap-3 border-b pb-5">
    <CakeSlice className="size-8 text-primary" />
    <div className="min-w-0">
     <h2 className="text-xl">Doce Gestão</h2>
     <p className="break-all text-sm text-muted-foreground">{user.email}</p>
     {papel !== 'dono' && <p className="text-xs text-muted-foreground">{NOME_PAPEL[papel]} na equipe{meuPapel?.confeitaria ? ` de ${meuPapel.confeitaria}` : ''}</p>}
    </div>
   </div>
   {gruposDoMenu(papel).map((grupo) => (
    <section key={grupo.id} className="mt-6 first:mt-0">
     <h2 className="mb-1 text-sm font-semibold text-muted-foreground">{grupo.titulo}</h2>
     <div className="divide-y">
      {grupo.links.map(({ to, label, icon: Icon }) => (
       <Link key={to} to={to} className="flex items-center gap-3 py-4 font-medium">
        <Icon className="size-5 text-primary" />
        <span className="flex-1">{label}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
       </Link>
      ))}
      {grupo.compras.map(({ secao, label, icon: Icon, description }) => (
       <Link key={secao} to="/compras" search={{ secao }} className="flex items-center gap-3 py-4">
        <Icon className="size-5 text-primary" />
        <span className="flex-1">
         <span className="block font-medium">{label}</span>
         <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
       </Link>
      ))}
     </div>
    </section>
   ))}
   <Button variant="outline" onClick={sair} className="mt-8 w-full h-11"><LogOut className="size-4" />Sair da conta</Button>
  </>
 );
}
