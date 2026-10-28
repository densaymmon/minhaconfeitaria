// Atualização otimista da lista de pedidos: a tela muda no toque, o servidor confirma
// em segundo plano e, se der erro, a lista volta ao que era. Regras puras testadas em
// cache-pedidos.test.ts.

import type { QueryClient } from "@tanstack/react-query";

type ItemBase = { id: string };
type PedidoBase = { id: string; pedido_itens: ItemBase[] };

/** Aplica uma alteração a um pedido da lista (sem modificar a lista original). */
export function alterarPedido<P extends PedidoBase>(lista: P[] | undefined, pedidoId: string, alteracao: Partial<P>): P[] | undefined {
  if (!lista) return lista;
  return lista.map((p) => (p.id === pedidoId ? { ...p, ...alteracao } : p));
}

/** Aplica uma alteração a um item de pedido, onde quer que ele esteja na lista. */
export function alterarItem<P extends PedidoBase>(lista: P[] | undefined, itemId: string, alteracao: Partial<P["pedido_itens"][number]>): P[] | undefined {
  if (!lista) return lista;
  return lista.map((p) =>
    p.pedido_itens.some((i) => i.id === itemId)
      ? { ...p, pedido_itens: p.pedido_itens.map((i) => (i.id === itemId ? { ...i, ...alteracao } : i)) }
      : p,
  );
}

/**
 * Executa uma gravação de forma otimista nas listas de pedidos (["pedidos"] e ["pedidos", "historico"]):
 * aplica `alterar` na hora, roda `gravar` e, em erro, desfaz e repassa o erro.
 * Ao final, pede ao servidor a versão atualizada em segundo plano.
 */
export async function otimista<P extends PedidoBase>(
  qc: QueryClient,
  alterar: (lista: P[] | undefined) => P[] | undefined,
  gravar: () => Promise<void>,
  outrasChaves: string[][] = [],
  /** Retorne false para adiar a atualização (ex.: ainda há toques na fila). */
  podeAtualizar: () => boolean = () => true,
) {
  // Vale para todas as listas de pedidos em memória (recentes e histórico).
  await qc.cancelQueries({ queryKey: ["pedidos"] });
  const antes = qc.getQueriesData<P[]>({ queryKey: ["pedidos"] });
  qc.setQueriesData<P[] | undefined>({ queryKey: ["pedidos"] }, (atual) => alterar(atual));
  try {
    await gravar();
  } catch (e) {
    for (const [chave, dados] of antes) qc.setQueryData(chave, dados);
    throw e;
  } finally {
    if (podeAtualizar()) {
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
      for (const chave of outrasChaves) void qc.invalidateQueries({ queryKey: chave });
    }
  }
}

/**
 * Fila por chave: garante que gravações do mesmo item (ex.: tocar várias vezes no "+")
 * cheguem ao servidor na ordem em que foram feitas.
 */
export function criarFila() {
  const filas = new Map<string, Promise<unknown>>();
  let emAndamento = 0;
  return {
    enfileirar<T>(chave: string, tarefa: () => Promise<T>): Promise<T> {
      const anterior = filas.get(chave) ?? Promise.resolve();
      emAndamento += 1;
      const atual = anterior.catch(() => undefined).then(tarefa);
      filas.set(chave, atual);
      void atual
        .finally(() => {
          emAndamento -= 1;
          if (filas.get(chave) === atual) filas.delete(chave);
        })
        .catch(() => undefined);
      return atual;
    },
    /** Quantas gravações ainda não terminaram (contando a atual). */
    pendentes: () => emAndamento,
  };
}
