import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CakeSlice, Check, Lock, LogOut, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { confeitariaQ, minhaAssinaturaQ, planosQ, plataformaPublicaQ } from "@/lib/queries";
import { NOME_RECURSO, RECURSOS, URL_PAINEL_ADMIN, avisoAssinatura, planoComRecurso, precoTexto, temRecurso, type MinhaAssinatura, type Plano, type Recurso } from "@/lib/assinatura";
import { linkWhatsApp } from "@/lib/catalogo";
import { NOME_PLATAFORMA, contato } from "@/lib/termos";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app/ui";
import { cn } from "@/lib/utils";

/** Link de WhatsApp para falar com a plataforma sobre o plano (null sem WhatsApp cadastrado). */
function useContatoPlano(mensagem: string) {
  const { data: plataforma } = useQuery(plataformaPublicaQ);
  return { link: linkWhatsApp(plataforma?.contato_whatsapp, mensagem), texto: contato(plataforma) };
}

/** O plano da conta inclui o recurso? (true enquanto carrega ou em contas sem assinatura). */
export function useRecurso(recurso: Recurso) {
  const { data } = useQuery(minhaAssinaturaQ);
  return temRecurso(data, recurso);
}

function BotaoContato({ mensagem, rotulo, className }: { mensagem: string; rotulo: string; className?: string }) {
  const { link, texto } = useContatoPlano(mensagem);
  if (!link) return <p className={cn("text-sm text-muted-foreground", className)}>Fale com a gente: {texto}.</p>;
  return (
    <Button asChild className={className}>
      <a href={link} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> {rotulo}</a>
    </Button>
  );
}

/** Tela ou cartão para um recurso que o plano atual não inclui. */
export function RecursoBloqueado({ recurso, compacto = false }: { recurso: Recurso; compacto?: boolean }) {
  const { data: planos = [] } = useQuery(planosQ);
  const { data: assinatura } = useQuery(minhaAssinaturaQ);
  const { data: loja } = useQuery(confeitariaQ);
  const plano = planoComRecurso(planos, recurso);
  const info = RECURSOS.find((r) => r.id === recurso);
  const mensagem = `Olá! Quero mudar o plano da ${loja?.nome ?? "minha confeitaria"} para ${plano?.nome ?? "um plano com " + NOME_RECURSO[recurso]}.`;
  return (
    <Card className={cn("text-center", compacto ? "space-y-2 border border-dashed p-4" : "mx-auto mt-6 max-w-md space-y-3 p-6")}>
      <div className={cn("mx-auto grid place-items-center rounded-full bg-accent text-primary", compacto ? "size-10" : "size-14")}><Lock className={compacto ? "size-5" : "size-7"} /></div>
      <h2 className={cn("font-semibold", !compacto && "font-display text-2xl")}>{info?.nome ?? "Recurso"} não está no seu plano</h2>
      <p className="text-sm text-muted-foreground">
        {info?.descricao} {assinatura ? `Seu plano atual é o ${assinatura.plano.nome}.` : ""}
        {plano ? ` Disponível a partir do plano ${plano.nome} (${precoTexto(plano.preco_mensal)}/mês).` : ""}
      </p>
      <BotaoContato mensagem={mensagem} rotulo={plano ? `Quero o plano ${plano.nome}` : "Falar sobre planos"} className="mx-auto" />
    </Card>
  );
}

/** Faixa no topo: fim do teste, vencimento próximo ou atraso. */
export function AvisoAssinatura() {
  const { data: assinatura } = useQuery(minhaAssinaturaQ);
  const { data: loja } = useQuery(confeitariaQ);
  const aviso = avisoAssinatura(assinatura);
  const { link } = useContatoPlano(`Olá! Quero ${assinatura?.situacao_cadastrada === "teste" ? "assinar" : "pagar a mensalidade de"} ${loja?.nome ?? "minha confeitaria"} (plano ${assinatura?.plano.nome ?? ""}).`);
  if (!aviso) return null;
  return (
    <div role="status" className={cn("mb-4 flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm",
      aviso.tom === "perigo" ? "bg-destructive/10 text-destructive" : aviso.tom === "alerta" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-foreground")}>
      {aviso.tom === "perigo" ? <AlertTriangle className="size-4 shrink-0" /> : <Sparkles className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1">{aviso.texto}</span>
      {link && <Button asChild size="sm" variant={aviso.tom === "perigo" ? "destructive" : "outline"}><a href={link} target="_blank" rel="noopener noreferrer">{assinatura?.situacao_cadastrada === "teste" ? "Assinar" : "Pagar"}</a></Button>}
    </div>
  );
}

function Moldura({ children, sair }: { children: React.ReactNode; sair: () => void }) {
  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <main className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><CakeSlice className="size-5" /></span>
          {NOME_PLATAFORMA}
        </div>
        <div className="space-y-4 rounded-2xl border bg-card p-5 text-sm shadow-soft">{children}</div>
        <Button type="button" variant="ghost" className="mt-4 w-full" onClick={sair}><LogOut className="size-4" /> Sair da conta</Button>
      </main>
    </div>
  );
}

/** Assinatura suspensa (teste ou mensalidade vencidos além da tolerância) ou cancelada. */
export function TelaAssinaturaSuspensa({ assinatura, sair }: { assinatura: MinhaAssinatura; sair: () => void }) {
  const { data: loja } = useQuery(confeitariaQ);
  const { data: planos = [] } = useQuery(planosQ);
  const cancelada = assinatura.situacao === "cancelada";
  const fimTeste = assinatura.situacao_cadastrada === "teste";
  return (
    <Moldura sair={sair}>
      <div className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive"><Lock className="size-6" /></div>
      <h1 className="font-display text-2xl font-semibold">{cancelada ? "Assinatura cancelada" : fimTeste ? "Seu teste grátis terminou" : "Acesso suspenso"}</h1>
      <p className="text-muted-foreground">
        {cancelada ? "A assinatura desta confeitaria foi cancelada." : fimTeste ? "Gostou? Escolha um plano para continuar usando o sistema." : "A mensalidade está vencida e o prazo de tolerância terminou."}
        {" "}Seus pedidos, clientes e produtos continuam guardados e voltam assim que a assinatura for regularizada. O catálogo on-line fica fora do ar enquanto isso.
      </p>
      {planos.length > 0 && <ListaPlanos planos={planos} atual={assinatura.plano.id} />}
      <BotaoContato mensagem={`Olá! Quero ${fimTeste ? "assinar" : "regularizar a assinatura de"} ${loja?.nome ?? "minha confeitaria"}.`} rotulo={fimTeste ? "Quero assinar" : "Regularizar pelo WhatsApp"} className="h-11 w-full" />
    </Moldura>
  );
}

/** Conta de administração aberta no sistema das confeitarias. */
export function TelaContaAdmin({ sair }: { sair: () => void }) {
  return (
    <Moldura sair={sair}>
      <div className="grid size-12 place-items-center rounded-full bg-accent text-primary"><ShieldCheck className="size-6" /></div>
      <h1 className="font-display text-2xl font-semibold">Conta de administração</h1>
      <p className="text-muted-foreground">Esta conta gerencia a plataforma e não é uma confeitaria. Use o painel de administração.</p>
      <Button asChild className="h-11 w-full"><a href={URL_PAINEL_ADMIN}>Abrir o painel de administração</a></Button>
    </Moldura>
  );
}

/** Comparativo dos planos com destaque para o atual. */
export function ListaPlanos({ planos, atual }: { planos: Plano[]; atual?: string | null }) {
  return (
    <div className="grid gap-2">
      {planos.map((p) => (
        <div key={p.id} className={cn("rounded-xl border p-3 text-left", p.id === atual && "border-primary ring-1 ring-primary/30")}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">{p.nome}{p.id === atual && <span className="ml-2 text-xs font-medium text-primary">seu plano</span>}</span>
            <span className="text-sm tabular-nums">{precoTexto(p.preco_mensal)}<span className="text-xs text-muted-foreground">/mês</span></span>
          </div>
          {p.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{p.descricao}</p>}
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {RECURSOS.filter((r) => p.recursos.includes(r.id)).map((r) => <li key={r.id} className="flex items-center gap-1"><Check className="size-3 text-success" />{r.nome}</li>)}
            {p.limite_pedidos_mes && <li className="text-muted-foreground">até {p.limite_pedidos_mes} pedidos/mês</li>}
            {p.limite_produtos && <li className="text-muted-foreground">até {p.limite_produtos} produtos</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Cartão "Meu plano" das configurações. */
export function CartaoMeuPlano() {
  const { data: assinatura } = useQuery(minhaAssinaturaQ);
  const { data: planos = [] } = useQuery(planosQ);
  const { data: loja } = useQuery(confeitariaQ);
  if (!assinatura) return null;
  const rotulo: Record<string, string> = { teste: "Teste grátis", ativa: "Ativa", cortesia: "Cortesia", atrasada: "Vencida", suspensa: "Suspensa", cancelada: "Cancelada" };
  const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
  const limite = (uso: number, max: number | null) => (max ? `${uso} de ${max}` : `${uso}`);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Meu plano</h2>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", assinatura.situacao === "atrasada" ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success")}>{rotulo[assinatura.situacao] ?? assinatura.situacao}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><div className="text-xs text-muted-foreground">Plano</div><div className="font-semibold">{assinatura.plano.nome}</div></div>
        <div><div className="text-xs text-muted-foreground">{assinatura.situacao_cadastrada === "teste" ? "Teste até" : "Pago até"}</div><div className="font-semibold">{assinatura.situacao === "cortesia" ? "Sem cobrança" : data(assinatura.vencimento)}</div></div>
        <div><div className="text-xs text-muted-foreground">Pedidos neste mês</div><div className="tabular-nums">{limite(assinatura.uso.pedidos_mes, assinatura.plano.limite_pedidos_mes)}</div></div>
        <div><div className="text-xs text-muted-foreground">Produtos</div><div className="tabular-nums">{limite(assinatura.uso.produtos, assinatura.plano.limite_produtos)}</div></div>
      </div>
      {planos.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">Comparar planos</summary>
          <div className="mt-3"><ListaPlanos planos={planos} atual={assinatura.plano.id} /></div>
        </details>
      )}
      <BotaoContato mensagem={`Olá! Quero falar sobre o plano da ${loja?.nome ?? "minha confeitaria"}.`} rotulo="Mudar de plano ou pagar" className="h-10 w-full sm:w-auto" />
    </Card>
  );
}
