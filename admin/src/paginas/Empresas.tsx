import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, MessageCircle, Search, Unlock, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { linkWhatsApp } from "@/lib/catalogo";
import { filtrarEmpresas, previsaoPagoAte, situacaoExibida, type Empresa, type FiltroEmpresas } from "@/lib/plataforma";
import { empresasQ, pagamentosQ, planosQ } from "../dados";
import { erroAmigavel, supabase } from "../supabase";
import { Campo, Cartao, Etiqueta, Selecao, Titulo, brl, data, hoje } from "../ui";

const FILTROS: { id: FiltroEmpresas; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "pendentes", rotulo: "Aguardando" },
  { id: "teste", rotulo: "Em teste" },
  { id: "ativas", rotulo: "Ativas" },
  { id: "atrasadas", rotulo: "Atrasadas" },
  { id: "suspensas", rotulo: "Suspensas" },
  { id: "cortesia", rotulo: "Cortesia" },
  { id: "bloqueadas", rotulo: "Bloqueadas" },
];

export function PaginaEmpresas() {
  const { data: empresas = [], isLoading, error } = useQuery(empresasQ);
  const [filtro, setFiltro] = useState<FiltroEmpresas>("todas");
  const [busca, setBusca] = useState("");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const lista = filtrarEmpresas(empresas, filtro, busca);
  const aberta = empresas.find((e) => e.user_id === abertaId) ?? null;

  return (
    <>
      <Titulo titulo="Empresas" subtitulo="Confeitarias cadastradas, planos e situação da assinatura" />
      <Cartao className="mb-4 space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, WhatsApp, cidade ou plano" aria-label="Buscar empresa" className="h-11 pl-9" />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTROS.map((f) => {
            const total = filtrarEmpresas(empresas, f.id, "").length;
            return (
              <button key={f.id} type="button" onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium", filtro === f.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                {f.rotulo}<span className={cn("rounded-full px-1.5 text-xs tabular-nums", filtro === f.id ? "bg-primary-foreground/20" : "bg-muted")}>{total}</span>
              </button>
            );
          })}
        </div>
      </Cartao>

      {isLoading ? <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando…</p>
        : error ? <p role="alert" className="py-8 text-destructive">{error.message}</p>
        : lista.length === 0 ? <Cartao className="border-dashed text-center text-sm text-muted-foreground">Nenhuma empresa neste filtro.</Cartao>
        : (
          <div className="grid gap-2 md:grid-cols-2">
            {lista.map((e) => {
              const s = situacaoExibida(e);
              const venc = e.situacao_cadastrada === "teste" ? e.teste_ate : e.situacao_cadastrada === "ativa" ? e.pago_ate : null;
              return (
                <button key={e.user_id} type="button" onClick={() => setAbertaId(e.user_id)} className="rounded-2xl border bg-card p-3.5 text-left shadow-soft transition hover:border-primary/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{e.nome}</div>
                      <div className="truncate text-xs text-muted-foreground">{e.email ?? "sem e-mail"}{e.cidade ? ` · ${e.cidade}` : ""}</div>
                    </div>
                    <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Plano <b className="text-foreground">{e.plano_nome ?? "—"}</b></span>
                    {venc && <span>{e.situacao_cadastrada === "teste" ? "Teste até" : "Pago até"} <b className="text-foreground">{data(venc)}</b></span>}
                    {e.situacao_cadastrada !== "cortesia" && e.valor_efetivo != null && <span>{brl(e.valor_efetivo)}/{e.ciclo === "anual" ? "ano" : "mês"}</span>}
                    <span>{e.pedidos_30d} pedido(s) em 30 dias</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      <Dialog open={!!aberta} onOpenChange={(v) => { if (!v) setAbertaId(null); }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          {aberta && <DetalheEmpresa empresa={aberta} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetalheEmpresa({ empresa: e }: { empresa: Empresa }) {
  const s = situacaoExibida(e);
  const whatsapp = linkWhatsApp(e.whatsapp, `Olá! Aqui é do Doce Gestão, sobre a conta da ${e.nome}.`);
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">{e.nome} <Etiqueta tom={s.tom}>{s.rotulo}</Etiqueta></DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-muted/50 p-3 text-sm sm:grid-cols-3">
          <Info rotulo="E-mail" valor={`${e.email ?? "—"}${e.email && !e.email_confirmado ? " (não confirmado)" : ""}`} />
          <Info rotulo="WhatsApp" valor={e.whatsapp ?? "—"} />
          <Info rotulo="Cidade" valor={e.cidade ?? "—"} />
          <Info rotulo="Cadastro" valor={data(e.criado_em)} />
          <Info rotulo="Último acesso" valor={data(e.ultimo_acesso)} />
          <Info rotulo="Pedidos (30 dias / total)" valor={`${e.pedidos_30d} / ${e.pedidos_total}`} />
          <Info rotulo="Produtos" valor={String(e.produtos)} />
          <Info rotulo="Catálogo" valor={e.slug ? `/${e.slug}${e.catalogo_ativo ? "" : " (desligado)"}` : "não configurado"} />
          <Info rotulo="Primeiros passos" valor={e.onboarding_concluido ? "Concluídos" : "Pendentes"} />
          <Info rotulo="Termos" valor={e.termos_aceitos_em ? `Aceitos em ${data(e.termos_aceitos_em)}` : "Não aceitos"} />
          <Info rotulo="Último pagamento" valor={data(e.ultimo_pagamento)} />
        </dl>
        {whatsapp && <Button asChild variant="outline" size="sm"><a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Conversar no WhatsApp</a></Button>}
        <FormAssinatura empresa={e} />
        <RegistrarPagamento empresa={e} />
        <HistoricoPagamentos userId={e.user_id} />
      </div>
    </>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="break-words">{valor}</dd></div>;
}

function useAtualizar() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["admin"] })]);
}

function FormAssinatura({ empresa: e }: { empresa: Empresa }) {
  const atualizar = useAtualizar();
  const { data: planos = [] } = useQuery(planosQ);
  const inicial = () => ({
    acesso: e.acesso,
    plano_id: e.plano_id ?? planos[0]?.id ?? "",
    ciclo: e.ciclo,
    situacao: e.situacao_cadastrada ?? "teste",
    teste_ate: e.teste_ate ?? "",
    pago_ate: e.pago_ate ?? "",
    valor: e.valor == null ? "" : String(e.valor),
    observacao: e.observacao ?? "",
  });
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setF(inicial()); }, [e, planos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const plano = planos.find((p) => p.id === f.plano_id);
  const precoPlano = plano ? (f.ciclo === "anual" ? plano.preco_anual : plano.preco_mensal) : null;

  async function salvar(acesso = f.acesso) {
    if (acesso === "bloqueado" && e.acesso !== "bloqueado" && !confirm(`Bloquear o acesso da ${e.nome}? O sistema e o catálogo dela ficam fora do ar até você liberar.`)) return;
    setSalvando(true);
    const valor = f.valor.trim().replace(",", ".");
    const { error } = await supabase.rpc("admin_salvar_empresa", {
      p_user_id: e.user_id,
      p: { ...f, acesso, valor: valor === "" ? null : Number(valor), teste_ate: f.teste_ate || null, pago_ate: f.pago_ate || null },
    });
    setSalvando(false);
    if (error) return void toast.error(erroAmigavel(error));
    await atualizar();
    toast.success(acesso !== e.acesso ? (acesso === "ativo" ? "Acesso liberado." : acesso === "bloqueado" ? "Acesso bloqueado." : "Situação atualizada.") : "Assinatura salva.");
  }

  return (
    <Cartao className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Assinatura e acesso</h3>
        <div className="flex gap-2">
          {e.acesso !== "ativo" && <Button type="button" size="sm" disabled={salvando} onClick={() => void salvar("ativo")}><Unlock className="size-4" /> Liberar acesso</Button>}
          {e.acesso !== "bloqueado" && <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={salvando} onClick={() => void salvar("bloqueado")}><Lock className="size-4" /> Bloquear</Button>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Plano">
          <Selecao value={f.plano_id} onChange={(ev) => setF({ ...f, plano_id: ev.target.value })}>
            {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.ativo ? "" : " (inativo)"}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Cobrança">
          <Selecao value={f.ciclo} onChange={(ev) => setF({ ...f, ciclo: ev.target.value === "anual" ? "anual" : "mensal" })}>
            <option value="mensal">Mensal</option><option value="anual">Anual</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Situação">
          <Selecao value={f.situacao} onChange={(ev) => setF({ ...f, situacao: ev.target.value as typeof f.situacao })}>
            <option value="teste">Teste grátis</option><option value="ativa">Ativa (pagante)</option><option value="cortesia">Cortesia (sem cobrança)</option><option value="cancelada">Cancelada</option>
          </Selecao>
        </Campo>
        {f.situacao === "teste" && <Campo rotulo="Teste grátis até"><Input type="date" value={f.teste_ate} onChange={(ev) => setF({ ...f, teste_ate: ev.target.value })} className="h-10" /></Campo>}
        {(f.situacao === "ativa" || f.pago_ate) && <Campo rotulo="Pago até"><Input type="date" value={f.pago_ate} onChange={(ev) => setF({ ...f, pago_ate: ev.target.value })} className="h-10" /></Campo>}
        <Campo rotulo={`Valor combinado (${f.ciclo === "anual" ? "ano" : "mês"})`} dica={`Vazio = preço do plano (${brl(precoPlano)})`}>
          <Input inputMode="decimal" value={f.valor} onChange={(ev) => setF({ ...f, valor: ev.target.value })} placeholder={precoPlano == null ? "" : String(precoPlano)} className="h-10" />
        </Campo>
      </div>
      <Campo rotulo="Anotações (só a administração vê)">
        <Textarea rows={2} maxLength={500} value={f.observacao} onChange={(ev) => setF({ ...f, observacao: ev.target.value })} placeholder="Ex.: paga todo dia 10 por Pix; indicação da Ana" />
      </Campo>
      <Button type="button" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar assinatura"}</Button>
    </Cartao>
  );
}

function RegistrarPagamento({ empresa: e }: { empresa: Empresa }) {
  const atualizar = useAtualizar();
  const [f, setF] = useState(() => ({ valor: e.valor_efetivo == null ? "" : String(e.valor_efetivo), pago_em: hoje(), meses: e.ciclo === "anual" ? "12" : "1", forma: "Pix", observacao: "" }));
  const [salvando, setSalvando] = useState(false);
  const meses = Math.max(1, Math.min(36, Math.round(Number(f.meses) || 1)));
  const previsao = f.pago_em ? previsaoPagoAte(e, f.pago_em, meses) : null;
  if (e.situacao_cadastrada === "cortesia") return null;

  async function registrar() {
    const valor = Number(f.valor.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) return void toast.error("Informe o valor recebido.");
    setSalvando(true);
    const { data: novo, error } = await supabase.rpc("admin_registrar_pagamento", {
      p_user_id: e.user_id, p_valor: valor, p_pago_em: f.pago_em, p_meses: meses, p_forma: f.forma || null, p_observacao: f.observacao || null,
    });
    setSalvando(false);
    if (error) return void toast.error(erroAmigavel(error));
    await atualizar();
    setF({ ...f, observacao: "" });
    toast.success(`Pagamento registrado. Pago até ${data(String(novo))}.`);
  }

  return (
    <Cartao className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><Wallet className="size-4" /> Registrar pagamento recebido</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo rotulo="Valor (R$)"><Input inputMode="decimal" value={f.valor} onChange={(ev) => setF({ ...f, valor: ev.target.value })} className="h-10" /></Campo>
        <Campo rotulo="Data"><Input type="date" value={f.pago_em} max={hoje()} onChange={(ev) => setF({ ...f, pago_em: ev.target.value })} className="h-10" /></Campo>
        <Campo rotulo="Meses pagos"><Input inputMode="numeric" value={f.meses} onChange={(ev) => setF({ ...f, meses: ev.target.value })} className="h-10" /></Campo>
        <Campo rotulo="Forma">
          <Selecao value={f.forma} onChange={(ev) => setF({ ...f, forma: ev.target.value })}>
            {["Pix", "Dinheiro", "Cartão", "Transferência", "Boleto"].map((x) => <option key={x}>{x}</option>)}
          </Selecao>
        </Campo>
      </div>
      <Input value={f.observacao} maxLength={300} onChange={(ev) => setF({ ...f, observacao: ev.target.value })} placeholder="Observação (opcional)" className="h-10" />
      {previsao && <p className="text-sm text-muted-foreground">A assinatura ficará paga até <b className="text-foreground">{data(previsao)}</b>.</p>}
      <Button type="button" disabled={salvando} onClick={() => void registrar()}>{salvando ? "Registrando…" : "Registrar pagamento"}</Button>
    </Cartao>
  );
}

function HistoricoPagamentos({ userId }: { userId: string }) {
  const { data: pagamentos = [], isLoading } = useQuery(pagamentosQ(userId));
  if (isLoading) return null;
  return (
    <div>
      <h3 className="mb-2 font-semibold">Pagamentos</h3>
      {pagamentos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : (
        <ul className="divide-y rounded-xl border text-sm">
          {pagamentos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>{data(p.pago_em)} · {p.forma ?? "—"} · {p.meses} {p.meses === 1 ? "mês" : "meses"}{p.observacao ? ` · ${p.observacao}` : ""}</span>
              <span className="shrink-0 text-right"><b className="tabular-nums">{brl(p.valor)}</b><span className="block text-xs text-muted-foreground">até {data(p.pago_ate_novo)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
