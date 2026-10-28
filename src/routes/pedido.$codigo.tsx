import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CakeSlice, Check, Copy, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { brl, dataLonga } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ETAPAS_PEDIDO, etapaAtual, linkWhatsApp, mensagemPedidoParaLoja, type PedidoAcompanhamento } from "@/lib/catalogo";

export const Route = createFileRoute("/pedido/$codigo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acompanhe seu pedido" },
      { name: "description", content: "Situação do pedido e pagamento por Pix." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcompanharRota,
});

function AcompanharRota() {
  const { codigo } = Route.useParams();
  return <AcompanharPedido codigo={codigo} />;
}

// Código longo (UUID) dos primeiros links ou código curto de 10 caracteres.
const CODIGO = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z2-9]{10})$/i;

/** Acompanhamento do pedido; usado em /p/<código curto> e em /pedido/<código>. */
export function AcompanharPedido({ codigo }: { codigo: string }) {
  const qc = useQueryClient();
  const codigoValido = CODIGO.test(codigo);
  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido-publico", codigo],
    enabled: codigoValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pedido_publico", { p_codigo: codigo });
      if (error) throw new Error(error.message);
      return (data as unknown as PedidoAcompanhamento | null) ?? null;
    },
    refetchInterval: 30_000,
  });
  const [avisando, setAvisando] = useState(false);

  if (codigoValido && isLoading) return <Pagina><p className="py-24 text-center text-sm text-muted-foreground" role="status">Carregando seu pedido…</p></Pagina>;
  if (!pedido) {
    return (
      <Pagina>
        <div className="py-24 text-center">
          <CakeSlice className="mx-auto mb-3 size-10 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Pedido não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Confira o link recebido ou fale com a confeitaria.</p>
        </div>
      </Pagina>
    );
  }

  const cancelado = pedido.status === "cancelado";
  const pago = pedido.pago >= pedido.total - 0.009;
  const falta = Math.max(0, Math.round((pedido.total - pedido.pago) * 100) / 100);
  const etapa = etapaAtual(pedido.status);
  const loja = pedido.confeitaria;
  // Resumo do pedido + link desta página, para a confeitaria receber tudo na conversa.
  const linkAcompanhamento = /^[a-z2-9]{10}$/i.test(codigo) ? `${window.location.origin}/p/${codigo.toLowerCase()}` : window.location.href;
  const whatsapp = linkWhatsApp(loja.whatsapp, mensagemPedidoParaLoja({
    cliente: pedido.cliente,
    numero: pedido.numero,
    itens: pedido.itens.map((i) => ({ descricao: i.descricao, quantidade: Number(i.quantidade), preco: Number(i.preco) })),
    taxaEntrega: Number(pedido.taxa_entrega) || 0,
    desconto: Number(pedido.desconto) || 0,
    total: Number(pedido.total) || 0,
    pago: Number(pedido.pago) || 0,
    dataEntrega: pedido.data_entrega,
    horaEntrega: pedido.hora_entrega,
    tipoEntrega: pedido.tipo_entrega,
    endereco: pedido.tipo_entrega === "entrega" ? pedido.endereco_entrega : null,
    link: linkAcompanhamento,
  }));

  async function copiarPix() {
    if (!loja.pix_chave) return;
    try {
      await navigator.clipboard.writeText(loja.pix_chave);
      toast.success("Chave Pix copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione a chave e copie manualmente.");
    }
  }

  async function informarPagamento() {
    setAvisando(true);
    const { error } = await supabase.rpc("informar_pagamento_pedido", { p_codigo: codigo });
    setAvisando(false);
    if (error) return void toast.error("Não foi possível avisar agora. Tente de novo em instantes.");
    await qc.invalidateQueries({ queryKey: ["pedido-publico", codigo] });
    toast.success("Pronto! A confeitaria vai conferir o pagamento.");
  }

  return (
    <Pagina>
      <header className="pb-4 pt-8 text-center">
        <p className="text-sm text-muted-foreground">{loja.nome}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Pedido #{pedido.numero}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pedido.tipo_entrega === "entrega" ? "Entrega" : "Retirada"} {dataLonga(pedido.data_entrega)}{pedido.hora_entrega ? ` às ${pedido.hora_entrega}` : ""}
        </p>
      </header>

      {!cancelado && whatsapp && (
        <div className="mb-4 rounded-2xl border border-success/30 bg-success/10 p-4 text-center">
          <p className="text-sm">Envie o resumo do pedido para a confeitaria e combine os detalhes pelo WhatsApp.</p>
          <Button asChild className="mt-3 h-11 w-full bg-success text-success-foreground hover:bg-success/90">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Enviar pedido no WhatsApp</a>
          </Button>
        </div>
      )}

      {cancelado ? (
        <p className="rounded-2xl bg-destructive/10 p-4 text-center text-sm font-medium text-destructive">Este pedido foi cancelado. Em caso de dúvida, fale com a confeitaria.</p>
      ) : (
        <ol className="grid grid-cols-4 gap-1 rounded-2xl bg-card p-3 shadow-soft" aria-label="Andamento do pedido">
          {ETAPAS_PEDIDO.map((e, i) => (
            <li key={e.label} className="flex flex-col items-center gap-1 text-center">
              <span className={cn("grid size-8 place-items-center rounded-full text-xs font-semibold", i <= etapa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")} aria-hidden="true">
                {i < etapa ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn("text-[11px] leading-tight", i === etapa ? "font-semibold text-foreground" : "text-muted-foreground")}>{e.label}</span>
              {i === etapa && <span className="sr-only">(etapa atual)</span>}
            </li>
          ))}
        </ol>
      )}

      {!cancelado && (
        <section className="mt-4 rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="font-semibold">Pagamento</h2>
          {pago ? (
            <p className="mt-2 rounded-xl bg-success/15 p-3 text-sm font-medium text-success">Pagamento confirmado. Obrigado!</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Valor a pagar por Pix: <b className="text-foreground tabular-nums">{brl(falta)}</b></p>
              {loja.pix_chave ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl border bg-background p-3">
                  <code className="min-w-0 flex-1 break-all text-sm">{loja.pix_chave}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copiarPix()}><Copy className="size-4" /> Copiar</Button>
                </div>
              ) : (
                <p className="mt-3 rounded-xl bg-muted p-3 text-sm">A confeitaria vai enviar os dados do Pix pelo WhatsApp.</p>
              )}
              {pedido.pagamento_informado ? (
                <p className="mt-3 text-sm text-muted-foreground">Você avisou que pagou. A confeitaria vai conferir e confirmar aqui.</p>
              ) : (
                <Button type="button" className="mt-3 h-11 w-full" disabled={avisando} onClick={() => void informarPagamento()}>
                  {avisando ? "Avisando…" : "Já fiz o Pix"}
                </Button>
              )}
            </>
          )}
        </section>
      )}

      <section className="mt-4 rounded-2xl bg-card p-4 shadow-soft">
        <h2 className="font-semibold">Itens</h2>
        <ul className="mt-2 divide-y text-sm">
          {pedido.itens.map((item, i) => (
            <li key={`${item.descricao}-${i}`} className="flex justify-between gap-3 py-2">
              <span>{Number(item.quantidade)}× {item.descricao}</span>
              <span className="tabular-nums">{brl(Number(item.quantidade) * Number(item.preco))}</span>
            </li>
          ))}
        </ul>
        {pedido.taxa_entrega > 0 && <div className="flex justify-between border-t pt-2 text-sm"><span className="text-muted-foreground">Entrega</span><span className="tabular-nums">{brl(pedido.taxa_entrega)}</span></div>}
        {pedido.desconto > 0 && <div className="flex justify-between pt-1 text-sm"><span className="text-muted-foreground">Desconto</span><span className="tabular-nums">− {brl(pedido.desconto)}</span></div>}
        <div className="mt-1 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{brl(pedido.total)}</span></div>
        {pedido.tipo_entrega === "entrega" && pedido.endereco_entrega && <p className="mt-3 text-sm text-muted-foreground">Entrega em: {pedido.endereco_entrega}</p>}
        {pedido.tipo_entrega === "retirada" && loja.endereco_retirada && <p className="mt-3 text-sm text-muted-foreground">Retirada em: {loja.endereco_retirada}</p>}
      </section>

      <div className="mt-4 grid gap-2 pb-10">
        {whatsapp && (
          <Button asChild variant="outline" className="h-11">
            <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Falar com a confeitaria</a>
          </Button>
        )}
        {loja.slug && (
          <Button asChild variant="ghost" className="h-11">
            <Link to="/$slug" params={{ slug: loja.slug }}>Fazer outro pedido</Link>
          </Button>
        )}
        <p className="text-center text-xs text-muted-foreground">Guarde este link para acompanhar o pedido.</p>
      </div>
    </Pagina>
  );
}

function Pagina({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><main className="mx-auto max-w-lg px-4">{children}</main></div>;
}
