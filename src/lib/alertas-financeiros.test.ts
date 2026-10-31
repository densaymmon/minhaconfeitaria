import { describe, expect, it } from "vitest";
import { alertasFinanceiros, contasQueVencemHoje, contasVencidas, entreguesComSaldo, insumosComSaldoNegativo, produtosComMargemBaixa } from "./alertas-financeiros";
import type { ContaFinanceira } from "./financeiro";

const hoje = "2026-10-30";
const conta = (valor: number, pago: number, venc: string, status = "pendente", cancelada_em: string | null = null): ContaFinanceira => ({ valor, valor_pago: pago, status, data_vencimento: venc, cancelada_em });
const zero = { quantidade: 0, valor: 0 };

describe("contas", () => {
  const contas = [
    conta(100, 0, "2026-10-29"),
    conta(60, 10, "2026-10-01", "parcial"),
    conta(40, 0, "2026-10-30"),
    conta(70, 0, "2026-11-02"),
    conta(500, 500, "2026-10-01", "pago"),
    conta(900, 0, "2026-10-10", "pendente", "2026-10-11T10:00:00Z"),
  ];

  it("vencidas: só em aberto, anteriores a hoje, pelo saldo", () => {
    expect(contasVencidas(contas, hoje)).toEqual({ quantidade: 2, valor: 150 });
  });

  it("vencem hoje: não contam como vencidas", () => {
    expect(contasQueVencemHoje(contas, hoje)).toEqual({ quantidade: 1, valor: 40 });
  });

  it("sem contas", () => {
    expect(contasVencidas([], hoje)).toEqual(zero);
    expect(contasQueVencemHoje([], hoje)).toEqual(zero);
  });
});

describe("pedidos entregues com saldo", () => {
  it("conta entregues/finalizados com saldo, ignora quitados, em andamento e cancelados", () => {
    const r = entreguesComSaldo([
      { status: "entregue", t: { saldo: 30 } },
      { status: "finalizado", t: { saldo: 20.5 } },
      { status: "entregue", t: { saldo: 0.004 } },
      { status: "pronto", t: { saldo: 99 } },
      { status: "cancelado", t: { saldo: 99 } },
    ]);
    expect(r).toEqual({ quantidade: 2, valor: 50.5 });
  });
});

describe("estoque e margem", () => {
  it("insumos com saldo negativo", () => {
    expect(insumosComSaldoNegativo([{ saldo: -1 }, { saldo: "-0.5" }, { saldo: 0 }, { saldo: 10 }])).toBe(2);
    expect(insumosComSaldoNegativo([])).toBe(0);
  });

  it("produtos abaixo da margem e abaixo do custo; inativos e sem custo não alertam", () => {
    const custos = new Map([["ok", 10], ["baixa", 10], ["prejuizo", 10], ["inativo", 10]]);
    const r = produtosComMargemBaixa([
      { id: "ok", preco_venda: 100, margem_desejada: 30 },
      { id: "baixa", preco_venda: 12, margem_desejada: 30 },
      { id: "prejuizo", preco_venda: 8, margem_desejada: 30 },
      { id: "inativo", ativo: false, preco_venda: 1, margem_desejada: 30 },
      { id: "semreceita", preco_venda: 1, margem_desejada: 30 },
    ], custos);
    expect(r).toEqual({ total: 2, prejuizo: 1 });
  });
});

describe("alertas em ordem de urgência", () => {
  const nenhum = { vencidas: zero, hoje: zero, aReceber: zero, insumosNegativos: 0, margem: { total: 0, prejuizo: 0 } };

  it("sem problemas, nenhum alerta", () => {
    expect(alertasFinanceiros(nenhum)).toEqual([]);
  });

  it("monta os textos no singular e no plural", () => {
    const r = alertasFinanceiros({
      vencidas: { quantidade: 1, valor: 100 },
      hoje: { quantidade: 2, valor: 80 },
      aReceber: { quantidade: 3, valor: 250.5 },
      insumosNegativos: 1,
      margem: { total: 2, prejuizo: 1 },
    });
    expect(r.map((a) => a.id)).toEqual(["contas_vencidas", "contas_hoje", "pedidos_a_receber", "estoque_negativo", "margem_baixa"]);
    expect(r[0]?.texto).toMatch(/^1 conta vencida: R\$\s100,00 para pagar$/);
    expect(r[1]?.texto).toMatch(/^2 contas vencem hoje/);
    expect(r[2]?.texto).toMatch(/^3 pedidos entregues com saldo a receber/);
    expect(r[3]?.texto).toMatch(/^1 insumo com saldo negativo/);
    expect(r[4]?.texto).toBe("2 produtos com margem baixa (1 com prejuízo)");
  });

  it("nível: vencidas e prejuízo são erro; o resto é aviso", () => {
    const r = alertasFinanceiros({ ...nenhum, vencidas: { quantidade: 1, valor: 1 }, hoje: { quantidade: 1, valor: 1 }, margem: { total: 1, prejuizo: 0 } });
    expect(r.map((a) => a.nivel)).toEqual(["erro", "aviso", "aviso"]);
    expect(alertasFinanceiros({ ...nenhum, margem: { total: 1, prejuizo: 1 } })[0]?.nivel).toBe("erro");
  });
});
