export type OpcoesConfirmacao = {
  titulo: string;
  mensagem?: string;
  /** Texto do botão que confirma (ex.: "Excluir"). */
  acao?: string;
  /** Texto do botão que desiste. */
  cancelar?: string;
  /** Ação que apaga ou cancela algo: botão em vermelho. */
  destrutivo?: boolean;
};

export type PedidoConfirmacao = OpcoesConfirmacao & { responder: (ok: boolean) => void };

let mostrar: ((pedido: PedidoConfirmacao) => void) | null = null;

/** Usado só por `<Confirmacao />` (components/app/confirmar.tsx) para receber os pedidos. */
export function registrarConfirmacao(fn: ((pedido: PedidoConfirmacao) => void) | null) {
  mostrar = fn;
}

/**
 * Substitui o `window.confirm` do navegador por uma janela do próprio app.
 * Uso: `if (!(await confirmar({ titulo: "Excluir?", destrutivo: true }))) return;`
 * Depende de `<Confirmacao />` montado uma vez na raiz (`__root.tsx`).
 */
export function confirmar(opcoes: OpcoesConfirmacao): Promise<boolean> {
  if (!mostrar) {
    // Sem a janela montada (ex.: testes), cai no diálogo do navegador para nunca pular a confirmação.
    const texto = [opcoes.titulo, opcoes.mensagem].filter(Boolean).join("\n\n");
    return Promise.resolve(typeof window !== "undefined" && window.confirm(texto));
  }
  const abrir = mostrar;
  return new Promise((resolve) => abrir({ ...opcoes, responder: resolve }));
}
