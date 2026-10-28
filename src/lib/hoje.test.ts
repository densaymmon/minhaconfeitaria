import { describe, expect, it } from "vitest";
import { mensagemCobranca, montarHoje, saudacao, type PedidoHoje } from "./hoje";

const p = (id: string, numero: number, data: string, status: string, extra: Partial<PedidoHoje> = {}): PedidoHoje => ({
  id, numero, status, data_entrega: data, hora_entrega: null, clientes: { nome: `Cliente ${numero}` },
  pedido_itens: [{ descricao: "Bolo de cenoura", quantidade: 2, quantidade_produzida: 0 }],
  t: { venda: 100, saldo: 0 }, ...extra,
});

const HOJE = "2026-10-28";
const AMANHA = "2026-10-29";

describe("tela Hoje", () => {
  const pedidos = [
    p("a", 1, "2026-10-27", "em_producao"),
    p("b", 2, HOJE, "confirmado", { hora_entrega: "15:00", t: { venda: 80, saldo: 50 } }),
    p("c", 3, HOJE, "recebido", { hora_entrega: "09:00", origem: "catalogo", visualizado_em: null, pedido_itens: [{ descricao: "Brigadeiro", quantidade: 50, quantidade_produzida: 20 }] }),
    p("d", 4, AMANHA, "recebido", { pedido_itens: [{ descricao: "Bolo de cenoura", quantidade: 1, quantidade_produzida: 0 }] }),
    p("e", 5, "2026-10-30", "recebido"),
    p("f", 6, HOJE, "pronto", { aviso_pronto_enviado_em: null, t: { venda: 60, saldo: 60 } }),
    p("g", 7, "2026-10-20", "entregue", { t: { venda: 90, saldo: 30 } }),
    p("h", 8, HOJE, "cancelado", { origem: "catalogo" }),
    p("i", 9, HOJE, "entregue", { t: { venda: 40, saldo: 0 } }),
  ];
  const r = montarHoje(pedidos, HOJE, AMANHA);
  const ids = (l: PedidoHoje[]) => l.map((x) => x.id);

  it("separa novos, atrasados e entregas de hoje e amanhã", () => {
    expect(ids(r.novos)).toEqual(["c"]);
    expect(ids(r.atrasados)).toEqual(["a"]);
    expect(ids(r.entregarHoje)).toEqual(["c", "b", "f"]);
    expect(ids(r.entregarAmanha)).toEqual(["d"]);
    expect(ids(r.avisarPronto)).toEqual(["f"]);
  });
  it("lista cobranças de pedidos entregues ou vencendo hoje com saldo", () => {
    expect(ids(r.cobrar)).toEqual(["g", "b", "f"]);
    expect(r.aReceberHoje).toBe(110);
  });
  it("soma a produção pendente até amanhã, sem prontos nem cancelados", () => {
    expect(r.produzir).toEqual([
      { descricao: "Bolo de cenoura", pendente: 5, pedidos: 3, maisCedo: "2026-10-27" },
      { descricao: "Brigadeiro", pendente: 30, pedidos: 1, maisCedo: HOJE },
    ]);
  });
  it("monta a cobrança e a saudação", () => {
    const m = mensagemCobranca(p("g", 7, "2026-10-20", "entregue", { t: { venda: 90, saldo: 30 } }), "pix@loja.com");
    expect(m).toContain("entregue em 20/10/2026");
    expect(m).toContain("R$");
    expect(m).toContain("Chave Pix: pix@loja.com");
    expect(mensagemCobranca(p("b", 2, HOJE, "confirmado", { t: { venda: 80, saldo: 50 } }), "")).toContain("entrega em 28/10/2026");
    expect(saudacao(9)).toBe("Bom dia");
    expect(saudacao(13)).toBe("Boa tarde");
    expect(saudacao(20)).toBe("Boa noite");
  });
});
