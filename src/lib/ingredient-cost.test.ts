import { describe, it, expect } from "vitest";
import { custoProporcional, numeroIngrediente } from "./ingredient-cost";
import { custoReceita } from "./calc";
describe("custo proporcional", () => {
  it.each([
    [54, 1, "kg", 100, "g", 5.4],
    [4, 1, "kg", 250, "g", 1],
    [5, 1, "L", 200, "ml", 1],
    [15, 20, "un", 3, "un", 2.25],
    [4, 1000, "g", 0.25, "kg", 1],
    [5, 1000, "ml", 0.2, "L", 1],
  ])("embalagem %s / %s %s, consumo %s %s = %s", (preco, total, u, q, v, esperado) => {
    expect(custoProporcional({ preco_unidade: 0, preco_embalagem: preco, quantidade_embalagem: total, unidade_embalagem: u }, q, v)).toBeCloseTo(esperado, 12);
  });
  it("rejeita divisão por zero, números inválidos e medidas incompatíveis", () => {
    const base = { preco_unidade: 4, quantidade_embalagem: 1, unidade_embalagem: "kg" };
    expect(() => custoProporcional(base, 2, "ml")).toThrow("incompatíveis");
    for (const total of [0, -1, NaN, Infinity]) expect(() => custoProporcional({ ...base, quantidade_embalagem: total }, 1, "g")).toThrow();
    for (const preco of [-1, NaN, Infinity]) expect(() => custoProporcional({ ...base, preco_embalagem: preco }, 1, "g")).toThrow();
    expect(() => custoProporcional(base, -1, "g")).toThrow();
    expect(numeroIngrediente("12abc")).toBeNaN();
    expect(numeroIngrediente("")).toBeNaN();
    expect(numeroIngrediente("1.234,50")).toBe(1234.5);
  });
  it("não arredonda antes de somar e recalcula ao alterar preço ou embalagem", () => {
    const i = { id: "a", preco_unidade: 0, preco_embalagem: 1, quantidade_embalagem: 3, unidade_embalagem: "un" };
    const itens = [1,2].map(() => ({ insumo_id: "a", quantidade: 1, quantidade_utilizada: 1, unidade_receita: "un" }));
    const p = { rendimento: 1, custo_gas: 0, custo_energia: 0, custo_mao_obra: 0 };
    expect(custoReceita(p, itens, new Map([["a",i]])).total).toBe(2/3);
    expect(custoReceita(p, itens, new Map([["a",{ ...i, preco_embalagem: 2 }]])).total).toBe(4/3);
    expect(custoProporcional({ ...i, quantidade_embalagem: 6 }, 1, "un")).toBe(1/6);
  });
});