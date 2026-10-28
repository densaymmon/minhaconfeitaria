import { describe, expect, it } from "vitest";
import { alterarItem, alterarPedido, criarFila } from "./cache-pedidos";

const lista = [
  { id: "p1", status: "recebido", pedido_itens: [{ id: "i1", quantidade_produzida: 0 }, { id: "i2", quantidade_produzida: 1 }] },
  { id: "p2", status: "pronto", pedido_itens: [{ id: "i3", quantidade_produzida: 2 }] },
];

describe("atualização otimista dos pedidos", () => {
  it("altera só o pedido indicado, sem mexer na lista original", () => {
    const nova = alterarPedido(lista, "p2", { status: "entregue" });
    expect(nova?.[1]?.status).toBe("entregue");
    expect(nova?.[0]).toBe(lista[0]);
    expect(lista[1]?.status).toBe("pronto");
    expect(alterarPedido<(typeof lista)[number]>(undefined, "p1", { status: "x" })).toBeUndefined();
  });
  it("altera um item onde quer que ele esteja", () => {
    const nova = alterarItem(lista, "i2", { quantidade_produzida: 3 });
    expect(nova?.[0]?.pedido_itens[1]?.quantidade_produzida).toBe(3);
    expect(nova?.[0]?.pedido_itens[0]).toBe(lista[0]?.pedido_itens[0]);
    expect(nova?.[1]).toBe(lista[1]);
  });
  it("executa as gravações do mesmo item em ordem, mesmo com tempos diferentes", async () => {
    const fila = criarFila();
    const enfileirar = fila.enfileirar;
    const ordem: number[] = [];
    const espera = (ms: number, n: number) => () => new Promise<number>((ok) => setTimeout(() => { ordem.push(n); ok(n); }, ms));
    const falha = () => Promise.reject(new Error("falhou"));
    const a = enfileirar("i1", espera(30, 1));
    const b = enfileirar("i1", falha).catch(() => -1);
    const c = enfileirar("i1", espera(1, 3));
    const d = enfileirar("outro", espera(1, 9));
    expect(await Promise.all([a, b, c, d])).toEqual([1, -1, 3, 9]);
    expect(ordem).toEqual([9, 1, 3]);
    expect(fila.pendentes()).toBe(0);
  });
});
