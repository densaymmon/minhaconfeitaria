import { describe, expect, it } from "vitest";
import { deslocarMes, nomeBase, nomeMes, resumoDoMes, variacao, type PedidoMes } from "./resumo-mes";

const pedido = (data: string, status: string, itens: PedidoMes["pedido_itens"], t: Partial<PedidoMes["t"]> = {}): PedidoMes => {
  const subtotal = itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0);
  const custo = itens.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0);
  return { status, data_entrega: data, pedido_itens: itens, t: { venda: subtotal, custo, taxas: 0, subtotal, ...t } };
};

describe("resumo do mês", () => {
  const pedidos = [
    pedido("2026-10-05", "entregue", [{ descricao: "Bolo (Tamanho: G)", quantidade: 1, preco_unitario: 100, custo_unitario: 40 }]),
    pedido("2026-10-12", "entregue", [
      { descricao: "Bolo (Tamanho: P)", quantidade: 2, preco_unitario: 50, custo_unitario: 20 },
      { descricao: "Brigadeiro", quantidade: 50, preco_unitario: 2, custo_unitario: 0.6 },
    ], { venda: 180, taxas: 5.4 }), // 20 de desconto
    pedido("2026-10-20", "cancelado", [{ descricao: "Bolo", quantidade: 1, preco_unitario: 999, custo_unitario: 1 }]),
    pedido("2026-09-30", "entregue", [{ descricao: "Bolo", quantidade: 1, preco_unitario: 80, custo_unitario: 30 }]),
  ];
  const despesas = [{ data: "2026-10-01", valor: 50, categoria: "Aluguel" }, { data: "2026-10-15", valor: 10, categoria: null }, { data: "2026-09-02", valor: 999 }];
  const r = resumoDoMes(pedidos, despesas, "2026-10");

  it("soma vendas, custos, taxas e despesas do mês, sem cancelados", () => {
    expect(r.pedidos).toBe(2);
    expect(r.vendas).toBe(280);
    expect(r.custoProdutos).toBe(110);
    expect(r.taxas).toBe(5.4);
    expect(r.lucroBruto).toBe(170);
    expect(r.despesas).toBe(60);
    expect(r.resultado).toBe(104.6);
    expect(r.ticketMedio).toBe(140);
    expect(r.margem).toBe(37.4);
    expect(r.despesasPorCategoria).toEqual([{ categoria: "Aluguel", valor: 50 }, { categoria: "Outros", valor: 10 }]);
  });
  it("agrupa variações do mesmo produto e rateia o desconto", () => {
    // Pedido 2: subtotal 200, venda 180 → fator 0,9. Bolo P: 100×0,9=90; Brigadeiro: 100×0,9=90.
    expect(r.produtos).toEqual([
      { nome: "Bolo", quantidade: 3, receita: 190, custo: 80, lucro: 110 },
      { nome: "Brigadeiro", quantidade: 50, receita: 90, custo: 30, lucro: 60 },
    ]);
  });
  it("navega entre meses e calcula a variação", () => {
    expect(deslocarMes("2026-01", -1)).toBe("2025-12");
    expect(deslocarMes("2026-12", 1)).toBe("2027-01");
    expect(nomeMes("2026-03")).toBe("março de 2026");
    expect(nomeBase("Bolo (Tamanho: G, Sabor: Morango)")).toBe("Bolo");
    expect(variacao(150, 100)).toBe(50);
    expect(variacao(50, -100)).toBe(150);
    expect(variacao(10, 0)).toBeNull();
    expect(resumoDoMes([], [], "2026-10").margem).toBe(0);
  });
});
