import { describe, expect, it } from "vitest";
import { custoReceita, custoUnitario, margemReal, precoSugerido, totaisPedido, CONFIG_PADRAO } from "./calc";
import { toCSV } from "./csv";
import { parseNum, STATUS, statusLabel } from "./format";

const insumos = new Map([
  ["farinha", { id: "farinha", preco_unidade: 6 }], // R$/kg
  ["ovo", { id: "ovo", preco_unidade: 0.8 }], // R$/un
]);
const bolo = { rendimento: 2, custo_gas: 3, custo_energia: 1, custo_mao_obra: 10 };
const itens = [
  { insumo_id: "farinha", quantidade: 0.5 },
  { insumo_id: "ovo", quantidade: 5 },
];

describe("custos", () => {
  it("calcula custo da receita e unitário", () => {
    const c = custoReceita(bolo, itens, insumos);
    expect(c.ingredientes).toBeCloseTo(7);
    expect(c.total).toBeCloseTo(21);
    expect(custoUnitario(bolo, itens, insumos)).toBeCloseTo(10.5);
  });
  it("preço sugerido e margem real", () => {
    expect(precoSugerido(10, 100)).toBe(20);
    expect(margemReal(10, 25)).toBe(150);
  });
});

describe("pedido", () => {
  const base = {
    status: "confirmado",
    forma_pagamento: "credito",
    valor_entrada: 50,
    saldo_quitado: false,
    desconto: 10,
    taxa_entrega: 10,
    pedido_itens: [{ quantidade: 2, preco_unitario: 60, custo_unitario: 20 }],
  };
  it("calcula venda, lucros, recebido e saldo", () => {
    const t = totaisPedido(base, CONFIG_PADRAO);
    expect(t.venda).toBe(120);
    expect(t.custo).toBe(40);
    expect(t.lucroBruto).toBe(80);
    expect(t.taxas).toBeCloseTo(120 * 0.0499);
    expect(t.lucroLiquido).toBeCloseTo(80 - 5.988);
    expect(t.recebido).toBe(50);
    expect(t.saldo).toBe(70);
  });
  it("saldo quitado zera o saldo", () => {
    const t = totaisPedido({ ...base, saldo_quitado: true }, CONFIG_PADRAO);
    expect(t.recebido).toBe(120);
    expect(t.saldo).toBe(0);
  });
});

describe("utilitários", () => {
  it("usa entregue como status persistido e mantém o rótulo Finalizado", () => {
    expect(STATUS.find((status) => status.label === "Finalizado")?.value).toBe("entregue");
    expect(statusLabel("entregue")).toBe("Finalizado");
    expect(statusLabel("finalizado")).toBe("Finalizado");
  });
  it("CSV com ; e vírgula decimal", () => {
    expect(toCSV(["a", "b"], [["x;y", 1.5]])).toBe('a;b\r\n"x;y";1,5');
  });
  it("parseNum aceita vírgula", () => {
    expect(parseNum("12,50")).toBe(12.5);
    expect(parseNum("1.234,5")).toBe(1234.5);
    expect(parseNum("3.75")).toBe(3.75);
  });
});

describe("proteção do CSV", () => {
 it("neutraliza fórmulas em campos de texto", () => {
  expect(toCSV(["Nome"], [["=HYPERLINK(1)"]])).toContain("'=HYPERLINK(1)");
 });
});
