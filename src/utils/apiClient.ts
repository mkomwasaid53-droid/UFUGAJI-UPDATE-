/**
 * Ufugaji Update — Production API Client & Error Normalizer
 *
 * Guarantees:
 * 1. Consistent API base URL strategy across environments.
 * 2. Strict Content-Type inspection before parsing JSON.
 * 3. Human-readable Swahili error diagnostics if an unexpected HTML response is received
 *    (e.g., when an API route falls through to index.html on misconfigured hosting).
 * 4. Preservation of original HTTP status codes and error payloads.
 */

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  contentType: string;
}

/**
 * Returns the configured API base URL.
 * Defaults to relative '' so requests go to the current host origin (/api/**).
 * Respects VITE_API_BASE_URL if explicitly set in deployment environment.
 */
export function getApiBaseUrl(): string {
  try {
    const metaEnv = typeof (import.meta as any) !== 'undefined' ? (import.meta as any)?.env : undefined;
    if (metaEnv?.VITE_API_BASE_URL) {
      return String(metaEnv.VITE_API_BASE_URL).replace(/\/+$/, '');
    }
  } catch {}
  return '';
}


/**
 * Safely parses any fetch Response, checking Content-Type before reading JSON.
 * Completely eliminates "Unexpected token '<', '<!doctype ... is not valid JSON'" errors.
 */
export async function parseApiResponse<T = any>(res: Response): Promise<ApiResponse<T>> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const status = res.status;

  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data?.error || data?.message || `Seva imerejesha hitilafu (HTTP ${status}).`;
        return { ok: false, status, data, error: errorMsg, contentType };
      }
      return { ok: true, status, data, error: null, contentType };
    } catch {
      return {
        ok: false,
        status,
        data: null,
        error: `Hitilafu ya kusoma muundo wa JSON kutoka kwenye seva (HTTP ${status}).`,
        contentType
      };
    }
  }

  // Received non-JSON response (e.g. HTML from unrouted SPA index.html or reverse proxy 502/504)
  const rawText = await res.text().catch(() => '');
  const isHtml = contentType.includes('text/html') || rawText.trim().startsWith('<');

  let errorMsg = `Seva imerejesha jibu lisilo la JSON (HTTP ${status}).`;
  if (isHtml) {
    errorMsg = `Huduma ya seva (API) haipatikani kwa sasa au njia imeelekezwa kwenye ukurasa wa wavuti badala ya seva (HTTP ${status}). Tafadhali hakikisha seva ya nyuma inafanya kazi.`;
  }

  return {
    ok: false,
    status,
    data: null,
    error: errorMsg,
    contentType
  };
}

/**
 * Robust fetch wrapper that guarantees structured JSON or a clean Swahili error exception.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${cleanEndpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(fullUrl, { ...options, headers });
  } catch (networkErr: any) {
    console.error(`[apiFetch Network Error] ${fullUrl}:`, networkErr);
    throw new Error(
      `Imeshindikana kuunganishwa na seva (${networkErr?.message || 'Hitilafu ya mtandao'}). Tafadhali angalia mtandao wako.`
    );
  }

  const parsed = await parseApiResponse<T>(res);
  if (!parsed.ok) {
    const customErr = new Error(parsed.error || `Hitilafu ya seva (HTTP ${parsed.status})`);
    (customErr as any).status = parsed.status;
    (customErr as any).statusCode = parsed.status;
    (customErr as any).data = parsed.data;
    throw customErr;
  }

  return parsed.data as T;
}
