export type MaterialUse = 'parede' | 'piso' | 'telhado' | 'movel';

export interface MaterialDef {
  id: string;
  name: string;
  /** Fator multiplicador do custo por m². */
  factor: number;
  /** Se aceita cor personalizada (tinta). */
  tintable: boolean;
  uses: MaterialUse[];
  /** Cor base padrão quando não tingível. */
  base: string;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'pintura', name: 'Pintura lisa', factor: 1, tintable: true, uses: ['parede', 'movel'], base: '#f1ece3' },
  { id: 'reboco', name: 'Reboco texturizado', factor: 1.1, tintable: true, uses: ['parede'], base: '#e8e1d4' },
  { id: 'tijolo', name: 'Tijolo aparente', factor: 1.6, tintable: false, uses: ['parede', 'piso'], base: '#a8573a' },
  { id: 'concreto', name: 'Concreto aparente', factor: 1.3, tintable: false, uses: ['parede', 'piso', 'telhado', 'movel'], base: '#9a9a96' },
  { id: 'pedra', name: 'Pedra natural', factor: 2.2, tintable: false, uses: ['parede', 'piso'], base: '#8d8478' },
  { id: 'madeira', name: 'Madeira clara', factor: 1.8, tintable: false, uses: ['parede', 'piso', 'movel', 'telhado'], base: '#c49a6c' },
  { id: 'madeira_escura', name: 'Madeira escura', factor: 2, tintable: false, uses: ['parede', 'piso', 'movel'], base: '#6b4329' },
  { id: 'marmore', name: 'Mármore branco', factor: 3.2, tintable: false, uses: ['parede', 'piso', 'movel'], base: '#ecebe8' },
  { id: 'granito', name: 'Granito escuro', factor: 2.8, tintable: false, uses: ['piso', 'movel', 'parede'], base: '#3b3a3c' },
  { id: 'porcelanato', name: 'Porcelanato', factor: 2.1, tintable: true, uses: ['piso', 'parede'], base: '#d9d4cc' },
  { id: 'azulejo', name: 'Azulejo', factor: 1.7, tintable: true, uses: ['parede', 'piso'], base: '#e9f0f2' },
  { id: 'carpete', name: 'Carpete', factor: 1.2, tintable: true, uses: ['piso'], base: '#8b8f9a' },
  { id: 'vidro', name: 'Vidro', factor: 3, tintable: false, uses: ['parede', 'movel'], base: '#bcd7e0' },
  { id: 'metal', name: 'Metal escovado', factor: 2.5, tintable: false, uses: ['movel', 'parede', 'telhado'], base: '#b9bcc0' },
  { id: 'metal_preto', name: 'Metal preto', factor: 2.4, tintable: false, uses: ['movel', 'parede'], base: '#2c2d30' },
  { id: 'tecido', name: 'Tecido', factor: 1.4, tintable: true, uses: ['movel'], base: '#8a9bab' },
  { id: 'couro', name: 'Couro', factor: 2.6, tintable: true, uses: ['movel'], base: '#6e4630' },
  { id: 'telha_ceramica', name: 'Telha cerâmica', factor: 1.5, tintable: false, uses: ['telhado'], base: '#a4532f' },
  { id: 'telha_ardosia', name: 'Telha de ardósia', factor: 1.9, tintable: false, uses: ['telhado'], base: '#4b5058' },
  { id: 'grama', name: 'Grama', factor: 0.5, tintable: false, uses: ['piso', 'telhado'], base: '#5f8f3e' },
  { id: 'deck', name: 'Deck de madeira', factor: 1.9, tintable: false, uses: ['piso'], base: '#9b6a42' },
];

export const MATERIAL_BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

export function materialsFor(use: MaterialUse): MaterialDef[] {
  return MATERIALS.filter((m) => m.uses.includes(use));
}

export const PALETTE = [
  '#f1ece3', '#ffffff', '#d9d4cc', '#b8b2a7', '#7d7a74', '#3d3c3a', '#1f1f22',
  '#e8d5b5', '#d6b48a', '#b07d4f', '#7a4b2a', '#c9a227', '#e0b84f',
  '#e9c3b5', '#d98b73', '#b5523b', '#8c2f2a', '#c76d8a', '#7d4e75',
  '#c8dbc0', '#8fb07a', '#4f7a4a', '#2f4f3b', '#9fc6c5', '#4f8f95',
  '#bcd3ea', '#7aa1c9', '#3e6a9a', '#253f63',
];
