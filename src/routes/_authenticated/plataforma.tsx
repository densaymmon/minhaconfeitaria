import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Lock, MessageCircle, Search, ShieldCheck, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ehAdminQ, plataformaPublicaQ } from "@/lib/queries";
import { dataBR, hojeISO } from "@/lib/format";
import { linkCatalogo, linkWhatsApp } from "@/lib/catalogo";
import { NOME_PLATAFORMA } from "@/lib/termos";
import { ROTULO_ACESSO, filtrarContas, lerContas, mensalidadeVencida, resumoContas, type Acesso, type ContaPlataforma, type FiltroContas } from "@/lib/plataforma";
import { Card, Field, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({ meta: [{ title: "Plataforma — Doce Gestão" }, { name: "robots", content: "noindex" }] }),
  component: Plataforma,
});

const contasQ = {
  queryKey: ["admin-confeitarias"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_listar_confeitarias");
    if (error) throw new Error(error.message);
    return lerContas(data);
  },
};

function Plataforma() {
  const { data: admin, isPending } = useQuery(ehAdminQ);
  if (isPending) return <p className="py-20 text-center text-sm text-muted-foreground" role="status">Carregando...</p>;
  if (!admin) {
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <ShieldCheck className="mx-auto mb-2 size-8 text-muted-foreground" />
        <h1 className="font-semibold">Área restrita</h1>
        <p className="mt-1 text-sm text-muted-foreground">Esta página é só para a administração da plataforma.</p>
      </Card>
    );
  }
  return <PainelPlataforma />;
}

function PainelPlataforma() {
  const hoje = hojeISO();
  const { data: contas = [], isLoading, error } = useQuery(contasQ);
  const [filtro, setFiltro] = useState<FiltroContas>("todas");
  const [busca, setBusca] = useState("");
  const resumo = resumoContas(contas, hoje);
  const lista = filtrarContas(contas, filtro, busca, hoje);
  const filtros: { valor: FiltroContas; rotulo: string; total: number }[] = [
    { valor: "todas", rotulo: "Todas", total: resumo.total },
    { valor: "pendente", rotulo: "Aguardando", total: resumo.pendente },
    { valor: "ativo", rotulo: "Ativas", total: resumo.ativo },
    { valor: "vencidas", rotulo: "Mensalidade vencida", total: resumo.vencidas },
    { valor: "bloqueado", rotulo: "Bloqueadas", total: resumo.bloqueado },
  ];

  return (
    <>
      <PageHeader title="Plataforma" subtitle={`Confeitarias que usam o ${NOME_PLATAFORMA}`} />
      <ConfigPlataforma />

      <div className="mb-3 mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Confeitarias", resumo.total], ["Aguardando", resumo.pendente], ["Ativas", resumo.ativo], ["Vencidas", resumo.vencidas]].map(([rotulo, total]) => (
          <Card key={String(rotulo)} className="p-3">
            <span className="block text-xs font-medium text-muted-foreground">{rotulo}</span>
            <span className={cn("mt-1 block text-2xl font-bold tabular-nums", rotulo === "Aguardando" && Number(total) > 0 && "text-primary", rotulo === "Vencidas" && Number(total) > 0 && "text-destructive")}>{total}</span>
          </Card>
        ))}
      </div>

      <Card className="mb-4 space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, WhatsApp ou cidade" aria-label="Buscar confeitaria" className="h-11 bg-background pl-9" />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Filtrar por situação">
          {filtros.map((f) => (
            <button key={f.valor} type="button" onClick={() => setFiltro(f.valor)} aria-pressed={filtro === f.valor}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium", filtro === f.valor ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
              {f.rotulo}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", filtro === f.valor ? "bg-primary-foreground/20" : "bg-muted")}>{f.total}</span>
            </button>
          ))}
        </div>
      </Card>

      {isLoading ? <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando confeitarias...</p>
        : error ? <p role="alert" className="py-8 text-destructive">{error.message}</p>
        : lista.length === 0 ? <Card className="border-dashed text-center text-sm text-muted-foreground">Nenhuma confeitaria neste filtro.</Card>
        : <div className="space-y-3">{lista.map((c) => <CartaoConta key={c.user_id} conta={c} hoje={hoje} />)}</div>}
    </>
  );
}

function ConfigPlataforma() {
  const qc = useQueryClient();
  const { data: plataforma, isLoading } = useQuery(plataformaPublicaQ);
  const [f, setF] = useState({ cadastro_aberto: false, aprovacao_manual: true, empresa_nome: "", empresa_documento: "", contato_email: "", contato_whatsapp: "" });
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!plataforma) return;
    setF({
      cadastro_aberto: plataforma.cadastro_aberto,
      aprovacao_manual: plataforma.aprovacao_manual,
      empresa_nome: plataforma.empresa_nome ?? "",
      empresa_documento: plataforma.empresa_documento ?? "",
      contato_email: plataforma.contato_email ?? "",
      contato_whatsapp: plataforma.contato_whatsapp ?? "",
    });
  }, [plataforma]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (f.contato_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contato_email.trim())) return void toast.error("Confira o e-mail de contato.");
    if (f.cadastro_aberto && !f.contato_email.trim() && !f.contato_whatsapp.trim()) return void toast.error("Antes de abrir o cadastro, informe um e-mail ou WhatsApp de contato: ele aparece nos termos e para quem aguarda liberação.");
    setSalvando(true);
    const { error } = await supabase.rpc("admin_salvar_plataforma", { p: f });
    setSalvando(false);
    if (error) return void toast.error(`Não foi possível salvar: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["plataforma-publica"] });
    toast.success("Configurações da plataforma salvas.");
  }

  if (isLoading) return null;
  return (
    <Card>
      <form onSubmit={salvar} className="space-y-4">
        <h2 className="text-lg font-semibold">Cadastro de novas confeitarias</h2>
        <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <span><span className="block text-sm font-medium">Cadastro aberto</span><span className="block text-xs text-muted-foreground">Mostra "Criar conta" na tela de entrada.</span></span>
          <Switch checked={f.cadastro_aberto} onCheckedChange={(v) => setF({ ...f, cadastro_aberto: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <span><span className="block text-sm font-medium">Liberar novas contas manualmente</span><span className="block text-xs text-muted-foreground">A conta nova só usa o sistema depois que você liberar aqui.</span></span>
          <Switch checked={f.aprovacao_manual} onCheckedChange={(v) => setF({ ...f, aprovacao_manual: v })} />
        </label>
        <details className="rounded-xl border p-3" open={!f.empresa_nome && !f.contato_email}>
          <summary className="cursor-pointer text-sm font-medium">Responsável e contato (aparecem nos termos de uso)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Nome ou razão social"><Input maxLength={120} value={f.empresa_nome} onChange={(e) => setF({ ...f, empresa_nome: e.target.value })} className="h-11" /></Field>
            <Field label="CPF ou CNPJ"><Input maxLength={30} value={f.empresa_documento} onChange={(e) => setF({ ...f, empresa_documento: e.target.value })} className="h-11" /></Field>
            <Field label="E-mail de contato"><Input type="email" maxLength={120} value={f.contato_email} onChange={(e) => setF({ ...f, contato_email: e.target.value })} className="h-11" /></Field>
            <Field label="WhatsApp de contato"><Input type="tel" maxLength={30} value={f.contato_whatsapp} onChange={(e) => setF({ ...f, contato_whatsapp: e.target.value })} className="h-11" /></Field>
          </div>
        </details>
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
      </form>
    </Card>
  );
}

function CartaoConta({ conta: c, hoje }: { conta: ContaPlataforma; hoje: string }) {
  const qc = useQueryClient();
  const [pagoAte, setPagoAte] = useState(c.pago_ate ?? "");
  const [obs, setObs] = useState(c.observacao ?? "");
  const [salvando, setSalvando] = useState(false);
  const vencida = mensalidadeVencida(c, hoje);
  const alterado = pagoAte !== (c.pago_ate ?? "") || obs.trim() !== (c.observacao ?? "");
  const whatsapp = linkWhatsApp(c.whatsapp, `Olá! Aqui é do ${NOME_PLATAFORMA}, sobre o cadastro da ${c.nome}.`);
  const catalogo = c.slug && c.catalogo_ativo && typeof window !== "undefined" ? linkCatalogo(window.location.origin, c.slug) : null;

  async function salvar(acesso: Acesso) {
    if (acesso === "bloqueado" && !confirm(`Bloquear o acesso da ${c.nome}? O catálogo dela sai do ar até você liberar de novo.`)) return;
    setSalvando(true);
    const { error } = await supabase.rpc("admin_atualizar_confeitaria", { p_user_id: c.user_id, p_acesso: acesso, p_pago_ate: pagoAte || null, p_observacao: obs.trim() || null });
    setSalvando(false);
    if (error) return void toast.error(error.message.replace(/^ADMIN:\s*/, ""));
    await qc.invalidateQueries({ queryKey: ["admin-confeitarias"] });
    toast.success(acesso === c.acesso ? "Anotações salvas." : acesso === "ativo" ? `${c.nome} liberada.` : `${c.nome} bloqueada.`);
  }

  return (
    <Card className={cn("space-y-3 p-3.5", c.acesso === "pendente" && "ring-1 ring-primary/40", vencida && "ring-1 ring-destructive/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{c.nome}</h3>
            {c.admin && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Você</span>}
          </div>
          <p className="break-all text-xs text-muted-foreground">{c.email ?? "sem e-mail"}{!c.email_confirmado && c.email ? " (e-mail não confirmado)" : ""}</p>
          <p className="text-xs text-muted-foreground">{[c.whatsapp, c.cidade].filter(Boolean).join(" · ") || "Sem WhatsApp e cidade"}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
          c.acesso === "ativo" ? (vencida ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success") : c.acesso === "pendente" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          {vencida ? "Mensalidade vencida" : ROTULO_ACESSO[c.acesso]}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Cadastro</dt><dd>{c.criado_em ? dataBR(c.criado_em.slice(0, 10)) : "—"}</dd></div>
        <div><dt className="text-muted-foreground">Último acesso</dt><dd>{c.ultimo_acesso ? dataBR(c.ultimo_acesso.slice(0, 10)) : "—"}</dd></div>
        <div><dt className="text-muted-foreground">Pedidos (30 dias)</dt><dd className="tabular-nums">{c.pedidos_30d} de {c.pedidos_total}</dd></div>
        <div><dt className="text-muted-foreground">Produtos</dt><dd className="tabular-nums">{c.produtos}</dd></div>
        <div><dt className="text-muted-foreground">Primeiros passos</dt><dd>{c.onboarding_concluido ? "Concluídos" : "Pendentes"}</dd></div>
        <div><dt className="text-muted-foreground">Termos</dt><dd>{c.termos_aceitos_em ? `Aceitos em ${dataBR(c.termos_aceitos_em.slice(0, 10))}` : "Não aceitos"}</dd></div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {whatsapp && <Button asChild size="sm" variant="outline"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>}
        {catalogo && <Button asChild size="sm" variant="outline"><a href={catalogo} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Catálogo</a></Button>}
      </div>

      {!c.admin && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Field label="Mensalidade paga até"><Input type="date" value={pagoAte} onChange={(e) => setPagoAte(e.target.value)} className="h-10" /></Field>
            <Field label="Anotações (só você vê)"><Textarea rows={1} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: plano mensal R$ 49, paga todo dia 10" /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.acesso !== "ativo" && <Button type="button" size="sm" disabled={salvando} onClick={() => void salvar("ativo")}><Unlock className="size-4" /> Liberar acesso</Button>}
            {c.acesso !== "bloqueado" && <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={salvando} onClick={() => void salvar("bloqueado")}><Lock className="size-4" /> Bloquear</Button>}
            {alterado && <Button type="button" size="sm" variant="secondary" disabled={salvando} onClick={() => void salvar(c.acesso)}><Check className="size-4" /> Salvar anotações</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}
