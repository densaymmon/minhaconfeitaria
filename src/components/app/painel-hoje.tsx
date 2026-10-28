import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AlertTriangle, BellRing, CalendarClock, ChefHat, CircleDollarSign, MessageCircle, PartyPopper, ShoppingBag, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosCalc, type PedidoCalc } from "@/lib/hooks";
import { configQ, confeitariaQ } from "@/lib/queries";
import { brl, hojeISO, num } from "@/lib/format";
import { somarDias } from "@/lib/lista-producao";
import { mensagemCobranca, montarHoje } from "@/lib/hoje";
import { linkWhatsApp } from "@/lib/catalogo";
import { avisoProntoWhatsApp } from "@/lib/whatsapp-pedido";
import { Card, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Bloco "Hoje" do painel: o que entregar, produzir, avisar e cobrar agora. */
export function PainelHoje() {
  const pedidos = usePedidosCalc();
  const { data: config } = useSuspenseQuery(configQ);
  const { data: confeitaria } = useQuery(confeitariaQ);
  const qc = useQueryClient();
  const hoje = hojeISO();
  const amanha = somarDias(hoje, 1);
  const r = useMemo(() => montarHoje(pedidos, hoje, amanha), [pedidos, hoje, amanha]);
  const opcoes = {
    loja: confeitaria?.nome?.trim() || "nossa confeitaria",
    pix: config.pix_chave,
    pixTipo: config.pix_tipo,
    cidade: confeitaria?.cidade ?? null,
    enderecoRetirada: confeitaria?.endereco_retirada ?? null,
    origem: typeof window === "undefined" ? "" : window.location.origin,
  };
  const totalProduzir = r.produzir.reduce((s, i) => s + i.pendente, 0);
  const nada = !r.novos.length && !r.atrasados.length && !r.entregarHoje.length && !r.produzir.length && !r.avisarPronto.length && !r.cobrar.length;

  async function marcarAvisado(p: PedidoCalc) {
    if (p.aviso_pronto_enviado_em) return;
    const { error } = await supabase.from("pedidos").update({ aviso_pronto_enviado_em: new Date().toISOString() }).eq("id", p.id);
    if (!error) void qc.invalidateQueries({ queryKey: ["pedidos"] });
  }

  const numeros = [
    { rotulo: "Entregas hoje", valor: String(r.entregarHoje.length), icone: Truck, destaque: r.entregarHoje.length > 0 },
    { rotulo: "Itens a produzir", valor: num(totalProduzir), icone: ChefHat, destaque: totalProduzir > 0 },
    { rotulo: "A receber hoje", valor: brl(r.aReceberHoje), icone: CircleDollarSign, destaque: r.aReceberHoje > 0 },
    { rotulo: "Novos do catálogo", valor: String(r.novos.length), icone: ShoppingBag, destaque: r.novos.length > 0 },
  ];

  return (
    <section aria-label="Hoje" className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {numeros.map(({ rotulo, valor, icone: Icone, destaque }) => (
          <Card key={rotulo} className={cn("flex items-center gap-3 p-3", destaque && "ring-1 ring-primary/25")}>
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", destaque ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}><Icone className="size-4" /></span>
            <span className="min-w-0">
              <span className="block truncate text-xs text-muted-foreground">{rotulo}</span>
              <span className="block truncate text-lg font-bold tabular-nums">{valor}</span>
            </span>
          </Card>
        ))}
      </div>

      {nada && (
        <Card className="flex items-center gap-3 p-4 text-sm">
          <PartyPopper className="size-5 shrink-0 text-success" />
          <span>Nada pendente para hoje. {r.entregarAmanha.length > 0 ? `Amanhã tem ${r.entregarAmanha.length} entrega(s).` : "Aproveite para cadastrar produtos ou divulgar o catálogo."}</span>
        </Card>
      )}

      {r.novos.length > 0 && (
        <Bloco titulo="Pedidos novos do catálogo" icone={BellRing} tom="primario">
          {r.novos.map((p) => <LinhaPedido key={p.id} p={p} detalhe={`para ${dataCurta(p.data_entrega, hoje)}`} />)}
        </Bloco>
      )}

      {r.atrasados.length > 0 && (
        <Bloco titulo={`Atrasados (${r.atrasados.length})`} icone={AlertTriangle} tom="perigo">
          {r.atrasados.slice(0, 5).map((p) => <LinhaPedido key={p.id} p={p} detalhe={`era para ${dataCurta(p.data_entrega, hoje)}`} />)}
          {r.atrasados.length > 5 && <MaisLink to="/producao" texto={`Ver os ${r.atrasados.length} atrasados`} />}
        </Bloco>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {r.entregarHoje.length > 0 && (
          <Bloco titulo="Entregas e retiradas de hoje" icone={Truck}>
            {r.entregarHoje.map((p) => (
              <LinhaPedido key={p.id} p={p} detalhe={`${p.hora_entrega ? p.hora_entrega.slice(0, 5) : "sem horário"}${p.tipo_entrega === "entrega" ? " · entrega" : p.tipo_entrega === "retirada" ? " · retirada" : ""}${p.t.saldo > 0.009 ? ` · falta ${brl(p.t.saldo)}` : ""}`} />
            ))}
          </Bloco>
        )}

        {r.produzir.length > 0 && (
          <Bloco titulo="Produzir para hoje e amanhã" icone={ChefHat}>
            {r.produzir.slice(0, 6).map((i) => (
              <div key={i.descricao} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{i.descricao}</span><span className="text-xs text-muted-foreground">{i.pedidos} pedido(s) · {i.maisCedo < hoje ? "atrasado" : i.maisCedo === hoje ? "para hoje" : "para amanhã"}</span></span>
                <span className="shrink-0 text-lg font-bold tabular-nums">{num(i.pendente)}</span>
              </div>
            ))}
            <MaisLink to="/producao" texto="Abrir a produção" />
          </Bloco>
        )}

        {r.avisarPronto.length > 0 && (
          <Bloco titulo="Avisar que está pronto" icone={MessageCircle}>
            {r.avisarPronto.map((p) => {
              const aviso = avisoProntoWhatsApp(p, opcoes);
              return (
                <LinhaPedido key={p.id} p={p} detalhe={dataCurta(p.data_entrega, hoje)}
                  acao={aviso ? <Button asChild size="sm" className="bg-success text-success-foreground hover:bg-success/90"><a href={aviso.url} target="_blank" rel="noopener noreferrer" onClick={() => void marcarAvisado(p)}><MessageCircle className="size-4" /> Avisar</a></Button> : null} />
              );
            })}
          </Bloco>
        )}

        {r.cobrar.length > 0 && (
          <Bloco titulo="Pagamentos em aberto" icone={CircleDollarSign}>
            {r.cobrar.slice(0, 6).map((p) => {
              const link = linkWhatsApp(p.clientes?.telefone, mensagemCobranca(p, config.pix_chave));
              return (
                <LinhaPedido key={p.id} p={p} detalhe={`${brl(p.t.saldo)} · ${["entregue", "finalizado"].includes(p.status) ? "já entregue" : dataCurta(p.data_entrega, hoje)}`}
                  acao={link ? <Button asChild size="sm" variant="outline"><a href={link} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Cobrar</a></Button> : null} />
              );
            })}
            {r.cobrar.length > 6 && <MaisLink to="/pedidos" texto={`Ver todos (${r.cobrar.length})`} />}
          </Bloco>
        )}
      </div>

      {r.entregarAmanha.length > 0 && !nada && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="size-4" /> Amanhã: {r.entregarAmanha.length} entrega(s).</p>
      )}
    </section>
  );
}

function dataCurta(iso: string, hoje: string) {
  if (iso === hoje) return "hoje";
  if (iso === somarDias(hoje, 1)) return "amanhã";
  if (iso === somarDias(hoje, -1)) return "ontem";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function Bloco({ titulo, icone: Icone, tom, children }: { titulo: string; icone: typeof Truck; tom?: "primario" | "perigo"; children: React.ReactNode }) {
  return (
    <Card className={cn("p-4", tom === "primario" && "ring-1 ring-primary/30", tom === "perigo" && "ring-1 ring-destructive/30")}>
      <h2 className={cn("mb-1 flex items-center gap-2 font-semibold", tom === "perigo" && "text-destructive", tom === "primario" && "text-primary")}><Icone className="size-4" /> {titulo}</h2>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

function LinhaPedido({ p, detalhe, acao }: { p: PedidoCalc; detalhe: string; acao?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm">
      <Link to="/pedidos/$id" params={{ id: p.id }} className="min-w-0 flex-1 rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex items-center gap-2"><b>#{p.numero}</b><span className="truncate">{p.clientes?.nome ?? "Sem cliente"}</span></span>
        <span className="block truncate text-xs text-muted-foreground">{detalhe}</span>
      </Link>
      {acao ?? <StatusBadge status={p.status} />}
    </div>
  );
}

function MaisLink({ to, texto }: { to: "/producao" | "/pedidos"; texto: string }) {
  return <Link to={to} className="block pt-2 text-sm font-medium text-primary hover:underline">{texto}</Link>;
}
