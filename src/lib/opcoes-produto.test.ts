import { describe, expect, it } from "vitest";
import { opcoesParaEdicao, opcoesParaSalvar } from "./opcoes-produto";

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
