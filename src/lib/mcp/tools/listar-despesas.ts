import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'listar_despesas', title: 'Consultar despesas',
  description: 'Consulta despesas do proprietário por período.',
  inputSchema: { limite: z.number().int().min(1).max(100).default(50), deslocamento: z.number().int().min(0).max(10000).default(0), inicio: z.iso.date().optional(), fim: z.iso.date().optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async ({ limite, deslocamento, inicio, fim }, ctx) => {
    if (inicio && fim && inicio > fim) throw new ToolError('A data inicial deve vir antes da data final.');
    const db = supabaseForUser(ctx);
    let query = db.from('despesas').select('id,data,descricao,categoria,valor').order('data').order('id').range(deslocamento, deslocamento + limite - 1);
    if (inicio) query = query.gte('data', inicio);
    if (fim) query = query.lte('data', fim);
    const { data, error } = await query;
    if (error) throw new ToolError('Não foi possível consultar os registros.');
    return { content: [{ type: 'text', text: JSON.stringify({ registros: data ?? [], limite, deslocamento }) }] };
  },
});
