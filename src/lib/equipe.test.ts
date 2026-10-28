import { describe, expect, it } from "vitest";
import { mensagemEquipe, paginaPermitidaAoPapel } from "./assinatura";

describe("papéis da equipe", () => {
  it("produção não abre páginas de dinheiro e configuração", () => {
    for (const p of ["/financeiro", "/despesas", "/contas-pagar", "/relatorios", "/resumo-mes", "/compras", "/configuracoes", "/catalogo"]) {
      expect(paginaPermitidaAoPapel(p, "producao")).toBe(false);
    }
    for (const p of ["/painel", "/pedidos", "/pedidos/abc", "/producao", "/clientes", "/produtos", "/equipe", "/mais", "/catalogos-x"]) {
      expect(paginaPermitidaAoPapel(p, "producao")).toBe(true);
    }
  });
  it("dona e gerente abrem tudo", () => {
    expect(paginaPermitidaAoPapel("/financeiro", "dono")).toBe(true);
    expect(paginaPermitidaAoPapel("/configuracoes", "gerente")).toBe(true);
    expect(paginaPermitidaAoPapel("/financeiro", null)).toBe(true);
  });
  it("limpa a mensagem de erro do banco", () => {
    expect(mensagemEquipe("ERROR: EQUIPE: convite inválido ou expirado.")).toBe("convite inválido ou expirado.");
  });
});
