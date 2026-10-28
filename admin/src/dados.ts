import { queryOptions } from "@tanstack/react-query";
import { lerEmpresas, lerPagamentos, lerResumo, type UsoEmpresa } from "@/lib/plataforma";
import type { Plano } from "@/lib/assinatura";
import { supabase } from "./supabase";

const falhar = (e: { message: string }) => { throw new Error(e.message.replace(/^.*?ADMIN:\s*/, "")); };

export const empresasQ = queryOptions({
  queryKey: ["admin", "empresas"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_listar_confeitarias");
    if (error) falhar(error);
    return lerEmpresas(data);
  },
});

export const resumoQ = queryOptions({
  queryKey: ["admin", "resumo"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_resumo");
    if (error) falhar(error);
    return lerResumo(data);
  },
});

export const pagamentosQ = (userId: string | null) => queryOptions({
  queryKey: ["admin", "pagamentos", userId ?? "todos"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_listar_pagamentos", { p_user_id: userId });
    if (error) falhar(error);
    return lerPagamentos(data);
  },
});

/** Todos os planos (inclusive inativos), na ordem de exibição. */
export const planosQ = queryOptions({
  queryKey: ["admin", "planos"],
  queryFn: async (): Promise<Plano[]> => {
    const { data, error } = await supabase.from("planos").select("*").order("ordem").order("preco_mensal");
    if (error) falhar(error);
    return (data ?? []).map((p) => ({
      id: p.id, nome: p.nome, descricao: p.descricao, preco_mensal: Number(p.preco_mensal),
      preco_anual: p.preco_anual == null ? null : Number(p.preco_anual), limite_pedidos_mes: p.limite_pedidos_mes,
      limite_produtos: p.limite_produtos, recursos: p.recursos, ordem: p.ordem, ativo: p.ativo,
    }));
  },
});

export type ConfigPlataforma = {
  cadastro_aberto: boolean;
  aprovacao_manual: boolean;
  empresa_nome: string | null;
  empresa_documento: string | null;
  contato_email: string | null;
  contato_whatsapp: string | null;
  dias_teste: number;
  dias_tolerancia: number;
  plano_teste: string;
};

export const configQ = queryOptions({
  queryKey: ["admin", "config"],
  queryFn: async (): Promise<ConfigPlataforma> => {
    const { data, error } = await supabase.rpc("admin_config");
    if (error) falhar(error);
    const d = (data ?? {}) as Record<string, unknown>;
    const t = (v: unknown) => (typeof v === "string" && v ? v : null);
    return {
      cadastro_aberto: d["cadastro_aberto"] === true,
      aprovacao_manual: d["aprovacao_manual"] !== false,
      empresa_nome: t(d["empresa_nome"]),
      empresa_documento: t(d["empresa_documento"]),
      contato_email: t(d["contato_email"]),
      contato_whatsapp: t(d["contato_whatsapp"]),
      dias_teste: Number(d["dias_teste"] ?? 14),
      dias_tolerancia: Number(d["dias_tolerancia"] ?? 7),
      plano_teste: t(d["plano_teste"]) ?? "vitrine",
    };
  },
});

export type Metricas = {
  pedidos_30_dias: number;
  faturamento_30_dias: number;
  pedidos_catalogo_30_dias: number;
  ativas_7_dias: number;
  catalogos_no_ar: number;
  membros_equipe: number;
  cadastros_por_mes: { mes: string; novos: number }[];
  uso: UsoEmpresa[];
};

export const metricasQ = queryOptions({
  queryKey: ["admin", "metricas"],
  queryFn: async (): Promise<Metricas> => {
    const { data, error } = await supabase.rpc("admin_metricas");
    if (error) falhar(error);
    return data as unknown as Metricas;
  },
});

export type ErroAgrupado = {
  mensagem: string;
  origem: "app" | "catalogo" | "admin";
  vezes: number;
  pessoas: number;
  confeitarias: string[];
  urls: string[];
  detalhe: string | null;
  agente: string | null;
  primeiro_em: string;
  ultimo_em: string;
};

export const errosQ = (dias: number) => queryOptions({
  queryKey: ["admin", "erros", dias],
  queryFn: async (): Promise<ErroAgrupado[]> => {
    const { data, error } = await supabase.rpc("admin_listar_erros", { p_dias: dias });
    if (error) falhar(error);
    return (data as unknown as ErroAgrupado[] | null) ?? [];
  },
});
