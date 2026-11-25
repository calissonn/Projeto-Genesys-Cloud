import type { P } from './types';

/* ------------------------------------------------------------------ Necessidades */

export type Need = 'fome' | 'energia' | 'higiene' | 'diversao' | 'social' | 'conforto' | 'bexiga';
export const NEEDS: { id: Need; name: string; icon: string }[] = [
  { id: 'fome', name: 'Fome', icon: '🍽' },
  { id: 'energia', name: 'Energia', icon: '⚡' },
  { id: 'higiene', name: 'Higiene', icon: '🧼' },
  { id: 'diversao', name: 'Diversão', icon: '🎈' },
  { id: 'social', name: 'Social', icon: '💬' },
  { id: 'conforto', name: 'Conforto', icon: '🛋' },
  { id: 'bexiga', name: 'Bexiga', icon: '🚻' },
];

/** Queda por hora de jogo (pontos de 0 a 100). */
export const NEED_DECAY: Record<Need, number> = {
  fome: 4.2, energia: 3.6, higiene: 3.0, diversao: 4.0, social: 3.0, conforto: 3.2, bexiga: 6.5,
};

export type Needs = Record<Need, number>;
export const fullNeeds = (): Needs => ({ fome: 85, energia: 85, higiene: 85, diversao: 75, social: 70, conforto: 80, bexiga: 85 });

/* ------------------------------------------------------------------ Idade */

export type AgeStage = 'bebe' | 'crianca' | 'adolescente' | 'jovem' | 'adulto' | 'idoso';
export const AGES: { id: AgeStage; name: string; days: number; height: number; head: number }[] = [
  { id: 'bebe', name: 'Bebê', days: 2, height: 0.62, head: 1.75 },
  { id: 'crianca', name: 'Criança', days: 6, height: 1.18, head: 1.32 },
  { id: 'adolescente', name: 'Adolescente', days: 6, height: 1.58, head: 1.08 },
  { id: 'jovem', name: 'Jovem adulto', days: 12, height: 1.72, head: 1 },
  { id: 'adulto', name: 'Adulto', days: 16, height: 1.72, head: 1 },
  { id: 'idoso', name: 'Idoso', days: Infinity, height: 1.66, head: 1 },
];
export const AGE_BY_ID = new Map(AGES.map((a) => [a.id, a]));
export const isAdult = (a: AgeStage) => a === 'jovem' || a === 'adulto' || a === 'idoso';
export const canWalk = (a: AgeStage) => a !== 'bebe';

/* ------------------------------------------------------------------ Aparência */

export const HAIR_STYLES = [
  { id: 'curto', name: 'Curto' }, { id: 'franja', name: 'Franja' }, { id: 'longo', name: 'Longo' },
  { id: 'rabo', name: 'Rabo de cavalo' }, { id: 'coque', name: 'Coque' }, { id: 'cacheado', name: 'Cacheado' },
  { id: 'black', name: 'Black power' }, { id: 'raspado', name: 'Raspado' }, { id: 'careca', name: 'Careca' },
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number]['id'];

export const TOPS = [
  { id: 'camiseta', name: 'Camiseta' }, { id: 'manga_longa', name: 'Manga longa' }, { id: 'regata', name: 'Regata' },
  { id: 'camisa', name: 'Camisa social' }, { id: 'moletom', name: 'Moletom' }, { id: 'vestido', name: 'Vestido' },
] as const;
export type TopStyle = (typeof TOPS)[number]['id'];

export const BOTTOMS = [
  { id: 'calca', name: 'Calça' }, { id: 'bermuda', name: 'Bermuda' }, { id: 'saia', name: 'Saia' }, { id: 'legging', name: 'Legging' },
] as const;
export type BottomStyle = (typeof BOTTOMS)[number]['id'];

export const ACCESSORIES = [
  { id: 'nenhum', name: 'Nenhum' }, { id: 'oculos', name: 'Óculos' }, { id: 'oculos_sol', name: 'Óculos de sol' },
  { id: 'chapeu', name: 'Chapéu' }, { id: 'bone', name: 'Boné' }, { id: 'brincos', name: 'Brincos' }, { id: 'colar', name: 'Colar' },
] as const;
export type Accessory = (typeof ACCESSORIES)[number]['id'];

export const SKIN_TONES = ['#f6d7c3', '#efc3a4', '#e0ac85', '#c98e66', '#a86f4c', '#8a5537', '#6b3f27', '#4c2c1b'];
export const HAIR_COLORS = ['#1b1512', '#3b2416', '#6a4127', '#9a6a3f', '#c9a063', '#e3c98d', '#b5452b', '#8d8d8d', '#e9e6e0', '#3b5ea8', '#b04d8c', '#3d8a63'];
export const EYE_COLORS = ['#3b2416', '#6a4127', '#3d6e4f', '#4a78a8', '#7a8a96', '#2b2b2b'];
export const CLOTH_COLORS = ['#f1ece3', '#1f1f22', '#3e6a9a', '#253f63', '#b5523b', '#8c2f2a', '#e0b84f', '#4f7a4a', '#2f4f3b', '#c76d8a', '#7d4e75', '#9fc6c5', '#b8b2a7', '#7a4b2a', '#e9c3b5', '#d6b48a'];

export interface Appearance {
  skin: string;
  height: number; // 0.85 .. 1.15
  build: number; // 0 magro .. 1 robusto
  faceWidth: number; // 0.85 .. 1.15
  jaw: number; // 0 .. 1
  eyeSize: number; // 0.8 .. 1.25
  eyeColor: string;
  nose: number; // 0.7 .. 1.4
  brows: number; // espessura 0.5 .. 1.6
  hair: HairStyle;
  hairColor: string;
  beard: boolean;
  top: TopStyle;
  topColor: string;
  bottom: BottomStyle;
  bottomColor: string;
  shoeColor: string;
  accessory: Accessory;
}

/* ------------------------------------------------------------------ Personalidade, aspirações, carreiras */

export type TraitId = 'alegre' | 'ativo' | 'preguicoso' | 'sociavel' | 'solitario' | 'romantico' | 'nerd' | 'glutao' | 'limpinho' | 'criativo' | 'familia' | 'ambicioso';
export const TRAITS: { id: TraitId; name: string; desc: string }[] = [
  { id: 'alegre', name: 'Alegre', desc: 'Humor sempre um pouco melhor.' },
  { id: 'ativo', name: 'Ativo', desc: 'Adora se exercitar e nadar.' },
  { id: 'preguicoso', name: 'Preguiçoso', desc: 'Cansa mais rápido e prefere descansar.' },
  { id: 'sociavel', name: 'Sociável', desc: 'Precisa conversar mais; ganha mais com interações.' },
  { id: 'solitario', name: 'Solitário', desc: 'Sente menos falta de companhia.' },
  { id: 'romantico', name: 'Romântico', desc: 'Interações românticas rendem mais.' },
  { id: 'nerd', name: 'Nerd', desc: 'Diverte-se lendo, estudando e no computador.' },
  { id: 'glutao', name: 'Glutão', desc: 'Sente fome mais rápido e adora cozinhar.' },
  { id: 'limpinho', name: 'Limpinho', desc: 'Higiene cai mais rápido; ama banhos.' },
  { id: 'criativo', name: 'Criativo', desc: 'Aprende criatividade mais rápido.' },
  { id: 'familia', name: 'Família', desc: 'Adora interagir com parentes e crianças.' },
  { id: 'ambicioso', name: 'Ambicioso', desc: 'Desempenho no trabalho cresce mais rápido.' },
];
export const TRAIT_BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

export type SkillId = 'logica' | 'culinaria' | 'fitness' | 'carisma' | 'criatividade';
export const SKILLS: { id: SkillId; name: string }[] = [
  { id: 'logica', name: 'Lógica' }, { id: 'culinaria', name: 'Culinária' }, { id: 'fitness', name: 'Condicionamento' },
  { id: 'carisma', name: 'Carisma' }, { id: 'criatividade', name: 'Criatividade' },
];

export interface CareerDef {
  id: string;
  name: string;
  titles: string[];
  /** Salário por hora em cada nível. */
  wage: number[];
  start: number;
  hours: number;
  skill?: SkillId;
  kids?: boolean;
}

export const CAREERS: CareerDef[] = [
  { id: 'nenhuma', name: 'Sem emprego', titles: ['—'], wage: [0], start: 0, hours: 0 },
  { id: 'arquitetura', name: 'Arquitetura', titles: ['Estagiário de projetos', 'Desenhista', 'Arquiteto júnior', 'Arquiteto', 'Arquiteto-chefe'], wage: [28, 42, 65, 95, 140], start: 9, hours: 8, skill: 'criatividade' },
  { id: 'tecnologia', name: 'Tecnologia', titles: ['Suporte técnico', 'Desenvolvedor júnior', 'Desenvolvedor', 'Engenheiro sênior', 'Diretor de tecnologia'], wage: [30, 48, 72, 105, 160], start: 9, hours: 8, skill: 'logica' },
  { id: 'saude', name: 'Saúde', titles: ['Atendente', 'Técnico de enfermagem', 'Enfermeiro', 'Médico residente', 'Médico especialista'], wage: [26, 40, 60, 98, 150], start: 7, hours: 8, skill: 'logica' },
  { id: 'gastronomia', name: 'Gastronomia', titles: ['Ajudante de cozinha', 'Cozinheiro', 'Sous-chef', 'Chef', 'Chef celebridade'], wage: [22, 34, 52, 80, 130], start: 11, hours: 8, skill: 'culinaria' },
  { id: 'educacao', name: 'Educação', titles: ['Monitor', 'Professor auxiliar', 'Professor', 'Coordenador', 'Diretor escolar'], wage: [22, 33, 48, 68, 95], start: 7, hours: 6, skill: 'carisma' },
  { id: 'esporte', name: 'Esportes', titles: ['Atleta amador', 'Atleta profissional', 'Titular', 'Capitão', 'Ídolo nacional'], wage: [20, 38, 60, 95, 150], start: 8, hours: 6, skill: 'fitness' },
  { id: 'artes', name: 'Artes', titles: ['Artista de rua', 'Ilustrador', 'Artista plástico', 'Artista renomado', 'Lenda das artes'], wage: [18, 30, 50, 85, 140], start: 10, hours: 6, skill: 'criatividade' },
  { id: 'escola', name: 'Escola', titles: ['Estudante'], wage: [0], start: 8, hours: 6, kids: true },
];
export const CAREER_BY_ID = new Map(CAREERS.map((c) => [c.id, c]));

export const ASPIRATIONS = [
  { id: 'familia', name: 'Família grande', desc: 'Ter 3 filhos.' },
  { id: 'fortuna', name: 'Fortuna', desc: 'Acumular R$ 1.000.000 em patrimônio.' },
  { id: 'carreira', name: 'Topo da carreira', desc: 'Chegar ao último nível da profissão.' },
  { id: 'social', name: 'Popularidade', desc: 'Ter 5 amigos.' },
  { id: 'conhecimento', name: 'Conhecimento', desc: 'Lógica no nível 10.' },
  { id: 'atleta', name: 'Corpo em forma', desc: 'Condicionamento no nível 10.' },
  { id: 'romance', name: 'Grande amor', desc: 'Casar-se.' },
] as const;
export type AspirationId = (typeof ASPIRATIONS)[number]['id'];

/* ------------------------------------------------------------------ Personagem */

export interface Moodlet {
  id: string;
  name: string;
  value: number;
  until: number; // minuto absoluto de jogo
}

export interface Sim {
  id: string;
  firstName: string;
  lastName: string;
  age: AgeStage;
  ageDays: number;
  look: Appearance;
  traits: TraitId[];
  aspiration: AspirationId;
  career: string;
  careerLevel: number;
  performance: number;
  skills: Record<SkillId, number>;
  needs: Needs;
  moodlets: Moodlet[];
  level: number;
  pos: P;
  rot: number;
  /** Visitante (não pertence à família). */
  visitor?: boolean;
  /** Minuto absoluto de partida do visitante. */
  leaveAt?: number;
  /** Minuto absoluto do nascimento de um bebê a caminho. */
  pregnantUntil?: number;
  away?: 'trabalho' | 'escola' | null;
  /** Dia em que já trabalhou (evita repetir o turno). */
  workedDay?: number;
}

export type RelKind = 'conjuge' | 'noivos' | 'namorados' | 'pai' | 'filho' | 'irmaos' | 'colegas' | 'amigos' | 'conhecidos';
export const REL_NAMES: Record<RelKind, string> = {
  conjuge: 'Cônjuges', noivos: 'Noivos', namorados: 'Namorados', pai: 'Pai/mãe de', filho: 'Filho(a) de',
  irmaos: 'Irmãos', colegas: 'Colegas de casa', amigos: 'Amigos', conhecidos: 'Conhecidos',
};

/** Relação dirigida a→b (a é "pai" de b, por exemplo). Amizade e romance são simétricos. */
export interface Relationship {
  a: string;
  b: string;
  kind: RelKind;
  amizade: number; // -100..100
  romance: number; // 0..100
}

export type PetKind = 'cachorro' | 'gato';
export interface Pet {
  id: string;
  name: string;
  kind: PetKind;
  color: string;
  needs: { fome: number; diversao: number; energia: number };
  level: number;
  pos: P;
  rot: number;
}

export interface Clock {
  /** Minutos de jogo desde o início (dia 0, 00:00). */
  minutes: number;
}

export interface LifeState {
  householdName: string;
  sims: Sim[];
  pets: Pet[];
  relationships: Relationship[];
  clock: Clock;
  /** Receitas menos despesas acumuladas na vida (salários, compras, festas). */
  cash: number;
  autonomy: boolean;
  aging: boolean;
  log: { t: number; text: string }[];
  partyUntil?: number;
}

export function newLife(name: string): LifeState {
  return {
    householdName: name, sims: [], pets: [], relationships: [], clock: { minutes: 8 * 60 }, cash: 0,
    autonomy: true, aging: true, log: [],
  };
}

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const dayOf = (min: number) => Math.floor(min / 1440);
export const hourOf = (min: number) => (min % 1440) / 60;
export const isWorkday = (min: number) => dayOf(min) % 7 < 5;
export function fmtClock(min: number) {
  const h = Math.floor(hourOf(min));
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ Geração aleatória */

const FIRST_F = ['Ana', 'Beatriz', 'Camila', 'Daniela', 'Eduarda', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Mariana', 'Natália', 'Olívia', 'Paula', 'Rafaela', 'Sofia', 'Valentina', 'Yasmin', 'Luana'];
const FIRST_M = ['André', 'Bruno', 'Caio', 'Diego', 'Eduardo', 'Felipe', 'Gustavo', 'Heitor', 'Igor', 'João', 'Lucas', 'Mateus', 'Nicolas', 'Otávio', 'Pedro', 'Rafael', 'Samuel', 'Thiago', 'Vinícius', 'Davi'];
export const LAST_NAMES = ['Silva', 'Souza', 'Oliveira', 'Costa', 'Pereira', 'Almeida', 'Ribeiro', 'Carvalho', 'Araújo', 'Mendes', 'Barros', 'Freitas', 'Moreira', 'Teixeira', 'Rocha', 'Nogueira', 'Lima', 'Campos'];

const pick = <T>(arr: readonly T[], r = Math.random) => arr[Math.floor(r() * arr.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function randomAppearance(feminine = Math.random() < 0.5): Appearance {
  const hairF: HairStyle[] = ['longo', 'rabo', 'coque', 'cacheado', 'black', 'franja', 'curto'];
  const hairM: HairStyle[] = ['curto', 'raspado', 'cacheado', 'black', 'franja', 'careca', 'curto'];
  return {
    skin: pick(SKIN_TONES), height: rnd(0.92, 1.08), build: rnd(0.15, 0.75), faceWidth: rnd(0.92, 1.08), jaw: rnd(feminine ? 0.1 : 0.4, feminine ? 0.5 : 0.9),
    eyeSize: rnd(0.9, 1.15), eyeColor: pick(EYE_COLORS), nose: rnd(0.85, 1.2), brows: rnd(0.7, 1.3),
    hair: pick(feminine ? hairF : hairM), hairColor: pick(HAIR_COLORS.slice(0, 7)), beard: !feminine && Math.random() < 0.3,
    top: feminine && Math.random() < 0.25 ? 'vestido' : pick(['camiseta', 'manga_longa', 'camisa', 'moletom', 'regata'] as TopStyle[]),
    topColor: pick(CLOTH_COLORS), bottom: feminine && Math.random() < 0.3 ? 'saia' : pick(['calca', 'bermuda', 'calca', 'legging'] as BottomStyle[]),
    bottomColor: pick(['#253f63', '#1f1f22', '#7a4b2a', '#b8b2a7', '#3e6a9a', '#2f4f3b']), shoeColor: pick(['#1f1f22', '#f1ece3', '#7a4b2a', '#b5523b']),
    accessory: Math.random() < 0.6 ? 'nenhum' : pick(ACCESSORIES.slice(1).map((a) => a.id)),
  };
}

export function blankSkills(): Record<SkillId, number> {
  return { logica: 0, culinaria: 0, fitness: 0, carisma: 0, criatividade: 0 };
}

let sid = 0;
export function newSimId() {
  sid = (sid + 1) % 1e6;
  return `sim${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${sid}`;
}

export function randomSim(opts: { lastName?: string; age?: AgeStage; feminine?: boolean } = {}): Sim {
  const fem = opts.feminine ?? Math.random() < 0.5;
  const age = opts.age ?? pick(['jovem', 'adulto', 'jovem', 'adulto', 'idoso'] as AgeStage[]);
  const traits = [...TRAITS].sort(() => Math.random() - 0.5).slice(0, 3).map((t) => t.id);
  return {
    id: newSimId(), firstName: pick(fem ? FIRST_F : FIRST_M), lastName: opts.lastName ?? pick(LAST_NAMES), age, ageDays: 0,
    look: randomAppearance(fem), traits, aspiration: pick(ASPIRATIONS).id,
    career: age === 'crianca' || age === 'adolescente' ? 'escola' : age === 'bebe' ? 'nenhuma' : pick(CAREERS.filter((c) => !c.kids)).id,
    careerLevel: 0, performance: 0, skills: blankSkills(), needs: fullNeeds(), moodlets: [], level: 0, pos: { x: 0, y: 0 }, rot: 0,
  };
}

export function fullName(s: Sim) {
  return `${s.firstName} ${s.lastName}`;
}

export function mood(s: Sim, now: number): number {
  const n = s.needs;
  const weights: Record<Need, number> = { fome: 1.3, energia: 1.2, higiene: 0.9, diversao: 1, social: 0.9, conforto: 0.7, bexiga: 1.1 };
  let sum = 0, wsum = 0;
  for (const k of Object.keys(weights) as Need[]) {
    // Necessidades muito baixas pesam mais.
    const v = n[k];
    const w = weights[k] * (v < 25 ? 2 : 1);
    sum += v * w;
    wsum += w;
  }
  let m = sum / wsum;
  for (const ml of s.moodlets) if (ml.until > now) m += ml.value;
  if (s.traits.includes('alegre')) m += 6;
  return Math.max(0, Math.min(100, m));
}

export function moodLabel(m: number): { text: string; color: string } {
  if (m >= 80) return { text: 'Muito feliz', color: '#4fd18b' };
  if (m >= 62) return { text: 'Feliz', color: '#9fd14f' };
  if (m >= 45) return { text: 'Bem', color: '#e0c34f' };
  if (m >= 28) return { text: 'Desconfortável', color: '#f29544' };
  return { text: 'Muito triste', color: '#ff6b6b' };
}
