import * as appQueries from "@/lib/queries";
import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { configQ, confeitariaQ } from '@/lib/queries';
import { parseNum } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader,Field,Card } from '@/components/app/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export const Route=createFileRoute('/_authenticated/configuracoes')({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.configQ),context.queryClient.ensureQueryData(appQueries.confeitariaQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,
head:()=>({meta:[{title:'Configurações — Doce Gestão'},{name:'description',content:'Dados da confeitaria, chave Pix, taxas de pagamento e impostos.'},{property:'og:title',content:'Configurações — Doce Gestão'},{property:'og:description',content:'Dados da confeitaria, chave Pix, taxas de pagamento e impostos.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:ConfigPage});
function ConfigPage(){
 const {data}=useSuspenseQuery(configQ);const {data:confeitaria}=useSuspenseQuery(confeitariaQ);const {user}=Route.useRouteContext();const qc=useQueryClient();
 const [f,setF]=useState(()=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])));const [pixChave,setPixChave]=useState(data.pix_chave??'');const [busy,setBusy]=useState(false);
 const [loja,setLoja]=useState(()=>({nome:confeitaria?.nome??'',slogan:confeitaria?.slogan??'',whatsapp:confeitaria?.whatsapp??''}));
 const campos=[['taxa_pix','Pix (%)'],['taxa_dinheiro','Dinheiro (%)'],['taxa_debito','Débito (%)'],['taxa_credito','Crédito (%)'],['taxa_outros','Outros (%)'],['imposto_pct','Impostos sobre vendas (%)']] as const;
 async function salvar(e:React.FormEvent){
  e.preventDefault();
  const values=Object.fromEntries(campos.map(([k])=>[k,parseNum(f[k]??'0')]));
  if(Object.values(values).some(v=>v<0||v>100)){toast.error('Informe taxas entre 0 e 100%.');return;}
  if(confeitaria&&!loja.nome.trim()){toast.error('Informe o nome da confeitaria.');return;}
  setBusy(true);
  const {error}=await supabase.from('configuracoes').upsert({user_id:user.id,...values,pix_chave:pixChave.trim()});
  if(error){setBusy(false);toast.error(error.message);return;}
  if(confeitaria){
   const {error:erroLoja}=await supabase.from('confeitarias').upsert({user_id:user.id,nome:loja.nome.trim().slice(0,80),slogan:loja.slogan.trim().slice(0,120)||null,whatsapp:loja.whatsapp.trim().slice(0,30)||null},{onConflict:'user_id'});
   if(erroLoja){setBusy(false);toast.error(`Não foi possível salvar os dados da confeitaria: ${erroLoja.message}`);return;}
  }
  setBusy(false);
  await Promise.all([qc.invalidateQueries({queryKey:['config']}),qc.invalidateQueries({queryKey:['confeitaria']})]);
  toast.success('Configurações salvas!');
 }
 return <><PageHeader title="Configurações" back="/mais"/><form onSubmit={salvar} className="space-y-5">
  <Card className="space-y-4">
   <h2 className="text-lg font-semibold">Dados da confeitaria</h2>
   {confeitaria?<>
    <Field label="Nome da confeitaria *" hint="Aparece no menu, nos recibos e nas mensagens enviadas aos clientes."><Input required maxLength={80} value={loja.nome} onChange={e=>setLoja({...loja,nome:e.target.value})} className="h-11 bg-card"/></Field>
    <Field label="Slogan (opcional)"><Input maxLength={120} value={loja.slogan} onChange={e=>setLoja({...loja,slogan:e.target.value})} placeholder="Ex.: Feito com carinho" className="h-11 bg-card"/></Field>
    <Field label="WhatsApp da confeitaria (opcional)"><Input type="tel" inputMode="tel" maxLength={30} value={loja.whatsapp} onChange={e=>setLoja({...loja,whatsapp:e.target.value})} placeholder="(19) 99999-9999" className="h-11 bg-card"/></Field>
   </>:<p className="text-sm text-muted-foreground">Os dados da confeitaria ficam disponíveis assim que a atualização do banco de dados for aplicada.</p>}
  </Card>
  <Card className="space-y-3">
   <h2 className="text-lg font-semibold">Pagamento por Pix</h2>
   <Field label="Chave Pix" hint="Incluída nos recibos e nas cobranças enviadas ao cliente. Confira se está correta antes de salvar."><Input value={pixChave} maxLength={120} onChange={e=>setPixChave(e.target.value)} placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória" className="h-11 bg-card"/></Field>
  </Card>
  <Card className="space-y-3">
   <h2 className="text-lg font-semibold">Taxas e impostos</h2>
   <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{campos.map(([k,label])=><Field key={k} label={label}><Input inputMode="decimal" value={f[k]??'0'} onChange={e=>setF({...f,[k]:e.target.value})} className="h-11 bg-card"/></Field>)}</div>
  </Card>
  <Button className="h-12 w-full" disabled={busy}>{busy?'Salvando...':'Salvar configurações'}</Button>
 </form></>;
}
