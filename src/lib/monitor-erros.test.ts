import { describe, expect, it } from "vitest";
import { descreverErro, ehRuido } from "./monitor-erros";

describe("monitor de erros", () => {
  it("descreve erros de vários tipos", () => {
    const e = new TypeError("x is undefined");
    expect(descreverErro(e).mensagem).toBe("TypeError: x is undefined");
    expect(descreverErro("falhou").mensagem).toBe("falhou");
    expect(descreverErro({ code: 1 }).mensagem).toBe('{"code":1}');
    expect(descreverErro("a".repeat(900)).mensagem.length).toBe(500);
  });
  it("ignora ruído conhecido", () => {
    expect(ehRuido("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(ehRuido("TypeError: boom", "at chrome-extension://abc/x.js")).toBe(true);
    expect(ehRuido("TypeError: Failed to fetch")).toBe(true);
    expect(ehRuido("TypeError: Cannot read properties of undefined (reading 'nome')")).toBe(false);
  });
});
