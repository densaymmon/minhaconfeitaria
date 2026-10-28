import { describe, expect, it } from "vitest";
import { clientesSumidos, mensagemReativar } from "./reativar";

const clientes = [
  { id: "a", nome: "Ana Souza", telefone: "19999990000" },
  { id: "b", nome: "Bia", telefone: null },
  { id: "c", nome: "Caio", telefone: "19999990002" },
  { id: "d", nome: "Davi (nunca comprou)", telefone: "1" },
];
const pedidos = [
  { cliente_id: "a", status: "entregue", data_entrega: "2026-08-01", t: { venda: 100 } },
  { cliente_id: "a", status: "entregue", data_entrega: "2026-09-10", t: { venda: 50 } },
  { cliente_id: "b", status: "entregue", data_entrega: "2026-06-01", t: { venda: 80 } },
  { cliente_id: "b", status: "cancelado", data_entrega: "2026-10-20", t: { venda: 999 } },
  { cliente_id: "c", status: "confirmado", data_entrega: "2026-11-05", t: { venda: 70 } },
  { cliente_id: null, status: "entregue", data_entrega: "2026-01-01", t: { venda: 1 } },
];

describe("clientes para reativar", () => {
  it("lista quem não compra há X dias, ignorando cancelados e quem tem pedido futuro", () => {
    const r = clientesSumidos(clientes, pedidos, "2026-10-28", 30);
    expect(r.map((x) => [x.cliente.id, x.dias, x.pedidos, x.total, x.ultimaCompra])).toEqual([
      ["a", 48, 2, 150, "2026-09-10"],
      ["b", 149, 1, 80, "2026-06-01"],
    ]);
    expect(clientesSumidos(clientes, pedidos, "2026-10-28", 60).map((x) => x.cliente.id)).toEqual(["b"]);
  });
  it("monta a mensagem com o primeiro nome e o link do catálogo", () => {
    const m = mensagemReativar("Ana Souza", "Casal do Bolo", "https://x.app/casal");
    expect(m).toContain("Oi Ana!");
    expect(m).toContain("Casal do Bolo");
    expect(m).toContain("https://x.app/casal");
    expect(mensagemReativar("Bia", "Loja")).toContain("opções desta semana");
  });
});
