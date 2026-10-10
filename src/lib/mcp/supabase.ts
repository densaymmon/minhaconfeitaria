import { createClient } from '@supabase/supabase-js';
import { ToolError, type ToolContext } from '@lovable.dev/mcp-js';
import type { Database } from '@/integrations/supabase/types';

function env(name: string) { return process.env[name]?.trim(); }
function projectUrl() {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL') ?? import.meta.env['VITE_SUPABASE_URL'];
  if (!url) throw new ToolError('Serviço de dados indisponível.');
  return url;
}
function publishableKey() {
  const direct = env('SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (direct) return direct;
  const keyset = env('SUPABASE_PUBLISHABLE_KEYS');
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const key = Object.values(parsed).find((v): v is string => typeof v === 'string' && v.startsWith('sb_publishable_'));
        if (key) return key;
      }
    } catch { /* Try legacy public key. */ }
  }
  const key = env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY') ?? import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!key) throw new ToolError('Serviço de dados indisponível.');
  return key;
}
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!ctx.isAuthenticated() || !token) throw new ToolError('Faça login para consultar os dados.');
  return createClient<Database>(projectUrl(), publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
