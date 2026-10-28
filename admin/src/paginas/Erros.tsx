import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Bug, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase, erroAmigavel } from "../supabase";
import { errosQ } from "../dados";
import { Cartao, Etiqueta, Titulo } from "../ui";

const ORIGEM = { app: "Sistema", catalogo: "Catálogo", admin: "Painel" } as const;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export function PaginaErros() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(7);
  const { data: erros = [], isLoading, error } = useQuery(errosQ(dias));

  async function resolver(mensagem: string) {
    const { error: e } = await supabase.rpc("admin_limpar_erro", { p_mensagem: mensagem });
    if (e) return void toast.error(erroAmigavel(e));
    await qc.invalidateQueries({ queryKey: ["admin", "erros"] });
    toast.success("Erro marcado como resolvido.");
  }

  return (
    <>
      <Titulo titulo="Erros" subtitulo="Falhas de tela registradas automaticamente no sistema, no catálogo e neste painel" />
      <div className="mb-4 flex gap-2">
        {[1, 7, 30].map((d) => <Button key={d} type="button" size="sm" variant={dias === d ? "default" : "outline"} onClick={() => setDias(d)}>{d === 1 ? "24 horas" : `${d} dias`}</Button>)}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground" role="status">Carregando…</p> : error ? <p role="alert" className="text-destructive">{error.message}</p> : erros.length === 0 ? (
        <Cartao className="py-10 text-center text-sm text-muted-foreground"><Bug className="mx-auto mb-2 size-8 opacity-50" />Nenhum erro no período. 🎉</Cartao>
      ) : (
        <div className="space-y-3">
          {erros.map((e) => (
            <Cartao key={e.mensagem} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words font-mono text-sm font-semibold">{e.mensagem}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void resolver(e.mensagem)}><Check className="size-4" /> Resolvido</Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Etiqueta tom="info">{ORIGEM[e.origem] ?? e.origem}</Etiqueta>
                <span>{e.vezes} vez(es) · {e.pessoas} pessoa(s)</span>
                <span className="text-muted-foreground">último: {quando(e.ultimo_em)} · primeiro: {quando(e.primeiro_em)}</span>
              </div>
              {e.confeitarias.length > 0 && <p className="text-xs">Confeitarias: {e.confeitarias.join(", ")}</p>}
              {e.urls.length > 0 && <p className="break-all text-xs text-muted-foreground">Páginas: {e.urls.slice(0, 5).join(" · ")}</p>}
              {e.detalhe && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-primary">Detalhes técnicos</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">{e.detalhe}</pre>
                  {e.agente && <p className="mt-1 text-muted-foreground">{e.agente}</p>}
                </details>
              )}
            </Cartao>
          ))}
        </div>
      )}
    </>
  );
}
