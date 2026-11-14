import { beforeEach, describe, expect, it } from "vitest";
import { verificarLimite, zerarLimites } from "./limite-taxa";

describe("verificarLimite", () => {
  beforeEach(() => zerarLimites());

  it("permite até o máximo e bloqueia a seguinte", () => {
    for (let i = 0; i < 3; i++) expect(verificarLimite("u1", 3, 60_000, 1000 + i).permitido).toBe(true);
    const r = verificarLimite("u1", 3, 60_000, 1010);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.esperarSegundos).toBeGreaterThan(0);
  });

  it("libera de novo quando a janela passa", () => {
    for (let i = 0; i < 2; i++) verificarLimite("u1", 2, 10_000, 1000);
    expect(verificarLimite("u1", 2, 10_000, 5000).permitido).toBe(false);
    expect(verificarLimite("u1", 2, 10_000, 11_001).permitido).toBe(true);
  });

  it("conta cada chave separadamente", () => {
    verificarLimite("a", 1, 60_000, 1000);
    expect(verificarLimite("a", 1, 60_000, 1001).permitido).toBe(false);
    expect(verificarLimite("b", 1, 60_000, 1001).permitido).toBe(true);
  });

  it("informa quantos segundos faltam para liberar", () => {
    verificarLimite("u", 1, 60_000, 0);
    const r = verificarLimite("u", 1, 60_000, 20_000);
    expect(r).toEqual({ permitido: false, esperarSegundos: 40 });
  });
});
