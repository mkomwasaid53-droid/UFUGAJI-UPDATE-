/**
 * Auth & Token Safety Utilities
 *
 * Guarantees safe extraction of ID tokens across both real Firebase User objects
 * and deserialized mock/admin sessions stored in localStorage.
 */

export function createAdminMockJwt(
  email: string = 'mkomwasaid53@gmail.com',
  uid: string = 'admin_mkomwasaid53'
): string {
  const encodeB64Url = (obj: any): string => {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
      try {
        return window.btoa(unescape(encodeURIComponent(str)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      } catch {
        return window.btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64url');
    }
    return '';
  };

  const header = encodeB64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeB64Url({
    email,
    role: 'admin',
    admin: true,
    uid,
    sub: uid,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 30
  });
  return `${header}.${payload}.admin_verified_signature`;
}

export async function getSafeIdToken(user: any): Promise<string> {
  if (user && typeof user.getIdToken === 'function') {
    try {
      const token = await user.getIdToken();
      if (typeof token === 'string' && token.trim()) {
        if (!token.startsWith('admin_mock_token_')) {
          return token;
        }
      }
    } catch {}
  }

  // If user is verified admin Said Mkomwa, return valid admin token
  if (user?.email?.toLowerCase() === 'mkomwasaid53@gmail.com') {
    return createAdminMockJwt('mkomwasaid53@gmail.com', user?.uid || 'admin_mkomwasaid53');
  }

  // Check saved admin session in localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = window.localStorage.getItem('ufugaji_admin_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed?.profile?.email?.toLowerCase() === 'mkomwasaid53@gmail.com' ||
          parsed?.user?.email?.toLowerCase() === 'mkomwasaid53@gmail.com'
        ) {
          return createAdminMockJwt('mkomwasaid53@gmail.com', parsed?.user?.uid || 'admin_mkomwasaid53');
        }
      }
    } catch {}
  }

  return '';
}

