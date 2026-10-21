import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { BookOpen, CakeSlice, ChartNoAxesCombined, ChefHat, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, Package, Settings, ShoppingCart, Users, X, Wallet } from "lucide-react";
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
  { to: "/mais", label: "Mais", icon: Menu },
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

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-4 pt-5 pb-safe">
        <Suspense fallback={<div className="py-20 text-center text-sm text-muted-foreground">Carregando...</div>}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {nav.map(({ to, label, icon: Icon }) => (
            to === "/mais" ? (
              <button
                key={to}
                type="button"
                onClick={() => setMaisAberto(true)}
                aria-label="Abrir menu Mais"
                aria-expanded={maisAberto}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${maisAberto ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ) : (
              <Link
                key={to}
                to={to}
                className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
                activeProps={{ className: "text-primary" }}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            )
          ))}
        </div>
      </nav>

      {maisAberto && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Fechar menu Mais"
            onClick={() => setMaisAberto(false)}
            className="absolute inset-0 h-full w-full bg-black/40"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu Mais"
            className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col overflow-y-auto bg-background px-5 pb-safe shadow-2xl animate-in slide-in-from-left duration-200"
          >
            <div className="flex items-center justify-between border-b py-5">
              <h2 className="text-xl font-semibold">Mais</h2>
              <button
                type="button"
                onClick={() => setMaisAberto(false)}
                aria-label="Fechar menu"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 border-b py-5">
              <CakeSlice className="size-8 shrink-0 text-primary" />
              <div className="min-w-0">
                <h3 className="font-semibold">Doce Gestão</h3>
                <p className="break-all text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="divide-y">
              {maisLinks.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} onClick={() => setMaisAberto(false)} className="flex items-center gap-3 py-4 font-medium">
                  <Icon className="size-5 shrink-0 text-primary" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              ))}
            </div>

            <div className="mt-3 border-t pt-3">
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Compras e estoque</h3>
              <div className="divide-y">
                {comprasLinks.map(({ secao, label, icon: Icon, description }) => (
                  <Link key={secao} to="/compras" search={{ secao }} onClick={() => setMaisAberto(false)} className="flex items-center gap-3 py-3">
                    <Icon className="size-5 shrink-0 text-primary" />
                    <span className="flex-1">
                      <span className="block font-medium">{label}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </div>

            <button type="button" onClick={sair} className="mt-6 mb-5 flex h-11 w-full items-center justify-center gap-2 rounded-md border text-sm font-medium hover:bg-muted">
              <LogOut className="size-4" />
              Sair da conta
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
