// Tipos e regras do catálogo público (funções puras, testadas em catalogo.test.ts).
// Preço, taxa e custo definitivos são sempre recalculados no servidor
// (criar_pedido_catalogo); aqui os valores servem apenas para mostrar o resumo.

export type MidiaCatalogo = { tipo: "imagem" | "video"; url: string };

export type ProdutoCatalogo = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  preco: number;
  imagem_url: string | null;
  antecedencia_dias: number;
  midias?: MidiaCatalogo[];
};

export type Catalogo = {
  nome: string;
  slogan: string | null;
  whatsapp: string | null;
  aviso: string | null;
  aceita_retirada: boolean;
  aceita_entrega: boolean;
  taxa_entrega: number;
  pedido_minimo: number;
  endereco_retirada: string | null;
  hoje: string;
  produtos: ProdutoCatalogo[];
};

export type PedidoAcompanhamento = {
  numero: number;
  status: string;
  cliente: string | null;
  data_entrega: string;
  hora_entrega: string | null;
  tipo_entrega: "retirada" | "entrega" | null;
  endereco_entrega: string | null;
  subtotal: number;
  taxa_entrega: number;
  desconto: number;
  total: number;
  pago: number;
  pagamento_informado: boolean;
  criado_em: string;
  itens: { descricao: string; quantidade: number; preco: number }[];
  confeitaria: { nome: string; whatsapp: string | null; slug: string | null; endereco_retirada: string | null; pix_chave: string | null; pix_tipo?: string | null; cidade?: string | null };
};

/** Carrinho: produto_id → quantidade. */
export type Carrinho = Record<string, number>;

export const QTD_MAX = 99;

export function alterarQuantidade(carrinho: Carrinho, produtoId: string, delta: number): Carrinho {
  const atual = carrinho[produtoId] ?? 0;
  const nova = Math.min(QTD_MAX, Math.max(0, atual + delta));
  const proximo = { ...carrinho };
  if (nova === 0) delete proximo[produtoId];
  else proximo[produtoId] = nova;
  return proximo;
}

/** Remove do carrinho produtos que saíram do catálogo e limita quantidades. */
export function limparCarrinho(carrinho: Carrinho, produtos: ProdutoCatalogo[]): Carrinho {
  const ids = new Set(produtos.map((p) => p.id));
  const limpo: Carrinho = {};
  for (const [id, qtd] of Object.entries(carrinho)) {
    const q = Math.floor(Number(qtd));
    if (ids.has(id) && q > 0) limpo[id] = Math.min(QTD_MAX, q);
  }
  return limpo;
}

export function resumoCarrinho(carrinho: Carrinho, produtos: ProdutoCatalogo[], opcoes: { entrega: boolean; taxaEntrega: number; hoje: string }) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const linhas = Object.entries(carrinho).flatMap(([id, quantidade]) => {
    const produto = porId.get(id);
    return produto ? [{ produto, quantidade, total: Math.round(produto.preco * 100) * quantidade / 100 }] : [];
  });
  const itens = linhas.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = Math.round(linhas.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const taxa = opcoes.entrega ? Math.max(0, Number(opcoes.taxaEntrega) || 0) : 0;
  const antecedencia = linhas.reduce((m, l) => Math.max(m, Number(l.produto.antecedencia_dias) || 0), 0);
  return { linhas, itens, subtotal, taxa, total: Math.round((subtotal + taxa) * 100) / 100, dataMinima: somarDias(opcoes.hoje, antecedencia) };
}

/** Soma dias a uma data AAAA-MM-DD sem depender do fuso do aparelho. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Telefone só com dígitos, sem o 55; válido com DDD (10 ou 11 dígitos). */
export function telefoneValido(telefone: string) {
  let d = telefone.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11;
}

/** Link de WhatsApp para o número da confeitaria (formato brasileiro). */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string) {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55")) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagem)}`;
}

/** Mensagem amigável a partir do erro do servidor ("CATALOGO: ..."). */
export function mensagemErroCatalogo(erro: unknown) {
  const texto = erro instanceof Error ? erro.message : typeof erro === "object" && erro && "message" in erro ? String((erro as { message: unknown }).message) : "";
  const amigavel = texto.match(/CATALOGO:\s*(.+)$/s)?.[1]?.trim();
  return amigavel || "Não foi possível enviar o pedido. Confira sua conexão e tente novamente.";
}

export const ETAPAS_PEDIDO = [
  { status: ["recebido", "confirmado"], label: "Recebido" },
  { status: ["em_producao"], label: "Em produção" },
  { status: ["pronto"], label: "Pronto" },
  { status: ["entregue", "finalizado"], label: "Entregue" },
] as const;

export function etapaAtual(status: string) {
  return ETAPAS_PEDIDO.findIndex((e) => (e.status as readonly string[]).includes(status));
}

/** Gera um slug válido (a-z, 0-9 e hífens) a partir do nome da confeitaria. */
export function sugerirSlug(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Endereços usados por páginas do sistema (mesma lista de public._slug_reservado no banco). */
export const SLUGS_RESERVADOS = [
  "c", "p", "pedido", "pedidos", "pedidos-recorrentes", "painel", "auth", "mcp", "reset-password",
  "clientes", "produtos", "producao", "financeiro", "relatorios", "despesas", "compras", "contas-pagar",
  "configuracoes", "mais", "api", "admin", "app", "login", "entrar", "cadastro", "suporte", "ajuda",
  "termos", "privacidade", "www", "assets", "static", "catalogo", "loja", "planos", "precos",
];

export function slugValido(slug: string) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 60 && !SLUGS_RESERVADOS.includes(slug);
}

/** Link curto do catálogo: dominio/endereco. */
export function linkCatalogo(origem: string, slug: string) {
  return `${origem.replace(/\/+$/, "")}/${slug}`;
}

/** Link curto de acompanhamento (código de 10 letras); o código longo continua funcionando. */
export function linkPedido(origem: string, codigo: { curto?: string | null; longo?: string | null }) {
  const base = origem.replace(/\/+$/, "");
  if (codigo.curto) return `${base}/p/${codigo.curto}`;
  if (codigo.longo) return `${base}/pedido/${codigo.longo}`;
  return null;
}

/** Fotos e vídeos do produto; produtos antigos só com imagem_url viram uma lista de uma foto. */
export function midiasDoProduto(p: ProdutoCatalogo): MidiaCatalogo[] {
  if (p.midias && p.midias.length > 0) return p.midias;
  return p.imagem_url ? [{ tipo: "imagem", url: p.imagem_url }] : [];
}

/** Capa do card: primeira foto; se só houver vídeo, o próprio vídeo. */
export function capaDoProduto(p: ProdutoCatalogo): MidiaCatalogo | null {
  const midias = midiasDoProduto(p);
  return midias.find((m) => m.tipo === "imagem") ?? midias[0] ?? null;
}

export type DadosConfirmacao = {
  loja: string;
  cliente: string | null;
  numero: number;
  itens: { descricao: string; quantidade: number; preco: number }[];
  taxaEntrega: number;
  desconto: number;
  total: number;
  pago: number;
  dataEntrega: string; // AAAA-MM-DD
  horaEntrega: string | null;
  tipoEntrega: "retirada" | "entrega" | null;
  endereco: string | null;
  pix: string | null;
  /** Código "Pix copia e cola" com o valor em aberto (opcional). */
  pixCopiaECola?: string | null;
  link: string | null;
};

const brlMsg = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(v) ? v : 0);
const dataMsg = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(data);
};

function linhasPagamento(d: Pick<DadosConfirmacao, "pix" | "pixCopiaECola">, falta: number) {
  if (!d.pix && !d.pixCopiaECola) return [`Falta pagar: ${brlMsg(falta)}`];
  return [
    `Pagamento por Pix: ${brlMsg(falta)}`,
    ...(d.pix ? [`Chave: ${d.pix}`] : []),
    ...(d.pixCopiaECola ? ["Pix copia e cola (já com o valor):", d.pixCopiaECola] : []),
  ];
}

/** Mensagem que a confeitaria envia ao cliente confirmando o pedido do catálogo. */
export function mensagemConfirmacaoPedido(d: DadosConfirmacao) {
  const primeiroNome = d.cliente?.trim().split(/\s+/)[0] ?? "";
  const falta = Math.max(0, Math.round((d.total - d.pago) * 100) / 100);
  const quando = `${dataMsg(d.dataEntrega)}${d.horaEntrega ? ` às ${d.horaEntrega}` : ""}`;
  return [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Recebemos seu pedido #${d.numero} na ${d.loja}. 💛`,
    "",
    ...d.itens.map((i) => `• ${Number(i.quantidade)}× ${i.descricao} — ${brlMsg(Number(i.quantidade) * Number(i.preco))}`),
    ...(d.taxaEntrega > 0 ? [`• Entrega — ${brlMsg(d.taxaEntrega)}`] : []),
    ...(d.desconto > 0 ? [`• Desconto — −${brlMsg(d.desconto)}`] : []),
    `*Total: ${brlMsg(d.total)}*`,
    "",
    d.tipoEntrega === "entrega" ? `🚚 Entrega ${quando}${d.endereco ? `\nEndereço: ${d.endereco}` : ""}` : `🏠 Retirada ${quando}${d.endereco ? `\nLocal: ${d.endereco}` : ""}`,
    ...(falta > 0
      ? ["", ...linhasPagamento(d, falta)]
      : ["", "Pagamento confirmado ✅"]),
    ...(d.link ? ["", `Acompanhe o andamento: ${d.link}`] : []),
    "",
    "Qualquer dúvida, é só responder esta mensagem.",
  ].join("\n");
}

/** Mensagem que o cliente envia à confeitaria pela página do pedido: resumo e link de acompanhamento. */
export function mensagemPedidoParaLoja(d: Omit<DadosConfirmacao, "loja" | "pix">) {
  const quando = `${dataMsg(d.dataEntrega)}${d.horaEntrega ? ` às ${d.horaEntrega}` : ""}`;
  const falta = Math.max(0, Math.round((d.total - d.pago) * 100) / 100);
  return [
    `Olá! Fiz o pedido #${d.numero} pelo catálogo.`,
    "",
    ...d.itens.map((i) => `• ${Number(i.quantidade)}× ${i.descricao} — ${brlMsg(Number(i.quantidade) * Number(i.preco))}`),
    ...(d.taxaEntrega > 0 ? [`• Entrega — ${brlMsg(d.taxaEntrega)}`] : []),
    ...(d.desconto > 0 ? [`• Desconto — −${brlMsg(d.desconto)}`] : []),
    `*Total: ${brlMsg(d.total)}*${falta <= 0 ? " (pago)" : ""}`,
    "",
    d.tipoEntrega === "entrega" ? `🚚 Entrega ${quando}${d.endereco ? `\nEndereço: ${d.endereco}` : ""}` : `🏠 Retirada ${quando}`,
    ...(d.cliente ? [`Nome: ${d.cliente}`] : []),
    ...(d.link ? ["", `Acompanhar o pedido: ${d.link}`] : []),
  ].join("\n");
}

/** Aviso de pedido pronto, enviado pela confeitaria ao cliente. */
export function mensagemPedidoPronto(d: DadosConfirmacao) {
  const primeiroNome = d.cliente?.trim().split(/\s+/)[0] ?? "";
  const falta = Math.max(0, Math.round((d.total - d.pago) * 100) / 100);
  return [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Seu pedido #${d.numero} da ${d.loja} está pronto! 🎉`,
    "",
    d.tipoEntrega === "entrega"
      ? `🚚 Já vamos sair para a entrega${d.endereco ? ` em: ${d.endereco}` : ""}.`
      : `🏠 Pode retirar${d.horaEntrega ? ` a partir das ${d.horaEntrega}` : ""}${d.endereco ? ` em: ${d.endereco}` : ""}.`,
    ...(falta > 0 ? ["", ...linhasPagamento(d, falta)] : []),
    ...(d.link ? ["", `Acompanhe: ${d.link}`] : []),
    "",
    "Obrigado pela preferência! 💛",
  ].join("\n");
}
