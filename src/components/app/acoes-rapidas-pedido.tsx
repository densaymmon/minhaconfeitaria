import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { alterarPedido, otimista } from "@/lib/cache-pedidos";
import type { Pedido } from "@/lib/queries";
import type { PedidoCalc } from "@/lib/hooks";
import { brl, FORMAS, hojeISO, parseNum } from "@/lib/format";
import { deveOferecerRecebimento, escolhasDeStatus, formaPadrao, saldoParaReceber, validarRecebimento, type StatusRapido } from "@/lib/acoes-rapidas-pedido";
import { Field, NativeSelect } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const tituloPedido = (p: PedidoCalc) => `Pedido #${p.numero} · ${p.clientes?.nome ?? "Sem cliente"}`;

/**
 * Trocar o status do pedido direto na lista. "Pronto" só quando todos os itens foram
 * produzidos (mesma regra da tela Produção). Cancelar pede confirmação e devolve ao estoque
 * pronto o que o pedido tinha retirado dele (feito no banco).
 */
export function DialogStatusPedido({ pedido, onClose, onEntregue }: {
  pedido: PedidoCalc;
  onClose: () => void;
  /** Chamado depois de marcar como entregue um pedido que ainda tem saldo a receber. */
  onEntregue: (pedido: PedidoCalc) => void;
}) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const escolhas = escolhasDeStatus(pedido.status, pedido.pedido_itens);

  async function gravar(status: StatusRapido | "cancelado", mensagem: string) {
    if (salvando) return;
    setSalvando(true);
    try {
      await otimista<Pedido>(
        qc,
        (lista) => alterarPedido(lista, pedido.id, { status }),
        async () => {
          const { error } = await supabase.from("pedidos").update({ status }).eq("id", pedido.id);
          if (error) throw new Error(error.message);
        },
        // Cancelar devolve unidades ao estoque pronto.
        [["estoque-pronto"]],
      );
      toast.success(mensagem);
      onClose();
      if (deveOferecerRecebimento(status, pedido.t.saldo)) onEntregue(pedido);
    } catch (e) {
      toast.error(`Não foi possível alterar o pedido: ${e instanceof Error ? e.message : "tente novamente."}`);
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    if (!confirm(`Cancelar o pedido #${pedido.numero}? O pedido será mantido no histórico.`)) return;
    void gravar("cancelado", `Pedido #${pedido.numero} cancelado. O histórico foi preservado.`);
  }

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Status do pedido</DialogTitle>
          <DialogDescription>{tituloPedido(pedido)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="group" aria-label="Escolher o status do pedido">
          {escolhas.map((e) => (
            <div key={e.valor}>
              <button
                type="button"
                disabled={salvando || e.atual || e.bloqueio !== null}
                aria-pressed={e.atual}
                onClick={() => void gravar(e.valor, `Pedido #${pedido.numero} marcado como ${e.rotulo.toLocaleLowerCase("pt-BR")}.`)}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left font-medium transition-colors",
                  e.atual ? "border-primary bg-primary/10 text-primary" : "bg-card hover:bg-muted",
                  e.bloqueio !== null && "cursor-not-allowed opacity-60",
                )}
              >
                <span>{e.rotulo}</span>
                {e.atual ? <Check className="size-4" aria-label="Status atual" /> : e.bloqueio !== null ? <Lock className="size-4" aria-hidden /> : null}
              </button>
              {e.bloqueio && <p className="mt-1 px-1 text-xs text-muted-foreground">{e.bloqueio}</p>}
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" className="w-full text-destructive" disabled={salvando} onClick={cancelar}>
          Cancelar pedido
        </Button>
      </DialogContent>
    </Dialog>
  );
}

const textoValor = (v: number) => String(v).replace(".", ",");

/**
 * Registrar um recebimento (total ou parcial) sem abrir o pedido. Usa a mesma função do
 * formulário do pedido, então entra no histórico de pagamentos e respeita o saldo.
 */
export function DialogRecebimentoPedido({ pedido, aposEntrega = false, onClose }: {
  pedido: PedidoCalc;
  /** Aberto logo depois de marcar o pedido como entregue com saldo em aberto. */
  aposEntrega?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saldo = saldoParaReceber(pedido.t.saldo);
  const hoje = hojeISO();
  const [valor, setValor] = useState(() => textoValor(saldo));
  const [forma, setForma] = useState(() => formaPadrao(pedido.pagamento_informado_em ? "pix" : pedido.forma_pagamento));
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const valorNumerico = Math.round(parseNum(valor) * 100) / 100;
  const erro = validarRecebimento({ valor: valorNumerico, saldo, data, hoje });

  async function registrar() {
    if (trava.current) return;
    if (erro) return void toast.error(erro);
    trava.current = true;
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("registrar_recebimento_pedido", {
        p_pedido_id: pedido.id,
        p_valor: valorNumerico,
        p_data_pagamento: data,
        p_forma_pagamento: forma,
      });
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pedidos"] }),
        qc.invalidateQueries({ queryKey: ["pedido-pagamentos"] }),
      ]);
      const restante = saldoParaReceber(saldo - valorNumerico);
      toast.success(restante > 0
        ? `Recebimento de ${brl(valorNumerico)} registrado. Ainda faltam ${brl(restante)}.`
        : `Recebimento de ${brl(valorNumerico)} registrado. Pedido #${pedido.numero} quitado.`);
      onClose();
    } catch (e) {
      toast.error(`Não foi possível registrar o recebimento: ${e instanceof Error ? e.message : "tente novamente."}`);
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto && !salvando) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pedido.pagamento_informado_em ? "Confirmar pagamento" : "Registrar recebimento"}</DialogTitle>
          <DialogDescription>{tituloPedido(pedido)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {aposEntrega && <p className="rounded-lg bg-accent p-3 text-sm">Pedido entregue. Quer registrar o recebimento agora?</p>}
          {pedido.pagamento_informado_em && <p className="rounded-lg bg-warning/15 p-3 text-sm font-medium text-warning-foreground">O cliente avisou que pagou por Pix. Confira no seu banco antes de confirmar.</p>}
          <div className="rounded-lg bg-muted/60 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total do pedido</span><span className="tabular-nums">{brl(pedido.t.venda)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Já recebido</span><span className="tabular-nums">{brl(pedido.t.recebido)}</span></div>
            <div className="flex justify-between font-semibold"><span>Falta receber</span><span className="tabular-nums">{brl(saldo)}</span></div>
          </div>
          <Field label="Valor recebido (R$)">
            <div className="flex gap-2">
              <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="h-11" aria-invalid={Boolean(erro)} />
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setValor(textoValor(saldo))}>Saldo inteiro</Button>
            </div>
          </Field>
          <Field label="Forma de pagamento">
            <NativeSelect value={forma} onChange={(e) => setForma(e.target.value)}>
              {FORMAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Data do recebimento">
            <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className="h-11" />
          </Field>
          {erro && valor.trim() !== "" && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={salvando} onClick={onClose}>{aposEntrega ? "Agora não" : "Cancelar"}</Button>
            <Button type="button" disabled={salvando || Boolean(erro)} onClick={() => void registrar()}>
              {salvando ? "Registrando..." : `Registrar ${brl(Number.isFinite(valorNumerico) && valorNumerico > 0 ? valorNumerico : 0)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
