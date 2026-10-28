import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { configQ, confeitariaQ } from '@/lib/queries';
import { parseNum } from '@/lib/format';
import { NativeSelect } from '@/components/app/ui';
import { ROTULO_CHAVE, normalizarChavePix, pixCopiaECola, tipoChaveValido, type TipoChavePix } from '@/lib/pix';
import { ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader,Field,Card } from '@/components/app/ui';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CartaoMeuPlano } from '@/components/app/plano';
export const Route=createFileRoute('/_authenticated/configuracoes')({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.configQ),context.queryClient.ensureQueryData(appQueries.confeitariaQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,
head:()=>({meta:[{title:'Configurações — Doce Gestão'},{name:'description',content:'Dados da confeitaria, chave Pix, taxas de pagamento e impostos.'},{property:'og:title',content:'Configurações — Doce Gestão'},{property:'og:description',content:'Dados da confeitaria, chave Pix, taxas de pagamento e impostos.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),component:ConfigPage});
function ConfigPage(){
 const {data}=useSuspenseQuery(configQ);const {data:confeitaria}=useSuspenseQuery(confeitariaQ);const {user}=Route.useRouteContext();const qc=useQueryClient();
 const [f,setF]=useState(()=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,String(v)])));const [pixChave,setPixChave]=useState(data.pix_chave??'');const [busy,setBusy]=useState(false);
 const [loja,setLoja]=useState(()=>({nome:confeitaria?.nome??'',slogan:confeitaria?.slogan??'',whatsapp:confeitaria?.whatsapp??'',cidade:confeitaria?.cidade??''}));
 const [pixTipo,setPixTipo]=useState<TipoChavePix|''>(()=>tipoChaveValido(data.pix_tipo)??'');
 const chaveDetectada=normalizarChavePix(pixChave,tipoChaveValido(pixTipo));
 const temCidade=Boolean(confeitaria&&'cidade' in confeitaria);
 // Campos do catálogo existem a partir da migração 0034; antes dela a seção fica oculta.
 const temCatalogo=Boolean(confeitaria&&'catalogo_ativo' in confeitaria);
 const campos=[['taxa_pix','Pix (%)'],['taxa_dinheiro','Dinheiro (%)'],['taxa_debito','Débito (%)'],['taxa_credito','Crédito (%)'],['taxa_outros','Outros (%)'],['imposto_pct','Impostos sobre vendas (%)']] as const;
 async function salvar(e:React.FormEvent){
  e.preventDefault();
  const values=Object.fromEntries(campos.map(([k])=>[k,parseNum(f[k]??'0')]));
  if(Object.values(values).some(v=>v<0||v>100)){toast.error('Informe taxas entre 0 e 100%.');return;}
  if(confeitaria&&!loja.nome.trim()){toast.error('Informe o nome da confeitaria.');return;}
   if(pixChave.trim()&&!chaveDetectada)toast.warning('Não reconhecemos o formato da chave Pix: ela será salva, mas o Pix copia e cola com valor não será gerado. Confira a chave ou escolha o tipo.');
  setBusy(true);
  const {error}=await supabase.from('configuracoes').upsert({user_id:user.id,...values,pix_chave:pixChave.trim(),...('pix_tipo' in data?{pix_tipo:pixTipo||null}:{})});
  if(error){setBusy(false);toast.error(error.message);return;}
  if(confeitaria){
   const dadosLoja={user_id:user.id,nome:loja.nome.trim().slice(0,80),slogan:loja.slogan.trim().slice(0,120)||null,whatsapp:loja.whatsapp.trim().slice(0,30)||null,...(temCidade?{cidade:loja.cidade.trim().slice(0,60)||null}:{})};
   const {error:erroLoja}=await supabase.from('confeitarias').upsert(dadosLoja,{onConflict:'user_id'});
   if(erroLoja){setBusy(false);toast.error(`Não foi possível salvar os dados da confeitaria: ${erroLoja.message}`);return;}
  }
  setBusy(false);
  await Promise.all([qc.invalidateQueries({queryKey:['config']}),qc.invalidateQueries({queryKey:['confeitaria']})]);
  toast.success('Configurações salvas!');
 }
 return <><PageHeader title="Configurações" back="/mais"/><form onSubmit={salvar} className="space-y-5">
  <CartaoMeuPlano/>
  <Card className="space-y-4">
   <h2 className="text-lg font-semibold">Dados da confeitaria</h2>
   {confeitaria?<>
    <Field label="Nome da confeitaria *" hint="Aparece no menu, nos recibos e nas mensagens enviadas aos clientes."><Input required maxLength={80} value={loja.nome} onChange={e=>setLoja({...loja,nome:e.target.value})} className="h-11 bg-card"/></Field>
    <Field label="Slogan (opcional)"><Input maxLength={120} value={loja.slogan} onChange={e=>setLoja({...loja,slogan:e.target.value})} placeholder="Ex.: Feito com carinho" className="h-11 bg-card"/></Field>
    {temCidade&&<Field label="Cidade" hint="Aparece no código Pix copia e cola enviado ao cliente."><Input maxLength={60} value={loja.cidade} onChange={e=>setLoja({...loja,cidade:e.target.value})} placeholder="Ex.: Hortolândia" className="h-11 bg-card"/></Field>}
    <Field label="WhatsApp da confeitaria (opcional)"><Input type="tel" inputMode="tel" maxLength={30} value={loja.whatsapp} onChange={e=>setLoja({...loja,whatsapp:e.target.value})} placeholder="(19) 99999-9999" className="h-11 bg-card"/></Field>
   </>:<p className="text-sm text-muted-foreground">Os dados da confeitaria ficam disponíveis assim que a atualização do banco de dados for aplicada.</p>}
  </Card>
  {temCatalogo&&<Link to="/catalogo" className="block"><Card className="flex items-center justify-between gap-3 transition-colors hover:bg-muted/40"><span><span className="block text-lg font-semibold">Catálogo online</span><span className="block text-xs text-muted-foreground">Link, QR Code, entrega, pedido mínimo e aviso agora ficam no menu Mais → Catálogo online.</span></span><ChevronRight className="size-5 shrink-0 text-muted-foreground"/></Card></Link>}
  <Card className="space-y-3">
   <h2 className="text-lg font-semibold">Pagamento por Pix</h2>
   <Field label="Chave Pix" hint="Incluída nos recibos, nas cobranças e no Pix copia e cola com o valor de cada pedido."><Input value={pixChave} maxLength={120} onChange={e=>setPixChave(e.target.value)} placeholder="CPF/CNPJ, e-mail, celular ou chave aleatória" className="h-11 bg-card"/></Field>
   {'pix_tipo' in data&&<Field label="Tipo da chave" hint={pixChave.trim()?(chaveDetectada?`Será usada como ${ROTULO_CHAVE[chaveDetectada.tipo]}: ${chaveDetectada.valor}`:'Chave inválida para este tipo.'):undefined}>
    <NativeSelect value={pixTipo} onChange={e=>setPixTipo(tipoChaveValido(e.target.value)??'')}>
     <option value="">Detectar automaticamente</option>
     {(Object.keys(ROTULO_CHAVE) as TipoChavePix[]).map(t=><option key={t} value={t}>{ROTULO_CHAVE[t][0]?.toUpperCase()}{ROTULO_CHAVE[t].slice(1)}</option>)}
    </NativeSelect>
   </Field>}
   {chaveDetectada&&<details className="rounded-xl bg-muted/60 p-3 text-xs"><summary className="cursor-pointer font-medium">Ver exemplo de Pix copia e cola (R$ 10,00)</summary><code className="mt-2 block break-all">{pixCopiaECola({chave:pixChave,tipoChave:tipoChaveValido(pixTipo),nome:loja.nome||'Confeitaria',cidade:loja.cidade,valor:10,identificador:'TESTE'})}</code><p className="mt-2 text-muted-foreground">Para conferir, cole este código no app do seu banco (área Pix → copia e cola): deve aparecer o seu nome e R$ 10,00. Não precisa concluir o pagamento.</p></details>}
  </Card>
  <Card className="space-y-3">
   <h2 className="text-lg font-semibold">Taxas e impostos</h2>
   <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{campos.map(([k,label])=><Field key={k} label={label}><Input inputMode="decimal" value={f[k]??'0'} onChange={e=>setF({...f,[k]:e.target.value})} className="h-11 bg-card"/></Field>)}</div>
  </Card>
  <Button className="h-12 w-full" disabled={busy}>{busy?'Salvando...':'Salvar configurações'}</Button>
 </form></>;
}
