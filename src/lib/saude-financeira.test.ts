import { describe, expect, it } from "vitest";
import { contasPagarEmFoco, margemBruta, recebimentoDoMes, saudeDoMes, valorEstoqueInsumos, valorEstoquePronto, type InsumoComPreco } from "./saude-financeira";
import type { PedidoMes } from "./resumo-mes";
import type { ContaFinanceira } from "./financeiro";

type P = PedidoMes & { t: PedidoMes["t"] & { recebido: number; saldo: number } };
const pedido = (data: string, status: string, venda: number, custo: number, recebido: number, taxas = 0): P => ({
  status,
  data_entrega: data,
  pedido_itens: [{ descricao: "Bolo", quantidade: 1, preco_unitario: venda, custo_unitario: custo }],
  t: { venda, custo, taxas, subtotal: venda, recebido, saldo: Math.max(0, venda - recebido) },
});

describe("saúde do mês", () => {
  const pedidos: P[] = [
    pedido("2026-10-05", "entregue", 100, 40, 100),
    pedido("2026-10-20", "recebido", 200, 80, 50), // ainda não entregue: conta no resultado
    pedido("2026-10-22", "cancelado", 999, 1, 0),
    pedido("2026-09-10", "entregue", 100, 50, 100),
  ];
  const despesas = [{ data: "2026-10-02", valor: 30 }, { data: "2026-09-02", valor: 10 }];
  const contas: ContaFinanceira[] = [
    { valor: 100, valor_pago: 0, status: "pendente", data_vencimento: "2026-10-29" },
  ];

  it("usa todos os pedidos não cancelados do mês", () => {
    const s = saudeDoMes({ pedidos, despesas, contas, mes: "2026-10", hoje: "2026-10-30" });
    expect(s.resumo.pedidos).toBe(2);
    expect(s.resumo.vendas).toBe(300);
    expect(s.resumo.custoProdutos).toBe(120);
    expect(s.resumo.despesas).toBe(30);
    // 300 − 120 − 0 (taxas) − 30
    expect(s.resumo.resultado).toBe(150);
    expect(s.margemBruta).toBe(60);
  });

  it("separa o que já entrou do que falta receber", () => {
    const s = saudeDoMes({ pedidos, despesas, contas, mes: "2026-10", hoje: "2026-10-30" });
    expect(s.recebido).toBe(150);
    expect(s.aReceber).toBe(150);
  });

  it("compara com o mês anterior", () => {
    const s = saudeDoMes({ pedidos, despesas, contas, mes: "2026-10", hoje: "2026-10-30" });
    // setembro: vendas 100, resultado 100 − 50 − 10 = 40
    expect(s.variacaoVendas).toBe(200);
    expect(s.variacaoResultado).toBe(275);
    expect(saudeDoMes({ pedidos, despesas, contas, mes: "2026-09", hoje: "2026-10-30" }).variacaoVendas).toBeNull();
  });

  it("mês sem pedidos zera tudo sem dividir por zero", () => {
    const s = saudeDoMes({ pedidos, despesas, contas, mes: "2026-01", hoje: "2026-10-30" });
    expect(s.resumo.vendas).toBe(0);
    expect(s.margemBruta).toBe(0);
    expect(s.recebido).toBe(0);
    expect(s.aReceber).toBe(0);
  });

  it("recebimentoDoMes ignora cancelados e saldos negativos", () => {
    const r = recebimentoDoMes([pedido("2026-10-01", "cancelado", 50, 0, 0), { ...pedido("2026-10-02", "entregue", 10, 0, 10), t: { recebido: 10, saldo: -3 } }], "2026-10");
    expect(r).toEqual({ recebido: 10, aReceber: 0 });
  });

  it("margem bruta", () => {
    expect(margemBruta(200, 50)).toBe(75);
    expect(margemBruta(100, 130)).toBe(-30);
    expect(margemBruta(0, 10)).toBe(0);
  });
});

describe("contas a pagar em foco", () => {
  const hoje = "2026-10-30";
  const conta = (valor: number, pago: number, venc: string, status = "pendente", cancelada_em: string | null = null): ContaFinanceira => ({
    valor, valor_pago: pago, status, data_vencimento: venc, cancelada_em,
  });

  it("soma saldo aberto, vencido e a vencer em 7 dias", () => {
    const r = contasPagarEmFoco([
      conta(100, 0, "2026-10-29"), // vencida
      conta(200, 50, "2026-10-30"), // vence hoje: não é vencida, entra nos próximos (saldo 150)
      conta(80, 0, "2026-11-06"), // limite de 7 dias: entra
      conta(70, 0, "2026-11-07"), // fora
      conta(500, 500, "2026-10-01", "pago"),
      conta(900, 0, "2026-10-10", "pendente", "2026-10-11T10:00:00Z"), // cancelada
    ], hoje);
    expect(r).toEqual({ aberto: 400, vencido: 100, proximos: 230, quantidade: 4 });
  });

  it("sem contas devolve zeros", () => {
    expect(contasPagarEmFoco([], hoje)).toEqual({ aberto: 0, vencido: 0, proximos: 0, quantidade: 0 });
  });
});

describe("valor do estoque de insumos", () => {
  const insumos: InsumoComPreco[] = [
    { id: "farinha", preco_unidade: 0, preco_embalagem: 10, quantidade_embalagem: 5, unidade_embalagem: "kg", unidade: "kg" }, // R$ 2/kg = 0,002/g
    { id: "leite", preco_unidade: 0, preco_embalagem: 5, quantidade_embalagem: 1, unidade_embalagem: "L", unidade: "L" }, // 0,005/ml
    { id: "ovo", preco_unidade: 0, preco_embalagem: 12, quantidade_embalagem: 1, unidade_embalagem: "dúzia", unidade: "un" }, // 1/un
    { id: "caixa", preco_unidade: 0, preco_embalagem: 9, quantidade_embalagem: 3, unidade_embalagem: "pacote", unidade: "pacote" },
    { id: "zero", preco_unidade: 0, preco_embalagem: 0, quantidade_embalagem: 0, unidade_embalagem: "kg", unidade: "kg" },
  ];

  it("multiplica o saldo em unidade-base pelo custo da embalagem", () => {
    const r = valorEstoqueInsumos([
      { insumo_id: "farinha", saldo: 2500, unidade_base: "g" }, // 5,00
      { insumo_id: "leite", saldo: "1000", unidade_base: "ml" }, // 5,00
      { insumo_id: "ovo", saldo: 6, unidade_base: "un" }, // 6,00
    ], insumos);
    expect(r).toEqual({ total: 16, itens: 3, semValor: 0, negativos: 0 });
  });

  it("saldo negativo não reduz o total e é sinalizado; saldo zero é ignorado", () => {
    const r = valorEstoqueInsumos([
      { insumo_id: "farinha", saldo: 1000, unidade_base: "g" },
      { insumo_id: "leite", saldo: -300, unidade_base: "ml" },
      { insumo_id: "ovo", saldo: 0, unidade_base: "un" },
    ], insumos);
    expect(r).toEqual({ total: 2, itens: 1, semValor: 0, negativos: 1 });
  });

  it("insumo sem unidade conversível, sem cadastro ou com embalagem inválida fica fora e é sinalizado", () => {
    const r = valorEstoqueInsumos([
      { insumo_id: "caixa", saldo: 3, unidade_base: null },
      { insumo_id: "removido", saldo: 10, unidade_base: "g" },
      { insumo_id: "zero", saldo: 10, unidade_base: "g" },
      { insumo_id: "farinha", saldo: 500, unidade_base: "g" }, // 1,00
    ], insumos);
    expect(r).toEqual({ total: 1, itens: 1, semValor: 3, negativos: 0 });
  });

  it("unidade-base incompatível com a embalagem não entra", () => {
    expect(valorEstoqueInsumos([{ insumo_id: "farinha", saldo: 5, unidade_base: "ml" }], insumos)).toEqual({ total: 0, itens: 0, semValor: 1, negativos: 0 });
  });

  it("sem saldos, zero", () => {
    expect(valorEstoqueInsumos([], insumos)).toEqual({ total: 0, itens: 0, semValor: 0, negativos: 0 });
  });
});

describe("valor do estoque de produtos prontos", () => {
  const custos = new Map([["bolo", 12.5], ["pao", 2]]);

  it("unidades × custo do produto", () => {
    expect(valorEstoquePronto([{ produto_id: "bolo", quantidade: 3 }, { produto_id: "pao", quantidade: "2" }], custos)).toEqual({ total: 41.5, unidades: 5, semCusto: 0 });
  });

  it("produto sem custo calculado conta nas unidades mas não no valor", () => {
    expect(valorEstoquePronto([{ produto_id: "bolo", quantidade: 1 }, { produto_id: "novo", quantidade: 4 }, { produto_id: "pao", quantidade: 0 }], custos)).toEqual({ total: 12.5, unidades: 5, semCusto: 1 });
  });

  it("vazio", () => {
    expect(valorEstoquePronto([], custos)).toEqual({ total: 0, unidades: 0, semCusto: 0 });
  });
});
