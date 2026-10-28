import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { configQ, insumosQ, pedidosHistoricoQ, pedidosQ, pedidoPagamentosQ, produtosQ, type Pedido } from "./queries";
import { calcularRecebimentoPedido, custoUnitario, totaisPedido } from "./calc";

export function useCustos() {
  const { data: produtos } = useSuspenseQuery(produtosQ);
  const { data: insumos } = useSuspenseQuery(insumosQ);
  return useMemo(() => {
    const mapIns = new Map(insumos.map((i) => [i.id, { ...i, preco_unidade: Number(i.preco_unidade) }]));
    const custo = new Map<string, number>();
    for (const p of produtos) custo.set(p.id, custoUnitario(p, p.receita_itens, mapIns));
    return { produtos, insumos, mapIns, custo };
  }, [produtos, insumos]);
}

export type PedidoCalc = Pedido & { t: ReturnType<typeof totaisPedido> };

/**
 * Pedidos com totais calculados. "recentes" (padrão) traz os em aberto e os dos últimos
 * 90 dias, para as telas do dia a dia; "historico" traz todos.
 */
export function usePedidosCalc(escopo: "recentes" | "historico" = "recentes"): PedidoCalc[] {
  const { data: pedidos } = useSuspenseQuery(escopo === "historico" ? pedidosHistoricoQ : pedidosQ);
  const { data: config } = useSuspenseQuery(configQ);
  const { data: pagamentos } = useSuspenseQuery(pedidoPagamentosQ);
  return useMemo(() => {
    const pagosPorPedido = new Map<string, number>();
    for (const pagamento of pagamentos) {
      pagosPorPedido.set(pagamento.pedido_id, (pagosPorPedido.get(pagamento.pedido_id) ?? 0) + Math.max(0, Number(pagamento.valor) || 0));
    }
    return pedidos.map((pedido) => {
      const totais = totaisPedido(pedido, config);
      const recebimento = calcularRecebimentoPedido({
        venda: totais.venda,
        status: pedido.status,
        saldo_quitado: pedido.saldo_quitado,
        valor_entrada: totais.recebido,
        pagamentosDetalhados: pagosPorPedido.get(pedido.id) ?? 0,
      });
      return { ...pedido, t: { ...totais, ...recebimento } };
    });
  }, [pedidos, config, pagamentos]);
}
