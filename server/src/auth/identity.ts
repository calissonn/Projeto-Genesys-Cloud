/**
 * Identificação do usuário.
 *
 * - proxy (produção): a autenticação corporativa (SSO/OIDC, ex.: Microsoft Entra ID) é feita por um
 *   proxy de autenticação (ex.: oauth2-proxy) na frente do backend. O proxy envia o e-mail do
 *   usuário em um cabeçalho e um segredo compartilhado; requisições sem o segredo são recusadas.
 *   O usuário precisa estar cadastrado e ativo (exceto o administrador inicial).
 * - dev (desenvolvimento/testes): cabeçalho X-Dev-User com o e-mail. Proibido em produção.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { ServerConfig } from '../config.js';
import type { Db } from '../db/pool.js';
import type { AppUser, Profile } from './rbac.js';

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
  }
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function identify(req: FastifyRequest, db: Db, cfg: ServerConfig): Promise<AppUser> {
  const h = (name: string) => {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  let email: string | undefined;
  let displayName: string | undefined;
  if (cfg.auth.mode === 'proxy') {
    if (cfg.auth.proxySecret && !safeEq(h('x-proxy-secret') ?? '', cfg.auth.proxySecret)) {
      throw new AuthError('Requisição não originada do proxy de autenticação.', 401);
    }
    email = h(cfg.auth.emailHeader);
    displayName = h(cfg.auth.nameHeader);
  } else {
    email = h('x-dev-user') ?? cfg.auth.devDefaultUser ?? undefined;
  }
  if (!email) throw new AuthError('Usuário não autenticado.', 401);
  email = email.trim().toLowerCase();

  let r = await db.query<{ id: string; email: string; name: string; profile: Profile; active: boolean }>(
    `SELECT id, email, name, profile, active FROM app_user WHERE email = $1`, [email]);
  if (!r.rowCount && cfg.bootstrapAdminEmail && email === cfg.bootstrapAdminEmail) {
    // Primeiro acesso do administrador inicial.
    await db.query(`INSERT INTO app_user (id, email, name, profile) VALUES ($1,$2,$3,'admin') ON CONFLICT (email) DO NOTHING`, [`u-${Date.now().toString(36)}`, email, displayName ?? email]);
    r = await db.query(`SELECT id, email, name, profile, active FROM app_user WHERE email = $1`, [email]);
  }
  const u = r.rows[0];
  if (!u) throw new AuthError('Usuário sem cadastro no Gazin URA Intelligence. Solicite acesso a um administrador.', 403);
  if (!u.active) throw new AuthError('Usuário inativo.', 403);
  const deps = await db.query<{ department_id: string }>(`SELECT department_id FROM user_department WHERE user_id = $1`, [u.id]);
  db.query(`UPDATE app_user SET last_login = now() WHERE id = $1 AND (last_login IS NULL OR last_login < now() - interval '5 minutes')`, [u.id]).catch(() => undefined);
  return { id: u.id, email: u.email, name: u.name, profile: u.profile, departments: deps.rows.map((d) => d.department_id) };
}
