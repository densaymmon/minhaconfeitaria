import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, AlertTriangle } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { useSuspenseQuery } from "@tanstack/react-query";
import { brl, dataCurta, hojeISO, mesISO } from "@/lib/format";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/painel")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ),context.queryClient.ensureQueryData(appQueries.despesasQ),context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
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
  const { data: pagamentosPedidos } = useSuspenseQuery(appQueries.pedidoPagamentosQ);
  const hoje = hojeISO();
  const mes = mesISO();
  const primeiroDiaMes = `${mes}-01`;
  const ultimoDiaMes = format(endOfMonth(new Date()), "yyyy-MM-dd");

  // "Pedidos feitos" usa a data de cadastro do pedido (created_at), não a data de entrega.
  // Pedidos cancelados ficam fora dos indicadores comerciais.
  const pedidosCriadosNoMes = pedidos.filter((pedido) => {
    const dataCriacao = String(pedido.created_at ?? "").slice(0, 10);
    return pedido.status !== "cancelado" && dataCriacao >= primeiroDiaMes && dataCriacao <= ultimoDiaMes;
  });
  const valorPedidosCriadosNoMes = pedidosCriadosNoMes.reduce(
    (soma, pedido) => soma + Math.max(0, Number(pedido.t.venda) || 0),
    0,
  );

  // Recebimento mensal usa apenas movimentos com data individual confirmada.
  // Não atribui pagamentos antigos sem data a um mês fictício.
  const totalRecebidoNoMes = pagamentosPedidos
    .filter((pagamento) =>
      pagamento.data_pagamento >= primeiroDiaMes &&
      pagamento.data_pagamento <= ultimoDiaMes &&
      pedidos.some((pedido) => pedido.id === pagamento.pedido_id && pedido.status !== "cancelado"),
    )
    .reduce((soma, pagamento) => soma + Math.max(0, Number(pagamento.valor) || 0), 0);

  // Saldo a receber limitado aos pedidos criados neste mês, sem incluir cancelados.
  const pedidosAReceberNoMes = pedidosCriadosNoMes.reduce(
    (soma, pedido) => soma + Math.max(0, Number(pedido.t.saldo) || 0),
    0,
  );
  const atrasados = pedidos.filter((p) => p.data_entrega < hoje && !["finalizado", "entregue", "cancelado"].includes(p.status)).length;

  const proximas = pedidos
    .filter((p) => p.data_entrega >= hoje && !["finalizado", "entregue", "cancelado"].includes(p.status))
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || (a.hora_entrega ?? "").localeCompare(b.hora_entrega ?? ""))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Olá! 👩‍🍳"
        subtitle={format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        action={
          <Button asChild size="sm" className="mt-1">
            <Link to="/pedidos/$id" params={{ id: "novo" }}>
              <Plus className="size-4" /> Pedido
            </Link>
          </Button>
        }
      />

      <section aria-label="Resumo financeiro do mês" className="mb-4">
        <div className="mb-3 text-xs text-muted-foreground">
          Movimento de {format(new Date(), "MMMM yyyy", { locale: ptBR })}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            to="/relatorios"
            search={{ inicio: primeiroDiaMes, fim: ultimoDiaMes, secao: "vendas", dataBase: "criacao" }}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver relatório dos pedidos feitos no mês: ${brl(valorPedidosCriadosNoMes)}`}
          >
            <Card className="h-full transition-colors hover:bg-muted/60">
              <div className="text-sm text-muted-foreground">Pedidos feitos no mês</div>
              <div className="mt-1 font-display text-2xl font-semibold">{brl(valorPedidosCriadosNoMes)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{pedidosCriadosNoMes.length} pedido(s) · pelo cadastro</div>
              <div className="mt-3 text-sm font-medium text-primary">Detalhar no financeiro →</div>
            </Card>
          </Link>
          <Link
            to="/relatorios"
            search={{ inicio: primeiroDiaMes, fim: ultimoDiaMes, secao: "caixa", dataBase: "entrega" }}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver relatório de recebimentos do mês: ${brl(totalRecebidoNoMes)}`}
          >
            <Card className="h-full transition-colors hover:bg-muted/60">
              <div className="text-sm text-muted-foreground">Pedidos pagos / recebido no mês</div>
              <div className="mt-1 font-display text-2xl font-semibold">{brl(totalRecebidoNoMes)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Pagamentos pela data em que entraram</div>
              <div className="mt-3 text-sm font-medium text-primary">Detalhar no financeiro →</div>
            </Card>
          </Link>
          <Link
            to="/relatorios"
            search={{ inicio: primeiroDiaMes, fim: ultimoDiaMes, secao: "contas", dataBase: "criacao" }}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver relatório dos valores a receber dos pedidos do mês: ${brl(pedidosAReceberNoMes)}`}
          >
            <Card className="h-full transition-colors hover:bg-muted/60">
              <div className="text-sm text-muted-foreground">A receber dos pedidos do mês</div>
              <div className="mt-1 font-display text-2xl font-semibold">{brl(pedidosAReceberNoMes)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Saldo dos pedidos não cancelados</div>
              <div className="mt-3 text-sm font-medium text-primary">Detalhar no financeiro →</div>
            </Card>
          </Link>
        </div>
      </section>

      <Link to="/pedidos" search={{ filtro: "mes", dataInicial: primeiroDiaMes, dataFinal: ultimoDiaMes }} className="mb-4 block">
        <Card className="flex items-center justify-between gap-3 transition-colors hover:bg-muted/60">
          <div>
            <div className="text-sm text-muted-foreground">Pedidos com entrega neste mês</div>
            <div className="mt-1 font-display text-3xl font-semibold">
              {pedidos.filter((p) => p.status !== "cancelado" && p.data_entrega >= primeiroDiaMes && p.data_entrega <= ultimoDiaMes).length}
            </div>
          </div>
          <div className="text-right text-sm font-medium text-primary">Ver entregas<br />do mês →</div>
        </Card>
      </Link>

      {atrasados > 0 && (
        <Link to="/producao" className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <AlertTriangle className="size-4" /> {atrasados} pedido(s) atrasado(s) — ver produção
        </Link>
      )}



      <h2 className="mb-2 text-lg font-semibold">Próximas entregas</h2>
      {proximas.length === 0 ? (
        <Empty>Nenhuma entrega agendada.</Empty>
      ) : (
        <div className="space-y-2">
          {proximas.map((p) => (
            <Link key={p.id} to="/pedidos/$id" params={{ id: p.id }} className="block">
              <Card className="flex items-center gap-3 p-3">
                <div className="w-16 shrink-0 text-center">
                  <div className="text-xs capitalize text-muted-foreground">{dataCurta(p.data_entrega).split(",")[0]}</div>
                  <div className="font-display text-lg font-semibold">{p.data_entrega.slice(8, 10)}/{p.data_entrega.slice(5, 7)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">#{p.numero} · {p.clientes?.nome ?? "Sem cliente"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.hora_entrega ? `${p.hora_entrega} · ` : ""}
                    {p.pedido_itens.map((i) => `${Number(i.quantidade)}× ${i.descricao}`).join(", ")}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
