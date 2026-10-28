import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarOff, Gift, Star, Wallet, Copy, ExternalLink, ImagePlus, MapPin, Package, Palette, Plus, QrCode, Share2, Sparkles, Store, Ticket, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, parseNum } from "@/lib/format";
import { DIAS_SEMANA, SLUGS_RESERVADOS, corDoTexto, linkCatalogo as montarLinkCatalogo, normalizarCupom, normalizarHorarios, origemPublica, slugValido, sugerirSlug, validarBairros, type TaxaBairro } from "@/lib/catalogo";
import { enviarLogo } from "@/lib/foto-catalogo";
import { dataBR, hojeISO } from "@/lib/format";
import { Card, Field, PageHeader } from "@/components/app/ui";
import { RecursoBloqueado, useRecurso } from "@/components/app/plano";
import { NotificacoesCard } from "@/components/app/notificacoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/catalogo")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.confeitariaQ),
      context.queryClient.ensureQueryData(appQueries.produtosQ),
      context.queryClient.ensureQueryData(appQueries.cuponsQ).catch(() => []),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar o catálogo."}</p>,
  head: () => ({ meta: [{ title: "Catálogo online — Doce Gestão" }, { name: "description", content: "Link, QR Code e configurações do catálogo on-line da confeitaria." }] }),
  component: CatalogoPage,
});

function CatalogoPage() {
  const temPlano = useRecurso("catalogo");
  const { data: confeitaria } = useSuspenseQuery(appQueries.confeitariaQ);
  const { data: produtos } = useSuspenseQuery(appQueries.produtosQ);
  const qc = useQueryClient();
  const [cat, setCat] = useState(() => ({
    ativo: confeitaria?.catalogo_ativo ?? false,
    slug: confeitaria?.slug ?? sugerirSlug(confeitaria?.nome ?? "").replace(/-/g, "").slice(0, 30),
    aviso: confeitaria?.catalogo_aviso ?? "",
    retirada: confeitaria?.aceita_retirada ?? true,
    entrega: confeitaria?.aceita_entrega ?? false,
    taxa: String(confeitaria?.taxa_entrega ?? 0),
    minimo: String(confeitaria?.pedido_minimo ?? 0),
    enderecoRetirada: confeitaria?.endereco_retirada ?? "",
    limite: confeitaria?.limite_pedidos_dia == null ? "" : String(confeitaria.limite_pedidos_dia),
    ...extrasDe(confeitaria),
    ...vendasDe(confeitaria),
  }));
  const [novaData, setNovaData] = useState("");
  const [novoHorario, setNovoHorario] = useState("");
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const arquivoLogo = useRef<HTMLInputElement>(null);
  const [mostrarQr, setMostrarQr] = useState(false);
  const [salvando, setSalvando] = useState(false);

  if (!confeitaria) return <><PageHeader title="Catálogo online" back="/mais" /><Card className="text-sm text-muted-foreground">O catálogo fica disponível depois da atualização do banco de dados.</Card></>;
  if (!temPlano) return <><PageHeader title="Catálogo online" back="/mais" /><RecursoBloqueado recurso="catalogo" /></>;

  // Id da confeitaria (o mesmo para toda a equipe).
  const donoId = confeitaria.user_id;
  const salvo = confeitaria.catalogo_ativo && confeitaria.slug ? montarLinkCatalogo(origemPublica(), confeitaria.slug) : "";
  const link = slugValido(cat.slug) ? montarLinkCatalogo(origemPublica(), cat.slug) : "";
  const slugReservado = SLUGS_RESERVADOS.includes(cat.slug);
  const noCatalogo = produtos.filter((p) => p.no_catalogo && p.ativo && Number(p.preco_venda) > 0).length;
  const alterado =
    cat.ativo !== confeitaria.catalogo_ativo || cat.slug !== (confeitaria.slug ?? "") || cat.aviso !== (confeitaria.catalogo_aviso ?? "") ||
    cat.retirada !== confeitaria.aceita_retirada || cat.entrega !== confeitaria.aceita_entrega || parseNum(cat.taxa) !== Number(confeitaria.taxa_entrega) ||
    parseNum(cat.minimo) !== Number(confeitaria.pedido_minimo) || cat.enderecoRetirada !== (confeitaria.endereco_retirada ?? "") ||
    cat.limite !== (confeitaria.limite_pedidos_dia == null ? "" : String(confeitaria.limite_pedidos_dia)) ||
    JSON.stringify(extrasDe(confeitaria)) !== JSON.stringify(extrasDe(null, cat)) ||
    JSON.stringify(vendasDe(confeitaria)) !== JSON.stringify(vendasDe(null, cat));

  async function copiar() {
    if (!salvo) return;
    try { await navigator.clipboard.writeText(salvo); toast.success("Link copiado."); } catch { toast.error("Não foi possível copiar."); }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const taxa = parseNum(cat.taxa), minimo = parseNum(cat.minimo), limite = cat.limite.trim() ? Math.round(parseNum(cat.limite)) : null;
    if (cat.slug && !slugValido(cat.slug)) return void toast.error(slugReservado ? "Este endereço é usado por uma página do sistema. Escolha outro." : "O endereço deve ter de 3 a 60 letras minúsculas, números ou hífens.");
    if (cat.ativo && !cat.slug) return void toast.error("Defina o endereço do catálogo antes de ativá-lo.");
    if (cat.ativo && !cat.retirada && !cat.entrega) return void toast.error("Ative retirada, entrega ou as duas.");
    if (taxa < 0 || taxa > 1000 || minimo < 0 || minimo > 100000) return void toast.error("Confira a taxa de entrega e o pedido mínimo.");
    if (limite !== null && (limite < 1 || limite > 500)) return void toast.error("O limite de pedidos por dia deve ser de 1 a 500, ou ficar em branco.");
    const bairros: TaxaBairro[] = cat.bairros.map((b) => ({ bairro: b.bairro.trim(), taxa: parseNum(b.taxa) }));
    const erroBairros = cat.entrega ? validarBairros(bairros) : null;
    if (erroBairros) return void toast.error(erroBairros);
    if (cat.dias.length === 7) return void toast.error("Deixe pelo menos um dia da semana aberto.");
    const sinalPct = parseNum(cat.sinalPct), sinalMin = parseNum(cat.sinalMin), fidA = Math.round(parseNum(cat.fidA)), fidValor = parseNum(cat.fidValor);
    if (sinalPct < 0 || sinalPct > 100) return void toast.error("O sinal deve ser de 0% a 100%.");
    if (cat.fidAtiva && (fidA < 2 || fidA > 50)) return void toast.error("A fidelidade deve premiar a cada 2 a 50 pedidos.");
    if (cat.fidAtiva && (!(fidValor > 0) || (cat.fidTipo === "percentual" && fidValor > 100))) return void toast.error("Informe o desconto da fidelidade.");
    setSalvando(true);
    const { error } = await supabase.from("confeitarias").update({
      slug: cat.slug || null, catalogo_ativo: cat.ativo, catalogo_aviso: cat.aviso.trim().slice(0, 300) || null,
      aceita_retirada: cat.retirada, aceita_entrega: cat.entrega, taxa_entrega: taxa, pedido_minimo: minimo,
      endereco_retirada: cat.enderecoRetirada.trim().slice(0, 300) || null, limite_pedidos_dia: limite,
      cor_primaria: cat.cor || null, logo_url: cat.logo || null, dias_fechados: cat.dias, datas_bloqueadas: cat.datas,
      horarios_retirada: cat.horarios, taxas_bairro: bairros, aceita_encomenda: cat.encomenda,
      sinal_percentual: sinalPct, sinal_a_partir_de: Math.max(0, sinalMin),
      fidelidade_a_cada: cat.fidAtiva ? fidA : 0, fidelidade_tipo: cat.fidTipo, fidelidade_valor: cat.fidAtiva ? fidValor : 0,
    }).eq("user_id", donoId);
    setSalvando(false);
    if (error) return void toast.error(error.code === "23505" ? "Este endereço de catálogo já está em uso. Escolha outro." : `Não foi possível salvar: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["confeitaria"] });
    toast.success(cat.ativo ? "Catálogo salvo e no ar!" : "Catálogo salvo.");
  }

  return (
    <>
      <PageHeader title="Catálogo online" subtitle="A página onde seus clientes escolhem, fazem o pedido e pagam por Pix." back="/mais" />

      <Card className={cn("mb-5 space-y-3", salvo && "ring-1 ring-success/30")}>
        <div className="flex items-center gap-3">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", salvo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}><Store className="size-5" /></span>
          <div className="min-w-0">
            <h2 className="font-semibold">{salvo ? "Seu catálogo está no ar" : "Seu catálogo está desligado"}</h2>
            <p className="text-xs text-muted-foreground">{noCatalogo} produto(s) aparecendo · <Link to="/produtos" className="text-primary hover:underline">escolher produtos</Link></p>
          </div>
        </div>
        {salvo ? (
          <>
            <p className="break-all rounded-xl bg-muted/60 p-3 text-sm font-medium">{salvo}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button asChild className="h-11"><a href={salvo} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir</a></Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => void copiar()}><Copy className="size-4" /> Copiar</Button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <Button type="button" variant="outline" className="h-11" onClick={() => void navigator.share({ title: confeitaria.nome, text: `Faça seu pedido na ${confeitaria.nome}:`, url: salvo }).catch(() => undefined)}><Share2 className="size-4" /> Compartilhar</Button>
              )}
              <Button type="button" variant="outline" className="h-11" onClick={() => setMostrarQr((v) => !v)} aria-expanded={mostrarQr}><QrCode className="size-4" /> QR Code</Button>
            </div>
            {mostrarQr && (
              <div className="pt-2 text-center">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=12&data=${encodeURIComponent(salvo)}`} alt={`QR Code do catálogo: ${salvo}`} width={240} height={240} className="mx-auto rounded-lg bg-white" />
                <p className="mt-2 text-xs text-muted-foreground">Imprima ou poste o QR Code: ao apontar a câmera, o cliente abre o catálogo. Para salvar, toque e segure a imagem.</p>
              </div>
            )}
            {noCatalogo === 0 && <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">Nenhum produto aparece no catálogo ainda. Em Produtos, abra um produto e ligue "Catálogo online".</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Escolha o endereço abaixo, ligue o catálogo e salve. Depois é só compartilhar o link ou o QR Code.</p>
        )}
      </Card>

      <form onSubmit={salvar} className="space-y-5">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Configurações</h2>
            <label className="flex items-center gap-2 text-sm font-medium">No ar<Switch checked={cat.ativo} onCheckedChange={(v) => setCat({ ...cat, ativo: v })} aria-label="Ativar catálogo online" /></label>
          </div>
          <Field label="Endereço do catálogo" hint={slugReservado ? "Este nome é usado por uma página do sistema. Escolha outro." : "Curto e fácil de digitar, ex.: casaldobolo. Só letras minúsculas, números e hífens."}>
            <div className="flex items-center rounded-md border bg-card pl-3 text-sm text-muted-foreground">
              <span className="shrink-0">/</span>
              <Input value={cat.slug} maxLength={60} onChange={(e) => setCat({ ...cat, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} className="h-11 border-0 bg-transparent pl-1 shadow-none focus-visible:ring-0" />
            </div>
          </Field>
          {link && link !== salvo && <p className="break-all text-xs text-muted-foreground">Novo link depois de salvar: {link}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Retirada na confeitaria<Switch checked={cat.retirada} onCheckedChange={(v) => setCat({ ...cat, retirada: v })} /></label>
            <label className="flex items-center justify-between rounded-xl border p-3 text-sm font-medium">Entrega<Switch checked={cat.entrega} onCheckedChange={(v) => setCat({ ...cat, entrega: v })} /></label>
          </div>
          {cat.retirada && <Field label="Endereço de retirada (opcional)"><Input maxLength={300} value={cat.enderecoRetirada} onChange={(e) => setCat({ ...cat, enderecoRetirada: e.target.value })} className="h-11 bg-card" /></Field>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {cat.entrega && <Field label="Taxa de entrega (R$)"><Input inputMode="decimal" value={cat.taxa} onChange={(e) => setCat({ ...cat, taxa: e.target.value })} className="h-11 bg-card" /></Field>}
            <Field label="Pedido mínimo (R$)" hint={parseNum(cat.minimo) > 0 ? `Abaixo de ${brl(parseNum(cat.minimo))} o pedido não é enviado.` : "0 = sem mínimo."}><Input inputMode="decimal" value={cat.minimo} onChange={(e) => setCat({ ...cat, minimo: e.target.value })} className="h-11 bg-card" /></Field>
            <Field label="Limite de pedidos por dia" hint="Em branco = sem limite."><Input inputMode="numeric" value={cat.limite} onChange={(e) => setCat({ ...cat, limite: e.target.value })} className="h-11 bg-card" /></Field>
          </div>
          <Field label="Aviso no topo do catálogo (opcional)"><Textarea rows={2} maxLength={300} value={cat.aviso} onChange={(e) => setCat({ ...cat, aviso: e.target.value })} placeholder="Ex.: Encomendas até quinta para entrega no fim de semana." /></Field>
          <p className="text-xs text-muted-foreground">O cliente paga pela chave Pix cadastrada em <Link to="/configuracoes" className="text-primary hover:underline">Configurações</Link>.</p>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2"><Palette className="size-4 text-primary" /><h2 className="text-lg font-semibold">Aparência</h2></div>
          <div className="flex items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-muted">
              {cat.logo ? <img src={cat.logo} alt="Logo da confeitaria" className="size-full object-cover" /> : <Store className="size-7 text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={arquivoLogo} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (!arquivo) return;
                setEnviandoLogo(true);
                try { setCat((c) => ({ ...c, logo: "" })); const url = await enviarLogo(donoId, arquivo); setCat((c) => ({ ...c, logo: url })); toast.success("Logo pronto. Salve para publicar."); }
                catch (erro) { toast.error(erro instanceof Error ? erro.message : "Não foi possível enviar o logo."); }
                finally { setEnviandoLogo(false); }
              }} />
              <Button type="button" variant="outline" className="h-10" disabled={enviandoLogo} onClick={() => arquivoLogo.current?.click()}><ImagePlus className="size-4" /> {enviandoLogo ? "Enviando..." : cat.logo ? "Trocar logo" : "Enviar logo"}</Button>
              {cat.logo && <Button type="button" variant="ghost" className="h-10" onClick={() => setCat({ ...cat, logo: "" })}>Remover</Button>}
            </div>
          </div>
          <Field label="Cor da sua marca" hint="Usada nos botões e destaques do catálogo.">
            <div className="flex flex-wrap items-center gap-2">
              {CORES_SUGERIDAS.map((c) => (
                <button key={c} type="button" onClick={() => setCat({ ...cat, cor: c })} aria-label={`Usar a cor ${c}`} aria-pressed={cat.cor === c}
                  className={cn("size-9 rounded-full border-2 transition", cat.cor === c ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: c }} />
              ))}
              <label className="relative grid size-9 cursor-pointer place-items-center rounded-full border text-xs text-muted-foreground" title="Outra cor">
                <Plus className="size-4" />
                <input type="color" value={cat.cor || "#b5476b"} onChange={(e) => setCat({ ...cat, cor: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher outra cor" />
              </label>
              {cat.cor && <Button type="button" variant="ghost" size="sm" onClick={() => setCat({ ...cat, cor: "" })}>Cor padrão</Button>}
            </div>
          </Field>
          {cat.cor && (
            <div className="rounded-xl p-3 text-center text-sm font-semibold" style={{ backgroundColor: cat.cor, color: corDoTexto(cat.cor) }}>Prévia do botão: Fazer pedido</div>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2"><CalendarOff className="size-4 text-primary" /><h2 className="text-lg font-semibold">Agenda</h2></div>
          <Field label="Dias em que você NÃO atende" hint="O cliente não consegue escolher esses dias no catálogo.">
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((nome, i) => {
                const fechado = cat.dias.includes(i);
                return (
                  <button key={nome} type="button" aria-pressed={fechado} onClick={() => setCat({ ...cat, dias: fechado ? cat.dias.filter((d) => d !== i) : [...cat.dias, i].sort() })}
                    className={cn("h-10 rounded-full border px-3 text-sm font-medium transition", fechado ? "border-destructive/40 bg-destructive/10 text-destructive line-through" : "bg-card")}>{nome.slice(0, 3)}</button>
                );
              })}
            </div>
          </Field>
          <Field label="Datas bloqueadas" hint="Feriados, férias ou agenda cheia.">
            <div className="flex gap-2">
              <Input type="date" min={hojeISO()} value={novaData} onChange={(e) => setNovaData(e.target.value)} className="h-11 bg-card" />
              <Button type="button" variant="outline" className="h-11" disabled={!novaData || cat.datas.includes(novaData)} onClick={() => { setCat({ ...cat, datas: [...cat.datas, novaData].sort().slice(-200) }); setNovaData(""); }}>Bloquear</Button>
            </div>
            {cat.datas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {cat.datas.map((d) => <Chip key={d} texto={dataBR(d)} onRemover={() => setCat({ ...cat, datas: cat.datas.filter((x) => x !== d) })} />)}
              </div>
            )}
          </Field>
          {cat.retirada && (
            <Field label="Horários de retirada" hint={cat.horarios.length ? "O cliente escolhe um destes horários." : "Sem horários cadastrados, o cliente digita o horário que quiser."}>
              <div className="flex gap-2">
                <Input type="time" value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} className="h-11 bg-card" />
                <Button type="button" variant="outline" className="h-11" disabled={!novoHorario} onClick={() => {
                  const lista = normalizarHorarios([...cat.horarios, novoHorario.slice(0, 5)]);
                  if (!lista) return void toast.error("Horário inválido.");
                  setCat({ ...cat, horarios: lista }); setNovoHorario("");
                }}>Adicionar</Button>
              </div>
              {cat.horarios.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cat.horarios.map((h) => <Chip key={h} texto={h} onRemover={() => setCat({ ...cat, horarios: cat.horarios.filter((x) => x !== h) })} />)}
                </div>
              )}
            </Field>
          )}
        </Card>

        {cat.entrega && (
          <Card className="space-y-3">
            <div className="flex items-center gap-2"><MapPin className="size-4 text-primary" /><h2 className="text-lg font-semibold">Taxa de entrega por bairro</h2></div>
            <p className="text-sm text-muted-foreground">{cat.bairros.length ? "O cliente escolhe o bairro e a taxa entra no pedido. Bairros fora da lista não recebem entrega." : `Sem bairros cadastrados, vale a taxa única de ${brl(parseNum(cat.taxa))} para qualquer endereço.`}</p>
            {cat.bairros.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={b.bairro} maxLength={60} placeholder="Bairro" aria-label="Bairro" onChange={(e) => setCat({ ...cat, bairros: cat.bairros.map((x, j) => (j === i ? { ...x, bairro: e.target.value } : x)) })} className="h-11 flex-1 bg-card" />
                <Input value={b.taxa} inputMode="decimal" placeholder="Taxa" aria-label={`Taxa de ${b.bairro || "entrega"}`} onChange={(e) => setCat({ ...cat, bairros: cat.bairros.map((x, j) => (j === i ? { ...x, taxa: e.target.value } : x)) })} className="h-11 w-24 bg-card" />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover ${b.bairro || "bairro"}`} onClick={() => setCat({ ...cat, bairros: cat.bairros.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" className="h-10" disabled={cat.bairros.length >= 100} onClick={() => setCat({ ...cat, bairros: [...cat.bairros, { bairro: "", taxa: cat.taxa }] })}><Plus className="size-4" /> Adicionar bairro</Button>
          </Card>
        )}

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2 className="text-lg font-semibold">Encomenda personalizada</h2></div>
            <Switch checked={cat.encomenda} onCheckedChange={(v) => setCat({ ...cat, encomenda: v })} aria-label="Aceitar encomendas personalizadas" />
          </div>
          <p className="text-sm text-muted-foreground">O cliente descreve o que quer (tema, tamanho, sabor) e envia até 3 fotos de referência. Chega como pedido "aguardando orçamento" para você combinar o valor.</p>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Wallet className="size-4 text-primary" /><h2 className="text-lg font-semibold">Sinal para confirmar</h2></div>
          <p className="text-sm text-muted-foreground">O cliente vê quanto pagar de sinal por Pix para confirmar o pedido; o restante fica para a entrega. 0% = sem sinal.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sinal (%)"><Input inputMode="decimal" value={cat.sinalPct} onChange={(e) => setCat({ ...cat, sinalPct: e.target.value })} className="h-11 bg-card" /></Field>
            <Field label="Em pedidos a partir de (R$)" hint="0 = todos os pedidos."><Input inputMode="decimal" value={cat.sinalMin} onChange={(e) => setCat({ ...cat, sinalMin: e.target.value })} className="h-11 bg-card" /></Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Gift className="size-4 text-primary" /><h2 className="text-lg font-semibold">Programa de fidelidade</h2></div>
            <Switch checked={cat.fidAtiva} onCheckedChange={(v) => setCat({ ...cat, fidAtiva: v })} aria-label="Ativar fidelidade" />
          </div>
          <p className="text-sm text-muted-foreground">A cada N pedidos do mesmo WhatsApp, o pedido seguinte pelo catálogo ganha desconto automático (não soma com cupom).</p>
          {cat.fidAtiva && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="A cada (pedidos)"><Input inputMode="numeric" value={cat.fidA} onChange={(e) => setCat({ ...cat, fidA: e.target.value })} className="h-11 bg-card" /></Field>
              <Field label="Tipo">
                <div className="grid h-11 grid-cols-2 rounded-md border bg-card p-1 text-sm">
                  {(["percentual", "valor"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setCat({ ...cat, fidTipo: t })} aria-pressed={cat.fidTipo === t} className={cn("rounded font-medium", cat.fidTipo === t && "bg-primary text-primary-foreground")}>{t === "percentual" ? "%" : "R$"}</button>
                  ))}
                </div>
              </Field>
              <Field label="Desconto"><Input inputMode="decimal" value={cat.fidValor} onChange={(e) => setCat({ ...cat, fidValor: e.target.value })} className="h-11 bg-card" /></Field>
            </div>
          )}
        </Card>

        <Button className="h-12 w-full" disabled={salvando || enviandoLogo || !alterado}>{salvando ? "Salvando..." : alterado ? "Salvar catálogo" : "Tudo salvo"}</Button>
      </form>

      <CuponsCard />
      <AvaliacoesCard />

      <NotificacoesCard />
      <div className="mt-3"><Button asChild variant="ghost" className="h-10 w-full sm:w-auto"><Link to="/produtos"><Package className="size-4" /> Produtos do catálogo</Link></Button></div>
    </>
  );
}

const CORES_SUGERIDAS = ["#b5476b", "#7a2e3b", "#d9822b", "#2f7d6d", "#4f5bd5", "#6b4226", "#1f1a17"];

type BairroEdicao = { bairro: string; taxa: string };

/** Campos de agenda, aparência, bairros e encomenda: do banco ou do formulário (para comparar). */
function extrasDe(
  c: appQueries.Confeitaria | null | undefined,
  form?: { cor: string; logo: string; dias: number[]; datas: string[]; horarios: string[]; bairros: BairroEdicao[]; encomenda: boolean },
) {
  if (form) {
    return {
      cor: form.cor, logo: form.logo, dias: [...form.dias].sort(), datas: form.datas, horarios: form.horarios,
      bairros: form.bairros.map((b) => ({ bairro: b.bairro, taxa: String(parseNum(b.taxa)) })), encomenda: form.encomenda,
    };
  }
  const bairros = Array.isArray(c?.taxas_bairro) ? (c.taxas_bairro as { bairro?: unknown; taxa?: unknown }[]) : [];
  return {
    cor: c?.cor_primaria ?? "",
    logo: c?.logo_url ?? "",
    dias: [...(c?.dias_fechados ?? [])].sort(),
    datas: (c?.datas_bloqueadas ?? []).filter((d) => d >= hojeISO()).sort(),
    horarios: c?.horarios_retirada ?? [],
    bairros: bairros.map((b) => ({ bairro: String(b.bairro ?? ""), taxa: String(Number(b.taxa ?? 0)) })),
    encomenda: c?.aceita_encomenda ?? false,
  };
}

function Chip({ texto, onRemover }: { texto: string; onRemover: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
      {texto}
      <button type="button" onClick={onRemover} aria-label={`Remover ${texto}`} className="grid size-6 place-items-center rounded-full hover:bg-background"><X className="size-3.5" /></button>
    </span>
  );
}

const CUPOM_VAZIO = { codigo: "", descricao: "", tipo: "percentual" as "percentual" | "valor", valor: "", minimo: "", validade: "", limite: "", primeira: false };

function CuponsCard() {
  const qc = useQueryClient();
  const { data: cupons = [] } = useQuery(appQueries.cuponsQ);
  const [novo, setNovo] = useState(CUPOM_VAZIO);
  const [abrir, setAbrir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeISO();

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const codigo = normalizarCupom(novo.codigo);
    const valor = parseNum(novo.valor), minimo = parseNum(novo.minimo), limite = novo.limite.trim() ? Math.round(parseNum(novo.limite)) : null;
    if (codigo.length < 3) return void toast.error("O código precisa de 3 a 20 letras ou números.");
    if (!(valor > 0) || (novo.tipo === "percentual" && valor > 100) || valor > 10000) return void toast.error(novo.tipo === "percentual" ? "O desconto deve ser de 1% a 100%." : "Informe o valor do desconto.");
    if (limite !== null && (limite < 1 || limite > 100000)) return void toast.error("O limite de usos deve ser 1 ou mais, ou ficar em branco.");
    setSalvando(true);
    const { error } = await supabase.from("cupons").insert({
      codigo, descricao: novo.descricao.trim().slice(0, 120) || null, tipo: novo.tipo, valor, pedido_minimo: Math.max(0, minimo),
      valido_ate: novo.validade || null, limite_usos: limite, primeira_compra: novo.primeira,
    });
    setSalvando(false);
    if (error) return void toast.error(error.code === "23505" ? "Já existe um cupom com este código." : `Não foi possível criar: ${error.message}`);
    setNovo(CUPOM_VAZIO); setAbrir(false);
    await qc.invalidateQueries({ queryKey: ["cupons"] });
    toast.success(`Cupom ${codigo} criado.`);
  }

  async function alternar(id: string, ativo: boolean) {
    const { error } = await supabase.from("cupons").update({ ativo }).eq("id", id);
    if (error) return void toast.error(`Não foi possível alterar: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["cupons"] });
  }

  async function excluir(id: string, codigo: string) {
    if (!window.confirm(`Excluir o cupom ${codigo}? Pedidos que já usaram continuam com o desconto.`)) return;
    const { error } = await supabase.from("cupons").delete().eq("id", id);
    if (error) return void toast.error(`Não foi possível excluir: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["cupons"] });
  }

  return (
    <Card className="mt-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Ticket className="size-4 text-primary" /><h2 className="text-lg font-semibold">Cupons de desconto</h2></div>
        {!abrir && <Button type="button" variant="outline" size="sm" onClick={() => setAbrir(true)}><Plus className="size-4" /> Novo cupom</Button>}
      </div>
      <p className="text-sm text-muted-foreground">O cliente digita o código no carrinho. O desconto vale sobre os produtos (sem a taxa de entrega).</p>

      {abrir && (
        <form onSubmit={criar} className="space-y-3 rounded-xl border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Código"><Input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: normalizarCupom(e.target.value) })} placeholder="Ex.: BEMVINDO10" className="h-11 bg-card font-mono uppercase" autoFocus /></Field>
            <Field label="Descrição (opcional)"><Input value={novo.descricao} maxLength={120} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="Ex.: Primeira compra" className="h-11 bg-card" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Tipo">
              <div className="grid h-11 grid-cols-2 rounded-md border bg-card p-1 text-sm">
                {(["percentual", "valor"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setNovo({ ...novo, tipo: t })} aria-pressed={novo.tipo === t} className={cn("rounded font-medium", novo.tipo === t && "bg-primary text-primary-foreground")}>{t === "percentual" ? "%" : "R$"}</button>
                ))}
              </div>
            </Field>
            <Field label={novo.tipo === "percentual" ? "Desconto (%)" : "Desconto (R$)"}><Input inputMode="decimal" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} className="h-11 bg-card" /></Field>
            <Field label="Pedido mínimo (R$)"><Input inputMode="decimal" value={novo.minimo} onChange={(e) => setNovo({ ...novo, minimo: e.target.value })} placeholder="0" className="h-11 bg-card" /></Field>
            <Field label="Limite de usos"><Input inputMode="numeric" value={novo.limite} onChange={(e) => setNovo({ ...novo, limite: e.target.value })} placeholder="Sem limite" className="h-11 bg-card" /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Válido até (opcional)"><Input type="date" min={hoje} value={novo.validade} onChange={(e) => setNovo({ ...novo, validade: e.target.value })} className="h-11 bg-card" /></Field>
            <label className="flex items-center justify-between gap-2 self-end rounded-xl border p-3 text-sm font-medium">Só na primeira compra<Switch checked={novo.primeira} onCheckedChange={(v) => setNovo({ ...novo, primeira: v })} /></label>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="h-11 flex-1" onClick={() => { setAbrir(false); setNovo(CUPOM_VAZIO); }}>Cancelar</Button>
            <Button className="h-11 flex-1" disabled={salvando}>{salvando ? "Criando..." : "Criar cupom"}</Button>
          </div>
        </form>
      )}

      {cupons.length === 0 && !abrir ? <p className="text-sm text-muted-foreground">Nenhum cupom criado.</p> : (
        <ul className="divide-y">
          {cupons.map((c) => {
            const vencido = !!c.valido_ate && c.valido_ate < hoje;
            const esgotado = c.limite_usos != null && c.usos >= c.limite_usos;
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{c.codigo}</span>
                    <span className="text-sm">{c.tipo === "percentual" ? `${Number(c.valor)}% off` : `${brl(Number(c.valor))} off`}</span>
                    {(vencido || esgotado) && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{vencido ? "vencido" : "esgotado"}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[c.descricao, Number(c.pedido_minimo) > 0 && `mínimo ${brl(Number(c.pedido_minimo))}`, c.primeira_compra && "1ª compra",
                      c.valido_ate && `até ${dataBR(c.valido_ate)}`, `${c.usos}${c.limite_usos != null ? `/${c.limite_usos}` : ""} uso(s)`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Switch checked={c.ativo} onCheckedChange={(v) => void alternar(c.id, v)} aria-label={`Cupom ${c.codigo} ativo`} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Excluir cupom ${c.codigo}`} onClick={() => void excluir(c.id, c.codigo)}><Trash2 className="size-4" /></Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Sinal e fidelidade: do banco ou do formulário (para comparar). */
function vendasDe(
  c: appQueries.Confeitaria | null | undefined,
  form?: { sinalPct: string; sinalMin: string; fidAtiva: boolean; fidA: string; fidTipo: "percentual" | "valor"; fidValor: string },
) {
  if (form) {
    return {
      sinalPct: String(parseNum(form.sinalPct)), sinalMin: String(parseNum(form.sinalMin)), fidAtiva: form.fidAtiva,
      fidA: form.fidAtiva ? String(Math.round(parseNum(form.fidA))) : "0", fidTipo: form.fidTipo, fidValor: form.fidAtiva ? String(parseNum(form.fidValor)) : "0",
    };
  }
  const ativa = Number(c?.fidelidade_a_cada ?? 0) > 0;
  return {
    sinalPct: String(Number(c?.sinal_percentual ?? 0)), sinalMin: String(Number(c?.sinal_a_partir_de ?? 0)), fidAtiva: ativa,
    fidA: ativa ? String(c?.fidelidade_a_cada) : "0", fidTipo: (c?.fidelidade_tipo === "valor" ? "valor" : "percentual") as "percentual" | "valor",
    fidValor: ativa ? String(Number(c?.fidelidade_valor ?? 0)) : "0",
  };
}

function AvaliacoesCard() {
  const qc = useQueryClient();
  const { data: avaliacoes = [] } = useQuery({
    queryKey: ["avaliacoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("avaliacoes").select("id,nota,comentario,cliente_nome,publicada,created_at").order("created_at", { ascending: false }).limit(50);
      return error ? [] : (data ?? []);
    },
  });
  if (avaliacoes.length === 0) return null;
  const media = avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length;
  async function alternar(id: string, publicada: boolean) {
    const { error } = await supabase.from("avaliacoes").update({ publicada }).eq("id", id);
    if (error) return void toast.error(`Não foi possível alterar: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["avaliacoes"] });
  }
  return (
    <Card className="mt-5 space-y-3">
      <div className="flex items-center gap-2"><Star className="size-4 fill-current text-amber-500" /><h2 className="text-lg font-semibold">Avaliações dos clientes</h2></div>
      <p className="text-sm text-muted-foreground">Média {media.toFixed(1).replace(".", ",")} em {avaliacoes.length} avaliação(ões). As publicadas aparecem no catálogo; desligue para esconder.</p>
      <ul className="divide-y">
        {avaliacoes.map((a) => (
          <li key={a.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{a.cliente_nome ?? "Cliente"}</span>
                <span className="inline-flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={cn("size-3.5", i <= a.nota ? "fill-current text-amber-500" : "text-muted-foreground/40")} />)}</span>
                <span className="text-xs text-muted-foreground">{dataBR(a.created_at.slice(0, 10))}</span>
              </div>
              {a.comentario && <p className="mt-1 text-sm text-muted-foreground">{a.comentario}</p>}
            </div>
            <Switch checked={a.publicada} onCheckedChange={(v) => void alternar(a.id, v)} aria-label="Publicar no catálogo" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
