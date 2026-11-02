/**
 * Cliente da API do backend Gazin URA Intelligence.
 * A autenticação é feita pelo proxy corporativo (cookies/cabeçalhos do SSO); o front-end
 * nunca recebe nem armazena credenciais da Genesys.
 */
export const BACKEND = import.meta.env.VITE_DATA_SOURCE === 'backend';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor do Gazin URA Intelligence.', 0);
  }
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'erro' in data ? String(data.erro) : `Erro HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const enc = encodeURIComponent;
