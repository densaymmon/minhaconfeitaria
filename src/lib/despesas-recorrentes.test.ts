import { describe, expect, it } from "vitest";
import { CATEGORIAS_DESPESA, CATEGORIA_RETIRADA, OPCOES_REPETICAO, datasMensais, ehRetirada } from "./despesas-recorrentes";

describe("despesa mensal repetida", () => {
  it("mantém o dia nos meses seguintes", () => {
    expect(datasMensais("2026-10-05", 3)).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
  });

  it("vira o ano", () => {
    expect(datasMensais("2026-11-15", 3)).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  });

  it("dia 31 cai no último dia dos meses menores, sem acumular o recuo", () => {
    expect(datasMensais("2026-01-31", 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(datasMensais("2028-01-31", 2)).toEqual(["2028-01-31", "2028-02-29"]); // bissexto
  });

  it("quantidade 1, inválida ou fora do limite", () => {
    expect(datasMensais("2026-10-05", 1)).toEqual(["2026-10-05"]);
    expect(datasMensais("2026-10-05", 0)).toEqual(["2026-10-05"]);
    expect(datasMensais("2026-10-05", 2.5)).toEqual(["2026-10-05"]);
    expect(datasMensais("2026-10-05", 100)).toHaveLength(24);
  });

  it("data inválida não gera lançamentos", () => {
    expect(datasMensais("", 3)).toEqual([]);
    expect(datasMensais("05/10/2026", 3)).toEqual([]);
  });

  it("todas as opções de repetição cabem no limite", () => {
    for (const q of OPCOES_REPETICAO) expect(datasMensais("2026-10-05", q)).toHaveLength(q);
  });
});

describe("categorias", () => {
  it("retirada do dono é uma categoria própria e única", () => {
    expect(CATEGORIAS_DESPESA).toContain(CATEGORIA_RETIRADA);
    expect(new Set(CATEGORIAS_DESPESA).size).toBe(CATEGORIAS_DESPESA.length);
    expect(ehRetirada(CATEGORIA_RETIRADA)).toBe(true);
    expect(ehRetirada("Aluguel")).toBe(false);
    expect(ehRetirada(null)).toBe(false);
  });
});
