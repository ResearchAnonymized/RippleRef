/** Direct Java backend URLs — bypass Next.js rewrites for long-running requests. */

export function backendApiPort(): string {
  return process.env.NEXT_PUBLIC_API_PORT || '8084';
}

/** In the browser, call the Java server directly (CORS enabled). SSR uses `/api` proxy. */
export function backendDirectApiBase(): string {
  if (typeof window === 'undefined') return '/api';
  return `http://127.0.0.1:${backendApiPort()}/api`;
}

export function backendDirectUrl(apiPath: string): string {
  const base = backendDirectApiBase();
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${base}${path}`;
}
