import { describe, expect, it } from "vitest";
import { avisoAssinatura, diasEntre, mensagemPlano, planoComRecurso, podeUsarRecurso, recursoDaPagina, temRecurso, type MinhaAssinatura, type Plano } from "./assinatura";

const base: MinhaAssinatura = {
  plano: { id: "essencial", nome: "Essencial", recursos: [], limite_pedidos_mes: 60, limite_produtos: 30, preco_mensal: 29.9, preco_anual: 299 },
  situacao: "ativa",
  situacao_cadastrada: "ativa",
  ciclo: "mensal",
  valor: 29.9,
  vencimento: "2026-11-20",
  bloqueio_em: "2026-11-28",
  hoje: "2026-10-28",
  uso: { produtos: 3, pedidos_mes: 10 },
};

const planos: Plano[] = [
  { id: "vitrine", nome: "Vitrine", descricao: null, preco_mensal: 89.9, preco_anual: 899, limite_pedidos_mes: null, limite_produtos: null, recursos: ["custos", "estoque", "financeiro", "recorrentes", "catalogo", "ia"], ordem: 3, ativo: true },
  { id: "confeitaria", nome: "Confeitaria", descricao: null, preco_mensal: 59.9, preco_anual: 599, limite_pedidos_mes: null, limite_produtos: null, recursos: ["custos", "estoque", "financeiro", "recorrentes"], ordem: 2, ativo: true },
  { id: "essencial", nome: "Essencial", descricao: null, preco_mensal: 29.9, preco_anual: 299, limite_pedidos_mes: 60, limite_produtos: 30, recursos: [], ordem: 1, ativo: true },
];

describe("plano da confeitaria", () => {
  it("libera tudo sem assinatura e respeita os recursos do plano", () => {
    expect(temRecurso(null, "catalogo")).toBe(true);
    expect(temRecurso(base, "catalogo")).toBe(false);
    expect(temRecurso({ ...base, plano: { ...base.plano, recursos: ["catalogo"] } }, "catalogo")).toBe(true);
  });
  it("o servidor só libera o recurso com plano que o inclui e assinatura não bloqueada", () => {
    const comIa = { ...base, plano: { ...base.plano, recursos: ["ia"] } };
    expect(podeUsarRecurso(null, "ia")).toBe(true);
    expect(podeUsarRecurso(base, "ia")).toBe(false);
    expect(podeUsarRecurso(comIa, "ia")).toBe(true);
    expect(podeUsarRecurso({ ...comIa, situacao: "atrasada" }, "ia")).toBe(true);
    expect(podeUsarRecurso({ ...comIa, situacao: "suspensa" }, "ia")).toBe(false);
    expect(podeUsarRecurso({ ...comIa, situacao: "cancelada" }, "ia")).toBe(false);
  });
  it("sabe qual recurso cada página exige", () => {
    expect(recursoDaPagina("/financeiro")).toBe("financeiro");
    expect(recursoDaPagina("/contas-pagar")).toBe("financeiro");
    expect(recursoDaPagina("/compras")).toBe("estoque");
    expect(recursoDaPagina("/pedidos-recorrentes")).toBe("recorrentes");
    expect(recursoDaPagina("/pedidos")).toBeNull();
    expect(recursoDaPagina("/despesas-x")).toBeNull();
  });
  it("indica o plano mais barato com o recurso", () => {
    expect(planoComRecurso(planos, "financeiro")?.id).toBe("confeitaria");
    expect(planoComRecurso(planos, "catalogo")?.id).toBe("vitrine");
    expect(planoComRecurso(planos.map((p) => ({ ...p, ativo: p.id !== "vitrine" })), "catalogo")).toBeNull();
  });
});

describe("avisos da assinatura", () => {
  it("avisa o fim do teste na última semana", () => {
    expect(avisoAssinatura({ ...base, situacao: "teste", situacao_cadastrada: "teste", vencimento: "2026-11-10" })).toBeNull();
    expect(avisoAssinatura({ ...base, situacao: "teste", situacao_cadastrada: "teste", vencimento: "2026-11-02" })?.texto).toContain("termina em 5 dias (02/11)");
    expect(avisoAssinatura({ ...base, situacao: "teste", situacao_cadastrada: "teste", vencimento: "2026-10-29" })?.tom).toBe("alerta");
  });
  it("avisa vencimento próximo e atraso com a data do bloqueio", () => {
    expect(avisoAssinatura(base)).toBeNull();
    expect(avisoAssinatura({ ...base, vencimento: "2026-10-29" })?.texto).toContain("vence amanhã");
    const atraso = avisoAssinatura({ ...base, situacao: "atrasada", vencimento: "2026-10-25", bloqueio_em: "2026-11-02" });
    expect(atraso?.tom).toBe("perigo");
    expect(atraso?.texto).toContain("em 5 dias (02/11)");
    expect(avisoAssinatura({ ...base, situacao: "cortesia" })).toBeNull();
  });
  it("calcula dias e limpa mensagens de limite", () => {
    expect(diasEntre("2026-10-28", "2026-11-04")).toBe(7);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
    expect(mensagemPlano("Não foi possível salvar: PLANO: o plano Essencial permite até 30 produtos.")).toBe("o plano Essencial permite até 30 produtos.");
  });
});
