import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChartNoAxesCombined, Receipt, Settings, LogOut, ChevronRight, CakeSlice } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/app/ui';
export const Route = createFileRoute('/_authenticated/mais')({
 head: () => ({meta:[{title:'Mais — Doce Gestão'},{name:'description',content:'Receitas, relatórios, despesas e configurações.'},{property:'og:title',content:'Mais — Doce Gestão'},{property:'og:description',content:'Receitas, relatórios, despesas e configurações.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
 component: Mais,
});
function Mais(){
 const qc=useQueryClient(); const navigate=useNavigate(); const {user}=Route.useRouteContext();
 const links=[{to:'/produtos',label:'Produtos e receitas',icon:BookOpen},{to:'/relatorios',label:'Relatórios financeiros',icon:ChartNoAxesCombined},{to:'/despesas',label:'Despesas',icon:Receipt},{to:'/configuracoes',label:'Taxas e configurações',icon:Settings}] as const;
 async function sair(){await qc.cancelQueries();qc.clear();await supabase.auth.signOut();await navigate({to:'/auth',replace:true});}
 return <><PageHeader title="Mais"/><div className="mb-6 flex items-center gap-3 border-b pb-5"><CakeSlice className="size-8 text-primary"/><div className="min-w-0"><h2 className="text-xl">Doce Gestão</h2><p className="break-all text-sm text-muted-foreground">{user.email}</p></div></div><div className="divide-y">{links.map(({to,label,icon:Icon})=><Link key={to} to={to} className="flex items-center gap-3 py-5 font-medium"><Icon className="size-5 text-primary"/><span className="flex-1">{label}</span><ChevronRight className="size-4 text-muted-foreground"/></Link>)}</div><Button variant="outline" onClick={sair} className="mt-8 w-full h-11"><LogOut className="size-4"/>Sair da conta</Button></>;
}
