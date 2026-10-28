import type { MinhaAssinatura, Plano } from "./assinatura";
import type { PlataformaPublica } from "./termos";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { CONFIG_PADRAO, type Config } from "./calc";
import { hojeISO } from "./format";
import { format, subDays } from "date-fns";

export type Cliente = Tables<"clientes">;
export type Insumo = Tables<"insumos">;
export type ReceitaItem = Tables<"receita_itens">;
export type Produto = Tables<"produtos"> & { receita_itens: ReceitaItem[] };
export type PedidoItem = Tables<"pedido_itens">;
export type PedidoPagamento = Tables<"pedido_pagamentos">;
export type Pedido = Tables<"pedidos"> & {
  pedido_itens: PedidoItem[];
  clientes: { nome: string; telefone: string | null } | null;
};
export type Despesa = Tables<"despesas">;
export type Confeitaria = Tables<"confeitarias">;
export type Compra = Tables<"compras">;
export type CompraItem = Tables<"compra_itens">;
export type ContaPagar = Tables<"contas_pagar">;
export type ContaPagarPagamento = Tables<"contas_pagar_pagamentos">;
export type ContaPagarEstorno = Tables<"contas_pagar_estornos">;


async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export const clientesQ = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => must<Cliente[]>(supabase.from("clientes").select("*").order("nome")),
});

export const insumosQ = queryOptions({
  queryKey: ["insumos"],
  queryFn: () => must<Insumo[]>(supabase.from("insumos").select("*").order("nome")),
});

export const produtosQ = queryOptions({
  queryKey: ["produtos"],
  queryFn: () => must<Produto[]>(supabase.from("produtos").select("*, receita_itens(*)").order("nome")),
});

export const pedidoPagamentosQ = queryOptions({
  queryKey: ["pedido-pagamentos"],
  queryFn: () => must<PedidoPagamento[]>(supabase.from("pedido_pagamentos").select("*").order("data_pagamento", { ascending: false })),
});

/** Dias de pedidos já entregues que as telas do dia a dia carregam (os em aberto vêm sempre). */
export const DIAS_PEDIDOS_RECENTES = 90;
const STATUS_EM_ABERTO = ["recebido", "confirmado", "em_producao", "pronto"];

/**
 * Pedidos das telas do dia a dia (Hoje, Produção): os em aberto e os com entrega nos
 * últimos 90 dias. Leve mesmo com anos de histórico.
 */
export const pedidosQ = queryOptions({
  queryKey: ["pedidos"],
  queryFn: async () => {
    const limite = format(subDays(new Date(), DIAS_PEDIDOS_RECENTES), "yyyy-MM-dd");
    const { data, error } = await supabase.from("pedidos")
      .select("*, pedido_itens(*), clientes(nome, telefone)")
      .or(`data_entrega.gte.${limite},status.in.(${STATUS_EM_ABERTO.join(",")})`)
      .order("data_entrega", { ascending: false })
      .order("numero", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pedido[];
  },
  refetchInterval: 60_000,
});

/** Histórico completo (lista de pedidos, clientes, relatórios, compras). */
export const pedidosHistoricoQ = queryOptions({
  queryKey: ["pedidos", "historico"],
  queryFn: async () => {
    const { data, error } = await supabase.from("pedidos")
      .select("*, pedido_itens(*), clientes(nome, telefone)")
      .order("data_entrega", { ascending: false })
      .order("numero", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Pedido[];
  },
  });

export const despesasQ = queryOptions({
  queryKey: ["despesas"],
  queryFn: () => must<Despesa[]>(supabase.from("despesas").select("*").order("data", { ascending: false })),
});

export const configQ = queryOptions({
  queryKey: ["config"],
  queryFn: async (): Promise<Config> => {
    const row = await must<Tables<"configuracoes"> | null>(supabase.from("configuracoes").select("*").maybeSingle());
    if (!row) return CONFIG_PADRAO;
    const { user_id: _u, ...rest } = row;
    return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, k === "pix_chave" ? String(v ?? "") : k === "pix_tipo" ? (v ?? null) : Number(v)])) as Config;
  },
});

/**
 * Dados da confeitaria da conta logada (nome, slogan, WhatsApp).
 * Retorna null enquanto a migração 0033 não estiver aplicada, para a tela continuar funcionando.
 */
export type Cupom = Tables<"cupons">;
export const cuponsQ = queryOptions({
  queryKey: ["cupons"],
  queryFn: () => must<Cupom[]>(supabase.from("cupons").select("*").order("created_at", { ascending: false })),
});

export const confeitariaQ = queryOptions({
  queryKey: ["confeitaria"],
  queryFn: async (): Promise<Confeitaria | null> => {
    const { data, error } = await supabase.from("confeitarias").select("*").maybeSingle();
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01" || error.message.includes("confeitarias")) return null;
      throw new Error(error.message);
    }
    return data;
  },
  staleTime: 5 * 60_000,
});

/** Fotos e vídeos do produto, na ordem do catálogo. Vazio antes da migração 0035. */
export const midiasProdutoQ = (produtoId: string) => queryOptions({
  queryKey: ["produto-midias", produtoId],
  queryFn: async () => {
    if (!/^[0-9a-f-]{36}$/i.test(produtoId)) return [];
    const { data, error } = await supabase.from("produto_midias").select("tipo, url, ordem").eq("produto_id", produtoId).order("ordem");
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01" || error.message.includes("produto_midias")) return [];
      throw new Error(error.message);
    }
    return (data ?? []).map((m) => ({ tipo: m.tipo === "video" ? ("video" as const) : ("imagem" as const), url: m.url }));
  },
});

export const comprasQ = queryOptions({
  queryKey: ["compras"],
  queryFn: () => must<Compra[]>(supabase.from("compras").select("*").order("data_compra", { ascending: false })),
});
export const compraItensQ = queryOptions({
  queryKey: ["compra-itens"],
  queryFn: () => must<CompraItem[]>(supabase.from("compra_itens").select("*").order("created_at")),
});


export const contasPagarQ = queryOptions({
  queryKey: ["contas-pagar"],
  queryFn: async () => {
    const contas = await must<ContaPagar[]>(
      supabase.from("contas_pagar").select("*").order("data_vencimento", { ascending: true }),
    );
    const { data: exclusoes, error } = await supabase.from("contas_pagar_exclusoes").select("conta_id");
    // Compatibilidade durante a implantação: antes da SQL incremental, mantém a tela funcionando.
    if (error) {
      if (error.code === "PGRST205" || error.message.includes("contas_pagar_exclusoes")) return contas;
      throw new Error(error.message);
    }
    const ocultas = new Set((exclusoes ?? []).map((item) => item.conta_id));
    return contas.filter((conta) => !ocultas.has(conta.id));
  },
});

export const contasPagarPagamentosQ = queryOptions({
  queryKey: ["contas-pagar-pagamentos"],
  queryFn: () => must<ContaPagarPagamento[]>(
    supabase.from("contas_pagar_pagamentos").select("*").order("data_pagamento", { ascending: false }),
  ),
});

export const contasPagarEstornosQ = queryOptions({
  queryKey: ["contas-pagar-estornos"],
  queryFn: () => must<ContaPagarEstorno[]>(
    supabase.from("contas_pagar_estornos").select("*").order("created_at", { ascending: false }),
  ),
});

/** Dados públicos da plataforma (cadastro aberto, responsável e contato); null antes da migração 0038. */
export const plataformaPublicaQ = queryOptions({
  queryKey: ["plataforma-publica"],
  queryFn: async (): Promise<PlataformaPublica | null> => {
    const { data, error } = await supabase.rpc("plataforma_publica");
    if (error || !data) return null;
    return data as unknown as PlataformaPublica;
  },
  staleTime: 10 * 60_000,
});

/** A conta logada administra a plataforma? (false se a função ainda não existir). */
export const ehAdminQ = queryOptions({
  queryKey: ["eh-admin-plataforma"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("eh_admin_plataforma");
    return !error && data === true;
  },
  staleTime: 10 * 60_000,
});

/** Plano e assinatura da conta logada; null em contas sem assinatura (tudo liberado). */
export const minhaAssinaturaQ = queryOptions({
  queryKey: ["minha-assinatura"],
  queryFn: async (): Promise<MinhaAssinatura | null> => {
    const { data, error } = await supabase.rpc("minha_assinatura");
    if (error || !data) return null;
    return data as unknown as MinhaAssinatura;
  },
  staleTime: 5 * 60_000,
});

/** Planos ativos, do mais simples ao mais completo. */
export const planosQ = queryOptions({
  queryKey: ["planos"],
  queryFn: async (): Promise<Plano[]> => {
    const { data, error } = await supabase.from("planos").select("*").eq("ativo", true).order("ordem");
    if (error) return [];
    return (data ?? []).map((p) => ({ ...p, preco_mensal: Number(p.preco_mensal), preco_anual: p.preco_anual == null ? null : Number(p.preco_anual) }));
  },
  staleTime: 10 * 60_000,
});

/**
 * A partir do dia da entrega, pedidos recebidos/confirmados passam para "em produção"
 * (finalizados e cancelados não mudam). Roda ao abrir o sistema e no máximo uma vez
 * por dia em cada aparelho, fora da leitura dos pedidos, para não atrasar as telas.
 * Retorna quantos pedidos mudaram.
 */
export async function avancarPedidosDoDia(userId: string, forcar = false) {
  const hoje = hojeISO();
  const chave = `docegestao:avanco:${userId}`;
  try {
    if (!forcar && localStorage.getItem(chave) === hoje) return 0;
  } catch {
    /* sem armazenamento local: segue normalmente */
  }
  const { data, error } = await supabase.from("pedidos")
    .update({ status: "em_producao" })
    .lte("data_entrega", hoje)
    .in("status", ["recebido", "confirmado"])
    .select("id");
  if (error) return 0;
  try { localStorage.setItem(chave, hoje); } catch { /* ignore */ }
  return data?.length ?? 0;
}
