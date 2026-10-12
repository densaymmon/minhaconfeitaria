import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart, Wallet, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { insumosQ, type Insumo } from "@/lib/queries";
import { brl, dataBR, hojeISO, parseNum } from "@/lib/format";
import { PageHeader, Field, Empty } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/compras")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.insumosQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
      context.queryClient.ensureQueryData(appQueries.estoqueMovimentosQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar as compras."}</p>,
  head: () => ({ meta: [{ title: "Compras e estoque — Doce Gestão" }, { name: "description", content: "Compras de insumos, estoque e contas a pagar." }] }),
  component: Compras,
});

type Linha = { insumo_id: string; quantidade: string; preco: string };
const linhaVazia = (): Linha => ({ insumo_id: "", quantidade: "1", preco: "" });

function Compras() {
  const { data: insumos } = useSuspenseQuery(insumosQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: contas } = useSuspenseQuery(appQueries.contasPagarQ);
  const { data: movimentos } = useSuspenseQuery(appQueries.estoqueMovimentosQ);
  const qc = useQueryClient();
  const [f, setF] = useState({ fornecedor: "", data_compra: hojeISO(), numero_documento: "", desconto: "0", frete: "0", vencimento: "", forma_pagamento: "pix", observacoes: "" });
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }));
  const linhasCalculadas = linhas.map(l => {
    const insumo = insumos.find(i => i.id === l.insumo_id);
    const quantidade = parseNum(l.quantidade);
    const preco = parseNum(l.preco);
    return { ...l, insumo, quantidade, preco, total: quantidade * preco };
  });
  const subtotal = linhasCalculadas.reduce((s, l) => s + l.total, 0);
  const total = Math.max(0, subtotal - parseNum(f.desconto) + parseNum(f.frete));
  const pendente = contas.filter(c => c.status === "pendente" || c.status === "parcial").reduce((s,c) => s + Math.max(0, Number(c.valor) - Number(c.valor_pago)), 0);
  const estoque = useMemo(() => {
    const m = new Map<string, number>();
    for (const mov of movimentos) m.set(mov.insumo_id, (m.get(mov.insumo_id) ?? 0) + (mov.tipo === "entrada" || mov.tipo === "ajuste" ? Number(mov.quantidade) : -Number(mov.quantidade)));
    return m;
  }, [movimentos]);

  function escolherInsumo(index: number, id: string) {
    const item = insumos.find(i => i.id === id);
    setLinhas(s => s.map((l, j) => j === index ? { ...l, insumo_id: id, preco: item ? String(item.preco_embalagem ?? item.preco_unidade) : "" } : l));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!linhasCalculadas.length || linhasCalculadas.some(l => !l.insumo || l.quantidade <= 0 || l.preco < 0)) {
      toast.error("Selecione um insumo e confira as quantidades e os preços de todos os itens.");
      return;
    }
    if (total <= 0) { toast.error("O total da compra precisa ser maior que zero."); return; }
    setBusy(true);
    let compraId: string | null = null;
    try {
      const { data: compra, error: erroCompra } = await supabase.from("compras").insert({
        fornecedor: f.fornecedor.trim() || null,
        data_compra: f.data_compra,
        numero_documento: f.numero_documento.trim() || null,
        origem: "manual",
        status: "registrada",
        subtotal: Number(subtotal.toFixed(2)),
        desconto: parseNum(f.desconto),
        frete: parseNum(f.frete),
        total: Number(total.toFixed(2)),
        observacoes: f.observacoes.trim() || null,
      }).select("id").single();
      if (erroCompra) throw erroCompra;
      compraId = compra.id;

      const itensPayload = linhasCalculadas.map(l => {
        const fator = Number(l.insumo?.quantidade_embalagem ?? 1);
        const unidadeBase = l.insumo?.unidade_embalagem ?? l.insumo?.unidade ?? "un";
        return {
          compra_id: compra.id,
          insumo_id: l.insumo!.id,
          descricao: l.insumo!.nome,
          quantidade: l.quantidade,
          unidade: "embalagem",
          preco_unitario: l.preco,
          total: Number(l.total.toFixed(2)),
          quantidade_base: Number((l.quantidade * fator).toFixed(4)),
          unidade_base: unidadeBase,
        };
      });
      const { data: itens, error: erroItens } = await supabase.from("compra_itens").insert(itensPayload).select("id,insumo_id,quantidade_base,unidade_base,total");
      if (erroItens) throw erroItens;

      const movimentosPayload = itens.map(item => ({
        insumo_id: item.insumo_id,
        compra_item_id: item.id,
        tipo: "entrada" as const,
        quantidade: item.quantidade_base,
        unidade: item.unidade_base,
        custo_total: item.total,
        data_movimento: f.data_compra,
        origem: "compra",
        referencia_id: compra.id,
      }));
      const { error: erroMovimentos } = await supabase.from("estoque_movimentos").insert(movimentosPayload);
      if (erroMovimentos) throw erroMovimentos;

      const { error: erroConta } = await supabase.from("contas_pagar").insert({
        compra_id: compra.id,
        descricao: `Compra de insumos${f.numero_documento.trim() ? " · documento " + f.numero_documento.trim() : ""}`,
        fornecedor: f.fornecedor.trim() || null,
        data_emissao: f.data_compra,
        data_vencimento: f.vencimento || f.data_compra,
        valor: Number(total.toFixed(2)),
        valor_pago: f.vencimento ? 0 : Number(total.toFixed(2)),
        data_pagamento: f.vencimento ? null : f.data_compra,
        forma_pagamento: f.forma_pagamento,
        status: f.vencimento ? "pendente" : "pago",
      });
      if (erroConta) throw erroConta;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["compras"] }),
        qc.invalidateQueries({ queryKey: ["contas-pagar"] }),
        qc.invalidateQueries({ queryKey: ["estoque-movimentos"] }),
        qc.invalidateQueries({ queryKey: ["insumos"] }),
        qc.invalidateQueries({ queryKey: ["produtos"] }),
      ]);
      setF({ fornecedor: "", data_compra: hojeISO(), numero_documento: "", desconto: "0", frete: "0", vencimento: "", forma_pagamento: "pix", observacoes: "" });
      setLinhas([linhaVazia()]);
      toast.success("Compra registrada e entradas adicionadas ao estoque.");
    } catch (e) {
      if (compraId) await supabase.from("compras").delete().eq("id", compraId);
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a compra.");
    } finally { setBusy(false); }
  }

  return <>
    <PageHeader title="Compras e estoque" back="/mais" />
    <div className="mb-6 grid grid-cols-2 gap-3">
      <div className="rounded-xl border bg-card p-3"><div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground"><ShoppingCart className="size-4"/>Compras registradas</div><p className="text-xl font-semibold">{brl(compras.reduce((s,c)=>s+Number(c.total),0))}</p><p className="text-xs text-muted-foreground">{compras.length} compra(s)</p></div>
      <div className="rounded-xl border bg-card p-3"><div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4"/>A pagar</div><p className="text-xl font-semibold">{brl(pendente)}</p><p className="text-xs text-muted-foreground">Saldo de contas pendentes</p></div>
    </div>
    <form onSubmit={salvar} className="mb-8 space-y-4 border-b pb-7">
      <h2 className="text-lg font-semibold">Registrar compra</h2>
      <p className="text-sm text-muted-foreground">Escolha os insumos já cadastrados. A compra gera uma entrada no estoque e um lançamento financeiro.</p>
      <Field label="Fornecedor"><Input maxLength={160} className="h-11" value={f.fornecedor} onChange={e=>set("fornecedor",e.target.value)} placeholder="Nome do fornecedor"/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data da compra"><Input required type="date" className="h-11" value={f.data_compra} onChange={e=>set("data_compra",e.target.value)}/></Field>
        <Field label="Nº do documento"><Input maxLength={80} className="h-11" value={f.numero_documento} onChange={e=>set("numero_documento",e.target.value)}/></Field>
      </div>
      <div className="space-y-3">
        {linhas.map((l,index)=>{
          const item=linhasCalculadas[index];
          return <div key={index} className="rounded-xl border p-3 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-medium">Item {index+1}</h3>{linhas.length>1&&<Button type="button" variant="ghost" size="icon" onClick={()=>setLinhas(s=>s.filter((_,j)=>j!==index))} aria-label="Remover item"><Trash2 className="size-4 text-destructive"/></Button>}</div>
            <Field label="Insumo"><select required value={l.insumo_id} onChange={e=>escolherInsumo(index,e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Selecione um insumo</option>{insumos.map(i=><option key={i.id} value={i.id}>{i.nome}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantidade de embalagens"><Input required inputMode="decimal" className="h-11" value={l.quantidade} onChange={e=>setLinhas(s=>s.map((x,j)=>j===index?{...x,quantidade:e.target.value}:x))}/></Field>
              <Field label="Preço por embalagem (R$)"><Input required inputMode="decimal" className="h-11" value={l.preco} onChange={e=>setLinhas(s=>s.map((x,j)=>j===index?{...x,preco:e.target.value}:x))}/></Field>
            </div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Entrada estimada: {item.insumo ? (item.quantidade * Number(item.insumo.quantidade_embalagem ?? 1)).toLocaleString("pt-BR") + " " + (item.insumo.unidade_embalagem ?? item.insumo.unidade) : "—"}</span><b>{brl(item.total)}</b></div>
          </div>;
        })}
        <Button type="button" variant="outline" className="w-full" onClick={()=>setLinhas(s=>[...s,linhaVazia()])}><Plus className="size-4"/>Adicionar insumo</Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desconto total (R$)"><Input inputMode="decimal" className="h-11" value={f.desconto} onChange={e=>set("desconto",e.target.value)}/></Field>
        <Field label="Frete (R$)"><Input inputMode="decimal" className="h-11" value={f.frete} onChange={e=>set("frete",e.target.value)}/></Field>
      </div>
      <Field label="Vencimento (deixe vazio se já pagou)"><Input type="date" className="h-11" value={f.vencimento} onChange={e=>set("vencimento",e.target.value)}/></Field>
      <Field label="Forma de pagamento"><select value={f.forma_pagamento} onChange={e=>set("forma_pagamento",e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="debito">Cartão de débito</option><option value="credito">Cartão de crédito</option><option value="boleto">Boleto</option><option value="outros">Outros</option></select></Field>
      <Field label="Observações"><Input maxLength={500} className="h-11" value={f.observacoes} onChange={e=>set("observacoes",e.target.value)} placeholder="Opcional"/></Field>
      <div className="flex items-center justify-between rounded-lg bg-muted p-3"><span className="font-medium">Total da compra</span><span className="text-lg font-bold">{brl(total)}</span></div>
      <Button disabled={busy||!insumos.length} className="h-11 w-full">{busy?"Salvando compra...":"Salvar compra e atualizar estoque"}</Button>
      {!insumos.length&&<p className="text-sm text-muted-foreground">Cadastre primeiro os insumos em Produtos e receitas.</p>}
    </form>
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Package className="size-5"/>Estoque atual</h2>
      {!insumos.length?<Empty>Nenhum insumo cadastrado.</Empty>:<div className="divide-y">{insumos.map(i=><div key={i.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{i.nome}</p><p className="text-xs text-muted-foreground">{i.unidade_embalagem??i.unidade}</p></div><b className="text-right">{(estoque.get(i.id)??0).toLocaleString("pt-BR",{maximumFractionDigits:4})} <span className="text-xs font-normal text-muted-foreground">{i.unidade_embalagem??i.unidade}</span></b></div>)}</div>}
    </section>
    <section>
      <h2 className="mb-3 text-lg font-semibold">Histórico de compras</h2>
      {!compras.length?<Empty>Nenhuma compra registrada.</Empty>:<div className="divide-y">{compras.map(c=><div key={c.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium">{c.fornecedor||"Compra sem fornecedor"}</p><p className="text-xs text-muted-foreground">{dataBR(c.data_compra)}{c.numero_documento? " · Doc. "+c.numero_documento:""}</p></div><b>{brl(Number(c.total))}</b></div>)}</div>}
    </section>
  </>;
}
