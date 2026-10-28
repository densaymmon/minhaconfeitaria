import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CakeSlice, Minus, MessageCircle, PlayCircle, Plus, ShoppingBag, Store, Truck } from "lucide-react";
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
  resumoCarrinho,
  telefoneValido,
  type Carrinho,
  type Catalogo,
} from "@/lib/catalogo";

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
  component: CatalogoRota,
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
  const { data: catalogo, isLoading, isError, refetch } = useQuery({
    queryKey: ["catalogo-publico", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalogo_publico", { p_slug: slug });
      if (error) throw new Error(error.message);
      return (data as unknown as Catalogo | null) ?? null;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (catalogo?.nome) document.title = `${catalogo.nome} — faça seu pedido`;
  }, [catalogo?.nome]);

  if (isLoading) return <Tela><p className="py-24 text-center text-sm text-muted-foreground" role="status">Carregando o catálogo…</p></Tela>;
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

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><div className="mx-auto max-w-2xl px-4">{children}</div></div>;
}

function Loja({ slug, catalogo }: { slug: string; catalogo: Catalogo }) {
  const chaveCarrinho = `catalogo:${slug}:carrinho`;
  const [carrinho, setCarrinho] = useState<Carrinho>(() => limparCarrinho(lerLocal<Carrinho>(chaveCarrinho, {}), catalogo.produtos));
  const [etapa, setEtapa] = useState<"produtos" | "finalizar">("produtos");
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

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b bg-card/70">
        <div className="mx-auto max-w-2xl px-4 pb-5 pt-8">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft"><CakeSlice className="size-6" /></span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{catalogo.nome}</h1>
              {catalogo.slogan && <p className="mt-0.5 text-sm text-muted-foreground">{catalogo.slogan}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {catalogo.aceita_retirada && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><Store className="size-3.5" /> Retirada</span>}
            {catalogo.aceita_entrega && <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1"><Truck className="size-3.5" /> Entrega {catalogo.taxa_entrega > 0 ? brl(catalogo.taxa_entrega) : "grátis"}</span>}
            {catalogo.pedido_minimo > 0 && <span className="rounded-full border bg-background px-2.5 py-1">Pedido mínimo {brl(catalogo.pedido_minimo)}</span>}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-success"><MessageCircle className="size-3.5" /> Dúvidas</a>}
          </div>
          {catalogo.aviso && <p className="mt-4 rounded-xl bg-accent p-3 text-sm text-accent-foreground">{catalogo.aviso}</p>}
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
  return <img src={capa.url} alt={produto.nome} loading="lazy" className="size-full object-cover" />;
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

type DadosCliente = { nome: string; telefone: string; endereco: string };

function Finalizar({ slug, catalogo, carrinho, setCarrinho, voltar, limparCarrinho: esvaziar }: {
  slug: string;
  catalogo: Catalogo;
  carrinho: Carrinho;
  setCarrinho: (f: (c: Carrinho) => Carrinho) => void;
  voltar: () => void;
  limparCarrinho: () => void;
}) {
  const navigate = useNavigate();
  const chaveCliente = "catalogo:cliente";
  const [cliente, setCliente] = useState<DadosCliente>(() => ({ nome: "", telefone: "", endereco: "", ...lerLocal<Partial<DadosCliente>>(chaveCliente, {}) }));
  const [tipo, setTipo] = useState<"retirada" | "entrega">(catalogo.aceita_retirada ? "retirada" : "entrega");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Um identificador por tentativa: repetir o envio não duplica o pedido no servidor.
  const token = useRef<string>(crypto.randomUUID());

  const resumo = resumoCarrinho(carrinho, catalogo.produtos, { entrega: tipo === "entrega", taxaEntrega: catalogo.taxa_entrega, hoje: catalogo.hoje });
  const dataMinima = resumo.dataMinima;
  useEffect(() => { if (!data || data < dataMinima) setData(dataMinima); }, [dataMinima, data]);
  const faltaMinimo = Math.max(0, catalogo.pedido_minimo - resumo.subtotal);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (cliente.nome.trim().length < 2) return setErro("Informe seu nome.");
    if (!telefoneValido(cliente.telefone)) return setErro("Informe um WhatsApp válido com DDD.");
    if (tipo === "entrega" && cliente.endereco.trim().length < 5) return setErro("Informe o endereço de entrega.");
    if (!data || data < dataMinima) return setErro(`Escolha uma data a partir de ${dataBR(dataMinima)}.`);
    if (faltaMinimo > 0) return setErro(`Faltam ${brl(faltaMinimo)} para o pedido mínimo.`);
    setEnviando(true);
    gravarLocal(chaveCliente, { nome: cliente.nome.trim(), telefone: cliente.telefone.trim(), endereco: cliente.endereco.trim() });
    const { data: resposta, error } = await supabase.rpc("criar_pedido_catalogo", {
      p_slug: slug,
      p_token: token.current,
      p_cliente: { nome: cliente.nome.trim(), telefone: cliente.telefone, endereco: tipo === "entrega" ? cliente.endereco.trim() : "" },
      p_entrega: { tipo, data, hora: hora || null, observacoes: obs.trim() },
      p_itens: resumo.linhas.map((l) => ({ produto_id: l.produto.id, quantidade: l.quantidade, opcoes: l.escolha })),
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
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Button type="button" size="icon" variant="ghost" onClick={voltar} aria-label="Voltar ao catálogo"><ArrowLeft className="size-5" /></Button>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold">Seu pedido</h1>
            <p className="truncate text-xs text-muted-foreground">{catalogo.nome}</p>
          </div>
        </div>
      </header>

      <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <ul className="divide-y">
            {resumo.linhas.map((l) => (
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

        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="font-semibold">Seus dados</h2>
          <Field label="Nome"><Input required autoComplete="name" maxLength={120} value={cliente.nome} onChange={(e) => setCliente({ ...cliente, nome: e.target.value })} className="h-11" /></Field>
          <Field label="WhatsApp com DDD" hint="Usado só para falar sobre este pedido."><Input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="(19) 99999-9999" value={cliente.telefone} onChange={(e) => setCliente({ ...cliente, telefone: e.target.value })} className="h-11" /></Field>
        </section>

        <section className="space-y-3 rounded-2xl bg-card p-4 shadow-soft">
          <h2 className="font-semibold">Retirada ou entrega</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Retirada ou entrega">
            {catalogo.aceita_retirada && (
              <button type="button" role="radio" aria-checked={tipo === "retirada"} onClick={() => setTipo("retirada")}
                className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium", tipo === "retirada" ? "border-primary bg-primary/10 text-primary" : "bg-background")}>
                <Store className="size-4" /> Retirar
              </button>
            )}
            {catalogo.aceita_entrega && (
              <button type="button" role="radio" aria-checked={tipo === "entrega"} onClick={() => setTipo("entrega")}
                className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium", tipo === "entrega" ? "border-primary bg-primary/10 text-primary" : "bg-background")}>
                <Truck className="size-4" /> Entrega {catalogo.taxa_entrega > 0 ? `· ${brl(catalogo.taxa_entrega)}` : ""}
              </button>
            )}
          </div>
          {tipo === "retirada" && catalogo.endereco_retirada && <p className="text-sm text-muted-foreground">Retirada em: {catalogo.endereco_retirada}</p>}
          {tipo === "entrega" && (
            <Field label="Endereço de entrega"><Textarea required rows={2} maxLength={300} autoComplete="street-address" value={cliente.endereco} onChange={(e) => setCliente({ ...cliente, endereco: e.target.value })} placeholder="Rua, número, bairro e complemento" /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><Input required type="date" min={dataMinima} value={data} onChange={(e) => setData(e.target.value)} className="h-11" /></Field>
            <Field label="Horário (opcional)"><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-11" /></Field>
          </div>
          {dataMinima > catalogo.hoje && <p className="text-xs text-muted-foreground">Data mínima para estes produtos: {dataBR(dataMinima)}.</p>}
          <Field label="Observações (opcional)"><Textarea rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: sem lactose, escrever “Parabéns, Ana”" /></Field>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-soft">
          <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Produtos</span><span className="tabular-nums">{brl(resumo.subtotal)}</span></div>
          {tipo === "entrega" && <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">Entrega</span><span className="tabular-nums">{brl(resumo.taxa)}</span></div>}
          <div className="mt-1 flex justify-between border-t pt-2 font-semibold"><span>Total</span><span className="tabular-nums">{brl(resumo.total)}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">Pagamento por Pix: a chave aparece assim que você enviar o pedido.</p>
        </section>

        {faltaMinimo > 0 && <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">Faltam {brl(faltaMinimo)} para o pedido mínimo de {brl(catalogo.pedido_minimo)}.</p>}
        {erro && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{erro}</p>}
        <Button type="submit" className="h-12 w-full text-base" disabled={enviando || faltaMinimo > 0}>
          {enviando ? "Enviando pedido…" : `Enviar pedido · ${brl(resumo.total)}`}
        </Button>
      </form>
    </div>
  );
}
