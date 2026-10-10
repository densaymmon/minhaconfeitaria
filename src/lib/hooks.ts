import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { configQ, insumosQ, pedidosQ, produtosQ, type Pedido } from "./queries";
import { custoUnitario, totaisPedido } from "./calc";

export function useCustos() {
  const { data: produtos } = useSuspenseQuery(produtosQ);
  const { data: insumos } = useSuspenseQuery(insumosQ);
  return useMemo(() => {
    const mapIns = new Map(insumos.map((i) => [i.id, { id: i.id, preco_unidade: Number(i.preco_unidade) }]));
    const custo = new Map<string, number>();
    for (const p of produtos) custo.set(p.id, custoUnitario(p, p.receita_itens, mapIns));
    return { produtos, insumos, mapIns, custo };
  }, [produtos, insumos]);
}

export type PedidoCalc = Pedido & { t: ReturnType<typeof totaisPedido> };

export function usePedidosCalc(): PedidoCalc[] {
  const { data: pedidos } = useSuspenseQuery(pedidosQ);
  const { data: config } = useSuspenseQuery(configQ);
  return useMemo(() => pedidos.map((p) => ({ ...p, t: totaisPedido(p, config) })), [pedidos, config]);
}
