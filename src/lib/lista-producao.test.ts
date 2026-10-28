import { describe, expect, it } from "vitest";
import { componentesDoKit, formatarQuantidade, ingredientesNecessarios, intervaloPeriodo, periodoAtual, somarDias } from "./lista-producao";

const insumos = [
  { id: "farinha", nome: "Farinha", unidade_embalagem: "kg" },
  { id: "leite", nome: "Leite", unidade_embalagem: "L" },
  { id: "ovo", nome: "Ovo", unidade_embalagem: "dúzia" },
  { id: "caixa", nome: "Caixa", unidade_embalagem: "pacote" },
];
const produtos = [
  // Receita rende 2 bolos: 500 g de farinha, 0,3 L de leite e 1 dúzia de ovos.
  { id: "bolo", nome: "Bolo", rendimento: 2, receita_itens: [
    { insumo_id: "farinha", quantidade: 0, quantidade_utilizada: 500, unidade_receita: "g" },
    { insumo_id: "leite", quantidade: 0.3, unidade_receita: "L" },
    { insumo_id: "ovo", quantidade: 1, unidade_receita: "dúzia" },
  ] },
  { id: "pudim", nome: "Pudim", rendimento: 1, receita_itens: [{ insumo_id: "leite", quantidade: 200, unidade_receita: "ml" }] },
  { id: "brigadeiro", nome: "Brigadeiro", rendimento: 50, receita_itens: [] },
  { id: "kit", nome: "Kit", rendimento: 1, receita_itens: [{ insumo_id: "caixa", quantidade: 1, unidade_receita: "pacote" }] },
];

describe("ingredientes necessários", () => {
  it("soma o pendente de vários pedidos, converte medidas e divide pelo rendimento", () => {
    const r = ingredientesNecessarios(
      [{ produto_id: "bolo", pendente: 3 }, { produto_id: "bolo", pendente: 1 }, { produto_id: "pudim", pendente: 2 }, { produto_id: "bolo", pendente: 0 }],
      produtos, insumos,
    );
    const porId = Object.fromEntries(r.linhas.map((l) => [l.insumo_id, l]));
    expect(porId["farinha"]).toMatchObject({ unidade: "g", necessario: 1000, estoque: null, falta: 0 });
    expect(porId["leite"]).toMatchObject({ unidade: "ml", necessario: 1000 });
    expect(porId["ovo"]).toMatchObject({ unidade: "un", necessario: 24 });
  });

  it("compara com o estoque e mostra primeiro o que falta comprar", () => {
    const r = ingredientesNecessarios(
      [{ produto_id: "bolo", pendente: 4 }],
      produtos, insumos,
      [
        { insumo_id: "farinha", saldo: 1500, unidade_base: "g" },
        { insumo_id: "leite", saldo: 250, unidade_base: "ml" },
        { insumo_id: "ovo", saldo: -3, unidade_base: "un" },
      ],
    );
    expect(r.linhas.map((l) => [l.nome, l.falta])).toEqual([["Leite", 350], ["Ovo", 24], ["Farinha", 0]]);
    expect(r.linhas.find((l) => l.nome === "Ovo")?.estoque).toBe(0);
  });

  it("ignora estoque em unidade diferente e avisa o que não entra na conta", () => {
    const r = ingredientesNecessarios(
      [{ produto_id: "pudim", pendente: 1 }, { produto_id: "brigadeiro", pendente: 100 }, { produto_id: "kit", pendente: 1 }, { produto_id: null, pendente: 2 }, { produto_id: "apagado", pendente: 1 }],
      produtos, insumos,
      [{ insumo_id: "leite", saldo: 5, unidade_base: null }],
    );
    expect(r.linhas).toEqual([{ insumo_id: "leite", nome: "Leite", unidade: "ml", necessario: 200, estoque: null, falta: 0 }]);
    expect(r.semReceita).toEqual(["Brigadeiro"]);
    expect(r.semMedida).toEqual(["Caixa"]);
    expect(r.avulsos).toBe(2);
  });
});

describe("formatação e período", () => {
  it("formata quantidades em kg, L e unidades", () => {
    expect(formatarQuantidade(1500, "g")).toBe("1,5 kg");
    expect(formatarQuantidade(250.4, "g")).toBe("250 g");
    expect(formatarQuantidade(1000, "ml")).toBe("1 L");
    expect(formatarQuantidade(12, "un")).toBe("12 un");
  });
  it("calcula os atalhos de período", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-12-28", 6)).toBe("2027-01-03");
    expect(intervaloPeriodo("hoje", "2026-10-28")).toEqual({ inicio: "", fim: "2026-10-28" });
    expect(intervaloPeriodo("amanha", "2026-10-28")).toEqual({ inicio: "2026-10-29", fim: "2026-10-29" });
    expect(intervaloPeriodo("semana", "2026-10-28")).toEqual({ inicio: "", fim: "2026-11-03" });
    expect(periodoAtual("", "", "2026-10-28")).toBe("tudo");
    expect(periodoAtual("2026-10-01", "", "2026-10-28")).toBeNull();
  });
});

describe("kits na lista de ingredientes", () => {
  it("abre o kit nos produtos que o compõem", () => {
    const produtos = [
      { id: "bolo", nome: "Bolo", rendimento: 1, receita_itens: [{ insumo_id: "farinha", quantidade: 200, unidade_receita: "g" }] },
      { id: "brig", nome: "Brigadeiro", rendimento: 10, receita_itens: [{ insumo_id: "leite", quantidade: 1, unidade_receita: "un" }] },
      { id: "kit", nome: "Kit", rendimento: 1, receita_itens: [], componentes: [{ produto_id: "bolo", quantidade: 2 }, { produto_id: "brig", quantidade: 10 }] },
    ];
    const insumos = [{ id: "farinha", nome: "Farinha", unidade: "g" }, { id: "leite", nome: "Leite condensado", unidade: "un" }];
    const r = ingredientesNecessarios([{ produto_id: "kit", pendente: 3 }], produtos, insumos);
    expect(r.semReceita).toEqual([]);
    expect(r.linhas.map((l) => [l.nome, l.necessario])).toEqual([["Farinha", 1200], ["Leite condensado", 3]]);
    expect(componentesDoKit("x")).toEqual([]);
    expect(componentesDoKit([{ produto_id: "a", quantidade: 0 }, { produto_id: "b", quantidade: 2 }])).toEqual([{ produto_id: "b", quantidade: 2 }]);
  });
});
