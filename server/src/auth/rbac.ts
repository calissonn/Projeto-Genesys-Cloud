/** Perfis e permissões (controle de acesso por perfil). */
export type Profile = 'admin' | 'analista_cx' | 'supervisor' | 'gestor';

export type Permission =
  | 'metrics:read' | 'catalog:write' | 'users:manage' | 'goals:write' | 'rules:write'
  | 'occurrences:write' | 'tests:write' | 'changes:write' | 'audit:read'
  | 'integration:read' | 'integration:manage';

const MATRIX: Record<Profile, Permission[]> = {
  admin: ['metrics:read', 'catalog:write', 'users:manage', 'goals:write', 'rules:write', 'occurrences:write', 'tests:write', 'changes:write', 'audit:read', 'integration:read', 'integration:manage'],
  analista_cx: ['metrics:read', 'catalog:write', 'goals:write', 'rules:write', 'occurrences:write', 'tests:write', 'changes:write', 'audit:read', 'integration:read'],
  supervisor: ['metrics:read', 'occurrences:write', 'tests:write'],
  gestor: ['metrics:read', 'audit:read'],
};

export const PROFILE_LABEL: Record<Profile, string> = {
  admin: 'Administrador', analista_cx: 'Analista CX', supervisor: 'Supervisor', gestor: 'Gestor',
};

export interface AppUser {
  id: string;
  email: string;
  name: string;
  profile: Profile;
  /** Departamentos permitidos (somente supervisores são restritos). */
  departments: string[];
}

export function can(user: AppUser, p: Permission) {
  return MATRIX[user.profile].includes(p);
}

export function permissionsOf(profile: Profile) {
  return MATRIX[profile];
}

/** Supervisor vê apenas os departamentos atribuídos; os demais perfis veem todos. */
export function isScoped(user: AppUser) {
  return user.profile === 'supervisor';
}
