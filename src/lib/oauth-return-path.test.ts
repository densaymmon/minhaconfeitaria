import { describe, expect, it } from 'vitest';
import { oauthReturnPath } from './oauth-return-path';
describe('OAuth return paths', () => {
  it('preserves consent query and fragment', () => {
    expect(oauthReturnPath('/.lovable/oauth/consent?authorization_id=abc#confirm')).toBe('/.lovable/oauth/consent?authorization_id=abc#confirm');
  });
  it('rejects unsafe redirects', () => {
    for (const path of [undefined, 'https://outside.invalid', '//outside.invalid', '/\\outside.invalid', '/\noutside.invalid', '/%2f%2foutside.invalid']) {
      const actual = oauthReturnPath(path);
      if (path === '/%2f%2foutside.invalid') expect(actual).toBe(path);
      else expect(actual).toBe('/');
    }
  });
});
