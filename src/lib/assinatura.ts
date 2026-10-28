// Plano e assinatura da confeitaria: regras puras (testadas em assinatura.test.ts).

export type Recurso = "custos" | "estoque" | "financeiro" | "recorrentes" | "catalogo" | "ia";
export type Situacao = "teste" | "ativa" | "cortesia" | "atrasada" | "suspensa" | "cancelada";

export const RECURSOS: { id: Recurso; nome: string; descricao: string }[] = [
  { id: "custos", nome: "Ficha técnica e custos", descricao: "Receita, custo por unidade, margem e lucro de cada pedido." },
  { id: "estoque", nome: "Compras e estoque", descricao: "Compras de insumos, saldo em estoque e lista de ingredientes." },
  { id: "financeiro", nome: "Financeiro", descricao: "Despesas, contas a pagar e relatórios." },
  { id: "recorrentes", nome: "Pedidos recorrentes", descricao: "Encomendas que se repetem toda semana ou mês." },
  { id: "catalogo", nome: "Catálogo on-line", descricao: "Página de pedidos com Pix, fotos, vídeos, variações e alerta de pedido novo." },
  { id: "ia", nome: "Leitura por IA", descricao: "Transforma mensagens de pedido e notas fiscais em registros." },
];

export const NOME_RECURSO: Record<Recurso, string> = Object.fromEntries(RECURSOS.map((r) => [r.id, r.nome])) as Record<Recurso, string>;

export type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_mensal: number;
  preco_anual: number | null;
  limite_pedidos_mes: number | null;
  limite_produtos: number | null;
  recursos: string[];
  ordem: number;
  ativo: boolean;
};

export type MinhaAssinatura = {
  plano: { id: string; nome: string; recursos: string[]; limite_pedidos_mes: number | null; limite_produtos: number | null; preco_mensal: number; preco_anual: number | null };
  situacao: Situacao;
  situacao_cadastrada: string;
  ciclo: "mensal" | "anual";
  valor: number | null;
  vencimento: string | null;
  bloqueio_em: string | null;
  hoje: string;
  uso: { produtos: number; pedidos_mes: number };
};

/** Sem assinatura (contas antigas ou antes da migração) tudo fica liberado. */
export function temRecurso(a: MinhaAssinatura | null | undefined, recurso: Recurso) {
  if (!a) return true;
  return a.plano.recursos.includes(recurso);
}

/** Recurso exigido por cada página do sistema. */
export function recursoDaPagina(caminho: string): Recurso | null {
  if (/^\/(financeiro|despesas|contas-pagar|relatorios|resumo-mes)(\/|$)/.test(caminho)) return "financeiro";
  if (/^\/compras(\/|$)/.test(caminho)) return "estoque";
  if (/^\/pedidos-recorrentes(\/|$)/.test(caminho)) return "recorrentes";
  return null;
}

/** Plano mais barato (ativo) que inclui o recurso. */
export function planoComRecurso(planos: Plano[], recurso: Recurso) {
  return [...planos].filter((p) => p.ativo && p.recursos.includes(recurso)).sort((a, b) => a.ordem - b.ordem || a.preco_mensal - b.preco_mensal)[0] ?? null;
}

/** Dias corridos entre duas datas ISO (yyyy-MM-dd). */
export function diasEntre(de: string, ate: string) {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(ate) - d(de)) / 86_400_000);
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export type Aviso = { tom: "info" | "alerta" | "perigo"; texto: string } | null;

/** Faixa de aviso no topo do sistema. */
export function avisoAssinatura(a: MinhaAssinatura | null | undefined): Aviso {
  if (!a) return null;
  if (a.situacao === "teste" && a.vencimento) {
    const dias = diasEntre(a.hoje, a.vencimento);
    if (dias > 7) return null;
    const quando = dias <= 0 ? "termina hoje" : dias === 1 ? "termina amanhã" : `termina em ${dias} dias`;
    return { tom: dias <= 3 ? "alerta" : "info", texto: `Seu teste grátis do plano ${a.plano.nome} ${quando} (${dataCurta(a.vencimento)}). Escolha seu plano para continuar usando.` };
  }
  if (a.situacao === "ativa" && a.vencimento) {
    const dias = diasEntre(a.hoje, a.vencimento);
    if (dias > 3) return null;
    return { tom: "info", texto: `Sua mensalidade vence ${dias <= 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`} (${dataCurta(a.vencimento)}).` };
  }
  if (a.situacao === "atrasada" && a.bloqueio_em) {
    const dias = diasEntre(a.hoje, a.bloqueio_em);
    const origem = a.situacao_cadastrada === "teste" ? "O teste grátis terminou" : "A mensalidade está vencida";
    return { tom: "perigo", texto: `${origem}. O acesso será suspenso ${dias <= 1 ? "amanhã" : `em ${dias} dias`} (${dataCurta(a.bloqueio_em)}). Regularize para não parar.` };
  }
  return null;
}

/** Mensagem de limite atingido ("PLANO: ...") sem o prefixo técnico. */
export function mensagemPlano(erro: string) {
  return erro.replace(/^.*?PLANO:\s*/, "");
}

export function precoTexto(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/** Endereço do painel de administração (site separado). */
export const URL_PAINEL_ADMIN = "https://densaymmon.github.io/minhaconfeitaria/";
