import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, AlertTriangle } from "lucide-react";
import { despesasQ } from "@/lib/queries";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, dataCurta, hojeISO, mesISO } from "@/lib/format";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
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
  const { data: despesas } = useSuspenseQuery(despesasQ);
  const hoje = hojeISO();
  const mes = mesISO();
  const ativos = pedidos.filter((p) => p.status !== "cancelado");
  const doMes = ativos.filter((p) => p.data_entrega.startsWith(mes));
  const doDia = ativos.filter((p) => p.data_entrega === hoje);
  const conta = (s: string[]) => pedidos.filter((p) => s.includes(p.status)).length;

  const faturamento = doMes.reduce((s, p) => s + p.t.venda, 0);
  const despesasMes = despesas.filter((d) => d.data.startsWith(mes)).reduce((s, d) => s + Number(d.valor), 0);
  const custos = doMes.reduce((s, p) => s + p.t.custo + p.t.taxas, 0) + despesasMes;
  const lucro = faturamento - custos;
  const atrasados = pedidos.filter((p) => p.data_entrega < hoje && !["entregue", "cancelado"].includes(p.status)).length;

  const proximas = pedidos
    .filter((p) => p.data_entrega >= hoje && !["entregue", "cancelado"].includes(p.status))
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
        <div className="text-xs opacity-80">Resultado de {format(new Date(), "MMMM", { locale: ptBR })}</div>
        <div className="mt-1 font-display text-3xl font-semibold">{brl(lucro)}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs opacity-75">Faturamento</div>
            <div className="font-semibold">{brl(faturamento)}</div>
          </div>
          <div>
            <div className="text-xs opacity-75">Custos + despesas</div>
            <div className="font-semibold">{brl(custos)}</div>
          </div>
        </div>
      </Card>

      {atrasados > 0 && (
        <Link to="/producao" className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <AlertTriangle className="size-4" /> {atrasados} pedido(s) atrasado(s) — ver produção
        </Link>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Entregas hoje" value={doDia.length} />
        <Stat label="Pedidos no mês" value={doMes.length} />
        <Stat label="Aguardando produção" value={conta(["recebido", "confirmado"])} />
        <Stat label="Em produção" value={conta(["em_producao"])} tone="primary" />
        <Stat label="Prontos" value={conta(["pronto"])} tone="success" />
        <Stat label="Entregues no mês" value={doMes.filter((p) => p.status === "entregue").length} />
      </div>

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
