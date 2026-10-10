import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { configQ } from '@/lib/queries';
import { parseNum } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader,Field } from '@/components/app/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export const Route=createFileRoute('/_authenticated/configuracoes')({head:()=>({meta:[{title:'Taxas — Doce Gestão'},{name:'description',content:'Taxas de pagamento e impostos da confeitaria.'},{property:'og:title',content:'Taxas — Doce Gestão'},{property:'og:description',content:'Taxas de pagamento e impostos da confeitaria.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:ConfigPage});
function ConfigPage(){
 const {data}=useSuspenseQuery(configQ);const {user}=Route.useRouteContext();const qc=useQueryClient();
 const [f,setF]=useState(()=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])));const [busy,setBusy]=useState(false);
 const campos=[['taxa_pix','Pix (%)'],['taxa_dinheiro','Dinheiro (%)'],['taxa_debito','Débito (%)'],['taxa_credito','Crédito (%)'],['taxa_outros','Outros (%)'],['imposto_pct','Impostos sobre vendas (%)']] as const;
 async function salvar(e:React.FormEvent){e.preventDefault();const values=Object.fromEntries(campos.map(([k])=>[k,parseNum(f[k]??'0')]));if(Object.values(values).some(v=>v<0||v>100)){toast.error('Informe taxas entre 0 e 100%.');return;}setBusy(true);const {error}=await supabase.from('configuracoes').upsert({user_id:user.id,...values});setBusy(false);if(error){toast.error(error.message);return;}await qc.invalidateQueries({queryKey:['config']});toast.success('Taxas salvas!');}
 return <><PageHeader title="Taxas e impostos" back="/mais"/><form onSubmit={salvar} className="space-y-5"><div className="grid grid-cols-2 gap-4">{campos.map(([k,label])=><Field key={k} label={label}><Input inputMode="decimal" value={f[k]??'0'} onChange={e=>setF({...f,[k]:e.target.value})} className="h-11 bg-card"/></Field>)}</div><Button className="h-12 w-full" disabled={busy}>Salvar taxas</Button></form></>;
}
