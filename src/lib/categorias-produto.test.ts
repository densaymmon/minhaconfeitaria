import { describe, expect, it } from "vitest";
import { categoriaExistenteOuNova, categoriasDisponiveis, contarPorCategoria, daCategoria, normalizarCategoria } from "./categorias-produto";

describe("categorias de produto", () => {
  it("normaliza espaços e tamanho", () => {
    expect(normalizarCategoria("  Tortas   doces ")).toBe("Tortas doces");
    expect(normalizarCategoria("x".repeat(60))).toHaveLength(40);
  });

  it("junta sugeridas e usadas sem repetir", () => {
    const lista = categoriasDisponiveis([{ categoria: "Tortas" }, { categoria: "doces" }, { categoria: "" }]);
    expect(lista).toContain("Tortas");
    expect(lista).toContain("Bolos caseiros");
    expect(lista.filter((c) => c.toLowerCase() === "doces")).toHaveLength(1);
    expect(lista).not.toContain("");
  });

  it("reaproveita a grafia de uma categoria existente", () => {
    expect(categoriaExistenteOuNova(" tortas ", ["Tortas", "Doces"])).toBe("Tortas");
    expect(categoriaExistenteOuNova("Brownies", ["Tortas"])).toBe("Brownies");
  });

  it("conta produtos por categoria e filtra", () => {
    const produtos = [{ categoria: "Doces" }, { categoria: "doces" }, { categoria: "Bolos" }, { categoria: null }];
    expect(contarPorCategoria(produtos)).toEqual([
      { categoria: "Bolos", total: 1 },
      { categoria: "Doces", total: 2 },
      { categoria: "Sem categoria", total: 1 },
    ]);
    expect(produtos.filter((p) => daCategoria(p, "Doces"))).toHaveLength(2);
    expect(produtos.filter((p) => daCategoria(p, null))).toHaveLength(4);
    expect(produtos.filter((p) => daCategoria(p, "Sem categoria"))).toHaveLength(1);
  });
});
