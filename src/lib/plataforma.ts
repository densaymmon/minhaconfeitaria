// Painel da plataforma: tipos e regras puras (testadas em plataforma.test.ts).

export type Acesso = "pendente" | "ativo" | "bloqueado";

export type ContaPlataforma = {
  user_id: string;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  cidade: string | null;
  slug: string | null;
  catalogo_ativo: boolean;
  acesso: Acesso;
  acesso_atualizado_em: string | null;
  criado_em: string;
  ultimo_acesso: string | null;
  email_confirmado: boolean;
  onboarding_concluido: boolean;
  termos_aceitos_em: string | null;
  admin: boolean;
  pedidos_total: number;
  pedidos_30d: number;
  produtos: number;
  pago_ate: string | null;
  observacao: string | null;
};

export type FiltroContas = "todas" | "pendente" | "ativo" | "bloqueado" | "vencidas";

export const ROTULO_ACESSO: Record<Acesso, string> = {
  pendente: "Aguardando liberação",
  ativo: "Ativa",
  bloqueado: "Bloqueada",
};

/** Mensalidade vencida: conta ativa (não administradora) com "pago até" antes de hoje. */
export function mensalidadeVencida(c: Pick<ContaPlataforma, "acesso" | "admin" | "pago_ate">, hoje: string) {
  return c.acesso === "ativo" && !c.admin && c.pago_ate !== null && c.pago_ate < hoje;
}

export function filtrarContas(contas: ContaPlataforma[], filtro: FiltroContas, busca: string, hoje: string) {
  const q = busca.trim().toLocaleLowerCase("pt-BR");
  return contas.filter((c) => {
    if (filtro === "vencidas" && !mensalidadeVencida(c, hoje)) return false;
    if (filtro !== "todas" && filtro !== "vencidas" && c.acesso !== filtro) return false;
    if (!q) return true;
    return [c.nome, c.email, c.whatsapp, c.cidade, c.slug].some((v) => (v ?? "").toLocaleLowerCase("pt-BR").includes(q));
  });
}

export function resumoContas(contas: ContaPlataforma[], hoje: string) {
  return {
    total: contas.length,
    pendente: contas.filter((c) => c.acesso === "pendente").length,
    ativo: contas.filter((c) => c.acesso === "ativo").length,
    bloqueado: contas.filter((c) => c.acesso === "bloqueado").length,
    vencidas: contas.filter((c) => mensalidadeVencida(c, hoje)).length,
  };
}

/** Normaliza a resposta de admin_listar_confeitarias (números chegam como número ou texto). */
export function lerContas(dados: unknown): ContaPlataforma[] {
  if (!Array.isArray(dados)) return [];
  return dados
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => {
      const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
      const acesso: Acesso = d["acesso"] === "pendente" ? "pendente" : d["acesso"] === "bloqueado" ? "bloqueado" : "ativo";
      return {
        user_id: String(d["user_id"] ?? ""),
        nome: texto(d["nome"]) ?? "Sem nome",
        email: texto(d["email"]),
        whatsapp: texto(d["whatsapp"]),
        cidade: texto(d["cidade"]),
        slug: texto(d["slug"]),
        catalogo_ativo: d["catalogo_ativo"] === true,
        acesso,
        acesso_atualizado_em: texto(d["acesso_atualizado_em"]),
        criado_em: texto(d["criado_em"]) ?? "",
        ultimo_acesso: texto(d["ultimo_acesso"]),
        email_confirmado: d["email_confirmado"] === true,
        onboarding_concluido: d["onboarding_concluido"] === true,
        termos_aceitos_em: texto(d["termos_aceitos_em"]),
        admin: d["admin"] === true,
        pedidos_total: Number(d["pedidos_total"]) || 0,
        pedidos_30d: Number(d["pedidos_30d"]) || 0,
        produtos: Number(d["produtos"]) || 0,
        pago_ate: texto(d["pago_ate"]),
        observacao: texto(d["observacao"]),
      };
    })
    .filter((c) => c.user_id);
}
