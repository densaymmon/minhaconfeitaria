import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, CheckCircle2, Search, List, Layers, SlidersHorizontal, Clock3, AlertTriangle, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosCalc, type PedidoCalc } from "@/lib/hooks";
import { brl, dataBR, dataLonga, formaLabel, FORMAS, hojeISO, num, parseNum } from "@/lib/format";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/producao")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
  notFoundComponent: () => <p>Registro não encontrado.</p>,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Produção — Doce Gestão" },
      { name: "description", content: "Painel simplificado de produção por prazo de entrega." },
      { property: "og:title", content: "Produção — Doce Gestão" },
      { property: "og:description", content: "Painel simplificado de produção por prazo de entrega." },
    ],
  }),
  component: Producao,
});

const STATUS_FINAIS = ["finalizado", "entregue"];
const STATUS_LABELS: Record<string, string> = {
  recebido: "Recebido", confirmado: "Confirmado", em_producao: "Em produção",
  pronto: "Pronto", finalizado: "Finalizado", entregue: "Entregue", cancelado: "Cancelado",
};
const STATUS_ATIVOS = ["recebido", "confirmado", "em_producao", "pronto"];

type Filtro = "fila" | "todos" | "a_produzir" | "em_producao" | "prontos" | "atrasados" | "finalizados";
type Visualizacao = "pedidos" | "produtos";

function prazoDoPedido(p: PedidoCalc) {
  // Sem horário definido, considera o fim do dia para não sinalizar atraso indevidamente.
  const horario = p.hora_entrega?.slice(0, 5) || "23:59";
  return new Date(`${p.data_entrega}T${horario}:00`);
}

function estaAtrasado(p: PedidoCalc, agora: Date) {
  if (!STATUS_ATIVOS.includes(p.status)) return false;
  return prazoDoPedido(p).getTime() < agora.getTime();
}

function Producao() {
  const pedidos = usePedidosCalc();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const agora = new Date();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("fila");
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("pedidos");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [mostrarDatas, setMostrarDatas] = useState(false);
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<PedidoCalc | null>(null);
  const [editandoPedido, setEditandoPedido] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [rascunho, setRascunho] = useState<{
    cliente_id: string; data_entrega: string; hora_entrega: string; forma_pagamento: string;
    valor_entrada: string; desconto: string; taxa_entrega: string; observacoes: string;
    itens: { produto_id: string | null; descricao: string; quantidade: string; preco_unitario: string; custo_unitario: number; quantidade_produzida: number }[];
  } | null>(null);

  function abrirPedido(p: PedidoCalc) {
    setPedidoAberto(p);
    setEditandoPedido(false);
    setRascunho({
      cliente_id: p.cliente_id ?? "", data_entrega: p.data_entrega, hora_entrega: p.hora_entrega ?? "",
      forma_pagamento: p.forma_pagamento, valor_entrada: String(p.valor_entrada ?? 0),
      desconto: String(p.desconto ?? 0), taxa_entrega: String(p.taxa_entrega ?? 0), observacoes: p.observacoes ?? "",
      itens: p.pedido_itens.map((i) => ({
        produto_id: i.produto_id, descricao: i.descricao, quantidade: String(i.quantidade),
        preco_unitario: String(i.preco_unitario), custo_unitario: Number(i.custo_unitario),
        quantidade_produzida: Number(i.quantidade_produzida),
      })),
    });
  }

  async function salvarEdicaoPedido() {
    if (!pedidoAberto || !rascunho) return;
    if (!rascunho.data_entrega) return void toast.error("Informe a data de entrega.");
    if (rascunho.itens.length === 0 || rascunho.itens.some((i) => !i.descricao.trim() || parseNum(i.quantidade) <= 0)) {
      return void toast.error("Confira os itens: descrição e quantidade maior que zero são obrigatórias.");
    }
    setSalvandoEdicao(true);
    try {
      const { error } = await supabase.rpc("salvar_pedido", {
        payload: {
          cliente_id: rascunho.cliente_id || null, data_entrega: rascunho.data_entrega,
          hora_entrega: rascunho.hora_entrega || null, status: pedidoAberto.status,
          forma_pagamento: rascunho.forma_pagamento, valor_entrada: parseNum(rascunho.valor_entrada),
          saldo_quitado: pedidoAberto.saldo_quitado, desconto: parseNum(rascunho.desconto),
          taxa_entrega: parseNum(rascunho.taxa_entrega), observacoes: rascunho.observacoes.trim() || null,
        },
        itens: rascunho.itens.map((i) => ({
          produto_id: i.produto_id, descricao: i.descricao.trim(), quantidade: parseNum(i.quantidade),
          preco_unitario: parseNum(i.preco_unitario), custo_unitario: i.custo_unitario,
        })),
        registro_id: pedidoAberto.id,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Pedido #${pedidoAberto.numero} atualizado!`);
      setPedidoAberto(null); setRascunho(null); setEditandoPedido(false);
    } catch (e) {
      toast.error(`Não foi possível salvar o pedido: ${e instanceof Error ? e.message : "tente novamente."}`);
    } finally { setSalvandoEdicao(false); }
  }

  const pedidosOrdenados = useMemo(
    () => [...pedidos]
      .filter((p) => p.status !== "cancelado")
      .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (a.hora_entrega ?? "23:59").localeCompare(b.hora_entrega ?? "23:59") || a.numero - b.numero),
    [pedidos],
  );

  const pedidosNoPeriodo = useMemo(
    () => pedidosOrdenados.filter((p) =>
      (!dataInicial || p.data_entrega >= dataInicial) &&
      (!dataFinal || p.data_entrega <= dataFinal)
    ),
    [pedidosOrdenados, dataInicial, dataFinal],
  );

  const pedidosFiltrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return pedidosNoPeriodo.filter((p) => {
      const atrasado = estaAtrasado(p, agora);
      if (filtro === "fila" && (!STATUS_ATIVOS.includes(p.status))) return false;
      if (filtro === "a_produzir" && !["recebido", "confirmado"].includes(p.status)) return false;
      if (filtro === "em_producao" && p.status !== "em_producao") return false;
      if (filtro === "prontos" && p.status !== "pronto") return false;
      if (filtro === "atrasados" && !atrasado) return false;
      if (filtro === "finalizados" && !STATUS_FINAIS.includes(p.status)) return false;
      if (!q) return true;
      return (
        String(p.numero).includes(q.replace(/^#/, "")) ||
        (p.clientes?.nome ?? "").toLocaleLowerCase("pt-BR").includes(q) ||
        (p.observacoes ?? "").toLocaleLowerCase("pt-BR").includes(q) ||
        p.pedido_itens.some((i) => i.descricao.toLocaleLowerCase("pt-BR").includes(q))
      );
    });
  }, [pedidosNoPeriodo, busca, filtro, agora]);

  const pedidosAtivos = useMemo(
    () => pedidosNoPeriodo.filter((p) => STATUS_ATIVOS.includes(p.status)),
    [pedidosNoPeriodo],
  );

  const resumoProdutos = useMemo(() => {
    const mapa = new Map<string, { quantidade: number; produzida: number; pedidos: Set<string> }>();
    for (const p of pedidosAtivos) {
      for (const item of p.pedido_itens) {
        const atual = mapa.get(item.descricao) ?? { quantidade: 0, produzida: 0, pedidos: new Set<string>() };
        atual.quantidade += Number(item.quantidade);
        atual.produzida += Number(item.quantidade_produzida);
        atual.pedidos.add(p.id);
        mapa.set(item.descricao, atual);
      }
    }
    return [...mapa.entries()].sort((a, b) =>
      (b[1].quantidade - b[1].produzida) - (a[1].quantidade - a[1].produzida),
    );
  }, [pedidosAtivos]);

  const contagens = useMemo(() => ({
    fila: pedidosNoPeriodo.filter((p) => STATUS_ATIVOS.includes(p.status)).length,
    aProduzir: pedidosNoPeriodo.filter((p) => ["recebido", "confirmado"].includes(p.status)).length,
    emProducao: pedidosNoPeriodo.filter((p) => p.status === "em_producao").length,
    atrasados: pedidosNoPeriodo.filter((p) => estaAtrasado(p, agora)).length,
    prontos: pedidosNoPeriodo.filter((p) => p.status === "pronto").length,
    finalizados: pedidosNoPeriodo.filter((p) => STATUS_FINAIS.includes(p.status)).length,
  }), [pedidosNoPeriodo, agora]);

  const porData = useMemo(() => {
    const mapa = new Map<string, PedidoCalc[]>();
    for (const p of pedidosFiltrados) mapa.set(p.data_entrega, [...(mapa.get(p.data_entrega) ?? []), p]);
    return [...mapa.entries()];
  }, [pedidosFiltrados]);

  async function ajustar(itemId: string, valor: number, max: number) {
    const v = Math.max(0, Math.min(max, valor));
    const { error } = await supabase.rpc("ajustar_producao", {
      pedido_item_id: itemId,
      quantidade_resultado: v,
      evento_id: crypto.randomUUID(),
    });
    if (error) return void toast.error(`Não foi possível atualizar a produção/estoque: ${error.message}`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pedidos"] }),
      qc.invalidateQueries({ queryKey: ["estoque"] }),
    ]);
  }

  async function mudarStatus(p: PedidoCalc, status: "pronto") {
    setFinalizandoId(p.id);
    try {
      // Process sequentially. Each RPC is atomic and delta-based; retrying a partially
      // completed order won't deduct the same quantity twice.
      for (const i of p.pedido_itens) {
        const { error } = await supabase.rpc("ajustar_producao", {
          pedido_item_id: i.id,
          quantidade_resultado: Number(i.quantidade),
          evento_id: crypto.randomUUID(),
        });
        if (error) throw new Error(`Não foi possível registrar produção/estoque do item "${i.descricao}": ${error.message}`);
      }

      const { error } = await supabase.from("pedidos").update({ status }).eq("id", p.id);
      if (error) throw new Error(`Não foi possível marcar o pedido como pronto: ${error.message}`);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pedidos"] }),
        qc.invalidateQueries({ queryKey: ["estoque"] }),
      ]);
      toast.success(`Pedido #${p.numero} marcado como pronto e aguardando entrega.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível finalizar o pedido. Tente novamente.");
    } finally {
      setFinalizandoId(null);
    }
  }

  async function marcarComoEntregue(p: PedidoCalc) {
    if (p.status !== "pronto") return;
    setFinalizandoId(p.id);
    try {
      const { error } = await supabase.from("pedidos").update({ status: "entregue" }).eq("id", p.id);
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Pedido #${p.numero} marcado como entregue.`);
    } catch (e) {
      toast.error(`Não foi possível marcar o pedido como entregue: ${e instanceof Error ? e.message : "tente novamente."}`);
    } finally {
      setFinalizandoId(null);
    }
  }

  const filtros: { value: Filtro; label: string; count: number }[] = [
    { value: "fila", label: "Fila ativa", count: contagens.fila },
    { value: "a_produzir", label: "A produzir", count: contagens.aProduzir },
    { value: "em_producao", label: "Em produção", count: contagens.emProducao },
    { value: "prontos", label: "Prontos", count: contagens.prontos },
    { value: "atrasados", label: "Atrasados", count: contagens.atrasados },
    { value: "finalizados", label: "Finalizados", count: contagens.finalizados },
    { value: "todos", label: "Todos", count: pedidosNoPeriodo.length },
  ];

  return (
    <>
      <PageHeader title="Produção" subtitle={`${contagens.fila} pedido(s) na fila ativa${contagens.atrasados ? ` · ${contagens.atrasados} atrasado(s)` : ""}`} />

      <Dialog open={!!pedidoAberto} onOpenChange={(open) => {
        if (!open && editandoPedido && !confirm("Descartar as alterações não salvas?")) return;
        if (!open) { setPedidoAberto(null); setRascunho(null); setEditandoPedido(false); }
      }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Pedido #{pedidoAberto?.numero} · {pedidoAberto?.clientes?.nome ?? "Sem cliente"}</DialogTitle></DialogHeader>
          {pedidoAberto && rascunho && (
            <div className="space-y-4">
              {!editandoPedido ? <>
                <div className="grid grid-cols-1 gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
                  <div><div className="text-xs text-muted-foreground">Cliente</div><div className="font-medium">{pedidoAberto.clientes?.nome ?? "Sem cliente"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Telefone</div><div className="font-medium">{pedidoAberto.clientes?.telefone || "Não informado"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Entrega</div><div className="font-medium">{dataBR(pedidoAberto.data_entrega)} {pedidoAberto.hora_entrega?.slice(0, 5) ?? ""}</div></div>
                  <div><div className="text-xs text-muted-foreground">Status</div><div className="font-medium">{STATUS_LABELS[pedidoAberto.status] ?? pedidoAberto.status}</div></div>
                  <div><div className="text-xs text-muted-foreground">Pagamento</div><div className="font-medium">{formaLabel(pedidoAberto.forma_pagamento)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Total do pedido</div><div className="font-semibold">{brl(pedidoAberto.t.venda)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Entrada recebida</div><div className="font-medium">{brl(Number(pedidoAberto.valor_entrada ?? 0))}</div></div>
                  <div><div className="text-xs text-muted-foreground">Saldo pendente</div><div className="font-medium">{brl(pedidoAberto.t.saldo)}</div></div>
                </div>
                <div><h3 className="mb-2 font-semibold">Itens do pedido</h3><div className="space-y-2">
                  {pedidoAberto.pedido_itens.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0"><div className="font-medium">{item.descricao}</div><div className="text-sm text-muted-foreground">{num(Number(item.quantidade))} × {brl(Number(item.preco_unitario))} · produzidos: {num(Number(item.quantidade_produzida))}</div></div>
                    <div className="shrink-0 font-semibold">{brl(Number(item.quantidade) * Number(item.preco_unitario))}</div>
                  </div>)}
                </div></div>
                {pedidoAberto.observacoes && <div className="rounded-lg bg-accent p-3 text-sm"><div className="mb-1 font-semibold">Observações</div><p className="whitespace-pre-wrap">{pedidoAberto.observacoes}</p></div>}
                <div className="flex justify-end"><Button onClick={() => setEditandoPedido(true)}><Pencil className="size-4" /> Editar pedido</Button></div>
              </> : <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm"><span className="font-medium">Data de entrega</span><Input type="date" value={rascunho.data_entrega} onChange={(e) => setRascunho({ ...rascunho, data_entrega: e.target.value })} /></label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Horário de entrega</span><Input type="time" value={rascunho.hora_entrega} onChange={(e) => setRascunho({ ...rascunho, hora_entrega: e.target.value })} /></label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Forma de pagamento</span><select className="h-10 w-full rounded-md border bg-background px-3" value={rascunho.forma_pagamento} onChange={(e) => setRascunho({ ...rascunho, forma_pagamento: e.target.value })}>{FORMAS.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}</select></label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Entrada recebida (R$)</span><Input inputMode="decimal" value={rascunho.valor_entrada} onChange={(e) => setRascunho({ ...rascunho, valor_entrada: e.target.value })} /></label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Desconto (R$)</span><Input inputMode="decimal" value={rascunho.desconto} onChange={(e) => setRascunho({ ...rascunho, desconto: e.target.value })} /></label>
                  <label className="space-y-1 text-sm"><span className="font-medium">Taxa de entrega (R$)</span><Input inputMode="decimal" value={rascunho.taxa_entrega} onChange={(e) => setRascunho({ ...rascunho, taxa_entrega: e.target.value })} /></label>
                </div>
                <div><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Itens</h3><Button type="button" size="sm" variant="outline" onClick={() => setRascunho({ ...rascunho, itens: [...rascunho.itens, { produto_id: null, descricao: "", quantidade: "1", preco_unitario: "0", custo_unitario: 0, quantidade_produzida: 0 }] })}><Plus className="size-4" /> Adicionar item</Button></div>
                  <div className="space-y-3">{rascunho.itens.map((item, index) => <div key={index} className="space-y-2 rounded-lg border p-3">
                    <Input aria-label="Descrição do item" placeholder="Descrição do produto" value={item.descricao} onChange={(e) => setRascunho({ ...rascunho, itens: rascunho.itens.map((x, i) => i === index ? { ...x, descricao: e.target.value } : x) })} />
                    <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-sm"><span>Quantidade</span><Input inputMode="decimal" value={item.quantidade} onChange={(e) => setRascunho({ ...rascunho, itens: rascunho.itens.map((x, i) => i === index ? { ...x, quantidade: e.target.value } : x) })} /></label><label className="space-y-1 text-sm"><span>Preço unitário (R$)</span><Input inputMode="decimal" value={item.preco_unitario} onChange={(e) => setRascunho({ ...rascunho, itens: rascunho.itens.map((x, i) => i === index ? { ...x, preco_unitario: e.target.value } : x) })} /></label></div>
                    <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal: {brl(parseNum(item.quantidade) * parseNum(item.preco_unitario))} · Produzidos: {num(item.quantidade_produzida)}</span><Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setRascunho({ ...rascunho, itens: rascunho.itens.filter((_, i) => i !== index) })}>Remover</Button></div>
                  </div>)}</div>
                </div>
                <label className="block space-y-1 text-sm"><span className="font-medium">Observações e personalizações</span><Textarea rows={3} value={rascunho.observacoes} onChange={(e) => setRascunho({ ...rascunho, observacoes: e.target.value })} placeholder="Detalhes do pedido..." /></label>
                <div className="rounded-lg bg-muted/50 p-3 text-right"><span className="text-sm text-muted-foreground">Total estimado: </span><span className="font-bold">{brl(rascunho.itens.reduce((total, item) => total + parseNum(item.quantidade) * parseNum(item.preco_unitario), 0) + parseNum(rascunho.taxa_entrega) - parseNum(rascunho.desconto))}</span></div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" disabled={salvandoEdicao} onClick={() => { if (confirm("Descartar as alterações não salvas?")) abrirPedido(pedidoAberto); }}>Cancelar edição</Button>
                  <Button type="button" disabled={salvandoEdicao} onClick={() => void salvarEdicaoPedido()}>{salvandoEdicao ? "Salvando..." : "Salvar alterações"}</Button>
                </div>
              </div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={() => setFiltro("fila")} className={cn("rounded-xl border bg-card p-3 text-left shadow-soft transition-colors", filtro === "fila" && "border-primary ring-1 ring-primary/30")}>
          <span className="block text-xs font-medium text-muted-foreground">Fila ativa</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{contagens.fila}</span>
        </button>
        <button type="button" onClick={() => setFiltro("em_producao")} className={cn("rounded-xl border bg-card p-3 text-left shadow-soft transition-colors", filtro === "em_producao" && "border-primary ring-1 ring-primary/30")}>
          <span className="block text-xs font-medium text-muted-foreground">Em produção</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{contagens.emProducao}</span>
        </button>
        <button type="button" onClick={() => setFiltro("atrasados")} className={cn("rounded-xl border bg-card p-3 text-left shadow-soft transition-colors", contagens.atrasados > 0 ? "border-destructive/40" : "", filtro === "atrasados" && "ring-1 ring-destructive/30")}>
          <span className={cn("block text-xs font-medium", contagens.atrasados > 0 ? "text-destructive" : "text-muted-foreground")}>Atrasados</span>
          <span className={cn("mt-1 block text-2xl font-bold tabular-nums", contagens.atrasados > 0 && "text-destructive")}>{contagens.atrasados}</span>
        </button>
        <button type="button" onClick={() => setFiltro("prontos")} className={cn("rounded-xl border bg-card p-3 text-left shadow-soft transition-colors", filtro === "prontos" && "border-primary ring-1 ring-primary/30")}>
          <span className="block text-xs font-medium text-muted-foreground">Prontos</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{contagens.prontos}</span>
        </button>
      </div>

      <Card className="mb-4 space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pedido, cliente ou produto"
            aria-label="Buscar pedido, cliente ou produto"
            className="h-11 bg-background pl-9"
          />
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Filtrar pedidos por status">
          {filtros.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              aria-pressed={filtro === f.value}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                filtro === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {f.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filtro === f.value ? "bg-primary-foreground/20" : "bg-muted")}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <button type="button" onClick={() => setMostrarDatas((v) => !v)} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" aria-expanded={mostrarDatas}>
            <SlidersHorizontal className="size-4" />
            {mostrarDatas ? "Ocultar período" : "Filtrar por data"}
          </button>
          <div className="inline-flex rounded-lg border p-1">
            <button type="button" onClick={() => setVisualizacao("pedidos")} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm", visualizacao === "pedidos" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} aria-pressed={visualizacao === "pedidos"}>
              <List className="size-4" /> Pedidos
            </button>
            <button type="button" onClick={() => setVisualizacao("produtos")} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm", visualizacao === "produtos" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} aria-pressed={visualizacao === "produtos"}>
              <Layers className="size-4" /> Por produto
            </button>
          </div>
        </div>

        {mostrarDatas && (
          <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Entrega a partir de</span>
              <Input type="date" value={dataInicial} max={dataFinal || undefined} onChange={(e) => setDataInicial(e.target.value)} className="h-11 bg-background" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Entrega até</span>
              <Input type="date" value={dataFinal} min={dataInicial || undefined} onChange={(e) => setDataFinal(e.target.value)} className="h-11 bg-background" />
            </label>
            {(dataInicial || dataFinal) && (
              <button type="button" className="text-left text-sm font-medium text-primary sm:col-span-2" onClick={() => { setDataInicial(""); setDataFinal(""); }}>
                Limpar período
              </button>
            )}
          </div>
        )}
      </Card>

      {visualizacao === "produtos" ? (
        <div className="space-y-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">Demanda por produto</h2>
            <span className="text-xs text-muted-foreground">Pedidos ativos no período</span>
          </div>
          {resumoProdutos.filter(([nome]) => !busca.trim() || nome.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"))).length === 0 ? (
            <Empty>Nenhum produto pendente encontrado.</Empty>
          ) : resumoProdutos.filter(([nome]) => !busca.trim() || nome.toLocaleLowerCase("pt-BR").includes(busca.trim().toLocaleLowerCase("pt-BR"))).map(([nome, r]) => {
            const pendente = Math.max(0, r.quantidade - r.produzida);
            const percentual = r.quantidade > 0 ? Math.min(100, (r.produzida / r.quantidade) * 100) : 0;
            return (
              <Card key={nome} className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{nome}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{r.pedidos.size} pedido(s) · {num(r.produzida)} de {num(r.quantidade)} produzidos</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums">{num(pendente)}</div>
                    <div className="text-xs text-muted-foreground">pendentes</div>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${percentual}%` }} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <Empty>Nenhum pedido encontrado. Tente mudar o filtro ou a pesquisa.</Empty>
      ) : (
        <div className="space-y-5">
          {porData.map(([data, lista]) => (
            <section key={data}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize text-muted-foreground">
                {data < hoje ? <AlertTriangle className="size-4 text-destructive" /> : <Clock3 className="size-4" />}
                <span className={cn(data < hoje && "text-destructive")}>{dataLonga(data)}</span>
                <span className="font-normal">· {lista.length} pedido(s)</span>
              </h2>
              <div className="space-y-2">
                {lista.map((p) => {
                  const atrasado = estaAtrasado(p, agora);
                  const total = p.pedido_itens.reduce((s, i) => s + Number(i.quantidade), 0);
                  const feito = p.pedido_itens.reduce((s, i) => s + Number(i.quantidade_produzida), 0);
                  const percentual = total > 0 ? Math.min(100, (feito / total) * 100) : 0;
                  const ativo = ["recebido", "confirmado", "em_producao"].includes(p.status);
                  return (
                    <Card
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Abrir informações do pedido #${p.numero}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
                        abrirPedido(p);
                      }}
                      onKeyDown={(e) => {
                        if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPedido(p); }
                      }}
                      className={cn("cursor-pointer p-3.5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", atrasado && "border-destructive/50 ring-1 ring-destructive/20")}
                    >
                      <div className="flex items-start gap-3">
                        {atrasado && <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"><AlertTriangle className="size-4" /></span>}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link to="/pedidos/$id" params={{ id: p.id }} className="font-bold hover:underline">#{p.numero}</Link>
                            <span className="text-muted-foreground">·</span>
                            <button type="button" onClick={() => abrirPedido(p)} className="min-w-0 rounded-sm text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{p.clientes?.nome ?? "Sem cliente"}</button>
                            <StatusBadge status={p.status} />
                          </div>
                          <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 text-sm", atrasado && "font-semibold text-destructive")}>
                            <span>{p.hora_entrega ? `Entrega às ${p.hora_entrega.slice(0, 5)}` : "Sem horário definido"}</span>
                            {atrasado && <span>· Atrasado</span>}
                          </div>
                        </div>
                      </div>

                      {p.observacoes && <p className="mt-3 rounded-lg bg-accent p-2.5 text-sm text-accent-foreground"><b>Observações:</b> {p.observacoes}</p>}

                      <div className="mt-3 space-y-3">
                        {p.pedido_itens.map((i) => {
                          const q = Number(i.quantidade);
                          const f = Number(i.quantidade_produzida);
                          const falta = Math.max(0, q - f);
                          return (
                            <div key={i.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={q > 0 && f >= q}
                                onChange={(e) => ajustar(i.id, e.target.checked ? q : 0, q)}
                                disabled={!ativo}
                                className="size-5 shrink-0 accent-primary"
                                aria-label={`Marcar ${i.descricao} como produzido`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium leading-snug">{i.descricao}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {num(f)} / {num(q)} produzidos{falta > 0 ? ` · faltam ${num(falta)}` : " · concluído"}
                                </div>
                              </div>
                              {ativo && (
                                <div className="flex shrink-0 gap-1">
                                  <Button size="icon" variant="outline" className="size-9" onClick={() => ajustar(i.id, f - 1, q)} disabled={f <= 0} aria-label={`Diminuir quantidade produzida de ${i.descricao}`}>
                                    <Minus className="size-4" />
                                  </Button>
                                  <Button size="icon" variant="outline" className="size-9" onClick={() => ajustar(i.id, f + 1, q)} disabled={f >= q} aria-label={`Aumentar quantidade produzida de ${i.descricao}`}>
                                    <Plus className="size-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {total > 0 && (
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>Progresso do pedido</span>
                            <span>{num(feito)} de {num(total)} unidades</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${percentual}%` }} />
                          </div>
                        </div>
                      )}

                      {ativo && (
                        <div className="mt-3 border-t pt-3">
                          <Button size="lg" className="w-full" onClick={() => mudarStatus(p, "pronto")} disabled={finalizandoId === p.id}>
                            <CheckCircle2 className="size-4" />
                            {finalizandoId === p.id ? "Marcando como pronto..." : "Marcar como Pronto"}
                          </Button>
                        </div>
                      )}

                      {p.status === "pronto" && (
                        <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row">
                          <Button size="sm" className="flex-1" onClick={() => void marcarComoEntregue(p)} disabled={finalizandoId === p.id}>
                            <CheckCircle2 className="size-4" />
                            {finalizandoId === p.id ? "Atualizando..." : "Marcar como entregue"}
                          </Button>
                          <Button asChild size="sm" variant="outline" className="flex-1">
                            <Link to="/pedidos/$id" params={{ id: p.id }}>
                              <Pencil className="size-4" /> Editar pedido
                            </Link>
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
