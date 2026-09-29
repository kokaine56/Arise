/**
 * The HTTP client for the Arise API.
 *
 * Same-origin by default, so there is no base URL to configure and no CORS to
 * work around: in production the browser talks to the process serving the page,
 * and in development Vite proxies `/api` to the local server.
 *
 * Every non-2xx response becomes an `ApiError` carrying the status and the
 * server's own code, which `lib/errors.ts` turns into an `AppError`. Services
 * never see a raw `Response`.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Base path. Overridable only for tests, which point it at an ephemeral port;
 * nothing in the app should need to change it.
 */
let basePath = '/api';

export const setApiBasePath = (path: string): void => {
  basePath = path;
};

interface ErrorBody {
  error?: { code?: string; message?: string };
}

const readError = async (response: Response): Promise<ApiError> => {
  let code = 'unknown';
  let message = `Request failed with ${response.status}.`;

  try {
    const body = (await response.json()) as ErrorBody;
    if (typeof body.error?.code === 'string') code = body.error.code;
    if (typeof body.error?.message === 'string') message = body.error.message;
  } catch {
    // A non-JSON error body (a proxy timeout page, say) leaves the defaults.
  }

  return new ApiError(response.status, code, message);
};

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${basePath}${path}`, {
      method,
      // Send credentials so the API keeps working unchanged if a session is
      // added later; harmless without one.
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    // fetch only rejects on a transport failure, so this is "server not
    // reachable" rather than any kind of application error.
    throw new ApiError(0, 'network', cause instanceof Error ? cause.message : 'Network failure');
  }

  if (!response.ok) throw await readError(response);

  // 204 No Content, which every DELETE returns.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
};

export const api = {
  get: <T>(path: string): Promise<T> => request<T>('GET', path),
  post: <T>(path: string, body: unknown): Promise<T> => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown): Promise<T> => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown): Promise<T> => request<T>('PATCH', path, body),
  delete: <T>(path: string): Promise<T> => request<T>('DELETE', path),
};

/** Build a query string, dropping empty values so URLs stay readable. */
export const queryString = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const encoded = search.toString();
  return encoded === '' ? '' : `?${encoded}`;
};
