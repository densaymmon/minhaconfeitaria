// Tipos e regras do catálogo público (funções puras, testadas em catalogo.test.ts).
// Preço, taxa e custo definitivos são sempre recalculados no servidor
// (criar_pedido_catalogo); aqui os valores servem apenas para mostrar o resumo.

export type MidiaCatalogo = { tipo: "imagem" | "video"; url: string };

/** Grupo de escolha única (ex.: Tamanho) com o acréscimo de preço de cada opção. */
export type GrupoOpcoes = { grupo: string; itens: { nome: string; preco: number }[] };
/** Opções escolhidas pelo cliente: grupo → opção. */
export type Escolha = Record<string, string>;

export type ProdutoCatalogo = {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  preco: number;
  imagem_url: string | null;
  antecedencia_dias: number;
  midias?: MidiaCatalogo[];
  opcoes?: GrupoOpcoes[];
  /** Limite de unidades por dia de entrega (null = sem limite) e o já reservado por data. */
  limite_dia?: number | null;
  reservas?: Record<string, number> | null;
  /** Último dia de venda (produto sazonal). */
  venda_ate?: string | null;
  /** Itens do kit. */
  componentes?: { nome: string; quantidade: number }[] | null;
};

export type Fidelidade = { a_cada: number; tipo: "percentual" | "valor"; valor: number };
export type ResumoAvaliacoes = { media: number; total: number; ultimas: { nota: number; comentario: string | null; cliente: string | null; data: string }[] };

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
  /** Campos da versão com agenda, aparência, bairros, cupons e encomenda (opcionais para catálogos em cache). */
  cor?: string | null;
  logo_url?: string | null;
  dias_fechados?: number[];
  datas_bloqueadas?: string[];
  horarios_retirada?: string[];
  bairros?: TaxaBairro[];
  aceita_encomenda?: boolean;
  tem_cupons?: boolean;
  sinal_percentual?: number;
  sinal_a_partir_de?: number;
  fidelidade?: Fidelidade | null;
  avaliacoes?: ResumoAvaliacoes | null;
};

export type TaxaBairro = { bairro: string; taxa: number };

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD, sem depender do fuso. */
export function diaDaSemana(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** Motivo de a data não estar disponível (ou null se a confeitaria atende). */
export function motivoDataIndisponivel(cat: Pick<Catalogo, "dias_fechados" | "datas_bloqueadas">, iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  if ((cat.dias_fechados ?? []).includes(diaDaSemana(iso))) return `A confeitaria não atende às ${DIAS_SEMANA[diaDaSemana(iso)]?.toLowerCase()}s. Escolha outra data.`;
  if ((cat.datas_bloqueadas ?? []).includes(iso)) return "A confeitaria não atende nesta data. Escolha outra.";
  return null;
}

/** Primeira data a partir de `desde` em que a confeitaria atende (até 180 dias). */
export function proximaDataDisponivel(cat: Pick<Catalogo, "dias_fechados" | "datas_bloqueadas">, desde: string) {
  for (let i = 0; i <= 180; i++) {
    const d = somarDias(desde, i);
    if (!motivoDataIndisponivel(cat, d)) return d;
  }
  return desde;
}

/** Taxa de entrega: pelo bairro escolhido quando há lista; senão a taxa única. null = bairro ainda não escolhido. */
export function taxaDeEntrega(cat: Pick<Catalogo, "taxa_entrega" | "bairros">, bairro: string | null | undefined) {
  const lista = cat.bairros ?? [];
  if (lista.length === 0) return Math.max(0, Number(cat.taxa_entrega) || 0);
  const alvo = (bairro ?? "").trim().toLowerCase();
  const achado = lista.find((b) => b.bairro.trim().toLowerCase() === alvo);
  return achado ? Math.max(0, Number(achado.taxa) || 0) : null;
}

/** Código de cupom como gravado: maiúsculas, só letras e números, até 20. */
export function normalizarCupom(codigo: string) {
  return codigo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
}

/** Valida a lista de bairros editada pela confeitaria (mesmas regras do banco). */
export function validarBairros(lista: TaxaBairro[]): string | null {
  if (lista.length > 100) return "Cadastre no máximo 100 bairros.";
  const vistos = new Set<string>();
  for (const b of lista) {
    const nome = b.bairro.trim();
    if (!nome || nome.length > 60) return "Cada bairro precisa de um nome com até 60 letras.";
    if (!Number.isFinite(b.taxa) || b.taxa < 0 || b.taxa > 1000) return `Taxa inválida para ${nome}.`;
    const chave = nome.toLowerCase();
    if (vistos.has(chave)) return `O bairro ${nome} aparece duas vezes.`;
    vistos.add(chave);
  }
  return null;
}

/** Horários de retirada em HH:MM, sem repetidos e em ordem. */
export function normalizarHorarios(texto: string[]): string[] | null {
  const lista = texto.map((h) => h.trim()).filter(Boolean);
  if (lista.some((h) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) return null;
  return [...new Set(lista)].sort().slice(0, 24);
}

/** Cor legível sobre a cor da marca (texto branco ou escuro). */
export function corDoTexto(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1] ?? "000000", 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.45 ? "#1f1a17" : "#ffffff";
}

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
  sinal?: number;
  encomenda?: boolean;
  pode_avaliar?: boolean;
  avaliacao?: { nota: number; comentario: string | null } | null;
  itens: { descricao: string; quantidade: number; preco: number }[];
  confeitaria: { nome: string; whatsapp: string | null; slug: string | null; endereco_retirada: string | null; pix_chave: string | null; pix_tipo?: string | null; cidade?: string | null };
};

/** Carrinho: chave do item (produto + opções escolhidas) → quantidade. */
export type Carrinho = Record<string, number>;

const arred = (v: number) => Math.round(v * 100) / 100;

/** Chave estável do item no carrinho: o mesmo produto com opções diferentes vira outra linha. */
export function chaveCarrinho(produtoId: string, escolha?: Escolha | null) {
  const pares = Object.entries(escolha ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return pares.length ? `${produtoId}|${encodeURIComponent(JSON.stringify(pares))}` : produtoId;
}

export function lerChaveCarrinho(chave: string): { produtoId: string; escolha: Escolha } {
  const corte = chave.indexOf("|");
  if (corte < 0) return { produtoId: chave, escolha: {} };
  try {
    const pares = JSON.parse(decodeURIComponent(chave.slice(corte + 1))) as unknown;
    const escolha: Escolha = {};
    if (Array.isArray(pares)) for (const par of pares) if (Array.isArray(par) && typeof par[0] === "string" && typeof par[1] === "string") escolha[par[0]] = par[1];
    return { produtoId: chave.slice(0, corte), escolha };
  } catch {
    return { produtoId: chave.slice(0, corte), escolha: {} };
  }
}

/** Todas as opções obrigatórias escolhidas, sem opções a mais nem inexistentes. */
export function escolhaCompleta(p: ProdutoCatalogo, escolha: Escolha) {
  const grupos = p.opcoes ?? [];
  if (Object.keys(escolha).some((g) => !grupos.some((x) => x.grupo === g))) return false;
  return grupos.every((g) => g.itens.some((i) => i.nome === escolha[g.grupo]));
}

export function precoComOpcoes(p: ProdutoCatalogo, escolha: Escolha) {
  const extra = (p.opcoes ?? []).reduce((s, g) => s + (g.itens.find((i) => i.nome === escolha[g.grupo])?.preco ?? 0), 0);
  return arred(Number(p.preco) + extra);
}

/** Menor preço possível ("a partir de"), para produtos com opções. */
export function precoMinimo(p: ProdutoCatalogo) {
  return arred(Number(p.preco) + (p.opcoes ?? []).reduce((s, g) => s + Math.min(...g.itens.map((i) => Number(i.preco))), 0));
}

/** Mesmo formato da descrição gravada pelo servidor: "Bolo (Tamanho: G, Sabor: Morango)". */
export function descricaoComOpcoes(p: ProdutoCatalogo, escolha: Escolha) {
  const partes = (p.opcoes ?? []).filter((g) => escolha[g.grupo]).map((g) => `${g.grupo}: ${escolha[g.grupo]}`);
  return partes.length ? `${p.nome} (${partes.join(", ")})` : p.nome;
}

export const QTD_MAX = 99;

export function alterarQuantidade(carrinho: Carrinho, produtoId: string, delta: number): Carrinho {
  const atual = carrinho[produtoId] ?? 0;
  const nova = Math.min(QTD_MAX, Math.max(0, atual + delta));
  const proximo = { ...carrinho };
  if (nova === 0) delete proximo[produtoId];
  else proximo[produtoId] = nova;
  return proximo;
}

/** Remove do carrinho produtos/opções que saíram do catálogo e limita quantidades. */
export function limparCarrinho(carrinho: Carrinho, produtos: ProdutoCatalogo[]): Carrinho {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const limpo: Carrinho = {};
  for (const [chave, qtd] of Object.entries(carrinho)) {
    const q = Math.floor(Number(qtd));
    const { produtoId, escolha } = lerChaveCarrinho(chave);
    const produto = porId.get(produtoId);
    if (produto && q > 0 && escolhaCompleta(produto, escolha)) limpo[chave] = Math.min(QTD_MAX, q);
  }
  return limpo;
}

export function resumoCarrinho(carrinho: Carrinho, produtos: ProdutoCatalogo[], opcoes: { entrega: boolean; taxaEntrega: number; hoje: string }) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const linhas = Object.entries(carrinho).flatMap(([chave, quantidade]) => {
    const { produtoId, escolha } = lerChaveCarrinho(chave);
    const produto = porId.get(produtoId);
    if (!produto || !escolhaCompleta(produto, escolha)) return [];
    const precoUnit = precoComOpcoes(produto, escolha);
    return [{ chave, produto, escolha, quantidade, precoUnit, descricao: descricaoComOpcoes(produto, escolha), total: arred(precoUnit * quantidade) }];
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
  "plataforma", "comecar", "resumo-mes", "equipe", "convite", "sw", "manifest", "fonts", "encomenda", "icons",
  "agenda", "lista-compras", "entregas", "etiquetas", "fluxo-caixa", "historico", "primeiros-passos",
];

export function slugValido(slug: string) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 60 && !SLUGS_RESERVADOS.includes(slug);
}

/**
 * Miniatura da foto para a lista do catálogo. Fotos enviadas a partir desta versão
 * terminam em "-g.jpg" e têm a miniatura em "-p.jpg"; as antigas usam a própria foto.
 */
export function miniaturaDaFoto(url: string) {
  return /-g\.jpg(\?.*)?$/.test(url) ? url.replace(/-g\.jpg(\?.*)?$/, "-p.jpg$1") : url;
}

/** Endereço público do sistema (o publicado, que clientes conseguem abrir sem login). */
export const URL_SISTEMA = "https://minhaconfeitaria.lovable.app";

/**
 * Origem usada nos links enviados a clientes (catálogo, acompanhamento do pedido).
 * Prévias do Lovable e o ambiente local exigem login ou não existem fora do aparelho,
 * então nesses casos o link sai sempre com o endereço publicado.
 */
export function origemPublica(origem?: string | null) {
  const atual = origem ?? (typeof window === "undefined" ? "" : window.location.origin);
  try {
    const host = new URL(atual).hostname;
    if (!host || host === "localhost" || /^127\./.test(host) || host.endsWith(".lovableproject.com") || host.startsWith("id-preview--") || host.startsWith("preview--") || host === "lovable.dev" || host.endsWith(".lovable.dev")) {
      return URL_SISTEMA;
    }
    return `${new URL(atual).protocol}//${new URL(atual).host}`;
  } catch {
    return URL_SISTEMA;
  }
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
  /** Sinal para confirmar (0 = sem sinal). */
  sinal?: number;
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
      ? ["", ...(Number(d.sinal ?? 0) > d.pago ? [`Para confirmar, o sinal é de ${brlMsg(Number(d.sinal) - d.pago)} (o restante até a entrega).`] : []), ...linhasPagamento(d, falta)]
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

/** Fotos de referência da encomenda personalizada citadas nas observações do pedido. */
export function fotosDeReferencia(texto: string | null | undefined) {
  const achadas = (texto ?? "").match(/https:\/\/[^\s]+\/storage\/v1\/object\/public\/catalogo\/encomendas\/[^\s]+\.(?:jpe?g|png|webp)/gi) ?? [];
  return [...new Set(achadas)].slice(0, 3);
}

/** Unidades ainda disponíveis do produto na data (null = sem limite). */
export function restanteNoDia(p: Pick<ProdutoCatalogo, "limite_dia" | "reservas">, data: string) {
  if (p.limite_dia == null) return null;
  return Math.max(0, Number(p.limite_dia) - Number(p.reservas?.[data] ?? 0));
}

/** Produtos do carrinho que passam do limite do dia escolhido. */
export function excessoNoLimite(linhas: { produto: ProdutoCatalogo; quantidade: number }[], data: string) {
  const porProduto = new Map<string, { produto: ProdutoCatalogo; quantidade: number }>();
  for (const l of linhas) {
    const atual = porProduto.get(l.produto.id);
    porProduto.set(l.produto.id, { produto: l.produto, quantidade: (atual?.quantidade ?? 0) + l.quantidade });
  }
  return [...porProduto.values()].flatMap(({ produto, quantidade }) => {
    const restante = restanteNoDia(produto, data);
    return restante !== null && quantidade > restante ? [{ nome: produto.nome, pedido: quantidade, restante }] : [];
  });
}

/** Sinal para confirmar o pedido (mesma regra do servidor). */
export function sinalDoPedido(total: number, cat: Pick<Catalogo, "sinal_percentual" | "sinal_a_partir_de">) {
  const pct = Number(cat.sinal_percentual ?? 0);
  if (pct <= 0 || total < Number(cat.sinal_a_partir_de ?? 0)) return 0;
  return Math.round(total * pct) / 100;
}

/** Desconto da fidelidade sobre os produtos (mesma regra do servidor). */
export function descontoFidelidade(subtotal: number, f: Fidelidade | null | undefined) {
  if (!f) return 0;
  return f.tipo === "valor" ? Math.min(Number(f.valor), subtotal) : Math.round(subtotal * Number(f.valor)) / 100;
}

export function textoFidelidade(f: Fidelidade) {
  const premio = f.tipo === "valor" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(f.valor)) : `${Number(f.valor)}%`;
  return `A cada ${f.a_cada} pedidos, o próximo ganha ${premio} de desconto.`;
}

/** "Inclui: 2× Bolo de pote, 10× Brigadeiro". */
export function textoComponentes(c: ProdutoCatalogo["componentes"]) {
  if (!c?.length) return null;
  return `Inclui: ${c.map((i) => `${Number(i.quantidade)}× ${i.nome}`).join(", ")}`;
}
