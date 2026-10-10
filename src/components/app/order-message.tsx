import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Sparkles, Check, X } from 'lucide-react';
import { extractOrderDraft } from '@/lib/order-draft.functions';
import type { OrderDraft } from '@/lib/order-draft';
import { dataBR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, Field } from './ui';

export function OrderMessage({ onApply }: { onApply: (draft: OrderDraft) => void }) {
  const extract = useServerFn(extractOrderDraft);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  async function generate() {
    setBusy(true); setError(null); setDraft(null);
    try {
      const result = await extract({ data: { mensagem: message } });
      if (!result.ok) setError(result.error);
      else setDraft(result.draft);
    } catch { setError('Não foi possível interpretar a mensagem. Confira seu login e tente novamente.'); }
    finally { setBusy(false); }
  }
  if (!open) return <Button variant="outline" className="mb-4 h-11 w-full" onClick={() => setOpen(true)}><Sparkles /> Rascunho pela mensagem</Button>;
  return <Card className="mb-4 space-y-4">
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Mensagem do cliente</h2><Button variant="ghost" size="icon" disabled={busy} aria-label="Fechar mensagem" onClick={() => setOpen(false)}><X /></Button></div>
    <Field label="Mensagem da encomenda"><Textarea aria-label="Mensagem da encomenda" rows={5} maxLength={6000} value={message} disabled={busy} onChange={e => { setMessage(e.target.value); setDraft(null); setError(null); }} placeholder="Olá! Quero 2 bolos de cenoura, sem cobertura, para amanhã às 15h." /></Field>
    <p className="text-xs text-muted-foreground">Lovable AI consome créditos por uso. A mensagem será enviada para interpretação.</p>
    <Button disabled={busy || message.trim().length < 5} onClick={generate} className="h-11 w-full"><Sparkles /> {busy ? 'Interpretando mensagem…' : 'Gerar rascunho'}</Button>
    {busy && <p role="status" className="text-sm text-muted-foreground">Aguardando interpretação…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {draft && <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Revisão do rascunho</h3>
      <ul className="divide-y">{draft.itens.map((item, index) => <li key={index} className="py-2 text-sm"><div className="font-medium">{item.quantidade ?? 'Quantidade a confirmar'}{item.quantidade ? ' × ' : ' · '}{item.produto}</div>{item.personalizacao && <p className="mt-1 text-muted-foreground">{item.personalizacao}</p>}</li>)}</ul>
      <p className="text-sm">Entrega: {draft.data_desejada ? dataBR(draft.data_desejada) : 'A confirmar'}{draft.horario ? ` às ${draft.horario}` : ''}</p>
      {draft.observacoes && <p className="whitespace-pre-wrap text-sm">{draft.observacoes}</p>}
      {draft.duvidas.length > 0 && <ul className="list-inside list-disc text-sm text-warning-foreground">{draft.duvidas.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      <Button className="h-11 w-full" onClick={() => { onApply(draft); }}><Check /> Usar no pedido</Button>
    </section>}
  </Card>;
}
