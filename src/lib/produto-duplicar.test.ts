import { describe, expect, it } from "vitest";
import { lerDuplicar } from "./produto-duplicar";

describe("lerDuplicar", () => {
  it("reconhece o valor que o botão Duplicar envia (booleano true)", () => {
    expect(lerDuplicar(true)).toBe(true);
  });

  it("reconhece as formas equivalentes vindas da URL", () => {
    expect(lerDuplicar(1)).toBe(true);
    expect(lerDuplicar("1")).toBe(true);
    expect(lerDuplicar("true")).toBe(true);
  });

  it("trata ausência e valores falsos como edição normal", () => {
    expect(lerDuplicar(undefined)).toBe(false);
    expect(lerDuplicar(null)).toBe(false);
    expect(lerDuplicar(false)).toBe(false);
    expect(lerDuplicar(0)).toBe(false);
    expect(lerDuplicar("0")).toBe(false);
    expect(lerDuplicar("false")).toBe(false);
    expect(lerDuplicar("")).toBe(false);
  });
});
