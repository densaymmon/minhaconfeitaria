import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOff, BellRing, Smartphone, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ativarPush, desativarPush, estadoPush, type EstadoPush } from "@/lib/push-cliente";
import { testarNotificacao } from "@/lib/push.functions";
import { Card } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

const aparelhosQ = {
  queryKey: ["push-inscricoes"],
  queryFn: async () => {
    const { data, error } = await supabase.from("push_inscricoes").select("id,aparelho,created_at,ultimo_envio_em,endpoint").order("created_at", { ascending: false });
    return error ? [] : (data ?? []);
  },
};

/** Avisos de pedido novo mesmo com o sistema fechado (notificação no celular/computador). */
export function NotificacoesCard() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [endpointAtual, setEndpointAtual] = useState<string | null>(null);
  const { data: aparelhos = [] } = useQuery(aparelhosQ);

  async function atualizar() {
    setEstado(await estadoPush());
    try {
      const reg = await navigator.serviceWorker?.getRegistration("/");
      setEndpointAtual((await reg?.pushManager.getSubscription())?.endpoint ?? null);
    } catch {
      setEndpointAtual(null);
    }
  }
  useEffect(() => { void atualizar(); }, []);

  async function ligar() {
    setOcupado(true);
    const r = await ativarPush();
    setOcupado(false);
    await atualizar();
    await qc.invalidateQueries({ queryKey: ["push-inscricoes"] });
    if (!r.ok) return void toast.error(r.erro);
    toast.success("Pronto! Este aparelho vai avisar cada pedido novo.");
    void testarNotificacao().catch(() => undefined);
  }

  async function desligar() {
    setOcupado(true);
    await desativarPush();
    setOcupado(false);
    await atualizar();
    await qc.invalidateQueries({ queryKey: ["push-inscricoes"] });
    toast.success("Este aparelho não vai mais receber avisos.");
  }

  async function testar() {
    setOcupado(true);
    try {
      const r = await testarNotificacao();
      if (r.aparelhos === 0) toast.error("Nenhum aparelho com notificações ligadas.");
      else if (r.enviados === 0) toast.error("O aviso não foi entregue. Desligue e ligue de novo neste aparelho.");
      else toast.success(`Aviso de teste enviado para ${r.enviados} aparelho(s).`);
    } catch {
      toast.error("Não foi possível enviar o teste agora.");
    } finally {
      setOcupado(false);
    }
  }

  async function remover(id: string) {
    await supabase.from("push_inscricoes").delete().eq("id", id);
    await qc.invalidateQueries({ queryKey: ["push-inscricoes"] });
    await atualizar();
  }

  return (
    <Card className="mt-5 space-y-3">
      <div className="flex items-center gap-2"><BellRing className="size-4 text-primary" /><h2 className="font-semibold">Aviso de pedido novo</h2></div>
      <p className="text-sm text-muted-foreground">Ligue as notificações para saber na hora de cada pedido e pedido de orçamento do catálogo, mesmo com o sistema fechado.</p>

      {estado === "ligado" ? (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm font-medium text-success"><BellRing className="size-4" /> Ligado neste aparelho</span>
          <Button type="button" variant="outline" className="h-10" disabled={ocupado} onClick={() => void testar()}>Enviar teste</Button>
          <Button type="button" variant="ghost" className="h-10" disabled={ocupado} onClick={() => void desligar()}><BellOff className="size-4" /> Desligar</Button>
        </div>
      ) : estado === "precisa-instalar" ? (
        <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">No iPhone/iPad: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>, abra o Doce Gestão pelo ícone e volte aqui para ligar os avisos.</p>
      ) : estado === "bloqueado" ? (
        <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do endereço) e recarregue a página.</p>
      ) : estado === "indisponivel" ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Este navegador não recebe notificações. No celular, use o Chrome (Android) ou instale o app (iPhone).</p>
      ) : (
        <Button type="button" className="h-11 w-full sm:w-auto" disabled={ocupado || estado === null} onClick={() => void ligar()}><BellRing className="size-4" /> {ocupado ? "Ativando..." : "Ligar avisos neste aparelho"}</Button>
      )}

      {aparelhos.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Aparelhos que recebem os avisos</p>
          <ul className="divide-y rounded-xl border">
            {aparelhos.map((a) => (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.aparelho ?? "Aparelho"}{a.endpoint === endpointAtual ? " · este" : ""}</span>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Remover ${a.aparelho ?? "aparelho"}`} onClick={() => void remover(a.id)}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
