import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/lib/database-compat";
import { despesasRecorrentesQ } from "@/lib/queries";
import { brl, dataBR, hojeISO, parseNum } from "@/lib/format";
import { diaDaRegra, encerrarRegra, proximoLancamento, regraEncerrada } from "@/lib/despesas-recorrentes";
import { Card } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Lança as despesas fixas vencidas (aluguel, internet...). Roda uma vez por abertura da tela e só
 * se houver alguma regra cadastrada; o banco é idempotente, então chamar de novo não duplica.
 */
export function useGerarDespesasRecorrentes() {
  const qc = useQueryClient();
  const { data: regras } = useQuery(despesasRecorrentesQ);
  const executou = useRef(false);
  const temRegras = Array.isArray(regras) && regras.length > 0;
  useEffect(() => {
    if (!temRegras || executou.current) return;
    executou.current = true;
    void supabase.rpc("gerar_despesas_recorrentes", { p_hoje: hojeISO() }).then(({ data, error }) => {
      if (error || !(Number(data) > 0)) return;
      void qc.invalidateQueries({ queryKey: ["despesas"] });
      void qc.invalidateQueries({ queryKey: ["despesas-recorrentes"] });
    });
  }, [temRegras, qc]);
}

/** Lista das despesas fixas automáticas: alterar o valor (vale dos próximos meses) e encerrar. */
export function DespesasFixas() {
  const qc = useQueryClient();
  const { data: regras } = useQuery(despesasRecorrentesQ);
  const [editando, setEditando] = useState<{ id: string; valor: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hoje = hojeISO();
  const ativas = (regras ?? []).filter((r) => !regraEncerrada(r, hoje));
  if (!ativas.length) return null;

  async function atualizar() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["despesas-recorrentes"] }), qc.invalidateQueries({ queryKey: ["despesas"] })]);
  }

  async function salvarValor() {
    if (!editando || busy) return;
    const valor = Math.round(parseNum(editando.valor) * 100) / 100;
    if (!(valor > 0) || valor > 10_000_000) return void toast.error("Informe um valor maior que zero.");
    setBusy(true);
    const { error } = await supabase.from("despesas_recorrentes").update({ valor }).eq("id", editando.id);
    setBusy(false);
    if (error) return void toast.error(`Não foi possível alterar: ${error.message}`);
    setEditando(null);
    await atualizar();
    toast.success("Valor alterado. Vale a partir dos próximos lançamentos; os já feitos não mudam.");
  }

  async function encerrar(regra: NonNullable<typeof regras>[number]) {
    if (busy) return;
    if (!confirm(`Encerrar a despesa fixa "${regra.descricao}"? Os lançamentos já feitos continuam; nada novo será lançado.`)) return;
    const acao = encerrarRegra(regra, hoje);
    setBusy(true);
    const { error } = acao.acao === "excluir"
      ? await supabase.from("despesas_recorrentes").delete().eq("id", regra.id)
      : await supabase.from("despesas_recorrentes").update({ fim: acao.fim }).eq("id", regra.id);
    setBusy(false);
    if (error) return void toast.error(`Não foi possível encerrar: ${error.message}`);
    await atualizar();
    toast.success("Despesa fixa encerrada.");
  }

  return (
    <section className="mb-7" aria-label="Despesas fixas automáticas">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><CalendarClock className="size-5" /> Despesas fixas automáticas</h2>
      <p className="mb-3 text-sm text-muted-foreground">Lançadas sozinhas todo mês, no mesmo dia. Cada lançamento vira uma despesa comum que você pode editar ou excluir.</p>
      <div className="space-y-2">
        {ativas.map((r) => {
          const proximo = proximoLancamento(r);
          const edicaoDesta = editando?.id === r.id ? editando : null;
          return (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-medium">{r.descricao}</p>
                  <p className="text-xs text-muted-foreground">{r.categoria} · todo dia {diaDaRegra(r)}{r.fim ? ` · até ${dataBR(r.fim)}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{proximo ? `Próximo lançamento: ${dataBR(proximo)}` : "Sem novos lançamentos"}</p>
                </div>
                <b className="whitespace-nowrap text-sm tabular-nums">{brl(Number(r.valor))}</b>
              </div>
              {edicaoDesta ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input inputMode="decimal" aria-label="Novo valor mensal em reais" className="h-10 w-36 bg-card" value={edicaoDesta.valor} onChange={(e) => setEditando({ id: r.id, valor: e.target.value })} />
                  <Button type="button" size="sm" disabled={busy} onClick={() => void salvarValor()}>Salvar</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditando(null)}>Cancelar</Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditando({ id: r.id, valor: String(r.valor).replace(".", ",") })}>Alterar valor</Button>
                  <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => void encerrar(r)}>Encerrar</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
