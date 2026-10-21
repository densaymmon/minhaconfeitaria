import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { BookOpen, CakeSlice, ChartNoAxesCombined, ChefHat, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingCart, Users, Wallet, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

const nav = [
  { to: "/painel", label: "Painel", icon: LayoutDashboard },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/producao", label: "Produção", icon: ChefHat },
  { to: "/clientes", label: "Clientes", icon: Users },
] as const;

const maisLinks = [
  { to: "/produtos", label: "Produtos e receitas", icon: BookOpen },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/configuracoes", label: "Taxas e configurações", icon: Settings },
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

  useEffect(() => {
    if (!maisAberto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMaisAberto(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [maisAberto]);

  async function sair() {
    setMaisAberto(false);
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
              <span>{label}</span>
            </Link>
          ))}
        </div>
        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gestão</p>
          <div className="space-y-1">
            {maisLinks.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} onClick={close} className={linkClass(false)} activeProps={{ className: linkClass(true) }}>
                <Icon className="size-5 shrink-0" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compras e estoque</p>
          <div className="space-y-1">
            {comprasLinks.map(({ secao, label, icon: Icon }) => (
              <Link key={secao} to="/compras" search={{ secao }} onClick={close} className={linkClass(false)}>
                <Icon className="size-5 shrink-0" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card/95 px-4 py-5 backdrop-blur lg:flex">
        <Link to="/painel" className="mb-8 flex items-center gap-3 rounded-xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <CakeSlice className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-lg font-semibold leading-tight text-foreground">Doce Gestão</span>
            <span className="block text-xs text-muted-foreground">Gestão da confeitaria</span>
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
          <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground" role="status">Carregando...</div>}>
            <Outlet />
          </Suspense>
        </main>

        <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto grid max-w-2xl grid-cols-5">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" activeProps={{ className: "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" }}>
                <Icon className="size-5" />
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
