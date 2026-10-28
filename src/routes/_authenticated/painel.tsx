import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, CalendarDays, CalendarRange, CircleDollarSign, Clock3, Plus, Wallet } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, dataCurta, hojeISO, mesISO } from "@/lib/format";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { PainelHoje } from "@/components/app/painel-hoje";
import { AlertaMargens, MetaDoMes } from "@/components/app/painel-gestao";
import { useRecurso } from "@/components/app/plano";
import { saudacao } from "@/lib/hoje";
import { endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/painel")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.despesasQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.produtosQ),
      context.queryClient.ensureQueryData(appQueries.insumosQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
  notFoundComponent: () => <p>Registro não encontrado.</p>,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Painel — Doce Gestão" },
      { name: "description", content: "Resumo do dia e do mês da confeitaria." },
      { property: "og:title", content: "Painel — Doce Gestão" },
      { property: "og:description", content: "Resumo do dia e do mês da confeitaria." },
    ],
  }),
  component: Painel,
});

function Painel() {
  const pedidos = usePedidosCalc();
  const temCustos = useRecurso("custos");
  const hoje = hojeISO();
  const mes = mesISO();
  const primeiroDiaMes = `${mes}-01`;
  const ultimoDiaMes = format(endOfMonth(new Date()), "yyyy-MM-dd");

  // Mantém os mesmos critérios de cálculo e filtros já usados pelo painel e relatório.
  const pedidosDoMes = pedidos.filter((pedido) =>
    pedido.status !== "cancelado" &&
    pedido.data_entrega >= primeiroDiaMes &&
    pedido.data_entrega <= ultimoDiaMes,
  );
  const valorPedidosDoMes = pedidosDoMes.reduce(
    (soma, pedido) => soma + Math.max(0, Number(pedido.t.venda) || 0),
    0,
  );
  const recebidoDosPedidosNoMes = pedidosDoMes.reduce(
    (soma, pedido) => soma + Math.max(0, Number(pedido.t.recebido) || 0),
    0,
  );
  const pedidosAReceberNoMes = pedidosDoMes.reduce(
    (soma, pedido) => soma + Math.max(0, Number(pedido.t.saldo) || 0),
    0,
  );
  const totalEntregasMes = pedidos.filter((p) =>
    p.status !== "cancelado" && p.data_entrega >= primeiroDiaMes && p.data_entrega <= ultimoDiaMes,
  ).length;
  const atrasados = pedidos.filter((p) =>
    p.data_entrega < hoje && !["finalizado", "entregue", "cancelado"].includes(p.status),
  ).length;

  const proximas = pedidos
    .filter((p) => p.data_entrega >= hoje && !["finalizado", "entregue", "cancelado"].includes(p.status))
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (a.hora_entrega ?? "").localeCompare(b.hora_entrega ?? ""))
    .slice(0, 6);

  const indicadores = [
    {
      titulo: "Valor dos pedidos",
      valor: brl(valorPedidosDoMes),
      detalhe: `${pedidosDoMes.length} pedido(s) · pela data de entrega`,
      icone: CalendarRange,
      secao: "visao-geral" as const,
      aria: `Ver relatório dos pedidos do mês: ${brl(valorPedidosDoMes)}`,
    },
    {
      titulo: "Recebido dos pedidos",
      valor: brl(recebidoDosPedidosNoMes),
      detalhe: "Recebimentos consolidados dos pedidos com entrega neste mês",
      icone: CircleDollarSign,
      secao: "vendas" as const,
      aria: `Ver relatório do valor recebido nos pedidos do mês: ${brl(recebidoDosPedidosNoMes)}`,
    },
    {
      titulo: "A receber",
      valor: brl(pedidosAReceberNoMes),
      detalhe: "Saldo dos pedidos com entrega neste mês",
      icone: Wallet,
      secao: "contas" as const,
      aria: `Ver relatório dos valores a receber dos pedidos do mês: ${brl(pedidosAReceberNoMes)}`,
    },
  ];

  return (
    <>
      <PageHeader
        title={`${saudacao(new Date().getHours())}! 👩‍🍳`}
        subtitle={format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        action={
          <Button asChild size="sm" className="mt-1 h-9 gap-1.5">
            <Link to="/pedidos/$id" params={{ id: "novo" }}>
              <Plus className="size-4" /> Novo pedido
            </Link>
          </Button>
        }
      />

      <PainelHoje />
      <MetaDoMes vendido={valorPedidosDoMes} />
      {temCustos && <AlertaMargens />}

      <section aria-label="Resumo financeiro do mês" className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <CircleDollarSign className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Resumo financeiro</h2>
            <p className="text-xs capitalize text-muted-foreground">{format(new Date(), "MMMM yyyy", { locale: ptBR })}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {indicadores.map((item) => {
            const Icone = item.icone;
            return (
              <Link
                key={item.titulo}
                to="/relatorios"
                search={{ inicio: primeiroDiaMes, fim: ultimoDiaMes, secao: item.secao, dataBase: "entrega" }}
                className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={item.aria}
              >
                <Card className="h-full border border-border/70 p-4 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-muted-foreground">{item.titulo}</div>
                      <div className="mt-2 font-display text-2xl font-bold tracking-tight tabular-nums sm:text-[1.7rem]">{item.valor}</div>
                    </div>
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icone className="size-5" />
                    </div>
                  </div>
                  <p className="mt-2 min-h-8 text-xs leading-4 text-muted-foreground">{item.detalhe}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3 text-xs font-semibold text-primary">
                    <span>Ver no financeiro</span>
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <Link
        to="/pedidos"
        search={{ filtro: "mes", dataInicial: primeiroDiaMes, dataFinal: ultimoDiaMes }}
        className="group mb-5 block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Card className="flex items-center justify-between gap-4 border border-border/70 p-4 transition-colors group-hover:border-primary/40 group-hover:bg-muted/30 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">Entregas deste mês</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Pedidos totais no mês</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-display text-3xl font-bold tabular-nums">{totalEntregasMes}</span>
            <ArrowUpRight className="size-4 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        </Card>
      </Link>

      {atrasados > 0 && (
        <Link
          to="/producao"
          className="mb-5 flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm transition-colors hover:bg-destructive/10"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-destructive">{atrasados} pedido(s) atrasado(s)</div>
            <p className="mt-0.5 text-xs text-muted-foreground">Confira os prazos na tela de produção.</p>
          </div>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-destructive" />
        </Link>
      )}

      <section aria-label="Próximas entregas" className="pb-2">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Clock3 className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Próximas entregas</h2>
            <p className="text-xs text-muted-foreground">{proximas.length ? `${proximas.length} próxima(s) encomenda(s)` : "Sua agenda de entregas"}</p>
          </div>
        </div>
        {proximas.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5 text-center"><p className="text-sm text-muted-foreground">Nenhuma entrega agendada.</p><p className="mt-1 text-xs text-muted-foreground">Cadastre um pedido para organizar a próxima entrega.</p><Button asChild size="sm" className="mt-3"><Link to="/pedidos/$id" params={{ id: "novo" }}><Plus className="size-4" /> Novo pedido</Link></Button></div>
        ) : (
          <div className="space-y-2">
            {proximas.map((p) => (
              <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="flex items-center gap-3 border border-border/70 p-3 transition-colors group-hover:border-primary/40 group-hover:bg-muted/30 sm:gap-4 sm:p-4">
                  <div className="flex w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-xl bg-muted/60 px-2 py-2.5 text-center">
                    <div className="text-[11px] font-medium capitalize text-muted-foreground">{dataCurta(p.data_entrega).split(",")[0]}</div>
                    <div className="font-display text-lg font-bold tabular-nums">{p.data_entrega.slice(8, 10)}/{p.data_entrega.slice(5, 7)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">
                      {p.hora_entrega ? `${p.hora_entrega} · ` : ""}
                      {p.pedido_itens.map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusBadge status={p.status} />
                    <ArrowUpRight className="hidden size-4 text-muted-foreground transition-colors group-hover:text-primary sm:block" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
