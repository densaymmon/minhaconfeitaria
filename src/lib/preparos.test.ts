import { describe, expect, it } from "vitest";
import { custoDoLote, custoPorPorcao, ehPreparo, preparoParaSalvar } from "./preparos";

// Chocolate 1 kg por R$ 40 (R$ 0,04/g); creme de leite 200 g por R$ 4 (R$ 0,02/g).
const insumos = new Map([
  ["choc", { id: "choc", nome: "Chocolate", tipo: "ingrediente", preco_unidade: 40, unidade: "kg", preco_embalagem: 40, quantidade_embalagem: 1, unidade_embalagem: "kg" }],
  ["creme", { id: "creme", nome: "Creme de leite", tipo: "ingrediente", preco_unidade: 0.02, unidade: "g", preco_embalagem: 4, quantidade_embalagem: 200, unidade_embalagem: "g" }],
  ["cob", { id: "cob", nome: "Cobertura", tipo: "preparo", preco_unidade: 0.02, unidade: "g", preco_embalagem: 10, quantidade_embalagem: 500, unidade_embalagem: "g" }],
]);

describe("preparos", () => {
  it("custa o lote e a porção de referência", () => {
    const lote = custoDoLote([{ insumo_id: "choc", quantidade: 200, unidade: "g" }, { insumo_id: "creme", quantidade: 100, unidade: "g" }], insumos);
    expect(lote).toBeCloseTo(10);
    expect(custoPorPorcao(10, 500, "g")).toEqual({ porcao: "100 g", custo: 2 });
    expect(custoPorPorcao(10, 1, "kg")?.custo).toBeCloseTo(1);
    expect(custoPorPorcao(12, 6, "un")).toEqual({ porcao: "1 unidade", custo: 2 });
  });

  it("no bolo, entra só a parte usada (100 g de 500 g = 1/5)", () => {
    // O preparo vira um insumo cujo pacote é o rendimento: o cálculo comum de receita já faz a proporção.
    expect(custoDoLote([{ insumo_id: "cob", quantidade: 100, unidade: "g" }], insumos)).toBeCloseTo(2);
    expect(ehPreparo(insumos.get("cob"))).toBe(true);
    expect(ehPreparo(insumos.get("choc"))).toBe(false);
  });

  it("valida e converte o formulário", () => {
    expect(preparoParaSalvar({ nome: " Cobertura ", rendimento: "500", unidade: "g", itens: [
      { insumo_id: "choc", quantidade: "0,2", unidade: "kg" }, { insumo_id: "", quantidade: "", unidade: "g" },
    ] }, insumos)).toEqual({ ok: true, valor: { nome: "Cobertura", rendimento: 500, unidade: "g", itens: [{ insumo_id: "choc", quantidade: 0.2, unidade: "kg" }] } });
    expect(preparoParaSalvar({ nome: "", rendimento: "500", unidade: "g", itens: [{ insumo_id: "choc", quantidade: "1", unidade: "g" }] }, insumos)).toMatchObject({ ok: false });
    expect(preparoParaSalvar({ nome: "X", rendimento: "0", unidade: "g", itens: [{ insumo_id: "choc", quantidade: "1", unidade: "g" }] }, insumos)).toMatchObject({ ok: false });
    expect(preparoParaSalvar({ nome: "X", rendimento: "1", unidade: "g", itens: [] }, insumos)).toMatchObject({ ok: false });
    expect(preparoParaSalvar({ nome: "X", rendimento: "1", unidade: "g", itens: [{ insumo_id: "cob", quantidade: "1", unidade: "g" }] }, insumos)).toMatchObject({ ok: false });
    expect(preparoParaSalvar({ nome: "X", rendimento: "1", unidade: "g", itens: [{ insumo_id: "choc", quantidade: "2", unidade: "un" }] }, insumos)).toMatchObject({ ok: false });
  });
});
