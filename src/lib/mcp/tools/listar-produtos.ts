import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { supabaseForUser } from '../supabase';

export default defineTool({
  name: 'listar_produtos', title: 'Consultar produtos e receitas',
  description: 'Consulta preços, rendimento e ingredientes das receitas do proprietário.',
  inputSchema: { limite: z.number().int().min(1).max(100).default(50), deslocamento: z.number().int().min(0).max(10000).default(0) },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async ({ limite, deslocamento }, ctx) => {
    const db = supabaseForUser(ctx);
    let query = db.from('produtos').select('id,nome,categoria,rendimento,custo_gas,custo_energia,custo_mao_obra,preco_venda,margem_desejada,modo_preparo,ativo,receita_itens(insumo_id,quantidade,insumos(nome,tipo,unidade,preco_unidade))').order('nome').order('id').range(deslocamento, deslocamento + limite - 1);
    const { data, error } = await query;
    if (error) throw new ToolError('Não foi possível consultar os registros.');
    return { content: [{ type: 'text', text: JSON.stringify({ registros: data ?? [], limite, deslocamento }) }] };
  },
});
