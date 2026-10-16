import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { configQ, insumosQ, pedidosQ, pedidoPagamentosQ, produtosQ, type Pedido } from "./queries";
import { custoUnitario, totaisPedido } from "./calc";

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

export function usePedidosCalc(): PedidoCalc[] {
  const { data: pedidos } = useSuspenseQuery(pedidosQ);
  const { data: config } = useSuspenseQuery(configQ);
  const { data: pagamentos } = useSuspenseQuery(pedidoPagamentosQ);
  return useMemo(() => {
    const pagosPorPedido = new Map<string, number>();
    for (const pagamento of pagamentos) {
      pagosPorPedido.set(pagamento.pedido_id, (pagosPorPedido.get(pagamento.pedido_id) ?? 0) + Math.max(0, Number(pagamento.valor) || 0));
    }
    return pedidos.map((pedido) => {
      const totais = totaisPedido(pedido, config);
      // valor_entrada guarda o total acumulado no formulário; o histórico pode
      // conter os mesmos pagamentos ou apenas os registrados detalhadamente.
      // Usar o maior valor evita ignorar recebimentos e também somá-los duas vezes.
      const recebido = Math.min(totais.venda, Math.max(totais.recebido, pagosPorPedido.get(pedido.id) ?? 0));
      const saldo = pedido.status === "cancelado" || pedido.saldo_quitado
        ? 0
        : Math.max(0, totais.venda - recebido);
      return { ...pedido, t: { ...totais, recebido, saldo } };
    });
  }, [pedidos, config, pagamentos]);
}
