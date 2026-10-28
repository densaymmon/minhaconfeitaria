// Painel de administração (site separado em admin/): tipos e regras puras,
// testadas em plataforma.test.ts.

import type { Situacao } from "./assinatura";

export type Acesso = "pendente" | "ativo" | "bloqueado";

export type Empresa = {
  user_id: string;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  cidade: string | null;
  slug: string | null;
  catalogo_ativo: boolean;
  acesso: Acesso;
  criado_em: string;
  ultimo_acesso: string | null;
  email_confirmado: boolean;
  onboarding_concluido: boolean;
  termos_aceitos_em: string | null;
  pedidos_total: number;
  pedidos_30d: number;
  produtos: number;
  observacao: string | null;
  plano_id: string | null;
  plano_nome: string | null;
  ciclo: "mensal" | "anual";
  situacao_cadastrada: "teste" | "ativa" | "cortesia" | "cancelada" | null;
  situacao: Situacao | null;
  teste_ate: string | null;
  pago_ate: string | null;
  valor: number | null;
  valor_efetivo: number | null;
  ultimo_pagamento: string | null;
};

export type Resumo = {
  total: number;
  pendentes: number;
  bloqueadas: number;
  em_teste: number;
  ativas: number;
  cortesia: number;
  atrasadas: number;
  suspensas: number;
  vencem_7_dias: number;
  receita_mensal: number;
  recebido_30_dias: number;
  recebido_mes: number;
};

export type PagamentoAssinatura = {
  id: string;
  valor: number;
  pago_em: string;
  meses: number;
  plano_id: string | null;
  pago_ate_novo: string;
  forma: string | null;
  observacao: string | null;
  empresa: string | null;
  user_id: string;
};

export type FiltroEmpresas = "todas" | "pendentes" | "teste" | "ativas" | "atrasadas" | "suspensas" | "bloqueadas" | "cortesia";

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  teste: "Teste grátis",
  ativa: "Ativa",
  cortesia: "Cortesia",
  atrasada: "Atrasada",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
};

/** Situação para exibir: acesso manual (pendente/bloqueado) vem antes da assinatura. */
export function situacaoExibida(e: Pick<Empresa, "acesso" | "situacao">): { rotulo: string; tom: "ok" | "info" | "alerta" | "perigo" | "neutro" } {
  if (e.acesso === "pendente") return { rotulo: "Aguardando liberação", tom: "info" };
  if (e.acesso === "bloqueado") return { rotulo: "Bloqueada", tom: "neutro" };
  switch (e.situacao) {
    case "ativa": return { rotulo: "Ativa", tom: "ok" };
    case "cortesia": return { rotulo: "Cortesia", tom: "ok" };
    case "teste": return { rotulo: "Teste grátis", tom: "info" };
    case "atrasada": return { rotulo: "Atrasada", tom: "alerta" };
    case "suspensa": return { rotulo: "Suspensa", tom: "perigo" };
    case "cancelada": return { rotulo: "Cancelada", tom: "neutro" };
    default: return { rotulo: "Sem plano", tom: "neutro" };
  }
}

export function filtrarEmpresas(lista: Empresa[], filtro: FiltroEmpresas, busca: string) {
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  return lista.filter((e) => {
    const ok =
      filtro === "todas" ||
      (filtro === "pendentes" && e.acesso === "pendente") ||
      (filtro === "bloqueadas" && e.acesso === "bloqueado") ||
      (e.acesso === "ativo" && (
        (filtro === "teste" && e.situacao === "teste") ||
        (filtro === "ativas" && e.situacao === "ativa") ||
        (filtro === "cortesia" && e.situacao === "cortesia") ||
        (filtro === "atrasadas" && e.situacao === "atrasada") ||
        (filtro === "suspensas" && (e.situacao === "suspensa" || e.situacao === "cancelada"))
      ));
    if (!ok) return false;
    if (!q) return true;
    return [e.nome, e.email, e.whatsapp, e.cidade, e.slug, e.plano_nome].some((v) => (v ?? "").toLocaleLowerCase("pt-BR").includes(q));
  });
}

/** Data em que o período pago terminará ao registrar um pagamento (mesma regra do banco). */
export function previsaoPagoAte(e: Pick<Empresa, "situacao_cadastrada" | "teste_ate" | "pago_ate">, pagoEm: string, meses: number) {
  const somarDias = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  let base: string;
  if (e.situacao_cadastrada === "teste") base = e.teste_ate && e.teste_ate > pagoEm ? e.teste_ate : pagoEm;
  else if (!e.pago_ate || e.pago_ate < somarDias(pagoEm, -31)) base = pagoEm;
  else base = e.pago_ate;
  const [a, m, d] = base.split("-").map(Number);
  const alvo = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d ?? 1, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
const numero = (v: unknown) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Normaliza a resposta de admin_listar_confeitarias. */
export function lerEmpresas(dados: unknown): Empresa[] {
  if (!Array.isArray(dados)) return [];
  return dados
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d): Empresa => {
      const acesso: Acesso = d["acesso"] === "pendente" ? "pendente" : d["acesso"] === "bloqueado" ? "bloqueado" : "ativo";
      const sit = d["situacao"];
      const situacao: Situacao | null = sit === "teste" || sit === "ativa" || sit === "cortesia" || sit === "atrasada" || sit === "suspensa" || sit === "cancelada" ? sit : null;
      const cad = d["situacao_cadastrada"];
      return {
        user_id: String(d["user_id"] ?? ""),
        nome: texto(d["nome"]) ?? "Sem nome",
        email: texto(d["email"]),
        whatsapp: texto(d["whatsapp"]),
        cidade: texto(d["cidade"]),
        slug: texto(d["slug"]),
        catalogo_ativo: d["catalogo_ativo"] === true,
        acesso,
        criado_em: texto(d["criado_em"]) ?? "",
        ultimo_acesso: texto(d["ultimo_acesso"]),
        email_confirmado: d["email_confirmado"] === true,
        onboarding_concluido: d["onboarding_concluido"] === true,
        termos_aceitos_em: texto(d["termos_aceitos_em"]),
        pedidos_total: numero(d["pedidos_total"]) ?? 0,
        pedidos_30d: numero(d["pedidos_30d"]) ?? 0,
        produtos: numero(d["produtos"]) ?? 0,
        observacao: texto(d["observacao"]),
        plano_id: texto(d["plano_id"]),
        plano_nome: texto(d["plano_nome"]),
        ciclo: d["ciclo"] === "anual" ? "anual" : "mensal",
        situacao_cadastrada: cad === "teste" || cad === "ativa" || cad === "cortesia" || cad === "cancelada" ? cad : null,
        situacao,
        teste_ate: texto(d["teste_ate"]),
        pago_ate: texto(d["pago_ate"]),
        valor: numero(d["valor"]),
        valor_efetivo: numero(d["valor_efetivo"]),
        ultimo_pagamento: texto(d["ultimo_pagamento"]),
      };
    })
    .filter((e) => e.user_id);
}

export function lerResumo(dados: unknown): Resumo {
  const d = (typeof dados === "object" && dados !== null ? dados : {}) as Record<string, unknown>;
  const n = (k: string) => numero(d[k]) ?? 0;
  return {
    total: n("total"), pendentes: n("pendentes"), bloqueadas: n("bloqueadas"), em_teste: n("em_teste"), ativas: n("ativas"),
    cortesia: n("cortesia"), atrasadas: n("atrasadas"), suspensas: n("suspensas"), vencem_7_dias: n("vencem_7_dias"),
    receita_mensal: n("receita_mensal"), recebido_30_dias: n("recebido_30_dias"), recebido_mes: n("recebido_mes"),
  };
}

export function lerPagamentos(dados: unknown): PagamentoAssinatura[] {
  if (!Array.isArray(dados)) return [];
  return dados
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => ({
      id: String(d["id"] ?? ""),
      valor: numero(d["valor"]) ?? 0,
      pago_em: texto(d["pago_em"]) ?? "",
      meses: numero(d["meses"]) ?? 1,
      plano_id: texto(d["plano_id"]),
      pago_ate_novo: texto(d["pago_ate_novo"]) ?? "",
      forma: texto(d["forma"]),
      observacao: texto(d["observacao"]),
      empresa: texto(d["empresa"]),
      user_id: String(d["user_id"] ?? ""),
    }))
    .filter((p) => p.id);
}
