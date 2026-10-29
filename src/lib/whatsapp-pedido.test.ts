import { describe, expect, it } from "vitest";
import { precisaAvisarPronto, precisaConfirmar } from "./whatsapp-pedido";

describe("precisaConfirmar", () => {
  const aberto = { origem: "catalogo", confirmacao_enviada_em: null, status: "recebido" } as const;

  it("pedido do catálogo aberto e sem confirmação precisa ser confirmado", () => {
    expect(precisaConfirmar(aberto)).toBe(true);
    expect(precisaConfirmar({ ...aberto, status: "em_producao" })).toBe(true);
  });

  it("já confirmado ou de outra origem não precisa", () => {
    expect(precisaConfirmar({ ...aberto, confirmacao_enviada_em: "2026-10-29T10:00:00Z" })).toBe(false);
    expect(precisaConfirmar({ ...aberto, origem: "manual" })).toBe(false);
  });

  it("pedido encerrado ou pronto não precisa", () => {
    for (const status of ["cancelado", "entregue", "finalizado", "pronto"]) {
      expect(precisaConfirmar({ ...aberto, status })).toBe(false);
    }
  });
});

describe("precisaAvisarPronto", () => {
  it("só quando está pronto e o cliente ainda não foi avisado", () => {
    expect(precisaAvisarPronto({ status: "pronto", aviso_pronto_enviado_em: null })).toBe(true);
    expect(precisaAvisarPronto({ status: "pronto", aviso_pronto_enviado_em: "2026-10-29T10:00:00Z" })).toBe(false);
    expect(precisaAvisarPronto({ status: "recebido", aviso_pronto_enviado_em: null })).toBe(false);
  });
});
