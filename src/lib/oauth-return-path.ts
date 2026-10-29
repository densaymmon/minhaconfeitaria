export function oauthReturnPath(value: unknown): string {
  // Os caracteres de controle são rejeitados de propósito (segurança do caminho de retorno).
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  const origin = 'https://app.invalid';
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname.startsWith('//')) return '/';
    return target.pathname + target.search + target.hash;
  } catch { return '/'; }
}
