import * as appQueries from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarPlus, Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card } from "@/components/app/ui";
import { useCustos } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/pedidos-recorrentes")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.clientesQ),
      context.queryClient.ensureQueryData(appQueries.produtosQ),
      context.queryClient.ensureQueryData(appQueries.insumosQ),
    ]);
  },
  component: PedidosRecorrentes,
});

type Recorrencia = {
  id: string; cliente_id: string; frequencia: "semanal" | "quinzenal" | "mensal";
  data_inicio: string; data_fim: string | null; hora_entrega: string | null;
  observacoes: string | null; ativa: boolean;
};
type Ocorrencia = {
  id: string; recorrencia_id: string; data_entrega: string;
  status: "pendente" | "confirmada" | "cancelada"; itens: Item[];
  pedido_id: string | null; observacoes: string | null;
};
type Item = { produto_id: string | null; descricao: string; quantidade: number; preco_unitario: number; custo_unitario: number };

function proximaData(data: string, frequencia: Recorrencia["frequencia"]) {
  const d = new Date(data + "T12:00:00");
  if (frequencia === "semanal") d.setDate(d.getDate() + 7);
  else if (frequencia === "quinzenal") d.setDate(d.getDate() + 14);
  else {
    const dia = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimoDia));
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dataBR(value: string) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function PedidosRecorrentes() {
  const qc = useQueryClient();
  const { data: clientes } = useSuspenseQuery(appQueries.clientesQ);
  const { data: produtos } = useSuspenseQuery(appQueries.produtosQ);
  const { custo } = useCustos();
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [selecionada, setSelecionada] = useState("");
  const [form, setForm] = useState({ cliente_id: "", frequencia: "semanal" as Recorrencia["frequencia"], data_inicio: new Date().toLocaleDateString("en-CA"), data_fim: "", hora_entrega: "", observacoes: "" });
  const [itemRascunho, setItemRascunho] = useState({ produto_id: "", quantidade: "1", preco_unitario: "" });

  async function carregar() {
    setCarregando(true);
    const db = supabase as any;
    const [r, o] = await Promise.all([
      db.from("pedidos_recorrentes").select("*").order("data_inicio", { ascending: true }),
      db.from("pedidos_recorrentes_ocorrencias").select("*").order("data_entrega", { ascending: true }),
    ]);
    if (r.error || o.error) toast.error(r.error?.message ?? o.error?.message ?? "Não foi possível carregar recorrências.");
    else {
      setRecorrencias((r.data ?? []) as Recorrencia[]);
      setOcorrencias((o.data ?? []) as Ocorrencia[]);
      setSelecionada((atual) => atual || r.data?.[0]?.id || "");
    }
    setCarregando(false);
  }
  useEffect(() => { void carregar(); }, []);

  const recorrenciaAtiva = recorrencias.find((r) => r.id === selecionada);
  const listaOcorrencias = useMemo(() => ocorrencias.filter((o) => o.recorrencia_id === selecionada), [ocorrencias, selecionada]);
  const ocorrenciaPendente = listaOcorrencias.find((o) => o.status === "pendente");
  const itensAtuais = ocorrenciaPendente?.itens ?? [];

  async function criarRecorrencia(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente_id) { toast.error("Selecione um cliente."); return; }
    setSalvando(true);
    const db = supabase as any;
    const { data, error } = await db.from("pedidos_recorrentes").insert({
      cliente_id: form.cliente_id, frequencia: form.frequencia, data_inicio: form.data_inicio,
      data_fim: form.data_fim || null, hora_entrega: form.hora_entrega || null,
      observacoes: form.observacoes || null, ativa: true,
    }).select("*").single();
    if (error) { toast.error(error.message); setSalvando(false); return; }
    const { error: erroOcorrencia } = await db.from("pedidos_recorrentes_ocorrencias").insert({
      recorrencia_id: data.id, data_entrega: form.data_inicio, status: "pendente", itens: [],
    });
    setSalvando(false);
    if (erroOcorrencia) toast.error(`Recorrência criada, mas não foi possível preparar a primeira entrega: ${erroOcorrencia.message}`);
    else toast.success("Recorrência criada. Configure os itens da primeira entrega.");
    setForm((f) => ({ ...f, observacoes: "" }));
    await carregar();
    setSelecionada(data.id);
  }

  async function prepararProxima() {
    if (!recorrenciaAtiva || !recorrenciaAtiva.ativa) return;
    const ultima = [...listaOcorrencias].sort((a,b) => b.data_entrega.localeCompare(a.data_entrega))[0];
    const base = ultima?.data_entrega ?? recorrenciaAtiva.data_inicio;
    const data = proximaData(base, recorrenciaAtiva.frequencia);
    if (recorrenciaAtiva.data_fim && data > recorrenciaAtiva.data_fim) { toast.error("A data final da recorrência já foi atingida."); return; }
    setSalvando(true);
    const { error } = await (supabase as any).from("pedidos_recorrentes_ocorrencias").insert({ recorrencia_id: recorrenciaAtiva.id, data_entrega: data, status: "pendente", itens: [] });
    setSalvando(false);
    if (error) toast.error(error.code === "23505" ? "Esta data já possui uma ocorrência." : error.message);
    else { toast.success(`Ocorrência de ${dataBR(data)} preparada.`); await carregar(); }
  }

  function adicionarItem() {
    const produto = produtos.find((p) => p.id === itemRascunho.produto_id);
    const quantidade = Number(itemRascunho.quantidade.replace(",", "."));
    const preco = Number(itemRascunho.preco_unitario.replace(",", "."));
    if (!produto || !Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(preco) || preco < 0) {
      toast.error("Selecione um produto e informe quantidade e preço válidos."); return;
    }
    if (!ocorrenciaPendente) { toast.error("Prepare ou selecione uma ocorrência pendente."); return; }
    const itens = [...itensAtuais, { produto_id: produto.id, descricao: produto.nome, quantidade, preco_unitario: preco, custo_unitario: Number(custo.get(produto.id) ?? 0) }];
    void salvarItens(itens);
    setItemRascunho({ produto_id: "", quantidade: "1", preco_unitario: "" });
  }
  async function salvarItens(itens: Item[]) {
    if (!ocorrenciaPendente) return;
    const { error } = await (supabase as any).from("pedidos_recorrentes_ocorrencias").update({ itens }).eq("id", ocorrenciaPendente.id);
    if (error) toast.error(error.message);
    else { setOcorrencias((prev) => prev.map((o) => o.id === ocorrenciaPendente.id ? { ...o, itens } : o)); toast.success("Itens da entrega salvos."); }
  }
  async function removerItem(index: number) { await salvarItens(itensAtuais.filter((_, i) => i !== index)); }

  async function confirmarPedido() {
    if (!ocorrenciaPendente || itensAtuais.length === 0) { toast.error("Adicione pelo menos um item antes de confirmar."); return; }
    setSalvando(true);
    const { data, error } = await (supabase as any).rpc("confirmar_ocorrencia_recorrente", {
      p_ocorrencia_id: ocorrenciaPendente.id,
      p_payload: { forma_pagamento: "pix", valor_entrada: 0, saldo_quitado: false, desconto: 0, taxa_entrega: 0, observacoes: ocorrenciaPendente.observacoes ?? "" },
      p_itens: itensAtuais,
    });
    setSalvando(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido normal criado e vinculado à ocorrência.");
      await Promise.all([carregar(), qc.invalidateQueries({ queryKey: ["pedidos"] })]);
      toast.info(`ID do pedido criado: ${data}`);
    }
  }

  async function alternarAtiva() {
    if (!recorrenciaAtiva) return;
    const { error } = await (supabase as any).from("pedidos_recorrentes").update({ ativa: !recorrenciaAtiva.ativa }).eq("id", recorrenciaAtiva.id);
    if (error) toast.error(error.message);
    else { toast.success(recorrenciaAtiva.ativa ? "Recorrência pausada." : "Recorrência reativada."); await carregar(); }
  }

  return <>
    <PageHeader title="Pedidos recorrentes" subtitle="Prepare cada entrega e confirme antes de criar o pedido normal." action={<Button asChild variant="outline" size="sm"><Link to="/pedidos"><ArrowLeft className="size-4" /> Pedidos</Link></Button>} />
    <Card className="mb-5 p-4">
      <h2 className="mb-3 font-semibold">Nova recorrência</h2>
      <form className="space-y-3" onSubmit={criarRecorrencia}>
        <label className="block text-sm">Cliente
          <select required value={form.cliente_id} onChange={(e) => setForm({...form, cliente_id:e.target.value})} className="mt-1 h-10 w-full rounded-md border bg-background px-3">
            <option value="">Selecione um cliente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Frequência
            <select value={form.frequencia} onChange={(e) => setForm({...form, frequencia:e.target.value as Recorrencia["frequencia"]})} className="mt-1 h-10 w-full rounded-md border bg-background px-3">
              <option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option>
            </select>
          </label>
          <label className="block text-sm">Hora da entrega
            <Input type="time" value={form.hora_entrega} onChange={(e) => setForm({...form, hora_entrega:e.target.value})} className="mt-1" />
          </label>
          <label className="block text-sm">Primeira entrega
            <Input type="date" required value={form.data_inicio} onChange={(e) => setForm({...form, data_inicio:e.target.value})} className="mt-1" />
          </label>
          <label className="block text-sm">Repetir até (opcional)
            <Input type="date" min={form.data_inicio} value={form.data_fim} onChange={(e) => setForm({...form, data_fim:e.target.value})} className="mt-1" />
          </label>
        </div>
        <label className="block text-sm">Observações padrão (opcional)
          <Input value={form.observacoes} onChange={(e) => setForm({...form, observacoes:e.target.value})} className="mt-1" placeholder="Ex.: entregar na portaria" />
        </label>
        <Button type="submit" disabled={salvando}><Plus className="size-4" /> Criar recorrência</Button>
      </form>
    </Card>

    <Card className="mb-5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Recorrências cadastradas</h2><Button variant="ghost" size="icon" onClick={() => void carregar()} aria-label="Atualizar"><RefreshCw className="size-4" /></Button></div>
      {carregando ? <p className="text-sm text-muted-foreground">Carregando...</p> : recorrencias.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma recorrência cadastrada.</p> : <div className="space-y-2">
        {recorrencias.map((r) => { const cliente = clientes.find((c) => c.id === r.cliente_id); return <button key={r.id} type="button" onClick={() => setSelecionada(r.id)} className={`w-full rounded-lg border p-3 text-left ${selecionada === r.id ? "border-primary bg-primary/5" : ""}`}>
          <span className="flex items-center justify-between gap-2 font-medium"><span>{cliente?.nome ?? "Cliente"}</span><span className="text-xs text-muted-foreground">{r.ativa ? "Ativa" : "Pausada"}</span></span>
          <span className="mt-1 block text-sm text-muted-foreground">{r.frequencia === "semanal" ? "Semanal" : r.frequencia === "quinzenal" ? "Quinzenal" : "Mensal"} · desde {dataBR(r.data_inicio)}</span>
        </button>; })}
      </div>}
      {recorrenciaAtiva && <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={prepararProxima} disabled={salvando || !recorrenciaAtiva.ativa}><CalendarPlus className="size-4" /> Preparar próxima ocorrência</Button>
        <Button variant="outline" size="sm" onClick={alternarAtiva}>{recorrenciaAtiva.ativa ? "Pausar recorrência" : "Reativar recorrência"}</Button>
      </div>}
    </Card>

    {recorrenciaAtiva && <Card className="mb-8 p-4">
      <h2 className="mb-3 font-semibold">Entregas de {clientes.find((c) => c.id === recorrenciaAtiva.cliente_id)?.nome ?? "cliente"}</h2>
      {listaOcorrencias.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ocorrência preparada.</p> : <div className="space-y-3">
        {listaOcorrencias.map((o) => <div key={o.id} className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><strong>{dataBR(o.data_entrega)}</strong><span className="text-xs text-muted-foreground">{o.status === "pendente" ? "Aguardando confirmação" : o.status === "confirmada" ? "Pedido criado" : "Cancelada"}</span></div>
          {o.status === "pendente" && <>
            <div className="mb-3 space-y-2">{(o.itens ?? []).map((item, i) => <div key={i} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1">{item.quantidade}× {item.descricao} — R$ {Number(item.preco_unitario).toFixed(2).replace(".", ",")}</span><Button variant="ghost" size="icon" onClick={() => void removerItem(i)} aria-label={`Remover ${item.descricao}`}><Trash2 className="size-4" /></Button></div>)}</div>
            {ocorrenciaPendente?.id === o.id && <><div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 block text-sm">Produto
                <select value={itemRascunho.produto_id} onChange={(e) => { const p=produtos.find((x)=>x.id===e.target.value); setItemRascunho({...itemRascunho,produto_id:e.target.value,preco_unitario:p?String(p.preco_venda):""}); }} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="">Selecione um produto</option>{produtos.filter((p)=>p.ativo).map((p)=><option key={p.id} value={p.id}>{p.nome}</option>)}</select>
              </label>
              <label className="block text-sm">Quantidade<Input value={itemRascunho.quantidade} onChange={(e)=>setItemRascunho({...itemRascunho,quantidade:e.target.value})} inputMode="decimal" className="mt-1" /></label>
              <label className="block text-sm">Preço unitário (R$)<Input value={itemRascunho.preco_unitario} onChange={(e)=>setItemRascunho({...itemRascunho,preco_unitario:e.target.value})} inputMode="decimal" className="mt-1" /></label>
            </div>
            <Button className="mt-3" variant="outline" size="sm" onClick={adicionarItem}><Plus className="size-4" /> Adicionar item</Button>
            <Button className="mt-3 ml-2" size="sm" onClick={confirmarPedido} disabled={salvando || !itensAtuais.length}><Check className="size-4" /> Confirmar e criar pedido</Button></>}
          </>}
          {o.status === "confirmada" && <p className="text-sm text-muted-foreground">Vinculada ao pedido {o.pedido_id?.slice(0, 8)}…</p>}
        </div>)}
      </div>}
    </Card>}
  </>;
}
