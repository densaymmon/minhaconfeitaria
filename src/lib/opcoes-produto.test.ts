import { describe, expect, it } from "vitest";
import { aplicarEscolha, custoDaOpcao, escolhaDaDescricao, escolhaPadrao, lerGrupos, opcoesParaEdicao, opcoesParaSalvar } from "./opcoes-produto";

describe("editor de variações", () => {
  it("converte o que vem do banco e volta igual", () => {
    const banco = [{ grupo: "Tamanho", itens: [{ nome: "P", preco: -5, custo: -2 }, { nome: "G", preco: 20.5, custo: 8 }] }];
    const edicao = opcoesParaEdicao(banco);
    expect(edicao[0]?.itens[1]).toEqual({ nome: "G", preco: "20,5", custo: "8" });
    expect(opcoesParaSalvar(edicao)).toEqual({ ok: true, valor: banco });
    expect(opcoesParaEdicao(null)).toEqual([]);
  });
  it("ignora linhas vazias e grupos em branco", () => {
    expect(opcoesParaSalvar([{ grupo: "", itens: [{ nome: "", preco: "0", custo: "0" }] }])).toEqual({ ok: true, valor: [] });
    expect(opcoesParaSalvar([{ grupo: "Sabor", itens: [{ nome: "Chocolate", preco: "", custo: "" }, { nome: " ", preco: "3", custo: "0" }] }]))
      .toEqual({ ok: true, valor: [{ grupo: "Sabor", itens: [{ nome: "Chocolate", preco: 0, custo: 0 }] }] });
  });
  it("aponta erros comuns", () => {
    expect(opcoesParaSalvar([{ grupo: "", itens: [{ nome: "P", preco: "0", custo: "0" }] }])).toMatchObject({ ok: false });
    expect(opcoesParaSalvar([{ grupo: "Tamanho", itens: [] }, { grupo: "Tamanho", itens: [{ nome: "P", preco: "0", custo: "0" }] }])).toMatchObject({ ok: false });
    expect(opcoesParaSalvar([{ grupo: "Tamanho", itens: [{ nome: "P", preco: "0", custo: "0" }, { nome: "p", preco: "1", custo: "0" }] }])).toMatchObject({ ok: false });
  });
});

describe("ingredientes das variações", () => {
  // Chocolate: 1 kg por R$ 40 → R$ 0,04/g. Creme de leite: caixa de 200 g por R$ 4 → R$ 0,02/g.
  const insumos = new Map([
    ["choc", { id: "choc", preco_unidade: 40, unidade: "kg", preco_embalagem: 40, quantidade_embalagem: 1, unidade_embalagem: "kg" }],
    ["creme", { id: "creme", preco_unidade: 4, unidade: "g", preco_embalagem: 4, quantidade_embalagem: 200, unidade_embalagem: "g" }],
  ]);
  const ganache = { nome: "Ganache", preco: 15, custo: 0, ingredientes: [{ insumo_id: "choc", quantidade: 200, unidade: "g" }, { insumo_id: "creme", quantidade: 100, unidade: "g" }] };

  it("calcula o custo da opção pelos ingredientes", () => {
    expect(custoDaOpcao(ganache, insumos)).toBeCloseTo(10);
    expect(custoDaOpcao({ nome: "Sem", preco: 0, custo: 1.5 }, insumos)).toBe(1.5);
  });

  it("salva o custo calculado junto com os ingredientes", () => {
    const r = opcoesParaSalvar([{ grupo: "Cobertura", itens: [
      { nome: "Sem cobertura", preco: "0", custo: "0" },
      { nome: "Ganache", preco: "15", custo: "0", ingredientes: [{ insumo_id: "choc", quantidade: "200", unidade: "g" }, { insumo_id: "creme", quantidade: "100", unidade: "g" }] },
    ] }], insumos);
    expect(r).toEqual({ ok: true, valor: [{ grupo: "Cobertura", itens: [{ nome: "Sem cobertura", preco: 0, custo: 0 }, { ...ganache, custo: 10 }] }] });
    if (r.ok) expect(opcoesParaEdicao(r.valor)[0]?.itens[1]?.ingredientes?.[0]).toEqual({ insumo_id: "choc", quantidade: "200", unidade: "g" });
  });

  it("recusa quantidade vazia ou medida incompatível", () => {
    expect(opcoesParaSalvar([{ grupo: "C", itens: [{ nome: "G", preco: "0", custo: "0", ingredientes: [{ insumo_id: "choc", quantidade: "", unidade: "g" }] }] }], insumos)).toMatchObject({ ok: false });
    expect(opcoesParaSalvar([{ grupo: "C", itens: [{ nome: "G", preco: "0", custo: "0", ingredientes: [{ insumo_id: "choc", quantidade: "2", unidade: "un" }] }] }], insumos)).toMatchObject({ ok: false });
  });

  it("aplica a escolha no pedido: preço, custo e descrição", () => {
    const grupos = lerGrupos([{ grupo: "Cobertura", itens: [{ nome: "Sem cobertura", preco: 0, custo: 0 }, ganache] }]);
    expect(escolhaPadrao(grupos)).toEqual({ Cobertura: "Sem cobertura" });
    const r = aplicarEscolha({ nome: "Bolo de cenoura", preco: 45, custo: 12 }, grupos, { Cobertura: "Ganache" }, insumos);
    expect(r).toEqual({ preco: 60, custo: 22, descricao: "Bolo de cenoura (Cobertura: Ganache)" });
    expect(escolhaDaDescricao("Bolo de cenoura", grupos, r.descricao)).toEqual({ Cobertura: "Ganache" });
    expect(escolhaDaDescricao("Bolo de cenoura", grupos, "Bolo de cenoura com vela")).toBeNull();
  });
});
