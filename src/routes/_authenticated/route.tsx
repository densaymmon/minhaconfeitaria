import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Store, BookOpen, UsersRound, CakeSlice, ChartNoAxesCombined, ChefHat, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingCart, Users, Wallet, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { avancarPedidosDoDia, confeitariaQ, ehAdminQ, meuPapelQ, minhaAssinaturaQ } from "@/lib/queries";
import { NOME_PAPEL, paginaPermitidaAoPapel, recursoDaPagina, temRecurso } from "@/lib/assinatura";
import { AvisoAssinatura, RecursoBloqueado, TelaAssinaturaSuspensa, TelaContaAdmin } from "@/components/app/plano";
import { TERMOS_VERSAO } from "@/lib/termos";
import { AceiteTermos, TelaBloqueada, TelaPendente } from "@/components/app/acesso-conta";
import { supabase } from "@/integrations/supabase/client";
import { CarregandoTela } from "@/components/app/carregando";
import { desativarPush, registrarServiceWorker } from "@/lib/push-cliente";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sessão lida do aparelho (sem ida ao servidor a cada troca de tela).
    // O banco continua validando o token em toda consulta.
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: Layout,
});

const nav = [
  { to: "/painel", label: "Hoje", icon: LayoutDashboard },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/producao", label: "Produção", icon: ChefHat },
  { to: "/clientes", label: "Clientes", icon: Users },
] as const;

const maisLinks = [
  { to: "/produtos", label: "Produtos e receitas", icon: BookOpen },
  { to: "/catalogo", label: "Catálogo online", icon: Store },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/resumo-mes", label: "Resumo do mês", icon: ChartNoAxesCombined },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
  { to: "/equipe", label: "Equipe", icon: UsersRound },
] as const;

const comprasLinks = [
  { secao: "compras", label: "Compras de insumos", icon: Package, description: "Cadastrar e consultar compras" },
  { secao: "gastos", label: "Gastos e histórico de compras", icon: ShoppingCart, description: "Consultar gastos por período e compras registradas" },
  { secao: "integracao", label: "Conferência de integração", icon: ChartNoAxesCombined, description: "Conferir compras, financeiro e alertas" },
  { secao: "estoque", label: "Controle de estoque", icon: Package, description: "Saldo atual e contagem física" },
] as const;

function Layout() {
  const [maisAberto, setMaisAberto] = useState(false);
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Enquanto a conta aguarda liberação, confere a cada minuto.
  const { data: confeitaria } = useQuery({ ...confeitariaQ, refetchInterval: (q) => (q.state.data?.acesso === "pendente" ? 60_000 : false) });
  const { data: adminInfo } = useQuery(ehAdminQ);
  const admin = adminInfo === true;
  const { data: assinatura } = useQuery({ ...minhaAssinaturaQ, refetchInterval: 15 * 60_000 });
  const { data: meuPapel } = useQuery(meuPapelQ);
  const papel = meuPapel?.papel ?? "dono";
  const ehDono = papel === "dono";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Campos da migração 0038; antes dela nada é bloqueado.
  const temControleAcesso = Boolean(confeitaria && "acesso" in confeitaria);
  const acesso = temControleAcesso && !admin ? confeitaria?.acesso : "ativo";
  // Só pede o aceite depois de saber que a conta não é da administração (evita piscar a tela).
  // Termos e primeiros passos são da dona; quem é da equipe entra direto.
  const precisaAceitarTermos = temControleAcesso && adminInfo === false && ehDono && meuPapel !== undefined && confeitaria?.termos_versao !== TERMOS_VERSAO;
  const precisaComecar = temControleAcesso && acesso === "ativo" && ehDono && meuPapel !== undefined && !precisaAceitarTermos && !confeitaria?.onboarding_concluido_em;
  const novosCatalogo = useAlertaCatalogo((id) => void navigate({ to: "/pedidos/$id", params: { id } }));
  const nomeLoja = confeitaria?.nome?.trim() || "Gestão da confeitaria";
  const recursoPagina = recursoDaPagina(pathname);
  const recursoBloqueado = recursoPagina && !temRecurso(assinatura, recursoPagina) ? recursoPagina : null;
  const bloqueadoPeloPapel = !paginaPermitidaAoPapel(pathname, papel);
  const linksGestao = maisLinks.filter((l) => paginaPermitidaAoPapel(l.to, papel));
  const verCompras = paginaPermitidaAoPapel("/compras", papel);

  useEffect(() => {
    if (!maisAberto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMaisAberto(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [maisAberto]);

  // Passa para "em produção" os pedidos do dia (uma vez por dia; atualiza a lista se algo mudou).
  useEffect(() => {
    let ativo = true;
    const executar = (forcar: boolean) => void avancarPedidosDoDia(user.id, forcar).then((n) => { if (ativo && n > 0) void queryClient.invalidateQueries({ queryKey: ["pedidos"] }); });
    executar(false);
    const intervalo = window.setInterval(() => executar(true), 30 * 60_000);
    return () => { ativo = false; window.clearInterval(intervalo); };
  }, [user.id, queryClient]);

  // Service worker das notificações de pedido novo (não guarda páginas em cache).
  useEffect(() => { void registrarServiceWorker(); }, []);

  useEffect(() => {
    if (precisaComecar && pathname !== "/comecar") void navigate({ to: "/comecar", replace: true });
  }, [precisaComecar, pathname, navigate]);

  async function sair() {
    setMaisAberto(false);
    // Ao sair, este aparelho para de receber os avisos desta confeitaria.
    await desativarPush().catch(() => undefined);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }

  function linkClass(active: boolean) {
    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;
  }

  function MenuLinks({ close }: { close?: () => void }) {
    return (
      <>
        <div className="space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} onClick={close} className={linkClass(false)} activeProps={{ className: linkClass(true) }}>
              <Icon className="size-5 shrink-0" />
              <span className="flex-1">{label}</span>
              {to === "/pedidos" && novosCatalogo > 0 && <ContadorNovos total={novosCatalogo} />}
            </Link>
          ))}
        </div>
        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gestão</p>
          <div className="space-y-1">
            {linksGestao.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} onClick={close} className={linkClass(false)} activeProps={{ className: linkClass(true) }}>
                <Icon className="size-5 shrink-0" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
        {verCompras && <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compras e estoque</p>
          <div className="space-y-1">
            {comprasLinks.map(({ secao, label, icon: Icon }) => (
              <Link key={secao} to="/compras" search={{ secao }} onClick={close} className={linkClass(false)}>
                <Icon className="size-5 shrink-0" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>}
      </>
    );
  }

  // Conta de administração (sem confeitaria): o lugar dela é o painel separado.
  if (admin && confeitaria === null) return <TelaContaAdmin sair={() => void sair()} />;
  // Saiu ou foi removida da equipe e não tem confeitaria própria.
  if (!admin && adminInfo === false && confeitaria === null && meuPapel?.papel === "dono") return <TelaSemConfeitaria sair={() => void sair()} />;
  if (confeitaria && acesso === "bloqueado") return <TelaBloqueada sair={() => void sair()} />;
  if (confeitaria && acesso === "pendente") return <TelaPendente confeitaria={confeitaria} sair={() => void sair()} />;
  if (confeitaria && !admin && assinatura && (assinatura.situacao === "suspensa" || assinatura.situacao === "cancelada")) {
    return <TelaAssinaturaSuspensa assinatura={assinatura} sair={() => void sair()} />;
  }
  if (confeitaria && precisaAceitarTermos) return <AceiteTermos jaAceitou={Boolean(confeitaria.termos_versao)} sair={() => void sair()} />;

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card/95 px-4 py-5 backdrop-blur lg:flex">
        <Link to="/painel" className="mb-8 flex items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <CakeSlice className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg font-semibold leading-tight text-foreground">Doce Gestão</span>
            <span className="block truncate text-xs text-muted-foreground" title={nomeLoja}>{nomeLoja}</span>
          </span>
        </Link>
        <nav aria-label="Navegação principal" className="min-h-0 flex-1 overflow-y-auto">
          <MenuLinks />
        </nav>
        <div className="mt-4 border-t pt-4">
          <p className="mb-3 truncate px-3 text-xs text-muted-foreground" title={user.email ?? undefined}>{user.email}</p>
          <button type="button" onClick={sair} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <LogOut className="size-5" />
            Sair da conta
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link to="/painel" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <CakeSlice className="size-5" />
            </span>
            <span className="font-display text-lg font-semibold">Doce Gestão</span>
          </Link>
          <button type="button" onClick={() => setMaisAberto(true)} aria-label="Abrir menu Mais" aria-expanded={maisAberto} className="grid size-10 place-items-center rounded-xl border bg-card text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Menu className="size-5" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-safe pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8 lg:pt-8">
          <AvisoAssinatura />
          <Suspense fallback={<CarregandoTela />}>
            {bloqueadoPeloPapel ? <BloqueioPapel papel={NOME_PAPEL[papel]} /> : recursoBloqueado ? <RecursoBloqueado recurso={recursoBloqueado} /> : <Outlet />}
          </Suspense>
        </main>

        <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto grid max-w-2xl grid-cols-5">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" activeProps={{ className: "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" }}>
                <span className="relative">
                  <Icon className="size-5" />
                  {to === "/pedidos" && novosCatalogo > 0 && <ContadorNovos total={novosCatalogo} className="absolute -right-2.5 -top-1.5" />}
                </span>
                {label}
              </Link>
            ))}
            <button type="button" onClick={() => setMaisAberto(true)} aria-label="Abrir menu Mais" aria-expanded={maisAberto} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${maisAberto ? "text-primary" : "text-muted-foreground"}`}>
              <Menu className="size-5" />
              Mais
            </button>
          </div>
        </nav>
      </div>

      {maisAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fechar menu Mais" onClick={() => setMaisAberto(false)} className="absolute inset-0 h-full w-full bg-black/40" />
          <aside role="dialog" aria-modal="true" aria-label="Menu Mais" className="absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col overflow-y-auto bg-background px-5 pb-safe shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b py-5">
              <div className="flex items-center gap-2">
                <CakeSlice className="size-6 text-primary" />
                <h2 className="font-display text-xl font-semibold">Mais opções</h2>
              </div>
              <button type="button" onClick={() => setMaisAberto(false)} aria-label="Fechar menu" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-5" />
              </button>
            </div>
            <p className="break-all border-b py-4 text-sm text-muted-foreground">{user.email}</p>
            <nav aria-label="Mais opções" className="flex-1 py-3">
              <MenuLinks close={() => setMaisAberto(false)} />
            </nav>
            <button type="button" onClick={sair} className="mb-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <LogOut className="size-4" />
              Sair da conta
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function ContadorNovos({ total, className }: { total: number; className?: string }) {
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground ${className ?? ""}`} aria-label={`${total} pedido(s) novo(s) pelo catálogo`}>
      {total > 9 ? "9+" : total}
    </span>
  );
}

/** Toca um aviso curto. Navegadores só liberam som depois de uma interação na página. */
function tocarAlerta() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const inicio = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16);
      osc.start(inicio);
      osc.stop(inicio + 0.17);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    /* sem som neste aparelho */
  }
}

/**
 * Acompanha pedidos do catálogo ainda não abertos: contador no menu, título da aba,
 * aviso na tela e som quando chega um pedido novo (verifica a cada 30 segundos).
 */
function useAlertaCatalogo(abrir: (id: string) => void) {
  const { data: novos = [] } = useQuery({
    queryKey: ["pedidos-catalogo-novos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero, created_at")
        .eq("origem", "catalogo")
        .is("visualizado_em", null)
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(50);
      // Antes da migração 0034 a coluna não existe: sem alertas, sem quebrar o app.
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const conhecidos = useRef<Set<string> | null>(null);
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;

  useEffect(() => {
    const ids = new Set(novos.map((p) => p.id));
    if (conhecidos.current === null) {
      conhecidos.current = ids;
      if (novos.length > 0) toast.info(`Você tem ${novos.length} pedido(s) novo(s) pelo catálogo.`);
      return;
    }
    const anteriores = conhecidos.current;
    const chegaram = novos.filter((p) => !anteriores.has(p.id));
    conhecidos.current = ids;
    if (chegaram.length === 0) return;
    tocarAlerta();
    const primeiro = chegaram[0];
    if (!primeiro) return;
    toast.success(chegaram.length === 1 ? `Novo pedido #${primeiro.numero} pelo catálogo!` : `${chegaram.length} pedidos novos pelo catálogo!`, {
      duration: 15_000,
      action: { label: "Abrir", onClick: () => abrirRef.current(primeiro.id) },
    });
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification("Novo pedido pelo catálogo", { body: `Pedido #${primeiro.numero}`, tag: `pedido-${primeiro.id}` });
      }
    } catch {
      /* notificações indisponíveis */
    }
  }, [novos]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, "");
    document.title = novos.length > 0 ? `(${novos.length > 9 ? "9+" : novos.length}) ${base}` : base;
  }, [novos.length]);

  return novos.length;
}

function BloqueioPapel({ papel }: { papel: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <UsersRound className="mx-auto mb-3 size-10 text-muted-foreground" />
      <h1 className="font-display text-2xl font-semibold">Página fora do seu acesso</h1>
      <p className="mt-2 text-sm text-muted-foreground">Seu acesso na equipe é de <b>{papel}</b>. Esta parte do sistema fica com a dona ou a gerência da confeitaria.</p>
      <Link to="/painel" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Voltar para o Hoje</Link>
    </div>
  );
}

function TelaSemConfeitaria({ sair }: { sair: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-sm text-center">
        <UsersRound className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h1 className="font-display text-2xl font-semibold">Você não faz parte de uma confeitaria</h1>
        <p className="mt-2 text-sm text-muted-foreground">Seu acesso à equipe foi encerrado. Para voltar, peça um novo convite para a dona da confeitaria.</p>
        <button type="button" onClick={sair} className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border px-5 text-sm font-semibold">Sair</button>
      </div>
    </div>
  );
}
