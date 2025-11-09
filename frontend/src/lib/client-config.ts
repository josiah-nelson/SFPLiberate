export type ClientRuntimeConfig = {
  endpoint?: string;
  projectId?: string;
  authEnabled?: boolean;
};

let cachedConfig: ClientRuntimeConfig | null = null;

export async function getBrowserClientConfig(): Promise<ClientRuntimeConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserClientConfig must be called in the browser');
  }

  if (cachedConfig) return cachedConfig;

  // Prefer inline config injected by SSR (layout)
  const inline: any = (globalThis as any).__APPWRITE_CONFIG__;
  if (inline && (inline.endpoint || inline.projectId)) {
    cachedConfig = inline as ClientRuntimeConfig;
    return cachedConfig as ClientRuntimeConfig;
  }

  // No route fallback; inline config is required in Appwrite mode.
  cachedConfig = {};
  return cachedConfig;
}
