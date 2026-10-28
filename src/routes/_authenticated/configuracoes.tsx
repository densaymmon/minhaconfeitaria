import * as appQueries from "@/lib/queries";
import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { configQ, confeitariaQ } from '@/lib/queries';
import { brl, parseNum } from '@/lib/format';
import { SLUGS_RESERVADOS, linkCatalogo as montarLinkCatalogo, slugValido, sugerirSlug } from '@/lib/catalogo';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, QrCode, Share2 } from 'lucide-react';
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
 // Campos do catálogo existem a partir da migração 0034; antes dela a seção fica oculta.
 const temCatalogo=Boolean(confeitaria&&'catalogo_ativo' in confeitaria);
 const [cat,setCat]=useState(()=>({
  ativo:confeitaria?.catalogo_ativo??false,
  slug:confeitaria?.slug??sugerirSlug(confeitaria?.nome??'').replace(/-/g,'').slice(0,30),
  aviso:confeitaria?.catalogo_aviso??'',
  retirada:confeitaria?.aceita_retirada??true,
  entrega:confeitaria?.aceita_entrega??false,
  taxa:String(confeitaria?.taxa_entrega??0),
  minimo:String(confeitaria?.pedido_minimo??0),
  enderecoRetirada:confeitaria?.endereco_retirada??'',
  limite:confeitaria?.limite_pedidos_dia==null?'':String(confeitaria.limite_pedidos_dia),
 }));
 const linkCatalogo=typeof window!=='undefined'&&slugValido(cat.slug)?montarLinkCatalogo(window.location.origin,cat.slug):'';
 const [mostrarQr,setMostrarQr]=useState(false);
 const slugReservado=SLUGS_RESERVADOS.includes(cat.slug);
 const campos=[['taxa_pix','Pix (%)'],['taxa_dinheiro','Dinheiro (%)'],['taxa_debito','Débito (%)'],['taxa_credito','Crédito (%)'],['taxa_outros','Outros (%)'],['imposto_pct','Impostos sobre vendas (%)']] as const;
 async function salvar(e:React.FormEvent){
  e.preventDefault();
  const values=Object.fromEntries(campos.map(([k])=>[k,parseNum(f[k]??'0')]));
  if(Object.values(values).some(v=>v<0||v>100)){toast.error('Informe taxas entre 0 e 100%.');return;}
  if(confeitaria&&!loja.nome.trim()){toast.error('Informe o nome da confeitaria.');return;}
  const taxa=parseNum(cat.taxa),minimo=parseNum(cat.minimo),limite=cat.limite.trim()?Math.round(parseNum(cat.limite)):null;
  if(temCatalogo){
   if(cat.slug&&!slugValido(cat.slug)){toast.error(slugReservado?'Este endereço é usado por uma página do sistema. Escolha outro.':'O endereço do catálogo deve ter de 3 a 60 letras minúsculas, números ou hífens.');return;}
   if(cat.ativo&&!cat.slug){toast.error('Defina o endereço do catálogo antes de ativá-lo.');return;}
   if(cat.ativo&&!cat.retirada&&!cat.entrega){toast.error('Ative retirada, entrega ou as duas.');return;}
   if(taxa<0||taxa>1000||minimo<0||minimo>100000){toast.error('Confira a taxa de entrega e o pedido mínimo.');return;}
   if(limite!==null&&(limite<1||limite>500)){toast.error('O limite de pedidos por dia deve ser de 1 a 500, ou ficar em branco.');return;}
  }
  setBusy(true);
  const {error}=await supabase.from('configuracoes').upsert({user_id:user.id,...values,pix_chave:pixChave.trim()});
  if(error){setBusy(false);toast.error(error.message);return;}
  if(confeitaria){
   const dadosLoja={user_id:user.id,nome:loja.nome.trim().slice(0,80),slogan:loja.slogan.trim().slice(0,120)||null,whatsapp:loja.whatsapp.trim().slice(0,30)||null};
   const dadosCatalogo=temCatalogo?{slug:cat.slug||null,catalogo_ativo:cat.ativo,catalogo_aviso:cat.aviso.trim().slice(0,300)||null,aceita_retirada:cat.retirada,aceita_entrega:cat.entrega,taxa_entrega:taxa,pedido_minimo:minimo,endereco_retirada:cat.enderecoRetirada.trim().slice(0,300)||null,limite_pedidos_dia:limite}:{};
   const {error:erroLoja}=await supabase.from('confeitarias').upsert({...dadosLoja,...dadosCatalogo},{onConflict:'user_id'});
   if(erroLoja){setBusy(false);toast.error(erroLoja.code==='23505'?'Este endereço de catálogo já está em uso. Escolha outro.':`Não foi possível salvar os dados da confeitaria: ${erroLoja.message}`);return;}
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
  {temCatalogo&&<Card className="space-y-4">
   <div className="flex items-center justify-between gap-3">
    <div><h2 className="text-lg font-semibold">Catálogo online</h2><p className="text-xs text-muted-foreground">Página onde o cliente vê os produtos e faz o pedido.</p></div>
    <Switch checked={cat.ativo} onCheckedChange={v=>setCat({...cat,ativo:v})} aria-label="Ativar catálogo online"/>
   </div>
   <Field label="Endereço do catálogo" hint={slugReservado?'Este nome é usado por uma página do sistema. Escolha outro.':'Curto e fácil de digitar, ex.: casaldobolo. Só letras minúsculas, números e hífens.'}>
    <div className="flex items-center rounded-md border bg-card pl-3 text-sm text-muted-foreground"><span className="shrink-0">/</span><Input value={cat.slug} maxLength={60} onChange={e=>setCat({...cat,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')})} className="h-11 border-0 bg-transparent pl-1 shadow-none focus-visible:ring-0"/></div>
   </Field>
   {linkCatalogo&&<div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm"><span className="min-w-0 flex-1 break-all">{linkCatalogo}</span>
    <Button type="button" size="sm" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(linkCatalogo);toast.success('Link copiado.');}catch{toast.error('Não foi possível copiar.');}}}><Copy className="size-4"/>Copiar</Button>
    {typeof navigator!=='undefined'&&'share' in navigator&&<Button type="button" size="sm" variant="outline" onClick={()=>{void navigator.share({title:loja.nome||'Catálogo',text:`Faça seu pedido na ${loja.nome||'nossa confeitaria'}:`,url:linkCatalogo}).catch(()=>undefined);}}><Share2 className="size-4"/>Compartilhar</Button>}
    <Button type="button" size="sm" variant="outline" onClick={()=>setMostrarQr(v=>!v)} aria-expanded={mostrarQr}><QrCode className="size-4"/>QR Code</Button>
    {confeitaria?.catalogo_ativo&&confeitaria.slug===cat.slug&&<Button type="button" size="sm" variant="ghost" asChild><a href={linkCatalogo} target="_blank" rel="noreferrer"><ExternalLink className="size-4"/>Abrir</a></Button>}
    {mostrarQr&&<div className="w-full pt-2 text-center"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=12&data=${encodeURIComponent(linkCatalogo)}`} alt={`QR Code do catálogo: ${linkCatalogo}`} width={240} height={240} className="mx-auto rounded-lg bg-white"/><p className="mt-2 text-xs text-muted-foreground">Imprima ou poste o QR Code: ao apontar a câmera, o cliente abre o catálogo. Para salvar, toque e segure a imagem.</p></div>}
   </div>}
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Retirada na confeitaria<Switch checked={cat.retirada} onCheckedChange={v=>setCat({...cat,retirada:v})}/></label>
    <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Entrega<Switch checked={cat.entrega} onCheckedChange={v=>setCat({...cat,entrega:v})}/></label>
   </div>
   {cat.retirada&&<Field label="Endereço de retirada (opcional)"><Input maxLength={300} value={cat.enderecoRetirada} onChange={e=>setCat({...cat,enderecoRetirada:e.target.value})} className="h-11 bg-card"/></Field>}
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {cat.entrega&&<Field label="Taxa de entrega (R$)"><Input inputMode="decimal" value={cat.taxa} onChange={e=>setCat({...cat,taxa:e.target.value})} className="h-11 bg-card"/></Field>}
    <Field label="Pedido mínimo (R$)" hint={parseNum(cat.minimo)>0?`Abaixo de ${brl(parseNum(cat.minimo))} o pedido não é enviado.`:'0 = sem mínimo.'}><Input inputMode="decimal" value={cat.minimo} onChange={e=>setCat({...cat,minimo:e.target.value})} className="h-11 bg-card"/></Field>
    <Field label="Limite de pedidos por dia" hint="Em branco = sem limite."><Input inputMode="numeric" value={cat.limite} onChange={e=>setCat({...cat,limite:e.target.value})} className="h-11 bg-card"/></Field>
   </div>
   <Field label="Aviso no topo do catálogo (opcional)"><Textarea rows={2} maxLength={300} value={cat.aviso} onChange={e=>setCat({...cat,aviso:e.target.value})} placeholder="Ex.: Encomendas até quinta para entrega no fim de semana."/></Field>
   <p className="text-xs text-muted-foreground">Escolha os produtos que aparecem no catálogo em Produtos → produto → Catálogo online. O cliente paga pela chave Pix abaixo.</p>
   <Button type="button" variant="outline" className="h-10 w-full sm:w-auto" onClick={async()=>{if(typeof Notification==='undefined'){toast.error('Este navegador não aceita notificações.');return;}const r=await Notification.requestPermission();toast[r==='granted'?'success':'error'](r==='granted'?'Notificações ativadas neste aparelho enquanto o sistema estiver aberto.':'Notificações não permitidas neste aparelho.');}}>Avisar pedidos novos com notificação neste aparelho</Button>
  </Card>}
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
