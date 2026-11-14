import { describe, expect, it } from "vitest";
import { CABECALHOS_SEGURANCA, comCabecalhosDeSeguranca } from "./cabecalhos-seguranca";

describe("comCabecalhosDeSeguranca", () => {
  it("adiciona todos os cabeçalhos a uma resposta comum", async () => {
    const r = comCabecalhosDeSeguranca(new Response("ok", { status: 200 }));
    for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) expect(r.headers.get(nome)).toBe(valor);
    expect(await r.text()).toBe("ok");
  });

  it("não sobrescreve um cabeçalho que o servidor já definiu", () => {
    const original = new Response("x", { headers: { "Referrer-Policy": "no-referrer" } });
    const r = comCabecalhosDeSeguranca(original);
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("funciona com cabeçalhos imutáveis, mantendo status e corpo", async () => {
    const imutavel = new Response("corpo", { status: 404, statusText: "Not Found", headers: { "content-type": "text/plain" } });
    Object.defineProperty(imutavel.headers, "set", { value: () => { throw new TypeError("immutable"); } });
    const r = comCabecalhosDeSeguranca(imutavel);
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toBe("text/plain");
    expect(r.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(await r.text()).toBe("corpo");
  });

  it("mantém redirecionamentos e respostas sem corpo", () => {
    const r = comCabecalhosDeSeguranca(new Response(null, { status: 302, headers: { location: "/auth" } }));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/auth");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
