import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CakeSlice, Camera, Minus, MessageCircle, PlayCircle, Plus, ShoppingBag, Sparkles, Store, Ticket, Truck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/app/ui";
import { brl, dataBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  alterarQuantidade,
  chaveCarrinho,
  escolhaCompleta,
  precoComOpcoes,
  precoMinimo,
  type Escolha,
  capaDoProduto,
  midiasDoProduto,
  type ProdutoCatalogo,
  limparCarrinho,
  linkWhatsApp,
  mensagemErroCatalogo,
  miniaturaDaFoto,
  resumoCarrinho,
  telefoneValido,
  type Carrinho,
  type Catalogo,
  corDoTexto,
  motivoDataIndisponivel,
  normalizarCupom,
  proximaDataDisponivel,
  somarDias,
  taxaDeEntrega,
} from "@/lib/catalogo";
import { enviarFotoEncomenda } from "@/lib/foto-catalogo";

export const Route = createFileRoute("/c/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Catálogo — faça seu pedido" },
      { name: "description", content: "Veja os produtos, monte seu pedido e pague por Pix." },
      { property: "og:title", content: "Catálogo — faça seu pedido" },
      { property: "og:description", content: "Veja os produtos, monte seu pedido e pague por Pix." },
      { property: "og:type", content: "website" },
    ],
  }),
  // Começa a buscar os produtos junto com o carregamento da página.
  loader: ({ context, params }) => { void context.queryClient.prefetchQuery(catalogoQ(params.slug)); },
  component: CatalogoRota,
});

/** Consulta do catálogo público (compartilhada entre /c/<endereço> e /<endereço>). */
export const catalogoQ = (slug: string) => queryOptions({
  queryKey: ["catalogo-publico", slug],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("catalogo_publico", { p_slug: slug });
    if (error) throw new Error(error.message);
    return (data as unknown as Catalogo | null) ?? null;
  },
  staleTime: 60_000,
});

function CatalogoRota() {
  const { slug } = Route.useParams();
  return <CatalogoPage slug={slug} />;
}

function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}
function gravarLocal(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* navegação privada: o carrinho só vale nesta aba */
  }
}

/** Página do catálogo; usada em /<endereço> (link curto) e em /c/<endereço>. */
export function CatalogoPage({ slug }: { slug: string }) {
  const { data: catalogo, isLoading, isError, refetch } = useQuery(catalogoQ(slug));

  useEffect(() => {
    if (catalogo?.nome) document.title = `${catalogo.nome} — faça seu pedido`;
  }, [catalogo?.nome]);

  if (isLoading) return <EsqueletoCatalogo />;
  if (isError) {
    return (
      <Tela>
        <div className="py-24 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar o catálogo.</p>
          <Button className="mt-4" variant="outline" onClick={() => void refetch()}>Tentar de novo</Button>
        </div>
      </Tela>
    );
  }
  if (!catalogo) {
    return (
      <Tela>
        <div className="py-24 text-center">
          <CakeSlice className="mx-auto mb-3 size-10 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Catálogo indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este endereço não existe ou a confeitaria pausou os pedidos online.</p>
        </div>
      </Tela>
    );
  }
  return <Loja slug={slug} catalogo={catalogo} />;
}

/** Esqueleto mostrado na hora, enquanto os produtos chegam. */
function EsqueletoCatalogo() {
  return (
    <Tela>
      <div className="animate-pulse py-6" role="status" aria-label="Carregando o catálogo">
        <div className="mx-auto h-8 w-48 rounded-lg bg-muted" />
        <div className="mx-auto mt-2 h-4 w-32 rounded bg-muted" />
        <div className="mt-6 flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 w-20 rounded-full bg-muted" />)}</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-card shadow-soft">
              <div className="aspect-square bg-muted" />
              <div className="space-y-2 p-3"><div className="h-4 w-3/4 rounded bg-muted" /><div className="h-4 w-1/3 rounded bg-muted" /></div>
            </div>
          ))}
        </div>
        <span className="sr-only">Carregando o catálogo…</span>
      </div>
    </Tela>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><div className="mx-auto max-w-2xl px-4">{children}</div></div>;
}

function Loja({ slug, catalogo }: { slug: string; catalogo: Catalogo }) {
  const chaveCarrinho = `catalogo:${slug}:carrinho`;
  const [carrinho, setCarrinho] = useState<Carrinho>(() => limparCarrinho(lerLocal<Carrinho>(chaveCarrinho, {}), catalogo.produtos));
  const [etapa, setEtapa] = useState<"produtos" | "finalizar" | "encomenda">("produtos");
  useCorDaMarca(catalogo.cor);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ProdutoCatalogo | null>(null);

  useEffect(() => gravarLocal(chaveCarrinho, carrinho), [chaveCarrinho, carrinho]);

  const categorias = useMemo(() => [...new Set(catalogo.produtos.map((p) => p.categoria))], [catalogo.produtos]);
  const visiveis = catalogo.produtos.filter((p) => !categoria || p.categoria === categoria);
  const resumo = resumoCarrinho(carrinho, catalogo.produtos, { entrega: false, taxaEntrega: 0, hoje: catalogo.hoje });
  const whatsapp = linkWhatsApp(catalogo.whatsapp, `Olá! Vi o catálogo da ${catalogo.nome} e tenho uma dúvida.`);

  if (etapa === "finalizar" && resumo.itens > 0) {
    return <Finalizar slug={slug} catalogo={catalogo} carrinho={carrinho} setCarrinho={setCarrinho} voltar={() => setEtapa("produtos")} limparCarrinho={() => setCarrinho({})} />;
  }
  if (etapa === "encomenda" && catalogo.aceita_encomenda) {
    return <Encomenda slug={slug} catalogo={catalogo} voltar={() => setEtapa("produtos")} />;
  }
  const bairros = catalogo.bairros ?? [];
  const menorTaxa = bairros.length ? Math.min(...bairros.map((b) => Number(b.taxa))) : catalogo.taxa_entrega;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b bg-card/70">
        <div className="mx-auto max-w-2xl px-4 pb-5 pt-8">
          <div className="flex items-start gap-3">
            {catalogo.logo_url
              ? <img src={catalogo.logo_url} alt={`Logo da ${catalogo.nome}`} width={56} height={56} className="size-14 shrink-0 rounded-2xl bg-card object-cover shadow-soft" />
              : <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft"><CakeSlice className="size-6" /></span>}
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{catalogo.nome}</h1>
              {catalogo.slogan && <p className="mt-0.5 text-sm text-muted-foreground">{catalogo.slogan}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {catalogo.aceita_retirada && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><Store className="size-3.5" /> Retirada</span>}
            {catalogo.aceita_entrega && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><Truck className="size-3.5" /> Entrega {bairros.length ? (menorTaxa > 0 ? `a partir de ${brl(menorTaxa)}` : "conforme o bairro") : catalogo.taxa_entrega > 0 ? brl(catalogo.taxa_entrega) : "grátis"}</span>}
            {catalogo.pedido_minimo > 0 && <span className="rounded-full border bg-background px-2.5 py-1">Pedido mínimo {brl(catalogo.pedido_minimo)}</span>}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-success"><MessageCircle className="size-3.5" /> Dúvidas</a>}
          </div>
          {catalogo.aviso && <p className="mt-4 rounded-xl bg-accent p-3 text-sm text-accent-foreground">{catalogo.aviso}</p>}
          {catalogo.aceita_encomenda && (
            <button type="button" onClick={() => { setEtapa("encomenda"); window.scrollTo({ top: 0 }); }}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="size-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold">Quer algo personalizado?</span><span className="block text-sm text-muted-foreground">Descreva sua ideia, envie fotos de referência e receba o orçamento.</span></span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4">
        {categorias.length > 1 && (
          <nav aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-4">
            {[null, ...categorias].map((c) => (
              <button key={c ?? "todas"} type="button" onClick={() => setCategoria(c)} aria-pressed={categoria === c}
                className={cn("shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors", categoria === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
                {c ?? "Tudo"}
              </button>
            ))}
          </nav>
        )}

        {catalogo.produtos.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nenhum produto disponível no momento.</p>
        ) : (
          <ul className={cn("grid gap-3", categorias.length > 1 ? "" : "pt-4")}>
            {visiveis.map((p) => {
              const qtd = carrinho[p.id] ?? 0;
              const temOpcoes = (p.opcoes?.length ?? 0) > 0;
              return (
                <li key={p.id} className="flex gap-3 rounded-2xl bg-card p-3 shadow-soft">
                  <button type="button" onClick={() => setDetalhe(p)} aria-label={`Ver fotos e detalhes de ${p.nome}`} className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28">
                    <Capa produto={p} />
                    {midiasDoProduto(p).length > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-background/90 px-1.5 text-[10px] font-semibold">+{midiasDoProduto(p).length - 1}</span>}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button type="button" onClick={() => setDetalhe(p)} className="text-left"><h2 className="font-semibold leading-snug">{p.nome}</h2></button>
                    {p.descricao && <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">{p.descricao}</p>}
                    {p.antecedencia_dias > 0 && <p className="mt-1 text-xs text-muted-foreground">Encomende com {p.antecedencia_dias} dia(s) de antecedência</p>}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="font-semibold tabular-nums">{temOpcoes ? <><span className="text-xs font-normal text-muted-foreground">a partir de </span>{brl(precoMinimo(p))}</> : brl(p.preco)}</span>
                      {temOpcoes ? (
                        <Button size="sm" onClick={() => setDetalhe(p)} aria-label={`Escolher opções de ${p.nome}`}><Plus className="size-4" /> Escolher</Button>
                      ) : qtd === 0 ? (
                        <Button size="sm" onClick={() => setCarrinho((c) => alterarQuantidade(c, p.id, 1))} aria-label={`Adicionar ${p.nome}`}><Plus className="size-4" /> Adicionar</Button>
                      ) : (
                        <Stepper nome={p.nome} quantidade={qtd} onChange={(d) => setCarrinho((c) => alterarQuantidade(c, p.id, d))} />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="py-8 text-center text-xs text-muted-foreground">Pedidos online por Doce Gestão · <Link to="/privacidade" className="underline">Privacidade</Link></p>
      </main>

      <DetalheProduto
        key={detalhe?.id ?? "nenhum"}
        produto={detalhe}
        carrinho={carrinho}
        onClose={() => setDetalhe(null)}
        onChange={(chave, d) => setCarrinho((c) => alterarQuantidade(c, chave, d))}
      />

      {resumo.itens > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto max-w-2xl px-4 py-3">
            <Button className="h-12 w-full justify-between text-base" onClick={() => { setEtapa("finalizar"); window.scrollTo({ top: 0 }); }}>
              <span className="inline-flex items-center gap-2"><ShoppingBag className="size-5" /> Ver pedido · {resumo.itens} {resumo.itens === 1 ? "item" : "itens"}</span>
              <span className="tabular-nums">{brl(resumo.subtotal)}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Capa({ produto }: { produto: ProdutoCatalogo }) {
  const capa = capaDoProduto(produto);
  if (!capa) return <div className="grid size-full place-items-center text-muted-foreground"><CakeSlice className="size-8 opacity-50" /></div>;
  if (capa.tipo === "video") {
    return (
      <>
        <video src={`${capa.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
        <PlayCircle className="pointer-events-none absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
      </>
    );
  }
  return <img src={miniaturaDaFoto(capa.url)} alt={produto.nome} loading="lazy" decoding="async" className="size-full object-cover"
    onError={(e) => { if (e.currentTarget.src !== capa.url) e.currentTarget.src = capa.url; }} />;
}

/** Fotos e vídeos do produto em carrossel, com descrição e botão de adicionar. */
function DetalheProduto({ produto, carrinho, onClose, onChange }: { produto: ProdutoCatalogo | null; carrinho: Carrinho; onClose: () => void; onChange: (chave: string, delta: number) => void }) {
  const [api, setApi] = useState<CarouselApi>();
  const [escolha, setEscolha] = useState<Escolha>({});
  const grupos = produto?.opcoes ?? [];
  const completa = produto ? escolhaCompleta(produto, escolha) : false;
  const chave = produto && completa ? chaveCarrinho(produto.id, escolha) : null;
  const quantidade = chave ? (carrinho[chave] ?? 0) : 0;
  const [atual, setAtual] = useState(0);
  useEffect(() => {
    if (!api) return;
    const atualizar = () => setAtual(api.selectedScrollSnap());
    atualizar();
    api.on("select", atualizar);
    return () => { api.off("select", atualizar); };
  }, [api]);
  const midias = produto ? midiasDoProduto(produto) : [];
  return (
    <Dialog open={Boolean(produto)} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-lg gap-3 overflow-y-auto rounded-2xl p-0">
        {produto && (
          <>
            {midias.length > 0 ? (
              <div className="relative">
                <Carousel setApi={setApi} opts={{ loop: midias.length > 1 }}>
                  <CarouselContent className="ml-0">
                    {midias.map((m, i) => (
                      <CarouselItem key={`${m.url}-${i}`} className="pl-0">
                        <div className="aspect-square w-full bg-black/5">
                          {m.tipo === "video"
                            ? <video src={m.url} controls playsInline preload="metadata" className="size-full bg-black object-contain" />
                            : <img src={m.url} alt={`${produto.nome} — foto ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} className="size-full object-cover" />}
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {midias.length > 1 && (
                    <>
                      <CarouselPrevious className="left-2 bg-background/90" />
                      <CarouselNext className="right-2 bg-background/90" />
                    </>
                  )}
                </Carousel>
                {midias.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden="true">
                    {midias.map((_, i) => <span key={i} className={cn("size-1.5 rounded-full", i === atual ? "bg-white" : "bg-white/50")} />)}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid aspect-[2/1] place-items-center bg-muted text-muted-foreground"><CakeSlice className="size-10 opacity-50" /></div>
            )}
            <div className="space-y-2 px-5 pb-5">
              <DialogTitle className="font-display text-xl">{produto.nome}</DialogTitle>
              <DialogDescription className="whitespace-pre-line text-sm">{produto.descricao || produto.categoria}</DialogDescription>
              {produto.antecedencia_dias > 0 && <p className="text-xs text-muted-foreground">Encomende com {produto.antecedencia_dias} dia(s) de antecedência.</p>}
              {grupos.map((g) => (
                <fieldset key={g.grupo} className="space-y-2 pt-1">
                  <legend className="text-sm font-semibold">{g.grupo} <span className="font-normal text-muted-foreground">· escolha 1</span></legend>
                  <div className="flex flex-wrap gap-2">
                    {g.itens.map((i) => {
                      const marcado = escolha[g.grupo] === i.nome;
                      return (
                        <button key={i.nome} type="button" aria-pressed={marcado} onClick={() => setEscolha((e) => ({ ...e, [g.grupo]: i.nome }))}
                          className={cn("rounded-full border px-3 py-2 text-sm", marcado ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
                          {i.nome}{Number(i.preco) !== 0 && <span className={cn("ml-1 text-xs", marcado ? "text-primary-foreground/80" : "text-muted-foreground")}>{Number(i.preco) > 0 ? "+" : "−"}{brl(Math.abs(Number(i.preco)))}</span>}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-lg font-semibold tabular-nums">
                  {grupos.length && !completa ? <><span className="text-xs font-normal text-muted-foreground">a partir de </span>{brl(precoMinimo(produto))}</> : brl(precoComOpcoes(produto, escolha))}
                </span>
                {!chave
                  ? <Button disabled>Escolha as opções</Button>
                  : quantidade === 0
                  ? <Button onClick={() => onChange(chave, 1)}><Plus className="size-4" /> Adicionar</Button>
                  : <Stepper nome={produto.nome} quantidade={quantidade} onChange={(d) => onChange(chave, d)} />}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ nome, quantidade, onChange }: { nome: string; quantidade: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full border bg-background">
      <Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" onClick={() => onChange(-1)} aria-label={`Diminuir ${nome}`}><Minus className="size-4" /></Button>
      <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{quantidade}</span>
      <Button type="button" size="icon" variant="ghost" className="size-9 rounded-full" onClick={() => onChange(1)} aria-label={`Aumentar ${nome}`}><Plus className="size-4" /></Button>
    </div>
  );
}

/** Aplica a cor da marca no catálogo (inclusive nas janelas abertas por cima da página). */
function useCorDaMarca(cor: string | null | undefined) {
  useEffect(() => {
    if (!cor || !/^#[0-9a-f]{6}$/i.test(cor)) return;
    const raiz = document.documentElement.style;
    const texto = corDoTexto(cor);
    const vars: [string, string][] = [["--primary", cor], ["--color-primary", cor], ["--primary-foreground", texto], ["--color-primary-foreground", texto], ["--ring", cor], ["--color-ring", cor]];
    for (const [k, v] of vars) raiz.setProperty(k, v);
    return () => { for (const [k] of vars) raiz.removeProperty(k); };
  }, [cor]);
}

type DadosCliente = { nome: string; telefone: string; endereco: string };
const CHAVE_CLIENTE = "catalogo:cliente";
function useCliente() {
  return useState<DadosCliente>(() => ({ nome: "", telefone: "", endereco: "", ...lerLocal<Partial<DadosCliente>>(CHAVE_CLIENTE, {}) }));
}

type Agenda = { tipo: "retirada" | "entrega"; bairro: string; data: string; hora: string };

/** Retirada/entrega, bairro, endereço, data e horário: regras da agenda da confeitaria. */
function useAgenda(catalogo: Catalogo, dataMinima: string, diasMaximos: number) {
  const [agenda, setAgenda] = useState<Agenda>({ tipo: catalogo.aceita_retirada ? "retirada" : "entrega", bairro: "", data: "", hora: "" });
  useEffect(() => {
    setAgenda((a) => (!a.data || a.data < dataMinima ? { ...a, data: proximaDataDisponivel(catalogo, dataMinima) } : a));
  }, [dataMinima, catalogo]);
  const taxa = agenda.tipo === "entrega" ? taxaDeEntrega(catalogo, agenda.bairro) : 0;
  const horarios = agenda.tipo === "retirada" ? (catalogo.horarios_retirada ?? []) : [];
  function validar(cliente: DadosCliente): string | null {
    if (agenda.tipo === "entrega" && cliente.endereco.trim().length < 5) return "Informe o endereço de entrega.";
    if (agenda.tipo === "entrega" && taxa === null) return "Escolha o bairro de entrega.";
    if (!agenda.data || agenda.data < dataMinima) return `Escolha uma data a partir de ${dataBR(dataMinima)}.`;
    if (agenda.data > somarDias(catalogo.hoje, diasMaximos)) return `Escolha uma data nos próximos ${diasMaximos} dias.`;
    const motivo = motivoDataIndisponivel(catalogo, agenda.data);
    if (motivo) return motivo;
    if (horarios.length && !horarios.includes(agenda.hora)) return "Escolha um horário de retirada.";
    return null;
  }
  return { agenda, setAgenda, taxa: taxa ?? 0, taxaEscolhida: taxa !== null, horarios, validar, dataMaxima: somarDias(catalogo.hoje, diasMaximos) };
}

function CamposAgenda({ catalogo, cliente, setCliente, ag, dataMinima }: {
  catalogo: Catalogo;
  cliente: DadosCliente;
  setCliente: (c: DadosCliente) => void;
  ag: ReturnType<typeof useAgenda>;
  dataMinima: string;
}) {
  const { agenda, setAgenda, horarios } = ag;
  const bairros = catalogo.bairros ?? [];
  const motivo = agenda.data ? motivoDataIndisponivel(catalogo, agenda.data) : null;
  const fechados = catalogo.dias_fechados ?? [];
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
      <h2 className="font-semibold">Retirada ou entrega</h2>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Retirada ou entrega">
        {catalogo.aceita_retirada && (
          <button type="button" role="radio" aria-checked={agenda.tipo === "retirada"} onClick={() => setAgenda({ ...agenda, tipo: "retirada" })}
            className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium", agenda.tipo === "retirada" ? "border-primary bg-primary/10 text-primary" : "bg-background")}>
            <Store className="size-4" /> Retirar
          </button>
        )}
        {catalogo.aceita_entrega && (
          <button type="button" role="radio" aria-checked={agenda.tipo === "entrega"} onClick={() => setAgenda({ ...agenda, tipo: "entrega", hora: horarios.length ? "" : agenda.hora })}
            className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium", agenda.tipo === "entrega" ? "border-primary bg-primary/10 text-primary" : "bg-background")}>
            <Truck className="size-4" /> Entrega {!bairros.length && catalogo.taxa_entrega > 0 ? `· ${brl(catalogo.taxa_entrega)}` : ""}
          </button>
        )}
      </div>
      {agenda.tipo === "retirada" && catalogo.endereco_retirada && <p className="text-sm text-muted-foreground">Retirada em: {catalogo.endereco_retirada}</p>}
      {agenda.tipo === "entrega" && bairros.length > 0 && (
        <Field label="Bairro" hint="Entregamos apenas nos bairros da lista.">
          <select required value={agenda.bairro} onChange={(e) => setAgenda({ ...agenda, bairro: e.target.value })}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Escolha o bairro</option>
            {bairros.map((b) => <option key={b.bairro} value={b.bairro}>{b.bairro} — {Number(b.taxa) > 0 ? brl(Number(b.taxa)) : "grátis"}</option>)}
          </select>
        </Field>
      )}
      {agenda.tipo === "entrega" && (
        <Field label="Endereço de entrega"><Textarea required rows={2} maxLength={300} autoComplete="street-address" value={cliente.endereco} onChange={(e) => setCliente({ ...cliente, endereco: e.target.value })} placeholder={bairros.length ? "Rua, número e complemento" : "Rua, número, bairro e complemento"} /></Field>
      )}
      <div className={cn("grid gap-3", horarios.length ? "grid-cols-1" : "grid-cols-2")}>
        <Field label="Data"><Input required type="date" min={dataMinima} max={ag.dataMaxima} value={agenda.data} onChange={(e) => setAgenda({ ...agenda, data: e.target.value })} className="h-11" /></Field>
        {!horarios.length && <Field label="Horário (opcional)"><Input type="time" value={agenda.hora} onChange={(e) => setAgenda({ ...agenda, hora: e.target.value })} className="h-11" /></Field>}
      </div>
      {motivo && <p role="alert" className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">{motivo}</p>}
      {fechados.length > 0 && !motivo && <p className="text-xs text-muted-foreground">Não atendemos: {fechados.map((d) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d]).join(", ")}.</p>}
      {dataMinima > catalogo.hoje && <p className="text-xs text-muted-foreground">Data mínima: {dataBR(dataMinima)}.</p>}
      {horarios.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Horário de retirada</legend>
          <div className="flex flex-wrap gap-2">
            {horarios.map((h) => (
              <button key={h} type="button" aria-pressed={agenda.hora === h} onClick={() => setAgenda({ ...agenda, hora: h })}
                className={cn("rounded-full border px-3.5 py-2 text-sm font-medium tabular-nums", agenda.hora === h ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{h}</button>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}

function CamposCliente({ cliente, setCliente }: { cliente: DadosCliente; setCliente: (c: DadosCliente) => void }) {
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
      <h2 className="font-semibold">Seus dados</h2>
      <Field label="Nome"><Input required autoComplete="name" maxLength={120} value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} className="h-11" /></Field>
      <Field label="WhatsApp com DDD" hint="Usado só para falar sobre este pedido."><Input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="(19) 99999-9999" value={cliente.telefone} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} className="h-11" /></Field>
    </section>
  );
}

function Cabecalho({ titulo, catalogo, voltar }: { titulo: string; catalogo: Catalogo; voltar: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Button type="button" size="icon" variant="ghost" onClick={voltar} aria-label="Voltar ao catálogo"><ArrowLeft className="size-5" /></Button>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold">{titulo}</h1>
          <p className="truncate text-xs text-muted-foreground">{catalogo.nome}</p>
        </div>
      </div>
    </header>
  );
}

type CupomAplicado = { codigo: string; desconto: number };

function Finalizar({ slug, catalogo, carrinho, setCarrinho, voltar, limparCarrinho: esvaziar }: {
  slug: string;
  catalogo: Catalogo;
  carrinho: Carrinho;
  setCarrinho: (f: (c: Carrinho) => Carrinho) => void;
  voltar: () => void;
  limparCarrinho: () => void;
}) {
  const navigate = useNavigate();
  const [cliente, setCliente] = useCliente();
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [codigoCupom, setCodigoCupom] = useState("");
  const [cupom, setCupom] = useState<CupomAplicado | null>(null);
  const [erroCupom, setErroCupom] = useState<string | null>(null);
  const [validandoCupom, setValidandoCupom] = useState(false);
  // Um identificador por tentativa: repetir o envio não duplica o pedido no servidor.
  const token = useRef<string>(crypto.randomUUID());

  const base = resumoCarrinho(carrinho, catalogo.produtos, { entrega: false, taxaEntrega: 0, hoje: catalogo.hoje });
  const ag = useAgenda(catalogo, base.dataMinima, 90);
  const subtotal = base.subtotal;
  const desconto = cupom ? Math.min(cupom.desconto, subtotal) : 0;
  const total = Math.round((subtotal - desconto + ag.taxa) * 100) / 100;
  const faltaMinimo = Math.max(0, catalogo.pedido_minimo - subtotal);

  async function aplicarCupom(codigo = codigoCupom) {
    const limpo = normalizarCupom(codigo);
    if (limpo.length < 3) return setErroCupom("Digite o código do cupom.");
    setValidandoCupom(true);
    setErroCupom(null);
    const { data, error } = await supabase.rpc("validar_cupom_catalogo", { p_slug: slug, p_codigo: limpo, p_subtotal: subtotal, p_telefone: cliente.telefone });
    setValidandoCupom(false);
    const r = data as { ok?: boolean; desconto?: number; codigo?: string; mensagem?: string } | null;
    if (error || !r?.ok) { setCupom(null); return setErroCupom(r?.mensagem ?? "Não foi possível validar o cupom."); }
    setCupom({ codigo: r.codigo ?? limpo, desconto: Number(r.desconto ?? 0) });
  }

  // O desconto depende do valor dos produtos: revalida quando o carrinho muda.
  const ultimoSubtotal = useRef(subtotal);
  useEffect(() => {
    if (ultimoSubtotal.current === subtotal) return;
    ultimoSubtotal.current = subtotal;
    if (cupom) void aplicarCupom(cupom.codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (cliente.nome.trim().length < 2) return setErro("Informe seu nome.");
    if (!telefoneValido(cliente.telefone)) return setErro("Informe um WhatsApp válido com DDD.");
    const erroAgenda = ag.validar(cliente);
    if (erroAgenda) return setErro(erroAgenda);
    if (faltaMinimo > 0) return setErro(`Faltam ${brl(faltaMinimo)} para o pedido mínimo.`);
    setEnviando(true);
    gravarLocal(CHAVE_CLIENTE, { nome: cliente.nome.trim(), telefone: cliente.telefone.trim(), endereco: cliente.endereco.trim() });
    const { agenda } = ag;
    const { data: resposta, error } = await supabase.rpc("criar_pedido_catalogo", {
      p_slug: slug,
      p_token: token.current,
      p_cliente: { nome: cliente.nome.trim(), telefone: cliente.telefone, endereco: agenda.tipo === "entrega" ? cliente.endereco.trim() : "" },
      p_entrega: {
        tipo: agenda.tipo, data: agenda.data, hora: agenda.hora || null, observacoes: obs.trim(),
        ...(agenda.tipo === "entrega" && agenda.bairro ? { bairro: agenda.bairro } : {}),
        ...(cupom ? { cupom: cupom.codigo } : {}),
      },
      p_itens: base.linhas.map((l) => ({ produto_id: l.produto.id, quantidade: l.quantidade, opcoes: l.escolha })),
    });
    setEnviando(false);
    const codigo = (resposta as { codigo?: string } | null)?.codigo;
    if (error || !codigo) {
      setErro(mensagemErroCatalogo(error));
      // Um erro de validação pode ser corrigido e reenviado com um novo identificador.
      token.current = crypto.randomUUID();
      return;
    }
    esvaziar();
    // Link curto (/p/xxxxxxxxxx) para o cliente guardar; o código longo continua valendo.
    const { data: curto } = await supabase.rpc("codigo_curto_pedido", { p_codigo: codigo });
    if (curto) void navigate({ to: "/p/$codigo", params: { codigo: curto } });
    else void navigate({ to: "/pedido/$codigo", params: { codigo } });
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <Cabecalho titulo="Seu pedido" catalogo={catalogo} voltar={voltar} />

      <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <ul className="divide-y">
            {base.linhas.map((l) => (
              <li key={l.chave} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{l.descricao}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{brl(l.precoUnit)} cada · {brl(l.total)}</p>
                </div>
                <Stepper nome={l.descricao} quantidade={l.quantidade} onChange={(d) => setCarrinho((c) => alterarQuantidade(c, l.chave, d))} />
              </li>
            ))}
          </ul>
          <button type="button" onClick={voltar} className="mt-2 text-sm font-medium text-primary">+ Adicionar mais produtos</button>
        </section>

        <CamposCliente cliente={cliente} setCliente={setCliente} />
        <CamposAgenda catalogo={catalogo} cliente={cliente} setCliente={setCliente} ag={ag} dataMinima={base.dataMinima} />

        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <Field label="Observações (opcional)"><Textarea rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: sem lactose, escrever “Parabéns, Ana”" /></Field>
        </section>

        {catalogo.tem_cupons && (
          <section className="space-y-2 rounded-2xl bg-card p-4 shadow-soft">
            <h2 className="flex items-center gap-2 font-semibold"><Ticket className="size-4 text-primary" /> Cupom de desconto</h2>
            {cupom ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-success/10 p-3 text-sm">
                <span><span className="font-mono font-semibold">{cupom.codigo}</span> aplicado · −{brl(desconto)}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setCupom(null); setCodigoCupom(""); }}>Remover</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input value={codigoCupom} onChange={(e) => { setCodigoCupom(normalizarCupom(e.target.value)); setErroCupom(null); }} placeholder="Digite o código" aria-label="Código do cupom"
                  className="h-11 font-mono uppercase" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void aplicarCupom(); } }} />
                <Button type="button" variant="outline" className="h-11" disabled={validandoCupom || codigoCupom.length < 3} onClick={() => void aplicarCupom()}>{validandoCupom ? "..." : "Aplicar"}</Button>
              </div>
            )}
            {erroCupom && <p role="alert" className="text-sm text-destructive">{erroCupom}</p>}
          </section>
        )}

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Produtos</span><span className="tabular-nums">{brl(subtotal)}</span></div>
          {desconto > 0 && <div className="flex justify-between py-1 text-sm text-success"><span>Desconto ({cupom?.codigo})</span><span className="tabular-nums">−{brl(desconto)}</span></div>}
          {ag.agenda.tipo === "entrega" && <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Entrega</span><span className="tabular-nums">{ag.taxaEscolhida ? brl(ag.taxa) : "escolha o bairro"}</span></div>}
          <div className="mt-1 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{brl(total)}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">Pagamento por Pix: a chave aparece assim que você enviar o pedido.</p>
        </section>

        {faltaMinimo > 0 && <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">Faltam {brl(faltaMinimo)} para o pedido mínimo de {brl(catalogo.pedido_minimo)}.</p>}
        {erro && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{erro}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={enviando || faltaMinimo > 0}>
          {enviando ? "Enviando pedido…" : `Enviar pedido · ${brl(total)}`}
        </Button>
      </form>
    </div>
  );
}

const MAX_FOTOS_ENCOMENDA = 3;

/** Encomenda personalizada: descrição + fotos de referência; a confeitaria responde com o orçamento. */
function Encomenda({ slug, catalogo, voltar }: { slug: string; catalogo: Catalogo; voltar: () => void }) {
  const navigate = useNavigate();
  const [cliente, setCliente] = useCliente();
  const [descricao, setDescricao] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const token = useRef<string>(crypto.randomUUID());
  const arquivo = useRef<HTMLInputElement>(null);
  const dataMinima = somarDias(catalogo.hoje, 1);
  const ag = useAgenda(catalogo, dataMinima, 180);

  async function adicionarFotos(lista: FileList | null) {
    const escolhidas = [...(lista ?? [])].slice(0, MAX_FOTOS_ENCOMENDA - fotos.length);
    if (!escolhidas.length) return;
    setEnviandoFoto(true);
    setErro(null);
    try {
      for (const f of escolhidas) {
        const url = await enviarFotoEncomenda(slug, f);
        setFotos((atual) => [...atual, url].slice(0, MAX_FOTOS_ENCOMENDA));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (cliente.nome.trim().length < 2) return setErro("Informe seu nome.");
    if (!telefoneValido(cliente.telefone)) return setErro("Informe um WhatsApp válido com DDD.");
    if (descricao.trim().length < 10) return setErro("Descreva a encomenda: tema, tamanho, sabor e para quantas pessoas.");
    const erroAgenda = ag.validar(cliente);
    if (erroAgenda) return setErro(erroAgenda);
    setEnviando(true);
    gravarLocal(CHAVE_CLIENTE, { nome: cliente.nome.trim(), telefone: cliente.telefone.trim(), endereco: cliente.endereco.trim() });
    const { agenda } = ag;
    const { data: resposta, error } = await supabase.rpc("criar_encomenda_catalogo", {
      p_slug: slug,
      p_token: token.current,
      p_cliente: { nome: cliente.nome.trim(), telefone: cliente.telefone, endereco: agenda.tipo === "entrega" ? cliente.endereco.trim() : "" },
      p_encomenda: {
        descricao: descricao.trim(), tipo: agenda.tipo, data: agenda.data, hora: agenda.hora || null, fotos,
        ...(agenda.tipo === "entrega" && agenda.bairro ? { bairro: agenda.bairro } : {}),
      },
    });
    setEnviando(false);
    const codigo = (resposta as { codigo?: string } | null)?.codigo;
    if (error || !codigo) {
      setErro(mensagemErroCatalogo(error));
      token.current = crypto.randomUUID();
      return;
    }
    const { data: curto } = await supabase.rpc("codigo_curto_pedido", { p_codigo: codigo });
    if (curto) void navigate({ to: "/p/$codigo", params: { codigo: curto } });
    else void navigate({ to: "/pedido/$codigo", params: { codigo } });
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <Cabecalho titulo="Encomenda personalizada" catalogo={catalogo} voltar={voltar} />
      <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="font-semibold">O que você quer?</h2>
          <Textarea required rows={5} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} aria-label="Descrição da encomenda"
            placeholder="Ex.: Bolo de 2 andares, tema jardim, massa de chocolate com recheio de ninho, para 40 pessoas. Escrever “Feliz 7 anos, Lia”." />
          <div>
            <p className="mb-2 text-sm font-medium">Fotos de referência <span className="font-normal text-muted-foreground">(opcional, até {MAX_FOTOS_ENCOMENDA})</span></p>
            <div className="flex flex-wrap gap-2">
              {fotos.map((url, i) => (
                <div key={url} className="relative size-20 overflow-hidden rounded-xl bg-muted">
                  <img src={url} alt={`Referência ${i + 1}`} className="size-full object-cover" />
                  <button type="button" onClick={() => setFotos((f) => f.filter((x) => x !== url))} aria-label={`Remover referência ${i + 1}`}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/90"><X className="size-3.5" /></button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS_ENCOMENDA && (
                <button type="button" disabled={enviandoFoto} onClick={() => arquivo.current?.click()}
                  className="grid size-20 place-items-center rounded-xl border border-dashed text-xs text-muted-foreground">
                  {enviandoFoto ? "Enviando…" : <span className="grid place-items-center gap-1"><Camera className="size-5" />Adicionar</span>}
                </button>
              )}
              <input ref={arquivo} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void adicionarFotos(e.target.files); e.target.value = ""; }} />
            </div>
          </div>
        </section>

        <CamposCliente cliente={cliente} setCliente={setCliente} />
        <CamposAgenda catalogo={catalogo} cliente={cliente} setCliente={setCliente} ag={ag} dataMinima={dataMinima} />

        <p className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">Você não paga nada agora. A {catalogo.nome} vai analisar e enviar o orçamento pelo WhatsApp.</p>
        {erro && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{erro}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={enviando || enviandoFoto}>{enviando ? "Enviando…" : "Pedir orçamento"}</Button>
      </form>
    </div>
  );
}
