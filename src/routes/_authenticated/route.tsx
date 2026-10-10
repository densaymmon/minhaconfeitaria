import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { ChefHat, ClipboardList, LayoutDashboard, Menu, Users } from "lucide-react";
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

function Layout() {
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
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
