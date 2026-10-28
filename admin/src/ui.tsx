import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Cartao({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={cn("rounded-2xl border bg-card p-4 shadow-soft", className)}>{children}</div>;
}

export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string | undefined; children: ReactNode; className?: string | undefined }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium">{rotulo}</span>
      {children}
      {dica && <span className="block text-xs text-muted-foreground">{dica}</span>}
    </label>
  );
}

export function Selecao({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("h-10 w-full rounded-md border bg-background px-3 text-sm", className)} />;
}

const TONS = {
  ok: "bg-success/15 text-success",
  info: "bg-primary/10 text-primary",
  alerta: "bg-warning/20 text-warning-foreground",
  perigo: "bg-destructive/10 text-destructive",
  neutro: "bg-muted text-muted-foreground",
} as const;

export function Etiqueta({ tom, children }: { tom: keyof typeof TONS; children: ReactNode }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold", TONS[tom])}>{children}</span>;
}

export function Titulo({ titulo, subtitulo, acao }: { titulo: string; subtitulo?: string; acao?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  );
}

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** yyyy-MM-dd (ou ISO com hora) → dd/MM/aaaa. */
export const data = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

/** Hoje no fuso de São Paulo (yyyy-MM-dd). */
export const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
