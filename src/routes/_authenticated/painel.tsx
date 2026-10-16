import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, AlertTriangle } from "lucide-react";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, dataCurta, hojeISO, mesISO } from "@/lib/format";
import { Card, Empty, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/painel")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ),context.queryClient.ensureQueryData(appQueries.despesasQ)]); },
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
  const hoje = hojeISO();
  const mes = mesISO();
  const ativos = pedidos.filter((p) => p.status !== "cancelado");
  const doMes = ativos.filter((p) => p.data_entrega.startsWith(mes));
  const primeiroDiaMes = `${mes}-01`;
  const ultimoDiaMes = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const valorEmCaixa = doMes
    .filter((p) => p.t.venda > 0 && p.t.saldo <= 0)
    .reduce((s, p) => s + p.t.venda, 0);
  // Mantém o mesmo critério do relatório financeiro: saldo de todos os pedidos não cancelados, sem limitar pela data de entrega ou status operacional.
  const pedidosAReceber = ativos.reduce((s, p) => s + Math.max(0, Number(p.t.saldo) || 0), 0);
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

      <Card className="mb-4 bg-hero text-primary-foreground">
        <div className="text-xs opacity-80">Resultado do mês · {format(new Date(), "MMMM", { locale: ptBR })}</div>
        <div className="mt-1 text-sm opacity-80">Saldo</div>
        <div className="mt-1 font-display text-3xl font-semibold">{brl(valorEmCaixa)}</div>
        <div className="mt-4 border-t border-primary-foreground/20 pt-3">
          <div className="text-xs opacity-75">Valores a receber</div>
          <Link
            to="/pedidos"
            search={{ filtro: "em_andamento", dataInicial: undefined, dataFinal: undefined }}
            className="mt-1 flex items-center justify-between gap-3 rounded-lg py-1 font-semibold hover:opacity-80"
          >
            <span className="text-2xl">{brl(pedidosAReceber)}</span>
            <span className="text-sm underline underline-offset-4">Ver pedidos <span aria-hidden="true">→</span></span>
          </Link>
          <p className="text-xs opacity-75">Saldo pendente de todos os pedidos não cancelados</p>
        </div>
      </Card>

      <Link to="/pedidos" search={{ filtro: "mes", dataInicial: primeiroDiaMes, dataFinal: ultimoDiaMes }} className="mb-4 block">
        <Card className="flex items-center justify-between gap-3 transition-colors hover:bg-muted/60">
          <div>
            <div className="text-sm text-muted-foreground">Total de pedidos no mês</div>
            <div className="mt-1 font-display text-3xl font-semibold">{doMes.length}</div>
          </div>
          <div className="text-right text-sm font-medium text-primary">Ver todos<br />do mês →</div>
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
