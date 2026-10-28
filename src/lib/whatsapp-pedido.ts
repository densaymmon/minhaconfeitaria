import type { PedidoCalc } from "./hooks";
import { linkPedido, linkWhatsApp, mensagemConfirmacaoPedido } from "./catalogo";

/**
 * Mensagem de confirmação de um pedido do catálogo, para a confeitaria enviar do próprio
 * WhatsApp ao cliente (abre a conversa com o texto pronto). Retorna null sem telefone válido.
 */
export function confirmacaoWhatsApp(
  p: PedidoCalc,
  opcoes: { loja: string; pix: string | null; enderecoRetirada: string | null; origem: string },
) {
  const tipo = p.tipo_entrega === "entrega" ? "entrega" : p.tipo_entrega === "retirada" ? "retirada" : null;
  const texto = mensagemConfirmacaoPedido({
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
    pix: opcoes.pix?.trim() || null,
    link: linkPedido(opcoes.origem, { curto: p.codigo_curto, longo: p.codigo_publico }),
  });
  const url = linkWhatsApp(p.clientes?.telefone, texto);
  return url ? { url, texto } : null;
}

/** Pedido do catálogo ainda aberto e sem confirmação enviada ao cliente. */
export function precisaConfirmar(p: Pick<PedidoCalc, "origem" | "confirmacao_enviada_em" | "status">) {
  return p.origem === "catalogo" && !p.confirmacao_enviada_em && !["cancelado", "entregue", "finalizado"].includes(p.status);
}
