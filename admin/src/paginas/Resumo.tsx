import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Clock3, UserPlus } from "lucide-react";
import { situacaoExibida } from "@/lib/plataforma";
import { diasEntre } from "@/lib/assinatura";
import { cn } from "@/lib/utils";
import { empresasQ, resumoQ } from "../dados";
import { Cartao, Etiqueta, Titulo, brl, data, hoje } from "../ui";

type Ir = (p: "empresas" | "pagamentos") => void;

export function PaginaResumo({ ir }: { ir: Ir }) {
  const { data: r, isLoading, error } = useQuery(resumoQ);
  const { data: empresas = [] } = useQuery(empresasQ);
  const h = hoje();
  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando…</p>;
  if (error || !r) return <p role="alert" className="py-8 text-destructive">{error?.message ?? "Não foi possível carregar."}</p>;

  const atencao = empresas
    .filter((e) => e.acesso === "pendente" || (e.acesso === "ativo" && (e.situacao === "atrasada" || e.situacao === "suspensa")))
    .slice(0, 8);
  const vencendo = empresas
    .filter((e) => e.acesso === "ativo" && (e.situacao === "teste" || e.situacao === "ativa"))
    .flatMap((e) => {
      const venc = e.situacao === "teste" ? e.teste_ate : e.pago_ate;
      return venc && diasEntre(h, venc) <= 7 ? [{ e, venc }] : [];
    })
    .sort((a, b) => a.venc.localeCompare(b.venc));

  const numeros: { rotulo: string; valor: string | number; destaque?: "perigo" | "alerta" | "info" }[] = [
    { rotulo: "Empresas ativas (pagantes)", valor: r.ativas },
    { rotulo: "Em teste grátis", valor: r.em_teste, destaque: "info" },
    { rotulo: "Atrasadas", valor: r.atrasadas, ...(r.atrasadas > 0 ? { destaque: "alerta" as const } : {}) },
    { rotulo: "Suspensas", valor: r.suspensas, ...(r.suspensas > 0 ? { destaque: "perigo" as const } : {}) },
    { rotulo: "Aguardando liberação", valor: r.pendentes, ...(r.pendentes > 0 ? { destaque: "info" as const } : {}) },
    { rotulo: "Cortesia", valor: r.cortesia },
  ];

  return (
    <>
      <Titulo titulo="Resumo" subtitulo={`${r.total} empresa(s) cadastrada(s)`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao className="bg-primary text-primary-foreground">
          <p className="text-xs opacity-80">Receita mensal recorrente</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{brl(r.receita_mensal)}</p>
          <p className="mt-1 text-xs opacity-80">Assinaturas pagas (anuais divididas por 12)</p>
        </Cartao>
        <Cartao>
          <p className="text-xs text-muted-foreground">Recebido neste mês</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{brl(r.recebido_mes)}</p>
        </Cartao>
        <Cartao>
          <p className="text-xs text-muted-foreground">Recebido nos últimos 30 dias</p>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{brl(r.recebido_30_dias)}</p>
        </Cartao>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {numeros.map((n) => (
          <button key={n.rotulo} type="button" onClick={() => ir("empresas")} className="rounded-2xl border bg-card p-3 text-left shadow-soft hover:border-primary/40">
            <span className="block text-xs text-muted-foreground">{n.rotulo}</span>
            <span className={cn("mt-1 block text-2xl font-bold tabular-nums", n.destaque === "perigo" && "text-destructive", n.destaque === "alerta" && "text-warning-foreground", n.destaque === "info" && "text-primary")}>{n.valor}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Cartao>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" /> Precisa de atenção</h2>
          {atencao.length === 0 ? <p className="text-sm text-muted-foreground">Nada pendente. 🎉</p> : (
            <ul className="divide-y text-sm">
              {atencao.map((e) => {
                const s = situacaoExibida(e);
                return (
                  <li key={e.user_id} className="flex items-center justify-between gap-2 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {e.acesso === "pendente" ? <UserPlus className="size-4 shrink-0 text-primary" /> : <Clock3 className="size-4 shrink-0 text-destructive" />}
                      <span className="truncate">{e.nome}</span>
                    </span>
                    <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={() => ir("empresas")}>Ver empresas</button>
        </Cartao>
        <Cartao>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CalendarClock className="size-4" /> Vencem nos próximos 7 dias</h2>
          {vencendo.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum vencimento na próxima semana.</p> : (
            <ul className="divide-y text-sm">
              {vencendo.map(({ e, venc }) => (
                <li key={e.user_id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{e.nome} <span className="text-xs text-muted-foreground">· {e.situacao === "teste" ? "fim do teste" : e.plano_nome}</span></span>
                  <span className="shrink-0 tabular-nums">{data(venc)}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={() => ir("pagamentos")}>Ver pagamentos</button>
        </Cartao>
      </div>
    </>
  );
}
