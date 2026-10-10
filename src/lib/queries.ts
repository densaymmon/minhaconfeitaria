import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { CONFIG_PADRAO, type Config } from "./calc";

export type Cliente = Tables<"clientes">;
export type Insumo = Tables<"insumos">;
export type ReceitaItem = Tables<"receita_itens">;
export type Produto = Tables<"produtos"> & { receita_itens: ReceitaItem[] };
export type PedidoItem = Tables<"pedido_itens">;
export type Pedido = Tables<"pedidos"> & {
  pedido_itens: PedidoItem[];
  clientes: { nome: string; telefone: string | null } | null;
};
export type Despesa = Tables<"despesas">;

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

export const pedidosQ = queryOptions({
  queryKey: ["pedidos"],
  queryFn: () =>
    must<Pedido[]>(
      supabase
        .from("pedidos")
        .select("*, pedido_itens(*), clientes(nome, telefone)")
        .order("data_entrega", { ascending: false })
        .order("numero", { ascending: false }),
    ),
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
    return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, Number(v)])) as Config;
  },
});
