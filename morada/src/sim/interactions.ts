import type { Item, P } from '../model/types';
import type { AgeStage, Need, SkillId, RelKind, Sim, Relationship } from '../model/life';
import { isAdult } from '../model/life';
import type { Anim } from '../render/character';
import { CATALOG_BY_ID } from '../model/catalog';
import { add, rotate } from '../model/geometry';

/* ------------------------------------------------------------------ Pontos de uso dos objetos */

export type SpotKind = 'sit' | 'lie' | 'stand' | 'inside';

export interface Spot {
  kind: SpotKind;
  /** Posição local (x, z) e altura do corpo (assento/colchão). */
  x: number;
  z: number;
  h: number;
  /** Rotação extra em relação à frente do objeto. */
  rot: number;
  /** Ponto de aproximação (local). */
  ax: number;
  az: number;
}

const sit = (x: number, z: number, h: number, az?: number): Spot => ({ kind: 'sit', x, z, h, rot: 0, ax: x, az: az ?? z + 0.62 });

const SEATS: Record<string, Spot[]> = {
  sofa3: [sit(-0.62, 0.08, 0.56, 0.9), sit(0, 0.08, 0.56, 0.9), sit(0.62, 0.08, 0.56, 0.9)],
  sofa_l: [sit(-0.95, -0.37, 0.56, 0.45), sit(-0.35, -0.37, 0.56, 0.45), sit(0.25, -0.37, 0.56, 0.45)],
  poltrona: [sit(0, 0.08, 0.56, 0.85)],
  cadeira: [sit(0, 0.04, 0.47, 0.6)],
  banqueta: [sit(0, 0, 0.77, 0.55)],
  cadeira_escritorio: [sit(0, 0, 0.53, 0.65)],
  poltrona_cinema: [sit(0, 0.05, 0.54, 0.75)],
  banco_jardim: [sit(-0.4, 0.02, 0.45), sit(0.4, 0.02, 0.45)],
  vaso: [sit(0, 0.12, 0.43, 0.75)],
};

const LIE: Record<string, Spot[]> = {
  cama_casal: [
    { kind: 'lie', x: -0.38, z: 0.15, h: 0.6, rot: 0, ax: -1.25, az: 0.3 },
    { kind: 'lie', x: 0.38, z: 0.15, h: 0.6, rot: 0, ax: 1.25, az: 0.3 },
  ],
  cama_solteiro: [{ kind: 'lie', x: 0, z: 0.15, h: 0.6, rot: 0, ax: 0.9, az: 0.3 }],
  berco: [{ kind: 'lie', x: 0, z: 0.05, h: 0.47, rot: 0, ax: 0, az: 1.1 }],
  espreguicadeira: [{ kind: 'lie', x: 0, z: 0.15, h: 0.32, rot: 0, ax: 0.75, az: 0.2 }],
  sofa3: [{ kind: 'lie', x: 0, z: 0.08, h: 0.52, rot: Math.PI / 2, ax: 0, az: 0.9 }],
  banheira: [{ kind: 'lie', x: 0, z: 0, h: 0.28, rot: Math.PI / 2, ax: 0, az: 0.85 }],
  maca: [{ kind: 'lie', x: 0, z: 0.1, h: 0.67, rot: 0, ax: 0.8, az: 0.3 }],
  ofuro: [{ kind: 'lie', x: 0, z: 0.1, h: 0.4, rot: 0, ax: 0, az: 1.4 }],
};

/** Pontos de uso de um objeto para um tipo de postura. */
export function spotsFor(catalogId: string, kind: SpotKind): Spot[] {
  const def = CATALOG_BY_ID.get(catalogId);
  if (!def) return [];
  if (kind === 'sit') return SEATS[catalogId] ?? [];
  if (kind === 'lie') return LIE[catalogId] ?? [];
  if (kind === 'inside') return [{ kind: 'inside', x: 0, z: 0, h: 0.05, rot: 0, ax: 0, az: def.d / 2 + 0.45 }];
  return [{ kind: 'stand', x: 0, z: def.d / 2 + 0.38, h: 0, rot: Math.PI, ax: 0, az: def.d / 2 + 0.45 }];
}

/** Converte um ponto local do objeto para a planta. */
export function spotWorld(it: Item, sp: Spot): { pos: P; approach: P; rot: number } {
  const k = it.scale;
  // A rotação do objeto no mundo é rotation.y = it.rot; em planta, um ponto local (x, z) vira rotate(-rot).
  const toPlan = (x: number, z: number) => add(it.pos, rotate({ x: x * k, y: z * k }, -it.rot));
  return { pos: toPlan(sp.x, sp.z), approach: toPlan(sp.ax, sp.az), rot: it.rot + sp.rot };
}

/* ------------------------------------------------------------------ Interações com objetos */

export interface InteractionDef {
  id: string;
  name: string;
  icon: string;
  /** Objetos (ids do catálogo) que oferecem a interação. */
  objects: string[];
  spot: SpotKind | 'seatNear' | 'here';
  anim: Anim;
  minutes: number;
  untilFull?: Need;
  /** Ganho por hora de jogo durante a ação. */
  rates: Partial<Record<Need, number>>;
  ages?: AgeStage[];
  cost?: number;
  /** Renda por hora (freelance). */
  earn?: number;
  skill?: { id: SkillId; perHour: number };
  /** Próxima interação encadeada (ex.: cozinhar → comer). */
  then?: string;
  /** Visitantes podem usar? */
  visitors?: boolean;
  hidden?: boolean;
  traitBonus?: Partial<Record<string, number>>;
  /** Efeito especial ao concluir. */
  effect?: 'groceries' | 'outfit' | 'checkup' | 'curso' | 'reforco' | 'horaextra';
  /** Assento deve estar voltado para o objeto (TV, telão). */
  faceObject?: boolean;
  maxSeatDist?: number;
  /** Depende de energia elétrica / água encanada (contas em dia). */
  power?: boolean;
  water?: boolean;
  /** Só para quem trabalha na área do estabelecimento. */
  careerAt?: boolean;
}

const ADULTS: AgeStage[] = ['adolescente', 'jovem', 'adulto', 'idoso'];
const WALKERS: AgeStage[] = ['crianca', 'adolescente', 'jovem', 'adulto', 'idoso'];
const KIDS: AgeStage[] = ['crianca'];

export const INTERACTIONS: InteractionDef[] = [
  { id: 'dormir', name: 'Dormir', icon: '😴', objects: ['cama_casal', 'cama_solteiro'], spot: 'lie', anim: 'sleep', minutes: 540, untilFull: 'energia', rates: { energia: 13, conforto: 6 }, ages: WALKERS },
  { id: 'cochilar', name: 'Cochilar', icon: '💤', objects: ['cama_casal', 'cama_solteiro', 'sofa3'], spot: 'lie', anim: 'sleep', minutes: 90, rates: { energia: 10, conforto: 8 }, ages: WALKERS, visitors: true },
  { id: 'relaxar', name: 'Deitar e relaxar', icon: '🛌', objects: ['espreguicadeira', 'cama_casal', 'cama_solteiro'], spot: 'lie', anim: 'lie', minutes: 60, rates: { conforto: 30, energia: 3 }, ages: WALKERS, visitors: true },
  { id: 'sentar', name: 'Sentar', icon: '🪑', objects: Object.keys(SEATS).filter((k) => k !== 'vaso'), spot: 'sit', anim: 'sit', minutes: 30, rates: { conforto: 28 }, ages: WALKERS, visitors: true },
  { id: 'lanche', name: 'Fazer um lanche', icon: '🥪', objects: ['geladeira', 'frigobar'], spot: 'stand', anim: 'eat', minutes: 12, rates: { fome: 90 }, cost: 6, ages: WALKERS, visitors: true },
  { id: 'cozinhar', name: 'Cozinhar refeição', icon: '🍳', objects: ['fogao'], spot: 'stand', anim: 'cook', minutes: 30, rates: {}, cost: 18, skill: { id: 'culinaria', perHour: 0.5 }, then: 'comer', ages: ADULTS, traitBonus: { glutao: 1.5 } },
  { id: 'comer', name: 'Comer refeição', icon: '🍽', objects: ['cadeira', 'banqueta', 'sofa3', 'sofa_l', 'poltrona', 'banco_jardim'], spot: 'sit', anim: 'eat', minutes: 25, untilFull: 'fome', rates: { fome: 190, diversao: 6 }, ages: WALKERS, hidden: true },
  { id: 'cafe', name: 'Tomar um café', icon: '☕', objects: ['cafeteira'], spot: 'stand', anim: 'eat', minutes: 10, rates: { energia: 50, diversao: 10 }, cost: 2, ages: ADULTS, visitors: true, power: true },
  { id: 'microondas', name: 'Esquentar comida', icon: '🍲', objects: ['microondas'], spot: 'stand', anim: 'cook', minutes: 8, rates: {}, cost: 10, then: 'comer', ages: WALKERS, power: true },
  { id: 'churrasco', name: 'Fazer churrasco', icon: '🍖', objects: ['churrasqueira'], spot: 'stand', anim: 'cook', minutes: 60, rates: { diversao: 20, social: 8 }, cost: 60, skill: { id: 'culinaria', perHour: 0.6 }, then: 'comer', ages: ADULTS },
  { id: 'banho', name: 'Tomar banho', icon: '🚿', objects: ['chuveiro'], spot: 'inside', anim: 'shower', minutes: 25, untilFull: 'higiene', rates: { higiene: 220, conforto: 10 }, ages: WALKERS, traitBonus: { limpinho: 1.5 }, water: true },
  { id: 'banheira', name: 'Banho de banheira', icon: '🛁', objects: ['banheira', 'ofuro'], spot: 'lie', anim: 'lie', minutes: 45, untilFull: 'higiene', rates: { higiene: 140, conforto: 50, diversao: 10 }, ages: WALKERS, water: true },
  { id: 'banheiro', name: 'Usar o banheiro', icon: '🚽', objects: ['vaso'], spot: 'sit', anim: 'sit', minutes: 8, untilFull: 'bexiga', rates: { bexiga: 900 }, ages: WALKERS, visitors: true },
  { id: 'maos', name: 'Lavar as mãos', icon: '🧼', objects: ['pia_banheiro', 'pia_cozinha', 'tanque'], spot: 'stand', anim: 'wash', minutes: 6, rates: { higiene: 120 }, ages: WALKERS, visitors: true, water: true },
  { id: 'espelho', name: 'Arrumar-se no espelho', icon: '🪞', objects: ['espelho'], spot: 'stand', anim: 'wash', minutes: 10, rates: { higiene: 40, diversao: 20 }, skill: { id: 'carisma', perHour: 0.6 }, ages: WALKERS },
  { id: 'tv', name: 'Assistir TV', icon: '📺', objects: ['tv', 'tv_parede'], spot: 'seatNear', anim: 'watch', minutes: 60, rates: { diversao: 30, conforto: 6 }, ages: WALKERS, visitors: true, faceObject: true, power: true },
  { id: 'freela', name: 'Trabalhar como freelancer', icon: '💻', objects: ['computador'], spot: 'seatNear', anim: 'type', minutes: 120, rates: { diversao: -6 }, earn: 55, skill: { id: 'logica', perHour: 0.35 }, ages: ADULTS, power: true },
  { id: 'jogar', name: 'Jogar no computador', icon: '🎮', objects: ['computador'], spot: 'seatNear', anim: 'type', minutes: 60, rates: { diversao: 38 }, ages: WALKERS, traitBonus: { nerd: 1.6 }, power: true },
  { id: 'ler', name: 'Ler um livro', icon: '📖', objects: ['estante', 'livros'], spot: 'seatNear', anim: 'read', minutes: 60, rates: { diversao: 16, conforto: 4 }, skill: { id: 'logica', perHour: 0.5 }, ages: WALKERS, traitBonus: { nerd: 1.8 } },
  { id: 'licao', name: 'Fazer lição de casa', icon: '✏', objects: ['escrivaninha', 'mesa_jantar', 'mesa_redonda'], spot: 'seatNear', anim: 'read', minutes: 45, rates: { diversao: -4 }, skill: { id: 'logica', perHour: 0.6 }, ages: ['crianca', 'adolescente'] },
  { id: 'desenhar', name: 'Desenhar projetos', icon: '📐', objects: ['escrivaninha', 'bancada_ferr'], spot: 'seatNear', anim: 'type', minutes: 60, rates: { diversao: 14 }, skill: { id: 'criatividade', perHour: 0.5 }, ages: ADULTS, traitBonus: { criativo: 1.6 } },
  { id: 'exercitar', name: 'Exercitar-se', icon: '🏃', objects: ['esteira', 'bicicleta'], spot: 'stand', anim: 'exercise', minutes: 45, rates: { diversao: 14, energia: -18, higiene: -20 }, skill: { id: 'fitness', perHour: 0.7 }, ages: ['crianca', ...ADULTS], traitBonus: { ativo: 2 } },
  { id: 'nadar', name: 'Nadar', icon: '🏊', objects: ['piscina_ret', 'piscina_redonda'], spot: 'inside', anim: 'swim', minutes: 50, rates: { diversao: 34, energia: -12, higiene: 10 }, skill: { id: 'fitness', perHour: 0.5 }, ages: WALKERS, visitors: true, traitBonus: { ativo: 1.6 } },
  { id: 'lavar_roupa', name: 'Lavar roupas', icon: '🧺', objects: ['lavadora', 'tanque'], spot: 'stand', anim: 'wash', minutes: 30, rates: { conforto: 8, higiene: 10 }, cost: 3, ages: ADULTS, power: true, water: true },
  { id: 'brincar', name: 'Brincar', icon: '🧸', objects: ['bau_brinquedos', 'ursinho', 'escorregador'], spot: 'stand', anim: 'play', minutes: 40, rates: { diversao: 45, social: 6 }, ages: KIDS },
  { id: 'admirar', name: 'Admirar', icon: '🖼', objects: ['quadro', 'fonte', 'arvore', 'canteiro'], spot: 'stand', anim: 'idle', minutes: 10, rates: { diversao: 22 }, ages: WALKERS, visitors: true },
  { id: 'regar', name: 'Cuidar da planta', icon: '🪴', objects: ['planta_grande', 'palmeira_vaso', 'canteiro', 'arbusto'], spot: 'stand', anim: 'wash', minutes: 10, rates: { diversao: 18, conforto: 6 }, ages: WALKERS },
  { id: 'som', name: 'Dançar ao som da música', icon: '🎵', objects: ['som'], spot: 'stand', anim: 'dance', minutes: 40, rates: { diversao: 40, energia: -6 }, ages: WALKERS, visitors: true, power: true },
  // Estabelecimentos da cidade
  { id: 'compras', name: 'Fazer compras do mês', icon: '🛒', objects: ['caixa', 'prateleira_mercado', 'refrigerador_mercado'], spot: 'stand', anim: 'wash', minutes: 25, rates: { diversao: 4 }, cost: 220, effect: 'groceries', ages: ['adolescente', 'jovem', 'adulto', 'idoso'] },
  { id: 'jantar_fora', name: 'Comer no restaurante', icon: '🍝', objects: ['mesa_restaurante'], spot: 'seatNear', maxSeatDist: 1.3, anim: 'eat', minutes: 50, untilFull: 'fome', rates: { fome: 150, diversao: 18, social: 14 }, cost: 55, ages: WALKERS, visitors: true },
  { id: 'filme', name: 'Assistir ao filme', icon: '🎬', objects: ['tela_cinema'], spot: 'seatNear', faceObject: true, maxSeatDist: 16, anim: 'watch', minutes: 110, rates: { diversao: 55, conforto: 8 }, cost: 32, ages: WALKERS, visitors: true, power: true },
  { id: 'roupas', name: 'Renovar o guarda-roupa', icon: '👕', objects: ['arara_roupas'], spot: 'stand', anim: 'wash', minutes: 25, rates: { diversao: 30 }, cost: 150, effect: 'outfit', ages: WALKERS },
  { id: 'checkup', name: 'Fazer check-up médico', icon: '🩺', objects: ['maca'], spot: 'lie', anim: 'lie', minutes: 30, rates: { conforto: 10 }, cost: 120, effect: 'checkup', ages: WALKERS },
  { id: 'curso', name: 'Fazer curso noturno', icon: '🎓', objects: ['lousa'], spot: 'seatNear', maxSeatDist: 7, faceObject: true, anim: 'read', minutes: 120, rates: { diversao: -4 }, cost: 180, effect: 'curso', ages: ['jovem', 'adulto', 'idoso'] },
  { id: 'reforco', name: 'Aula de reforço', icon: '📚', objects: ['lousa'], spot: 'seatNear', maxSeatDist: 7, faceObject: true, anim: 'read', minutes: 90, rates: { diversao: -6 }, cost: 60, effect: 'reforco', ages: ['crianca', 'adolescente'] },
  { id: 'hora_extra', name: 'Fazer hora extra', icon: '⏱', objects: ['estacao_trabalho'], spot: 'seatNear', maxSeatDist: 1.4, anim: 'type', minutes: 120, rates: { diversao: -8, energia: -6 }, effect: 'horaextra', careerAt: true, ages: ['jovem', 'adulto', 'idoso'], power: true },
  { id: 'musculacao', name: 'Fazer musculação', icon: '🏋', objects: ['aparelho_musculacao', 'barra_exercicio'], spot: 'stand', anim: 'exercise', minutes: 45, rates: { diversao: 16, energia: -16, higiene: -18 }, skill: { id: 'fitness', perHour: 0.9 }, ages: ['adolescente', 'jovem', 'adulto', 'idoso'], visitors: true, traitBonus: { ativo: 2 } },
  { id: 'piquenique', name: 'Fazer piquenique', icon: '🧺', objects: ['toalha_piquenique'], spot: 'stand', anim: 'play', minutes: 40, rates: { fome: 80, social: 20, diversao: 30 }, cost: 20, ages: WALKERS, visitors: true },
];

export const INTERACTION_BY_ID = new Map(INTERACTIONS.map((i) => [i.id, i]));

export function interactionsForObject(catalogId: string): InteractionDef[] {
  return INTERACTIONS.filter((i) => !i.hidden && i.objects.includes(catalogId));
}

/* ------------------------------------------------------------------ Interações sociais */

export interface SocialCtx {
  a: Sim;
  b: Sim;
  rel: Relationship | null;
  hasDoubleBed: boolean;
  householdSize: number;
}

export interface SocialDef {
  id: string;
  name: string;
  icon: string;
  anim: Anim;
  minutes: number;
  amizade: number;
  romance: number;
  social: number;
  diversao?: number;
  /** Retorna o motivo do bloqueio, ou null se disponível. */
  require: (c: SocialCtx) => string | null;
}

const FAMILY: RelKind[] = ['pai', 'filho', 'irmaos'];
const romanticKinds: RelKind[] = ['namorados', 'noivos', 'conjuge'];
const isFamily = (r: Relationship | null) => !!r && FAMILY.includes(r.kind);
const walkers = (c: SocialCtx) => (c.b.age === 'bebe' ? 'Bebês não conversam ainda' : null);
const adultPair = (c: SocialCtx) => {
  if (c.a.age === 'bebe' || c.a.age === 'crianca' || c.b.age === 'bebe' || c.b.age === 'crianca') return 'Somente adolescentes ou adultos';
  const teen = (s: Sim) => s.age === 'adolescente';
  if (teen(c.a) !== teen(c.b)) return 'Idades incompatíveis';
  if (isFamily(c.rel)) return 'Não é possível com parentes';
  return null;
};

export const SOCIALS: SocialDef[] = [
  { id: 'conversar', name: 'Conversar', icon: '💬', anim: 'talk', minutes: 20, amizade: 8, romance: 0, social: 30, require: walkers },
  { id: 'piada', name: 'Contar uma piada', icon: '😂', anim: 'talk', minutes: 10, amizade: 6, romance: 0, social: 15, diversao: 18, require: walkers },
  { id: 'elogiar', name: 'Elogiar', icon: '🌟', anim: 'talk', minutes: 8, amizade: 8, romance: 1, social: 14, require: walkers },
  { id: 'abracar', name: 'Abraçar', icon: '🤗', anim: 'hug', minutes: 5, amizade: 7, romance: 1, social: 16, require: (c) => walkers(c) ?? ((c.rel?.amizade ?? 0) < 25 && !isFamily(c.rel) ? 'Precisam ser mais próximos (amizade 25)' : null) },
  { id: 'discutir', name: 'Discutir', icon: '😠', anim: 'talk', minutes: 15, amizade: -16, romance: -6, social: 6, require: walkers },
  { id: 'brincar_crianca', name: 'Brincar juntos', icon: '🪀', anim: 'play', minutes: 20, amizade: 7, romance: 0, social: 20, diversao: 30, require: (c) => (c.b.age === 'crianca' || c.a.age === 'crianca' ? null : 'Brincadeira para crianças') },
  { id: 'cuidar_bebe', name: 'Cuidar do bebê', icon: '🍼', anim: 'carry', minutes: 20, amizade: 6, romance: 0, social: 8, require: (c) => (c.b.age !== 'bebe' ? 'Apenas com bebês' : !isAdult(c.a.age) && c.a.age !== 'adolescente' ? 'Muito novo para cuidar' : null) },
  { id: 'flertar', name: 'Flertar', icon: '😉', anim: 'talk', minutes: 10, amizade: 2, romance: 10, social: 14, require: adultPair },
  { id: 'beijar', name: 'Beijar', icon: '💋', anim: 'kiss', minutes: 6, amizade: 3, romance: 12, social: 16, require: (c) => adultPair(c) ?? ((c.rel?.romance ?? 0) < 35 ? 'Romance insuficiente (35)' : null) },
  {
    id: 'namoro', name: 'Pedir em namoro', icon: '💞', anim: 'talk', minutes: 10, amizade: 5, romance: 10, social: 10,
    require: (c) => adultPair(c) ?? (c.rel && romanticKinds.includes(c.rel.kind) ? 'Já estão juntos' : (c.rel?.romance ?? 0) < 45 || (c.rel?.amizade ?? 0) < 30 ? 'Requer romance 45 e amizade 30' : null),
  },
  {
    id: 'pedido', name: 'Pedir em casamento', icon: '💍', anim: 'kiss', minutes: 10, amizade: 6, romance: 12, social: 10,
    require: (c) => adultPair(c) ?? (c.a.age === 'adolescente' ? 'Somente adultos' : c.rel?.kind !== 'namorados' ? 'Precisam estar namorando' : c.rel.romance < 65 ? 'Requer romance 65' : null),
  },
  {
    id: 'casar', name: 'Casar agora', icon: '💒', anim: 'kiss', minutes: 30, amizade: 10, romance: 15, social: 30,
    require: (c) => adultPair(c) ?? (c.rel?.kind !== 'noivos' ? 'Precisam estar noivos' : null),
  },
  {
    id: 'bebe', name: 'Tentar ter um bebê', icon: '👶', anim: 'kiss', minutes: 20, amizade: 4, romance: 10, social: 20,
    require: (c) => {
      const r = adultPair(c); if (r) return r;
      if (!['jovem', 'adulto'].includes(c.a.age) || !['jovem', 'adulto'].includes(c.b.age)) return 'Somente jovens adultos e adultos';
      if (!c.rel || !romanticKinds.includes(c.rel.kind) || c.rel.romance < 50) return 'Requer relacionamento com romance 50';
      if (!c.hasDoubleBed) return 'Precisam de uma cama de casal em casa';
      if (c.a.pregnantUntil || c.b.pregnantUntil) return 'Já há um bebê a caminho';
      if (c.householdSize >= 8) return 'A família já tem 8 membros';
      if (c.a.visitor || c.b.visitor) return 'Precisam morar juntos';
      return null;
    },
  },
  { id: 'convidar_morar', name: 'Convidar para morar aqui', icon: '🏡', anim: 'talk', minutes: 10, amizade: 5, romance: 0, social: 10, require: (c) => (!c.b.visitor ? 'Já mora aqui' : (c.rel?.amizade ?? 0) < 55 && !(c.rel && romanticKinds.includes(c.rel.kind)) ? 'Requer amizade 55 ou relacionamento' : c.householdSize >= 8 ? 'A família já tem 8 membros' : null) },
  { id: 'despedir', name: 'Despedir-se', icon: '👋', anim: 'wave', minutes: 3, amizade: 1, romance: 0, social: 4, require: (c) => (!c.b.visitor ? 'Apenas visitantes' : null) },
];
export const SOCIAL_BY_ID = new Map(SOCIALS.map((s) => [s.id, s]));

export const PET_ACTIONS = [
  { id: 'brincar_pet', name: 'Brincar com o pet', icon: '🎾', minutes: 15, actor: { diversao: 22, social: 8 }, pet: { diversao: 50, energia: -10 } },
  { id: 'alimentar_pet', name: 'Colocar ração', icon: '🦴', minutes: 5, actor: {}, pet: { fome: 100 }, cost: 8 },
  { id: 'carinho_pet', name: 'Fazer carinho', icon: '🐾', minutes: 6, actor: { social: 12, conforto: 6 }, pet: { diversao: 18 } },
] as const;
