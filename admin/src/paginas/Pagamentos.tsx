import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pagamentosQ } from "../dados";
import { Cartao, Titulo, brl, data, hoje } from "../ui";

export function PaginaPagamentos() {
  const { data: pagamentos = [], isLoading, error } = useQuery(pagamentosQ(null));
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const meses = [...new Set([hoje().slice(0, 7), ...pagamentos.map((p) => p.pago_em.slice(0, 7))])].sort().reverse();
  const doMes = mes === "todos" ? pagamentos : pagamentos.filter((p) => p.pago_em.startsWith(mes));
  const total = doMes.reduce((s, p) => s + p.valor, 0);

  function exportar() {
    const linhas = [["Data", "Empresa", "Valor", "Meses", "Pago até", "Forma", "Observação"], ...doMes.map((p) => [data(p.pago_em), p.empresa ?? "", p.valor.toFixed(2).replace(".", ","), String(p.meses), data(p.pago_ate_novo), p.forma ?? "", p.observacao ?? ""])];
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `pagamentos-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Titulo titulo="Pagamentos" subtitulo="Mensalidades recebidas das confeitarias"
        acao={doMes.length > 0 ? <Button type="button" variant="outline" size="sm" onClick={exportar}><Download className="size-4" /> Exportar</Button> : undefined} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Mês">
          {meses.map((m) => <option key={m} value={m}>{`${m.slice(5, 7)}/${m.slice(0, 4)}`}</option>)}
          <option value="todos">Todos os meses</option>
        </select>
        <span className="text-sm text-muted-foreground">{doMes.length} pagamento(s) · <b className="text-foreground">{brl(total)}</b></span>
      </div>
      {isLoading ? <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando…</p>
        : error ? <p role="alert" className="py-8 text-destructive">{error.message}</p>
        : doMes.length === 0 ? <Cartao className="border-dashed text-center text-sm text-muted-foreground">Nenhum pagamento neste período. Registre os pagamentos em Empresas → empresa → Registrar pagamento.</Cartao>
        : (
          <Cartao className="p-0">
            <ul className="divide-y text-sm">
              {doMes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.empresa ?? "Empresa removida"}</div>
                    <div className="text-xs text-muted-foreground">{data(p.pago_em)} · {p.forma ?? "—"} · {p.meses} {p.meses === 1 ? "mês" : "meses"} · até {data(p.pago_ate_novo)}{p.observacao ? ` · ${p.observacao}` : ""}</div>
                  </div>
                  <b className="shrink-0 tabular-nums">{brl(p.valor)}</b>
                </li>
              ))}
            </ul>
          </Cartao>
        )}
    </>
  );
}
