import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { paginaPermitidaAoPapel } from "./assinatura";
import { GRUPOS_MENU, gruposDoMenu, linksCompras, linksMais } from "./navegacao";

/** Telas e seções que o menu "Mais" já oferecia antes do agrupamento: nenhuma pode sumir. */
const TELAS_DO_MENU_ANTERIOR = [
  "/agenda", "/entregas", "/lista-compras", "/etiquetas", "/produtos", "/catalogo",
  "/financeiro", "/resumo-mes", "/fluxo-caixa", "/historico", "/configuracoes", "/equipe",
];
const SECOES_DE_COMPRAS_ANTERIORES = ["compras", "gastos", "integracao", "estoque"];

function destinos(papel: "dono" | "gerente" | "producao") {
  const grupos = gruposDoMenu(papel);
  return {
    telas: grupos.flatMap((g) => g.links.map((l) => l.to as string)),
    secoes: grupos.flatMap((g) => g.compras.map((c) => c.secao as string)),
  };
}

describe("menu Mais agrupado", () => {
  it("a dona continua vendo todas as telas do menu anterior", () => {
    const { telas, secoes } = destinos("dono");
    expect([...telas].sort()).toEqual([...TELAS_DO_MENU_ANTERIOR].sort());
    expect([...secoes].sort()).toEqual([...SECOES_DE_COMPRAS_ANTERIORES].sort());
  });

  it("o gerente vê o mesmo que a dona", () => {
    expect(destinos("gerente")).toEqual(destinos("dono"));
  });

  it("mantém os grupos na ordem definida e nenhum grupo vazio para a dona", () => {
    expect(gruposDoMenu("dono").map((g) => g.id)).toEqual(GRUPOS_MENU.map((g) => g.id));
  });

  it("nenhuma tela ou seção aparece duas vezes", () => {
    const telas = linksMais.map((l) => l.to as string);
    const secoes = linksCompras.map((c) => c.secao as string);
    expect(new Set(telas).size).toBe(telas.length);
    expect(new Set(secoes).size).toBe(secoes.length);
  });

  it("todo item pertence a um grupo existente", () => {
    const ids = new Set<string>(GRUPOS_MENU.map((g) => g.id));
    for (const item of [...linksMais, ...linksCompras]) expect(ids.has(item.grupo)).toBe(true);
  });

  it("produção não vê dinheiro, compras, catálogo nem configurações", () => {
    const { telas, secoes } = destinos("producao");
    expect(secoes).toEqual([]);
    expect(gruposDoMenu("producao").some((g) => g.id === "financeiro")).toBe(false);
    for (const to of telas) expect(paginaPermitidaAoPapel(to, "producao")).toBe(true);
    for (const bloqueada of ["/financeiro", "/resumo-mes", "/fluxo-caixa", "/historico", "/configuracoes", "/catalogo"]) {
      expect(telas).not.toContain(bloqueada);
    }
  });

  it("produção continua vendo as telas do dia a dia, receitas, lista de compras e equipe", () => {
    const { telas } = destinos("producao");
    for (const esperada of ["/agenda", "/entregas", "/etiquetas", "/produtos", "/lista-compras", "/equipe"]) {
      expect(telas).toContain(esperada);
    }
  });

  it("cada tela do menu tem uma rota correspondente (sem link quebrado)", () => {
    const pasta = path.resolve(process.cwd(), "src/routes/_authenticated");
    for (const { to } of linksMais) {
      const nome = to.slice(1);
      const existe = fs.existsSync(path.join(pasta, `${nome}.tsx`)) || fs.existsSync(path.join(pasta, `${nome}.index.tsx`));
      expect({ to, existe }).toEqual({ to, existe: true });
    }
    expect(fs.existsSync(path.join(pasta, "compras.tsx"))).toBe(true);
  });
});
