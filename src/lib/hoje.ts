// Tela "Hoje": o que a confeitaria precisa fazer agora. Funções puras (hoje.test.ts).

const FINAIS = ["entregue", "finalizado", "cancelado"];

export type PedidoHoje = {
  id: string;
  numero: number;
  status: string;
  origem?: string | null;
  visualizado_em?: string | null;
  aviso_pronto_enviado_em?: string | null;
  lembrete_enviado_em?: string | null;
  tipo_entrega?: string | null;
  endereco_entrega?: string | null;
  data_entrega: string;
  hora_entrega: string | null;
  clientes: { nome: string; telefone?: string | null } | null;
  pedido_itens: { descricao: string; quantidade: number; quantidade_produzida: number }[];
  t: { venda: number; saldo: number };
};

export type ItemProduzir = { descricao: string; pendente: number; pedidos: number; maisCedo: string };

export type ResumoHoje<P extends PedidoHoje> = {
  novos: P[];
  atrasados: P[];
  entregarHoje: P[];
  entregarAmanha: P[];
  avisarPronto: P[];
  /** Entregas de amanhã cujo cliente ainda não recebeu o lembrete. */
  lembrar: P[];
  cobrar: P[];
  produzir: ItemProduzir[];
  aReceberHoje: number;
};

const porHorario = (a: PedidoHoje, b: PedidoHoje) =>
  a.data_entrega.localeCompare(b.data_entrega) || (a.hora_entrega ?? "23:59").localeCompare(b.hora_entrega ?? "23:59") || a.numero - b.numero;

const ativo = (p: PedidoHoje) => !FINAIS.includes(p.status);

/**
 * Monta as listas do dia. "Produzir" soma o que falta dos pedidos ativos com entrega
 * até amanhã (inclui atrasados), agrupado pela descrição do item.
 */
export function montarHoje<P extends PedidoHoje>(pedidos: P[], hoje: string, amanha: string): ResumoHoje<P> {
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  const novos = validos.filter((p) => p.origem === "catalogo" && !p.visualizado_em).sort(porHorario);
  const atrasados = validos.filter((p) => ativo(p) && p.data_entrega < hoje).sort(porHorario);
  const entregarHoje = validos.filter((p) => ativo(p) && p.data_entrega === hoje).sort(porHorario);
  const entregarAmanha = validos.filter((p) => ativo(p) && p.data_entrega === amanha).sort(porHorario);
  const lembrar = entregarAmanha.filter((p) => !p.lembrete_enviado_em && p.clientes?.telefone);
  const avisarPronto = validos.filter((p) => p.status === "pronto" && !p.aviso_pronto_enviado_em).sort(porHorario);
  // Cobrar: já entregue com saldo, ou entrega até hoje ainda com saldo.
  const cobrar = validos
    .filter((p) => p.t.saldo > 0.009 && (["entregue", "finalizado"].includes(p.status) || p.data_entrega <= hoje))
    .sort(porHorario);

  const mapa = new Map<string, ItemProduzir & { ids: Set<string> }>();
  for (const p of validos) {
    if (!ativo(p) || p.status === "pronto" || p.data_entrega > amanha) continue;
    for (const item of p.pedido_itens) {
      const falta = Math.max(0, Number(item.quantidade) - Number(item.quantidade_produzida));
      if (falta <= 0) continue;
      const atual = mapa.get(item.descricao) ?? { descricao: item.descricao, pendente: 0, pedidos: 0, maisCedo: p.data_entrega, ids: new Set<string>() };
      atual.pendente += falta;
      atual.ids.add(p.id);
      atual.pedidos = atual.ids.size;
      if (p.data_entrega < atual.maisCedo) atual.maisCedo = p.data_entrega;
      mapa.set(item.descricao, atual);
    }
  }
  const produzir = [...mapa.values()]
    .map(({ ids: _ids, ...resto }) => resto)
    .sort((a, b) => a.maisCedo.localeCompare(b.maisCedo) || b.pendente - a.pendente || a.descricao.localeCompare(b.descricao, "pt-BR"));

  const aReceberHoje = entregarHoje.reduce((s, p) => s + Math.max(0, p.t.saldo), 0);
  return { novos, atrasados, entregarHoje, entregarAmanha, avisarPronto, lembrar, cobrar, produzir, aReceberHoje };
}

/** Mensagem de cobrança do saldo (mesmo texto da lista de pedidos). */
export function mensagemCobranca(p: Pick<PedidoHoje, "numero" | "data_entrega" | "status" | "clientes" | "t">, pix: string | null | undefined) {
  const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const data = `${p.data_entrega.slice(8, 10)}/${p.data_entrega.slice(5, 7)}/${p.data_entrega.slice(0, 4)}`;
  const entregue = ["entregue", "finalizado"].includes(p.status);
  return [
    `Olá ${p.clientes?.nome ?? ""}! Tudo bem?`,
    entregue
      ? `Passando para lembrar do saldo do pedido #${p.numero} (entregue em ${data}).`
      : `Passando para lembrar do pagamento do pedido #${p.numero} (entrega em ${data}).`,
    `Valor em aberto: ${brl(p.t.saldo)}`,
    ...(pix?.trim() ? [`Chave Pix: ${pix.trim()}`] : []),
    "",
    "Obrigado! 💛",
  ].join("\n");
}

/** Saudação conforme a hora. */
export function saudacao(hora: number) {
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

/** Lembrete da véspera: data, horário, retirada/entrega, itens e o que falta pagar. */
export function mensagemLembrete(
  p: Pick<PedidoHoje, "numero" | "data_entrega" | "hora_entrega" | "clientes" | "t" | "pedido_itens" | "tipo_entrega" | "endereco_entrega">,
  opcoes: { loja: string; pix?: string | null; enderecoRetirada?: string | null; linkPix?: string | null },
) {
  const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const data = `${p.data_entrega.slice(8, 10)}/${p.data_entrega.slice(5, 7)}`;
  const hora = p.hora_entrega ? ` às ${p.hora_entrega.slice(0, 5)}` : "";
  const onde = p.tipo_entrega === "entrega"
    ? `🚗 Entrega${p.endereco_entrega ? ` em: ${p.endereco_entrega}` : ""}`
    : `📍 Retirada${opcoes.enderecoRetirada ? ` em: ${opcoes.enderecoRetirada}` : " na confeitaria"}`;
  const itens = p.pedido_itens.map((i) => `• ${Number(i.quantidade)}× ${i.descricao}`);
  return [
    `Olá ${p.clientes?.nome?.split(" ")[0] ?? ""}! Aqui é da ${opcoes.loja} 😊`,
    `Passando para lembrar que seu pedido #${p.numero} é amanhã (${data})${hora}.`,
    "",
    ...itens,
    "",
    onde,
    ...(p.t.saldo > 0.009 ? ["", `Falta pagar: ${brl(p.t.saldo)}`, ...(opcoes.pix?.trim() ? [`Chave Pix: ${opcoes.pix.trim()}`] : [])] : []),
    "",
    "Qualquer dúvida é só responder aqui. Até amanhã! 💛",
  ].join("\n");
}
