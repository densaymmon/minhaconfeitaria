import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CakeSlice, Calculator, Check, ChefHat, ClipboardList, MessageCircle, QrCode, ShoppingBag, Smartphone, Wallet } from "lucide-react";
import bakeryImage from "@/assets/confeitaria.jpg";
import { planosQ, plataformaPublicaQ } from "@/lib/queries";
import { RECURSOS, precoTexto } from "@/lib/assinatura";
import { linkWhatsApp } from "@/lib/catalogo";
import { NOME_PLATAFORMA } from "@/lib/termos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FUNCOES = [
  { icone: ClipboardList, titulo: "Pedidos e agenda", texto: "Todas as encomendas num lugar só, com data, horário, sinal e saldo. Nada de caderno ou conversa perdida no WhatsApp." },
  { icone: ChefHat, titulo: "Produção do dia", texto: "Saiba o que produzir hoje e amanhã, quanto de cada ingrediente vai usar e o que falta comprar." },
  { icone: Calculator, titulo: "Custo e preço certo", texto: "Ficha técnica com custo por unidade, margem e preço sugerido. Veja o lucro real de cada pedido." },
  { icone: ShoppingBag, titulo: "Catálogo on-line", texto: "Um link com seus produtos, fotos e variações. O cliente escolhe, faz o pedido e paga por Pix." },
  { icone: MessageCircle, titulo: "WhatsApp em um toque", texto: "Confirmação do pedido, aviso de pronto, recibo e cobrança com a mensagem já escrita." },
  { icone: Wallet, titulo: "Financeiro simples", texto: "Recebimentos, despesas, contas a pagar e relatórios do mês sem planilha." },
];

const PASSOS = [
  { titulo: "Crie sua conta", texto: "Em 2 minutos, só com e-mail e o WhatsApp da confeitaria." },
  { titulo: "Configure em 4 passos", texto: "Nome, chave Pix, endereço do catálogo e o primeiro produto." },
  { titulo: "Compartilhe e venda", texto: "Mande o link do catálogo para seus clientes e acompanhe os pedidos chegando." },
];

const PERGUNTAS = [
  { p: "Preciso instalar alguma coisa?", r: "Não. Funciona no navegador do celular e do computador. Dá para adicionar à tela inicial do celular como um aplicativo." },
  { p: "O Pix cai na minha conta?", r: "Sim. O cliente paga direto na sua chave Pix, com o valor do pedido já preenchido. Não cobramos taxa sobre suas vendas." },
  { p: "Meus dados ficam seguros?", r: "Cada confeitaria só enxerga os próprios dados, e isso é garantido pelo banco de dados, não só pela tela. Seguimos a LGPD." },
  { p: "Como funciona o teste grátis?", r: "Você usa o plano mais completo durante o período de teste, sem cartão de crédito. Depois escolhe o plano que fizer sentido." },
  { p: "Posso mudar de plano depois?", r: "Pode, a qualquer momento. Seus pedidos, clientes e produtos continuam guardados." },
];

/** Página de apresentação do sistema para confeitarias que ainda não usam. */
export function PaginaVendas() {
  const { data: plataforma } = useQuery(plataformaPublicaQ);
  const { data: planos = [] } = useQuery(planosQ);
  const diasTeste = plataforma?.dias_teste ?? 14;
  const cadastroAberto = plataforma?.cadastro_aberto !== false;
  const whatsapp = linkWhatsApp(plataforma?.contato_whatsapp, `Olá! Quero conhecer o ${NOME_PLATAFORMA} para minha confeitaria.`);

  function Chamada({ className, texto }: { className?: string; texto?: string }) {
    if (cadastroAberto) {
      return (
        <Button asChild size="lg" className={cn("h-12 px-6 text-base", className)}>
          <Link to="/auth" search={{ modo: "criar" }}>{texto ?? `Testar grátis por ${diasTeste} dias`}</Link>
        </Button>
      );
    }
    if (whatsapp) {
      return (
        <Button asChild size="lg" className={cn("h-12 px-6 text-base", className)}>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-5" /> Quero conhecer</a>
        </Button>
      );
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><CakeSlice className="size-5" /></span>
            {NOME_PLATAFORMA}
          </span>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#planos" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">Planos</a>
            <a href="#duvidas" className="hidden rounded-md px-3 py-2 text-muted-foreground hover:text-foreground sm:block">Dúvidas</a>
            <Button asChild variant="outline" size="sm"><Link to="/auth">Entrar</Link></Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:py-16 lg:grid-cols-2">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Feito para confeitarias artesanais</p>
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Sua confeitaria organizada, do pedido ao lucro.</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Pedidos, produção, custos, catálogo on-line com Pix e WhatsApp num só lugar. Simples de usar no celular, feito para quem vive de encomenda.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Chamada />
              <a href="#funcoes" className="text-sm font-medium text-primary hover:underline">Ver o que o sistema faz</a>
            </div>
            {cadastroAberto && <p className="mt-3 text-xs text-muted-foreground">Sem cartão de crédito. Cancele quando quiser.</p>}
          </div>
          <div className="relative">
            <img src={bakeryImage} width={1152} height={576} alt="Bolos e pães artesanais sobre a mesa" className="w-full rounded-3xl object-cover shadow-soft" />
            <div className="absolute -bottom-5 left-4 right-4 flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft sm:left-auto sm:right-6 sm:w-72">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><Smartphone className="size-5" /></span>
              <span className="text-sm"><b>Novo pedido pelo catálogo!</b><span className="block text-xs text-muted-foreground">Bolo de cenoura (G) · Pix R$ 89,90</span></span>
            </div>
          </div>
        </section>

        <section id="funcoes" className="border-t bg-card/50 py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-display text-3xl font-semibold">Tudo o que a confeitaria precisa</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">Sem planilha, sem caderno e sem conta de cabeça. Cada função foi pensada para a rotina de quem produz e vende por encomenda.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FUNCOES.map(({ icone: Icone, titulo, texto }) => (
                <div key={titulo} className="rounded-2xl border bg-card p-5 shadow-soft">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icone className="size-5" /></span>
                  <h3 className="mt-3 text-lg font-semibold">{titulo}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-14">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <h2 className="font-display text-3xl font-semibold">Seu catálogo, seu link</h2>
              <p className="mt-2 text-muted-foreground">Seus clientes abrem o link ou o QR Code, escolhem tamanho e sabor, informam a data e pagam por Pix com o valor certo. O pedido aparece no sistema com aviso sonoro, e o cliente acompanha o andamento por um link próprio.</p>
              <ul className="mt-4 space-y-2 text-sm">
                {["Fotos e vídeos dos produtos", "Variações com preço (tamanho, sabor, recheio)", "Pix copia e cola com o valor do pedido", "Página de acompanhamento para o cliente"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="size-4 text-success" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PASSOS.map((passo, i) => (
                <div key={passo.titulo} className="rounded-2xl border bg-card p-4 shadow-soft">
                  <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                  <h3 className="mt-3 font-semibold leading-tight">{passo.titulo}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{passo.texto}</p>
                </div>
              ))}
              <div className="col-span-full flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                <QrCode className="size-8 shrink-0 text-primary" /> Imprima o QR Code do catálogo e deixe no balcão, na embalagem e no Instagram.
              </div>
            </div>
          </div>
        </section>

        {planos.length > 0 && (
          <section id="planos" className="border-t bg-card/50 py-14">
            <div className="mx-auto max-w-6xl px-4">
              <h2 className="font-display text-3xl font-semibold">Planos</h2>
              <p className="mt-2 text-muted-foreground">
                {cadastroAberto ? `Comece com ${diasTeste} dias grátis no plano mais completo. Depois, escolha o que fizer sentido.` : "Escolha o plano que combina com o tamanho da sua confeitaria."}
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {planos.map((p, i) => {
                  const destaque = i === planos.length - 1;
                  return (
                    <div key={p.id} className={cn("flex flex-col rounded-3xl border bg-card p-6 shadow-soft", destaque && "border-primary ring-2 ring-primary/30")}>
                      {destaque && <span className="mb-2 self-start rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Mais completo</span>}
                      <h3 className="font-display text-2xl font-semibold">{p.nome}</h3>
                      {p.descricao && <p className="mt-1 text-sm text-muted-foreground">{p.descricao}</p>}
                      <p className="mt-4"><span className="font-display text-4xl font-semibold tabular-nums">{precoTexto(p.preco_mensal)}</span><span className="text-sm text-muted-foreground">/mês</span></p>
                      {p.preco_anual != null && p.preco_anual < p.preco_mensal * 12 && (
                        <p className="text-xs text-success">ou {precoTexto(p.preco_anual)} por ano (economize {precoTexto(p.preco_mensal * 12 - p.preco_anual)})</p>
                      )}
                      <ul className="mt-5 flex-1 space-y-2 text-sm">
                        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> Pedidos, clientes, produção e Pix</li>
                        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> {p.limite_pedidos_mes ? `Até ${p.limite_pedidos_mes} pedidos por mês` : "Pedidos ilimitados"}</li>
                        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> {p.limite_produtos ? `Até ${p.limite_produtos} produtos` : "Produtos ilimitados"}</li>
                        {RECURSOS.filter((r) => p.recursos.includes(r.id)).map((r) => (
                          <li key={r.id} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" /> {r.nome}</li>
                        ))}
                      </ul>
                      <Chamada className="mt-6 w-full" texto={destaque ? `Testar grátis por ${diasTeste} dias` : "Começar agora"} />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section id="duvidas" className="py-14">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="font-display text-3xl font-semibold">Dúvidas frequentes</h2>
            <div className="mt-6 divide-y rounded-2xl border bg-card">
              {PERGUNTAS.map(({ p, r }) => (
                <details key={p} className="group p-4">
                  <summary className="cursor-pointer list-none font-medium">{p}<span className="float-right text-muted-foreground group-open:rotate-45">+</span></summary>
                  <p className="mt-2 text-sm text-muted-foreground">{r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16">
          <div className="mx-auto max-w-4xl rounded-3xl bg-primary px-6 py-10 text-center text-primary-foreground">
            <BookOpen className="mx-auto size-8 opacity-80" />
            <h2 className="mt-3 font-display text-3xl font-semibold">Pronta para organizar sua confeitaria?</h2>
            <p className="mx-auto mt-2 max-w-xl opacity-90">Comece hoje e veja seus pedidos, custos e lucro de forma clara já na primeira semana.</p>
            <Chamada className="mt-6 bg-background text-foreground hover:bg-background/90" />
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} {NOME_PLATAFORMA}</p>
        <p className="mt-2 flex justify-center gap-4">
          <Link to="/termos" className="hover:underline">Termos de uso</Link>
          <Link to="/privacidade" className="hover:underline">Privacidade</Link>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="hover:underline">Fale conosco</a>}
        </p>
      </footer>
    </div>
  );
}
