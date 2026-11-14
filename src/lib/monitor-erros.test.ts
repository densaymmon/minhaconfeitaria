import { describe, expect, it } from "vitest";
import { descreverErro, ehRuido, limparUrl } from "./monitor-erros";

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

describe("limparUrl", () => {
  it("remove parâmetros e trecho após #", () => {
    expect(limparUrl("https://app.exemplo.com/reset-password?code=abc#access_token=segredo")).toBe("https://app.exemplo.com/reset-password");
  });
  it("esconde códigos de pedido e de convite", () => {
    expect(limparUrl("https://app.exemplo.com/p/AbC123xYz9")).toBe("https://app.exemplo.com/p/:codigo");
    expect(limparUrl("https://app.exemplo.com/pedido/3f2b8c1e-0000-4000-8000-000000000000?x=1")).toBe("https://app.exemplo.com/pedido/:codigo");
    expect(limparUrl("https://app.exemplo.com/convite/token-secreto")).toBe("https://app.exemplo.com/convite/:codigo");
  });
  it("mantém páginas comuns e devolve vazio para endereço inválido", () => {
    expect(limparUrl("https://app.exemplo.com/painel")).toBe("https://app.exemplo.com/painel");
    expect(limparUrl("isto não é um endereço")).toBe("");
  });
});
