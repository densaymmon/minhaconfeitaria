import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BellRing, Copy, ExternalLink, Package, QrCode, Share2, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, parseNum } from "@/lib/format";
import { SLUGS_RESERVADOS, linkCatalogo as montarLinkCatalogo, origemPublica, slugValido, sugerirSlug } from "@/lib/catalogo";
import { Card, Field, PageHeader } from "@/components/app/ui";
import { RecursoBloqueado, useRecurso } from "@/components/app/plano";
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
  const { user } = Route.useRouteContext();
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
  }));
  const [mostrarQr, setMostrarQr] = useState(false);
  const [salvando, setSalvando] = useState(false);

  if (!confeitaria) return <><PageHeader title="Catálogo online" back="/mais" /><Card className="text-sm text-muted-foreground">O catálogo fica disponível depois da atualização do banco de dados.</Card></>;
  if (!temPlano) return <><PageHeader title="Catálogo online" back="/mais" /><RecursoBloqueado recurso="catalogo" /></>;

  const salvo = confeitaria.catalogo_ativo && confeitaria.slug ? montarLinkCatalogo(origemPublica(), confeitaria.slug) : "";
  const link = slugValido(cat.slug) ? montarLinkCatalogo(origemPublica(), cat.slug) : "";
  const slugReservado = SLUGS_RESERVADOS.includes(cat.slug);
  const noCatalogo = produtos.filter((p) => p.no_catalogo && p.ativo && Number(p.preco_venda) > 0).length;
  const alterado =
    cat.ativo !== confeitaria.catalogo_ativo || cat.slug !== (confeitaria.slug ?? "") || cat.aviso !== (confeitaria.catalogo_aviso ?? "") ||
    cat.retirada !== confeitaria.aceita_retirada || cat.entrega !== confeitaria.aceita_entrega || parseNum(cat.taxa) !== Number(confeitaria.taxa_entrega) ||
    parseNum(cat.minimo) !== Number(confeitaria.pedido_minimo) || cat.enderecoRetirada !== (confeitaria.endereco_retirada ?? "") ||
    cat.limite !== (confeitaria.limite_pedidos_dia == null ? "" : String(confeitaria.limite_pedidos_dia));

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
    setSalvando(true);
    const { error } = await supabase.from("confeitarias").update({
      slug: cat.slug || null, catalogo_ativo: cat.ativo, catalogo_aviso: cat.aviso.trim().slice(0, 300) || null,
      aceita_retirada: cat.retirada, aceita_entrega: cat.entrega, taxa_entrega: taxa, pedido_minimo: minimo,
      endereco_retirada: cat.enderecoRetirada.trim().slice(0, 300) || null, limite_pedidos_dia: limite,
    }).eq("user_id", user.id);
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
          <Button className="h-12 w-full" disabled={salvando || !alterado}>{salvando ? "Salvando..." : alterado ? "Salvar catálogo" : "Tudo salvo"}</Button>
        </Card>
      </form>

      <Card className="mt-5 space-y-3">
        <div className="flex items-center gap-2"><BellRing className="size-4 text-primary" /><h2 className="font-semibold">Aviso de pedido novo</h2></div>
        <p className="text-sm text-muted-foreground">Quando chega um pedido pelo catálogo, o sistema toca um som e mostra um aviso. Com as notificações ligadas, o aviso aparece mesmo com a aba em segundo plano.</p>
        <Button type="button" variant="outline" className="h-10 w-full sm:w-auto" onClick={async () => {
          if (typeof Notification === "undefined") return void toast.error("Este navegador não aceita notificações.");
          const r = await Notification.requestPermission();
          toast[r === "granted" ? "success" : "error"](r === "granted" ? "Notificações ativadas neste aparelho enquanto o sistema estiver aberto." : "Notificações não permitidas neste aparelho.");
        }}>Ativar notificações neste aparelho</Button>
        <Button asChild variant="ghost" className="h-10 w-full sm:w-auto"><Link to="/produtos"><Package className="size-4" /> Produtos do catálogo</Link></Button>
      </Card>
    </>
  );
}
