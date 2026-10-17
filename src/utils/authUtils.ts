/**
 * Auth & Token Safety Utilities
 *
 * Guarantees safe extraction of ID tokens across both real Firebase User objects
 * and deserialized mock/admin sessions stored in localStorage.
 */

export async function getSafeIdToken(user: any): Promise<string> {
  if (!user) return '';
  if (typeof user.getIdToken === 'function') {
    try {
      const token = await user.getIdToken();
      return typeof token === 'string' ? token : '';
    } catch {
      return '';
    }
  }
  return '';
}
