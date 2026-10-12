import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number) => brlFmt.format(Number.isFinite(v) ? v : 0);
export const num = (v: number, d = 2) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d }).format(v || 0);
export const pct = (v: number) => `${num(v, 1)}%`;

/** Aceita "12,50" ou "12.50". */
export const parseNum = (s: string | number) => {
  if (typeof s === "number") return s;
  const v = parseFloat(String(s).replace(/\./g, (m, i, str) => (str.includes(",") ? "" : m)).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

export const hojeISO = () => format(new Date(), "yyyy-MM-dd");
export const mesISO = (d = new Date()) => format(d, "yyyy-MM");
export const dataBR = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");
export const dataCurta = (iso: string) => format(parseISO(iso), "EEE, dd MMM", { locale: ptBR });
export const dataLonga = (iso: string) => format(parseISO(iso), "EEEE, dd 'de' MMMM", { locale: ptBR });

export const STATUS = [
  { value: "recebido", label: "Recebido" },
  { value: "em_producao", label: "Em produção" },
  // Status persistido no Supabase; a interface mantém o rótulo familiar.
  { value: "entregue", label: "Finalizado" },
] as const;
export const statusLabel = (s: string) =>
  STATUS.find((x) => x.value === s)?.label ??
  (s === "finalizado" || s === "entregue" ? "Finalizado" : s === "confirmado" ? "Recebido" : s === "pronto" ? "Em produção" : s === "cancelado" ? "Cancelado" : s);

export const FORMAS = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "outros", label: "Outros" },
] as const;
export const formaLabel = (s: string) => FORMAS.find((x) => x.value === s)?.label ?? s;

export const CATEGORIAS = [
  "Bolos caseiros",
  "Pães caseiros",
  "Pão italiano",
  "Baguetes recheadas",
  "Doces",
  "Salgados",
  "Outros",
];

export const UNIDADES = ["kg", "g", "L", "ml", "un", "dúzia", "pacote"];
