import type { PedidoCalc } from "./hooks";
import { linkPedido, linkWhatsApp, mensagemConfirmacaoPedido, mensagemPedidoPronto, type DadosConfirmacao } from "./catalogo";
import { pixCopiaECola, tipoChaveValido } from "./pix";

export type OpcoesMensagemPedido = {
  loja: string;
  pix: string | null;
  pixTipo?: string | null;
  cidade?: string | null;
  enderecoRetirada: string | null;
  origem: string;
};

/** Dados comuns às mensagens do pedido, com o Pix copia e cola do valor em aberto. */
export function dadosMensagemPedido(p: PedidoCalc, opcoes: OpcoesMensagemPedido): DadosConfirmacao {
  const tipo = p.tipo_entrega === "entrega" ? "entrega" : p.tipo_entrega === "retirada" ? "retirada" : null;
  const falta = Math.max(0, Math.round((p.t.venda - p.t.recebido) * 100) / 100);
  const pix = opcoes.pix?.trim() || null;
  return {
    loja: opcoes.loja,
    cliente: p.clientes?.nome ?? null,
    numero: p.numero,
    itens: p.pedido_itens.map((i) => ({ descricao: i.descricao, quantidade: Number(i.quantidade), preco: Number(i.preco_unitario) })),
    taxaEntrega: Number(p.taxa_entrega) || 0,
    desconto: Number(p.desconto) || 0,
    total: p.t.venda,
    pago: p.t.recebido,
    dataEntrega: p.data_entrega,
    horaEntrega: p.hora_entrega,
    tipoEntrega: tipo,
    endereco: tipo === "entrega" ? p.endereco_entrega : opcoes.enderecoRetirada,
    pix,
    pixCopiaECola: pix && falta > 0
      ? pixCopiaECola({ chave: pix, tipoChave: tipoChaveValido(opcoes.pixTipo), nome: opcoes.loja, cidade: opcoes.cidade, valor: falta, identificador: `PEDIDO${p.numero}` })
      : null,
    link: linkPedido(opcoes.origem, { curto: p.codigo_curto, longo: p.codigo_publico }),
    sinal: Number(p.sinal_valor ?? 0) || 0,
  };
}

/**
 * Mensagem de confirmação de um pedido, para a confeitaria enviar do próprio
 * WhatsApp ao cliente (abre a conversa com o texto pronto). Retorna null sem telefone válido.
 */
export function confirmacaoWhatsApp(p: PedidoCalc, opcoes: OpcoesMensagemPedido) {
  const texto = mensagemConfirmacaoPedido(dadosMensagemPedido(p, opcoes));
  const url = linkWhatsApp(p.clientes?.telefone, texto);
  return url ? { url, texto } : null;
}

/** Aviso de "pedido pronto" para o WhatsApp do cliente. */
export function avisoProntoWhatsApp(p: PedidoCalc, opcoes: OpcoesMensagemPedido) {
  const texto = mensagemPedidoPronto(dadosMensagemPedido(p, opcoes));
  const url = linkWhatsApp(p.clientes?.telefone, texto);
  return url ? { url, texto } : null;
}

/** Pedido do catálogo ainda aberto e sem confirmação enviada ao cliente. */
export function precisaConfirmar(p: Pick<PedidoCalc, "origem" | "confirmacao_enviada_em" | "status">) {
  return p.origem === "catalogo" && !p.confirmacao_enviada_em && !["cancelado", "entregue", "finalizado", "pronto"].includes(p.status);
}

/** Pedido pronto cujo cliente ainda não foi avisado. */
export function precisaAvisarPronto(p: Pick<PedidoCalc, "status" | "aviso_pronto_enviado_em">) {
  return p.status === "pronto" && !p.aviso_pronto_enviado_em;
}
