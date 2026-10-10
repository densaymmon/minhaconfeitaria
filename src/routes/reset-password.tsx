import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nova senha — Doce Gestão" },
      { name: "description", content: "Defina uma nova senha de acesso." },
      { property: "og:title", content: "Nova senha — Doce Gestão" },
      { property: "og:description", content: "Defina uma nova senha de acesso." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return toast.error("Use pelo menos 8 caracteres.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada!");
    navigate({ to: "/painel" });
  }
  return (
    <div className="min-h-screen bg-hero px-5 py-16">
      <form onSubmit={salvar} className="mx-auto max-w-sm space-y-4 rounded-2xl bg-card p-5 shadow-soft">
        <h1 className="text-xl font-semibold">Definir nova senha</h1>
        <Field label="Nova senha">
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11" autoComplete="new-password" />
        </Field>
        <Button className="h-11 w-full" disabled={loading}>Salvar</Button>
      </form>
    </div>
  );
}
