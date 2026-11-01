import { describe, expect, it } from "vitest";
import { CATEGORIAS_DESPESA, CATEGORIA_RETIRADA, OPCOES_REPETICAO, datasMensais, diaDaRegra, ehRetirada, encerrarRegra, proximoLancamento, regraEncerrada, type RegraFixa } from "./despesas-recorrentes";

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

describe("despesa fixa automática", () => {
  const regra = (inicio: string, fim: string | null = null, gerado_ate: string | null = null): RegraFixa => ({ inicio, fim, gerado_ate });

  it("o dia vem da primeira data", () => {
    expect(diaDaRegra(regra("2026-08-05"))).toBe(5);
    expect(diaDaRegra(regra("2026-01-31"))).toBe(31);
  });

  it("próximo lançamento: o mês da primeira data, ou o seguinte ao último lançado", () => {
    expect(proximoLancamento(regra("2026-10-05"))).toBe("2026-10-05");
    expect(proximoLancamento(regra("2026-08-05", null, "2026-10-01"))).toBe("2026-11-05");
    expect(proximoLancamento(regra("2026-11-20", null, "2026-12-01"))).toBe("2027-01-20");
  });

  it("dia 31 cai no último dia do mês curto", () => {
    expect(proximoLancamento(regra("2026-01-31", null, "2026-01-01"))).toBe("2026-02-28");
    expect(proximoLancamento(regra("2028-01-31", null, "2028-01-01"))).toBe("2028-02-29");
    expect(proximoLancamento(regra("2026-01-31", null, "2026-03-01"))).toBe("2026-04-30");
  });

  it("depois da data final não há próximo lançamento", () => {
    expect(proximoLancamento(regra("2026-08-05", "2026-10-31", "2026-10-01"))).toBeNull();
    expect(proximoLancamento(regra("2026-08-05", "2026-11-15", "2026-10-01"))).toBe("2026-11-05");
  });

  it("regra encerrada: só quando o mês final já passou", () => {
    expect(regraEncerrada(regra("2026-01-05"), "2026-10-30")).toBe(false);
    expect(regraEncerrada(regra("2026-01-05", "2026-10-15"), "2026-10-30")).toBe(false);
    expect(regraEncerrada(regra("2026-01-05", "2026-09-30"), "2026-10-30")).toBe(true);
  });

  it("encerrar sem nada lançado remove a regra", () => {
    expect(encerrarRegra(regra("2026-11-05"), "2026-10-30")).toEqual({ acao: "excluir" });
  });

  it("encerrar com o mês atual já lançado: a data final é hoje", () => {
    expect(encerrarRegra(regra("2026-08-05", null, "2026-10-01"), "2026-10-30")).toEqual({ acao: "definir_fim", fim: "2026-10-30" });
  });

  it("encerrar antes de cair o lançamento deste mês: a data final é o fim do mês passado", () => {
    expect(encerrarRegra(regra("2026-08-28", null, "2026-09-01"), "2026-10-10")).toEqual({ acao: "definir_fim", fim: "2026-09-30" });
    expect(encerrarRegra(regra("2026-01-05", null, "2026-02-01"), "2026-03-02")).toEqual({ acao: "definir_fim", fim: "2026-02-28" });
  });

  it("virada de ano", () => {
    expect(encerrarRegra(regra("2025-10-05", null, "2025-12-01"), "2026-01-03")).toEqual({ acao: "definir_fim", fim: "2025-12-31" });
  });
});
