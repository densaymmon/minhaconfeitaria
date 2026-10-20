import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Download, MessageCircle, Plus, ReceiptText, Repeat, Search, SlidersHorizontal, Wallet } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { supabase } from "@/integrations/supabase/client";
import { STATUS, brl, dataBR, formaLabel, hojeISO, statusLabel } from "@/lib/format";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_ATIVOS = ["recebido", "confirmado", "em_producao", "pronto"];

export const Route = createFileRoute("/_authenticated/pedidos/")({
 validateSearch: (search: Record<string, unknown>): { filtro?: string | undefined; dataInicial?: string | undefined; dataFinal?: string | undefined; dataReferencia?: "recebimento" | undefined } => ({
   filtro: typeof search["filtro"] === "string" ? search["filtro"] : undefined,
   dataInicial: typeof search["dataInicial"] === "string" ? search["dataInicial"] : undefined,
   dataFinal: typeof search["dataFinal"] === "string" ? search["dataFinal"] : undefined,
   dataReferencia: search["dataReferencia"] === "recebimento" ? ("recebimento" as const) : undefined,
 }),
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ),context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),context.queryClient.ensureQueryData(appQueries.clientesQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Pedidos — Doce Gestão" },
      { name: "description", content: "Lista e busca de encomendas." },
      { property: "og:title", content: "Pedidos — Doce Gestão" },
      { property: "og:description", content: "Lista e busca de encomendas." },
    ],
  }),
  component: Pedidos,
});

function normalizarTelefoneWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  const internacional = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return internacional.length >= 12 && internacional.length <= 13 ? internacional : null;
}

function Pedidos() {
  const pedidos = usePedidosCalc();
  const { data: config } = useSuspenseQuery(appQueries.configQ);
  const { data: clientes } = useSuspenseQuery(appQueries.clientesQ);
  const [ocorrenciasPendentes, setOcorrenciasPendentes] = useState<Array<{ id: string; recorrencia_id: string; cliente_id: string; cliente_nome: string; frequencia: "semanal" | "quinzenal" | "mensal"; data_entrega: string; hora_entrega: string | null; itens: Array<{ descricao: string; quantidade: number; preco_unitario: number }>; observacoes: string | null }>>([]);
  const [recorrenciasPorPedido, setRecorrenciasPorPedido] = useState<Record<string, { frequencia: "semanal" | "quinzenal" | "mensal"; proximaEntrega: string | null }>>({});
  useEffect(() => {
    let ativo = true;
    // Os vínculos são carregados separadamente para que uma falha nas tabelas novas nunca derrube a lista normal.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas novas ainda não constam nos tipos gerados.
    const db = supabase as any;
    void Promise.all([
      db.from("pedidos_recorrentes_ocorrencias").select("pedido_id,recorrencia_id,data_entrega,status").order("data_entrega", { ascending: true }),
      db.from("pedidos_recorrentes").select("id,frequencia,cliente_id,hora_entrega"),
      db.from("pedidos_recorrentes_ocorrencias").select("id,recorrencia_id,data_entrega,status,itens,observacoes,pedido_id").eq("status", "pendente").is("pedido_id", null).order("data_entrega", { ascending: true }),
    ]).then(([ocorrenciasResult, recorrenciasResult, pendentesResult]: [
      { data: { pedido_id: string | null; recorrencia_id: string; data_entrega: string; status: string }[] | null; error: { message: string } | null },
      { data: { id: string; frequencia: "semanal" | "quinzenal" | "mensal"; cliente_id: string; hora_entrega: string | null }[] | null; error: { message: string } | null },
      { data: { id: string; recorrencia_id: string; data_entrega: string; status: string; itens: Array<{ descricao: string; quantidade: number; preco_unitario: number }> | null; observacoes: string | null; pedido_id: string | null }[] | null; error: { message: string } | null }
    ]) => {
      if (!ativo) return;
      if (ocorrenciasResult.error || recorrenciasResult.error || pendentesResult.error) {
        console.warn("Não foi possível carregar os vínculos de pedidos recorrentes:", ocorrenciasResult.error?.message ?? recorrenciasResult.error?.message ?? pendentesResult.error?.message);
        return;
      }
      const recorrencias = new Map((recorrenciasResult.data ?? []).map((r) => [r.id, r]));
      const frequencias = new Map((recorrenciasResult.data ?? []).map((r) => [r.id, r.frequencia]));
      const ocorrencias = ocorrenciasResult.data ?? [];
      const porPedido: Record<string, { frequencia: "semanal" | "quinzenal" | "mensal"; proximaEntrega: string | null }> = {};
      for (const ocorrencia of ocorrencias) {
        if (!ocorrencia.pedido_id) continue;
        const frequencia = frequencias.get(ocorrencia.recorrencia_id);
        if (!frequencia) continue;
        const proxima = ocorrencias.find((outra) => outra.recorrencia_id === ocorrencia.recorrencia_id && outra.status !== "cancelada" && outra.data_entrega > ocorrencia.data_entrega);
        porPedido[ocorrencia.pedido_id] = { frequencia, proximaEntrega: proxima?.data_entrega ?? null };
      }
      setRecorrenciasPorPedido(porPedido);
      setOcorrenciasPendentes((pendentesResult.data ?? []).flatMap((o) => {
        const recorrencia = recorrencias.get(o.recorrencia_id);
        const cliente = clientes.find((item) => item.id === recorrencia?.cliente_id);
        if (!recorrencia || !cliente) return [];
        return [{ id: o.id, recorrencia_id: o.recorrencia_id, cliente_id: recorrencia.cliente_id, cliente_nome: cliente.nome, frequencia: recorrencia.frequencia, data_entrega: o.data_entrega, hora_entrega: recorrencia.hora_entrega, itens: o.itens ?? [], observacoes: o.observacoes }];
      }));
    });
    return () => { ativo = false; };
  }, []);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [filtroRecorrencia, setFiltroRecorrencia] = useState<"todos" | "recorrentes" | "nao_recorrentes">("todos");
  const clientesDisponiveis = useMemo(() => {
    const porId = new Map<string, string>();
    pedidos.forEach((p) => {
      const id = p.cliente_id == null ? "" : String(p.cliente_id);
      const nome = p.clientes?.nome?.trim();
      if (id && nome) porId.set(id, nome);
    });
    return [...porId.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  }, [pedidos]);
  const [status, setStatus] = useState<string>(() => {
    const filtro = search.filtro;
    if (!filtro) return "abertos";
    if (filtro === "mes") return "todos";
    if (["abertos", "prontos", "todos", "em_andamento", "atrasados", "entregas_hoje", "a_receber", "recebido", "confirmado", "em_producao", "pronto", "finalizado", "entregue", "cancelado"].includes(filtro)) return filtro;
    return "abertos";
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(Boolean(search.filtro && !["abertos", "prontos", "todos"].includes(search.filtro)));
  const [ordem, setOrdem] = useState<"entrega" | "recebimento">("entrega");
  const hoje = hojeISO();

  const contagens = useMemo(() => ({
    abertos: pedidos.filter((p) => !["pronto", "finalizado", "entregue", "cancelado"].includes(p.status)).length,
    prontos: pedidos.filter((p) => p.status === "pronto").length,
    entregasHoje: pedidos.filter((p) => p.data_entrega === hoje && STATUS_ATIVOS.includes(p.status)).length,
    // Mesmo critério do relatório financeiro e do painel: todos os pedidos não cancelados.
    aReceber: pedidos
      .filter((p) => p.status !== "cancelado")
      .reduce((soma, p) => soma + Math.max(0, Number(p.t.saldo) || 0), 0),
  }), [pedidos, hoje]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (clienteFiltro && String(p.cliente_id ?? "") !== clienteFiltro) return false;
      const ehRecorrente = Boolean(recorrenciasPorPedido[p.id]);
      if (filtroRecorrencia === "recorrentes" && !ehRecorrente) return false;
      if (filtroRecorrencia === "nao_recorrentes" && ehRecorrente) return false;
      if (status === "abertos" && ["pronto", "finalizado", "entregue", "cancelado"].includes(p.status)) return false;
      if (status === "prontos" && p.status !== "pronto") return false;
      if (status === "em_andamento" && !["recebido", "confirmado", "em_producao"].includes(p.status)) return false;
      if (status === "atrasados" && (p.data_entrega >= hoje || ["finalizado", "entregue", "cancelado"].includes(p.status))) return false;
      if (status === "entregas_hoje" && (p.data_entrega !== hoje || !STATUS_ATIVOS.includes(p.status))) return false;
      if (status === "a_receber" && (!STATUS_ATIVOS.includes(p.status) || Number(p.t.saldo) <= 0)) return false;
      if (!["abertos", "prontos", "todos", "em_andamento", "atrasados", "entregas_hoje", "a_receber"].includes(status)) {
        const statusCompativel = status === "entregue"
          ? ["entregue", "finalizado"].includes(p.status)
          : p.status === status;
        if (!statusCompativel) return false;
      }
      if (!q) return true;
      return (
        String(p.numero) === q.replace("#", "") ||
        (p.clientes?.nome ?? "").toLowerCase().includes(q) ||
        (p.observacoes ?? "").toLowerCase().includes(q) ||
        p.pedido_itens.some((i) => i.descricao.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      const dataA = ordem === "entrega" ? (a.data_entrega || "9999-12-31") : (a.created_at ?? "9999-12-31").slice(0, 10);
      const dataB = ordem === "entrega" ? (b.data_entrega || "9999-12-31") : (b.created_at ?? "9999-12-31").slice(0, 10);
      const comparacaoData = dataA.localeCompare(dataB);
      if (comparacaoData !== 0) return comparacaoData;
      if (ordem === "entrega") return (a.hora_entrega ?? "23:59").localeCompare(b.hora_entrega ?? "23:59");
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
  }, [pedidos, busca, clienteFiltro, filtroRecorrencia, recorrenciasPorPedido, status, ordem, hoje]);

  function exportar() {
    baixarCSV(
      `pedidos-${hoje}`,
      ["Nº", "Cliente", "Entrega", "Status", "Pagamento", "Itens", "Valor vendido", "Custo", "Taxas", "Lucro bruto", "Lucro líquido", "Entrada", "Recebido", "Saldo", "Observações"],
      lista.map((p) => [
        p.numero,
        p.clientes?.nome ?? "",
        dataBR(p.data_entrega),
        statusLabel(p.status),
        formaLabel(p.forma_pagamento),
        p.pedido_itens.map((i) => `${Number(i.quantidade)}x ${i.descricao}`).join(", "),
        +p.t.venda.toFixed(2),
        +p.t.custo.toFixed(2),
        +p.t.taxas.toFixed(2),
        +p.t.lucroBruto.toFixed(2),
        +p.t.lucroLiquido.toFixed(2),
        Number(p.valor_entrada),
        +p.t.recebido.toFixed(2),
        +p.t.saldo.toFixed(2),
        p.observacoes ?? "",
      ]),
    );
  }

  const filtrosAvancados = [
    { value: "em_andamento", label: "Recebidos e em produção" },
    { value: "atrasados", label: "Atrasados" },
    { value: "entregas_hoje", label: "Entregas de hoje" },
    { value: "a_receber", label: "Com saldo a receber" },
    ...STATUS.filter((item) => item.value !== "pronto"),
    { value: "confirmado", label: "Confirmado" },
    { value: "finalizado", label: "Finalizado" },
    { value: "cancelado", label: "Cancelado" },
  ];

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle={`${lista.length} encontrado(s)`}
        action={
          <div className="mt-1 flex gap-2">
            <Button asChild size="sm" variant="outline" className="h-9"><Link to="/pedidos-recorrentes"><Repeat className="size-4" /> Recorrências</Link></Button>
            <Button size="icon" variant="outline" onClick={exportar} aria-label="Exportar CSV">
              <Download className="size-4" />
            </Button>
            <Button asChild size="sm" className="h-9">
              <Link to="/pedidos/$id" params={{ id: "novo" }}>
                <Plus className="size-4" /> Novo
              </Link>
            </Button>
          </div>
        }
      />
      <div className="relative mb-4">
        <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
        <Input placeholder="Buscar por nº, cliente ou produto" aria-label="Buscar por número, cliente ou produto" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-11 bg-card pl-9" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <button type="button" onClick={() => setStatus("abertos")} aria-pressed={status === "abertos"} className={cn("rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", status === "abertos" && "border-primary ring-1 ring-primary/20")}>
          <span className="block text-xs font-medium text-muted-foreground">Em aberto</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{contagens.abertos}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Precisam de atenção</span>
        </button>
        <button type="button" onClick={() => setStatus("prontos")} aria-pressed={status === "prontos"} className={cn("rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", status === "prontos" && "border-primary ring-1 ring-primary/20")}>
          <span className="block text-xs font-medium text-muted-foreground">Prontos</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{contagens.prontos}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Aguardando entrega</span>
        </button>
        <button type="button" onClick={() => setStatus("entregas_hoje")} aria-pressed={status === "entregas_hoje"} className={cn("rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", status === "entregas_hoje" && "border-primary ring-1 ring-primary/20")}>
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><CalendarClock className="size-3.5" /> Entregas de hoje</span>
          <span className="mt-1 block text-2xl font-bold tabular-nums">{contagens.entregasHoje}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Ainda não entregues</span>
        </button>
        <button type="button" onClick={() => setStatus("a_receber")} aria-pressed={status === "a_receber"} className={cn("rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", status === "a_receber" && "border-primary ring-1 ring-primary/20")}>
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Wallet className="size-3.5" /> A receber</span>
          <span className="mt-1 block text-xl font-bold tabular-nums">{brl(contagens.aReceber)}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Saldo dos pedidos ativos</span>
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filtrar por recorrência">
        {[
          { value: "todos", label: "Todos os pedidos" },
          { value: "recorrentes", label: "↻ Recorrentes" },
          { value: "nao_recorrentes", label: "Não recorrentes" },
        ].map((f) => (
          <button key={f.value} type="button" onClick={() => setFiltroRecorrencia(f.value as typeof filtroRecorrencia)} aria-pressed={filtroRecorrencia === f.value} className={cn("rounded-full border px-3 py-2 text-sm font-medium transition-colors", filtroRecorrencia === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            {f.label}
          </button>
        ))}
      </div>


      {filtroRecorrencia !== "nao_recorrentes" && ocorrenciasPendentes.filter((o) => {
        if (clienteFiltro && o.cliente_id !== clienteFiltro) return false;
        const q = busca.trim().toLowerCase();
        return !q || o.cliente_nome.toLowerCase().includes(q) || o.itens.some((i) => i.descricao.toLowerCase().includes(q));
      }).length > 0 && (
        <section className="mb-4 space-y-2" aria-label="Entregas recorrentes aguardando confirmação">
          <h2 className="font-semibold">Recorrentes · Aguardando confirmação</h2>
          {ocorrenciasPendentes.filter((o) => {
            if (clienteFiltro && o.cliente_id !== clienteFiltro) return false;
            const q = busca.trim().toLowerCase();
            return !q || o.cliente_nome.toLowerCase().includes(q) || o.itens.some((i) => i.descricao.toLowerCase().includes(q));
          }).map((o) => (
            <Card key={o.id} className="border-dashed border-primary/40 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 font-semibold">{o.cliente_nome}</div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-1 text-xs font-bold"><Repeat className="size-3" /> Aguardando confirmação</span>
              </div>
              <div className="mt-1 text-xs font-medium text-primary">
                {(o.frequencia === "semanal" ? "Semanal" : o.frequencia === "quinzenal" ? "Quinzenal" : "Mensal") + " · Entrega: " + dataBR(o.data_entrega) + " " + (o.hora_entrega ?? "")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {o.itens.length ? o.itens.map((i) => Number(i.quantidade) + "× " + i.descricao).join(", ") : "Itens ainda não configurados"}
              </div>
              {o.observacoes && <div className="mt-1 text-xs text-muted-foreground">{o.observacoes}</div>}
              <div className="mt-3 border-t pt-3">
                <Button asChild size="sm" variant="outline"><Link to="/pedidos-recorrentes">Configurar e confirmar entrega</Link></Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[
          { value: "abertos", label: "Em aberto" },
          { value: "prontos", label: "Prontos" },
          { value: "todos", label: "Todos" },
        ].map((f) => (
          <button key={f.value} type="button" onClick={() => setStatus(f.value)} aria-pressed={status === f.value} className={cn("rounded-full border px-3 py-2 text-sm font-medium transition-colors", status === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            {f.label}
          </button>
        ))}
        <Button type="button" variant="outline" size="sm" aria-expanded={mostrarFiltros} onClick={() => setMostrarFiltros((v) => !v)} className="h-9">
          <SlidersHorizontal className="size-4" /> Filtros <ChevronDown className={cn("size-4 transition-transform", mostrarFiltros && "rotate-180")} />
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm font-medium">Organizar pedidos por</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={ordem === "entrega" ? "default" : "outline"} aria-pressed={ordem === "entrega"} onClick={() => setOrdem("entrega")} className="flex-1 sm:flex-none">Ordem de entrega</Button>
          <Button type="button" size="sm" variant={ordem === "recebimento" ? "default" : "outline"} aria-pressed={ordem === "recebimento"} onClick={() => setOrdem("recebimento")} className="flex-1 sm:flex-none">Ordem de recebimento</Button>
        </div>
      </div>

      {mostrarFiltros && (
        <Card className="mb-4 space-y-3 p-3">
          <label className="block space-y-1 text-sm font-medium">
            <span>Cliente</span>
            <select aria-label="Filtrar pedidos por cliente" value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal">
              <option value="">Todos os clientes</option>
              {clientesDisponiveis.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Status do pedido</span>
            <select aria-label="Status do pedido" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal">
              <option value="abertos">Em aberto</option>
              <option value="prontos">Prontos</option>
              <option value="todos">Todos os pedidos</option>
              {filtrosAvancados.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">{lista.length} pedido(s) encontrado(s)</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setStatus("abertos"); setBusca(""); setClienteFiltro(""); setFiltroRecorrencia("todos"); }}>
              Limpar filtros
            </Button>
          </div>
        </Card>
      )}
      {lista.length === 0 ? (
        <Empty>Nenhum pedido encontrado.</Empty>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => {
            const atrasado = p.data_entrega < hoje && !["finalizado", "entregue", "cancelado"].includes(p.status);
            const telefoneWhatsApp = normalizarTelefoneWhatsApp(p.clientes?.telefone);
            const infoRecorrencia = recorrenciasPorPedido[p.id];
            const itensRecibo = p.pedido_itens.map((item) =>
              `• ${Number(item.quantidade)} × ${item.descricao} — ${brl(Number(item.quantidade) * Number(item.preco_unitario))}`
            );
            const textoRecibo = [
              "O CASAL DO BOLO — Amor em cada pedaço",
              `RECIBO DO PEDIDO #${p.numero}`,
              `Cliente: ${p.clientes?.nome ?? "Cliente"}`,
              "",
              "Itens:",
              ...(itensRecibo.length ? itensRecibo : ["• Itens não informados"]),
              "",
              `Entrega: ${dataBR(p.data_entrega)}${p.hora_entrega ? ` às ${p.hora_entrega}` : ""}`,
              `Total do pedido: ${brl(p.t.venda)}`,
              `Valor recebido: ${brl(p.t.recebido)}`,
              `Saldo restante: ${brl(p.t.saldo)}`,
              ...(config.pix_chave?.trim() ? [`Chave Pix: ${config.pix_chave.trim()}`] : ["Chave Pix: entre em contato para confirmar os dados de pagamento."]),
              "",
              "Obrigado pela preferência! 💛",
            ].join("\n");
            const podeEmitirRecibo = ["pronto", "entregue", "finalizado"].includes(p.status);
            return (
              <Card
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`Abrir pedido #${p.numero} de ${p.clientes?.nome ?? "cliente sem nome"}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
                  void navigate({ to: "/pedidos/$id", params: { id: p.id } });
                }}
                onKeyDown={(e) => {
                  if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void navigate({ to: "/pedidos/$id", params: { id: p.id } });
                  }
                }}
                className="cursor-pointer p-3.5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 font-semibold">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {infoRecorrencia && <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-bold text-primary"><Repeat className="size-3" /> Recorrente</span>}
                      {p.t.venda > 0 && p.t.saldo <= 0 && <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Pago</span>}
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  {infoRecorrencia && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-primary">
                    <span>{infoRecorrencia.frequencia === "semanal" ? "Semanal" : infoRecorrencia.frequencia === "quinzenal" ? "Quinzenal" : "Mensal"}</span>
                    {infoRecorrencia.proximaEntrega && <span>· Próxima entrega: {dataBR(infoRecorrencia.proximaEntrega)}</span>}
                  </div>}
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {p.pedido_itens.map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ") || "Sem itens"}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className={cn("min-w-0", ordem === "entrega" && atrasado && "font-semibold text-destructive")}>
                      {ordem === "entrega" ? (
                        <>{atrasado ? "Atrasado · " : "Entrega: "}{dataBR(p.data_entrega)} {p.hora_entrega ?? ""}</>
                      ) : (
                        <>
                          <span className="block">Recebido: {p.created_at ? dataBR(p.created_at.slice(0, 10)) : "Data indisponível"}</span>
                          <span className={cn("block text-xs", atrasado && "font-semibold text-destructive")}>{atrasado ? "Entrega atrasada · " : "Entrega: "}{dataBR(p.data_entrega)} {p.hora_entrega ?? ""}</span>
                        </>
                      )}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{brl(p.t.venda)}</span>
                  </div>
                  {p.t.saldo > 0 && <div className="mt-0.5 text-right text-xs text-warning-foreground">Falta receber {brl(p.t.saldo)}</div>}
                  <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                    {podeEmitirRecibo && (
                      <Button type="button" size="sm" variant="outline" onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await navigator.clipboard.writeText(textoRecibo);
                          toast.success("Recibo copiado. Você já pode colá-lo na conversa com o cliente.");
                        } catch {
                          toast.error("Não foi possível copiar o recibo neste dispositivo.");
                        }
                      }}>
                        <ReceiptText className="size-4" /> Copiar recibo
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={(e) => {
                      e.stopPropagation();
                      if (!telefoneWhatsApp) {
                        toast.error(p.clientes?.telefone ? "O telefone cadastrado não parece válido para o WhatsApp." : "Cadastre o telefone do cliente para abrir o WhatsApp.");
                        return;
                      }
                      const mensagem = podeEmitirRecibo
                        ? textoRecibo
                        : `Olá ${p.clientes?.nome ?? ""}! Estou entrando em contato sobre o pedido #${p.numero} da O Casal do Bolo.`;
                      window.open(`https://wa.me/${telefoneWhatsApp}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
                    }}>
                      <MessageCircle className="size-4" /> {podeEmitirRecibo ? "Enviar recibo no WhatsApp" : "WhatsApp do cliente"}
                    </Button>
                  </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
