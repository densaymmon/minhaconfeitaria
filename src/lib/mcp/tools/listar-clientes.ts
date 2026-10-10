import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'listar_clientes', title: 'Consultar clientes',
  description: 'Consulta clientes cadastrados pelo proprietário.',
  inputSchema: { limite: z.number().int().min(1).max(100).default(50), deslocamento: z.number().int().min(0).max(10000).default(0) },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async ({ limite, deslocamento }, ctx) => {
    const db = supabaseForUser(ctx);
    let query = db.from('clientes').select('id,nome,telefone,endereco,observacoes').order('nome').order('id').range(deslocamento, deslocamento + limite - 1);
    const { data, error } = await query;
    if (error) throw new ToolError('Não foi possível consultar os registros.');
    return { content: [{ type: 'text', text: JSON.stringify({ registros: data ?? [], limite, deslocamento }) }] };
  },
});
