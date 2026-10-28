import { describe, expect, it } from "vitest";
import { primeirosPassos, progressoPassos } from "./primeiros-passos";

describe("primeiros passos", () => {
  it("marca o que já foi feito e aponta o próximo", () => {
    const passos = primeirosPassos({ nome: "Doces da Ana", whatsapp: "19999990000", pix: " ", insumos: 3, produtosComReceita: 0, catalogoNoAr: false, pedidos: 0 });
    expect(passos.map((p) => p.feito)).toEqual([true, false, true, false, false, false]);
    const p = progressoPassos(passos);
    expect([p.feitos, p.total, p.completo, p.proximo?.id]).toEqual([2, 6, false, "pix"]);
  });
  it("nome padrão não conta como dado da loja", () => {
    expect(primeirosPassos({ nome: "Minha confeitaria", whatsapp: "1", pix: "x", insumos: 1, produtosComReceita: 1, catalogoNoAr: true, pedidos: 1 })[0]?.feito).toBe(false);
    const todos = primeirosPassos({ nome: "A", whatsapp: "1", pix: "x", insumos: 1, produtosComReceita: 1, catalogoNoAr: true, pedidos: 1 });
    expect(progressoPassos(todos).completo).toBe(true);
    expect(progressoPassos(todos).proximo).toBeNull();
  });
});
