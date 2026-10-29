import { BookOpen, CalendarDays, ChartNoAxesCombined, History, Package, Settings, ShoppingBasket, ShoppingCart, Store, Tag, TrendingUp, Truck, UsersRound, Wallet } from "lucide-react";
import { paginaPermitidaAoPapel, type Papel } from "./assinatura";

/**
 * Menu "Mais": fonte única usada pela gaveta do layout (`_authenticated/route.tsx`)
 * e pela página `/mais`. Para incluir uma tela no menu, adicione-a aqui, em um grupo.
 * Quem pode ver cada página continua definido em `paginaPermitidaAoPapel`.
 */
export const GRUPOS_MENU = [
  { id: "dia", titulo: "Dia a dia" },
  { id: "produtos", titulo: "Produtos e insumos" },
  { id: "financeiro", titulo: "Financeiro" },
  { id: "conta", titulo: "Equipe e configurações" },
] as const;

export type GrupoMenu = (typeof GRUPOS_MENU)[number]["id"];

export const linksMais = [
  { to: "/agenda", label: "Agenda da semana", icon: CalendarDays, grupo: "dia" },
  { to: "/entregas", label: "Entregas do dia", icon: Truck, grupo: "dia" },
  { to: "/etiquetas", label: "Etiquetas", icon: Tag, grupo: "dia" },
  { to: "/produtos", label: "Produtos e receitas", icon: BookOpen, grupo: "produtos" },
  { to: "/catalogo", label: "Catálogo online", icon: Store, grupo: "produtos" },
  { to: "/lista-compras", label: "Lista de compras", icon: ShoppingBasket, grupo: "produtos" },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, grupo: "financeiro" },
  { to: "/resumo-mes", label: "Resumo do mês", icon: ChartNoAxesCombined, grupo: "financeiro" },
  { to: "/fluxo-caixa", label: "Fluxo de caixa", icon: TrendingUp, grupo: "financeiro" },
  { to: "/historico", label: "Histórico", icon: History, grupo: "conta" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, grupo: "conta" },
  { to: "/equipe", label: "Equipe", icon: UsersRound, grupo: "conta" },
] as const;

/** Seções da tela `/compras`; abrem com `search={{ secao }}`. */
export const linksCompras = [
  { secao: "compras", label: "Compras de insumos", icon: Package, description: "Cadastrar e consultar compras", grupo: "produtos" },
  { secao: "gastos", label: "Gastos e histórico de compras", icon: ShoppingCart, description: "Consultar gastos por período e compras registradas", grupo: "produtos" },
  { secao: "estoque", label: "Controle de estoque", icon: Package, description: "Saldo atual e contagem física", grupo: "produtos" },
  { secao: "integracao", label: "Conferência de integração", icon: ChartNoAxesCombined, description: "Conferir compras, financeiro e alertas", grupo: "financeiro" },
] as const;

export type LinkMais = (typeof linksMais)[number];
export type LinkCompras = (typeof linksCompras)[number];

export type GrupoDoMenu = {
  id: GrupoMenu;
  titulo: string;
  links: LinkMais[];
  compras: LinkCompras[];
};

/** Grupos do menu com apenas o que o papel pode abrir; grupos vazios são omitidos. */
export function gruposDoMenu(papel: Papel | null | undefined): GrupoDoMenu[] {
  const verCompras = paginaPermitidaAoPapel("/compras", papel);
  const grupos: GrupoDoMenu[] = GRUPOS_MENU.map((grupo) => {
    const links: LinkMais[] = linksMais.filter((l) => l.grupo === grupo.id && paginaPermitidaAoPapel(l.to, papel));
    const compras: LinkCompras[] = verCompras ? linksCompras.filter((c) => c.grupo === grupo.id) : [];
    return { id: grupo.id, titulo: grupo.titulo, links, compras };
  });
  return grupos.filter((grupo) => grupo.links.length + grupo.compras.length > 0);
}
