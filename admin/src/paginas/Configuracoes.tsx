import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { configQ, planosQ } from "../dados";
import { erroAmigavel, supabase } from "../supabase";
import { Campo, Cartao, Selecao, Titulo } from "../ui";

export function PaginaConfiguracoes() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery(configQ);
  const { data: planos = [] } = useQuery(planosQ);
  const [f, setF] = useState({
    cadastro_aberto: false, aprovacao_manual: true, empresa_nome: "", empresa_documento: "", contato_email: "", contato_whatsapp: "",
    dias_teste: "14", dias_tolerancia: "7", plano_teste: "vitrine",
  });
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!config) return;
    setF({
      cadastro_aberto: config.cadastro_aberto, aprovacao_manual: config.aprovacao_manual,
      empresa_nome: config.empresa_nome ?? "", empresa_documento: config.empresa_documento ?? "",
      contato_email: config.contato_email ?? "", contato_whatsapp: config.contato_whatsapp ?? "",
      dias_teste: String(config.dias_teste), dias_tolerancia: String(config.dias_tolerancia), plano_teste: config.plano_teste,
    });
  }, [config]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (f.contato_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contato_email.trim())) return void toast.error("Confira o e-mail de contato.");
    if (f.cadastro_aberto && !f.contato_email.trim() && !f.contato_whatsapp.trim()) return void toast.error("Antes de abrir o cadastro, informe um e-mail ou WhatsApp de contato: ele aparece para as confeitarias e nos termos.");
    setSalvando(true);
    const { error } = await supabase.rpc("admin_salvar_plataforma", { p: { ...f, dias_teste: Number(f.dias_teste), dias_tolerancia: Number(f.dias_tolerancia) } });
    setSalvando(false);
    if (error) return void toast.error(erroAmigavel(error));
    await qc.invalidateQueries({ queryKey: ["admin"] });
    toast.success("Configurações salvas.");
  }

  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando…</p>;
  return (
    <>
      <Titulo titulo="Configurações" subtitulo="Cadastro de novas confeitarias, teste grátis, cobrança e dados da plataforma" />
      <form onSubmit={salvar} className="max-w-2xl space-y-4">
        <Cartao className="space-y-3">
          <h2 className="font-semibold">Novas confeitarias</h2>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span><span className="block text-sm font-medium">Cadastro aberto</span><span className="block text-xs text-muted-foreground">Mostra "Criar conta" na tela de entrada do sistema das confeitarias.</span></span>
            <Switch checked={f.cadastro_aberto} onCheckedChange={(v) => setF({ ...f, cadastro_aberto: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span><span className="block text-sm font-medium">Liberar novas contas manualmente</span><span className="block text-xs text-muted-foreground">A conta nova espera você liberar em Empresas. O teste grátis começa na liberação.</span></span>
            <Switch checked={f.aprovacao_manual} onCheckedChange={(v) => setF({ ...f, aprovacao_manual: v })} />
          </label>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="font-semibold">Teste grátis e cobrança</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Dias de teste grátis"><Input inputMode="numeric" value={f.dias_teste} onChange={(e) => setF({ ...f, dias_teste: e.target.value })} className="h-10" /></Campo>
            <Campo rotulo="Plano do teste">
              <Selecao value={f.plano_teste} onChange={(e) => setF({ ...f, plano_teste: e.target.value })}>
                {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Tolerância após o vencimento" dica="Dias corridos até suspender o acesso"><Input inputMode="numeric" value={f.dias_tolerancia} onChange={(e) => setF({ ...f, dias_tolerancia: e.target.value })} className="h-10" /></Campo>
          </div>
          <p className="text-xs text-muted-foreground">Durante a tolerância, a confeitaria usa normalmente e vê um aviso. Depois dela, o acesso e o catálogo ficam suspensos até você registrar o pagamento.</p>
        </Cartao>

        <Cartao className="space-y-3">
          <h2 className="font-semibold">Responsável e contato</h2>
          <p className="text-xs text-muted-foreground">Aparecem nos termos de uso, na política de privacidade e nos avisos de plano para as confeitarias. O WhatsApp é usado nos botões "Assinar", "Pagar" e "Mudar de plano".</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome ou razão social"><Input maxLength={120} value={f.empresa_nome} onChange={(e) => setF({ ...f, empresa_nome: e.target.value })} className="h-10" /></Campo>
            <Campo rotulo="CPF ou CNPJ"><Input maxLength={30} value={f.empresa_documento} onChange={(e) => setF({ ...f, empresa_documento: e.target.value })} className="h-10" /></Campo>
            <Campo rotulo="E-mail de contato"><Input type="email" maxLength={120} value={f.contato_email} onChange={(e) => setF({ ...f, contato_email: e.target.value })} className="h-10" /></Campo>
            <Campo rotulo="WhatsApp de contato"><Input type="tel" maxLength={30} placeholder="(19) 99999-9999" value={f.contato_whatsapp} onChange={(e) => setF({ ...f, contato_whatsapp: e.target.value })} className="h-10" /></Campo>
          </div>
        </Cartao>
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={salvando}>{salvando ? "Salvando…" : "Salvar configurações"}</Button>
      </form>
    </>
  );
}
