export type Mount = 'piso' | 'superficie' | 'parede' | 'teto';

/** Funções que o objeto oferecerá na simulação de vida (Etapa 3). */
export type Affordance =
  | 'dormir' | 'sentar' | 'deitar' | 'comer' | 'cozinhar' | 'armazenar_comida' | 'banho'
  | 'higiene' | 'necessidades' | 'assistir_tv' | 'trabalhar' | 'estudar' | 'exercitar'
  | 'lavar_roupa' | 'iluminar' | 'decorar' | 'brincar' | 'guardar' | 'nadar' | 'churrasco';

export interface CatalogDef {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Dimensões padrão (m): largura (x), profundidade (z), altura (y). */
  w: number;
  d: number;
  h: number;
  mount: Mount;
  /** Altura da superfície de apoio, se o objeto aceita outros por cima. */
  surface?: number;
  color: string;
  material: string;
  affords: Affordance[];
  /** Emite luz (luminárias). */
  light?: boolean;
}

export interface CategoryDef {
  id: string;
  name: string;
  icon: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 'estar', name: 'Sala de estar', icon: '🛋' },
  { id: 'jantar', name: 'Sala de jantar', icon: '🍽' },
  { id: 'cozinha', name: 'Cozinha', icon: '🍳' },
  { id: 'quarto', name: 'Quartos', icon: '🛏' },
  { id: 'banheiro', name: 'Banheiros', icon: '🛁' },
  { id: 'escritorio', name: 'Escritório', icon: '💼' },
  { id: 'lavanderia', name: 'Lavanderia', icon: '🧺' },
  { id: 'garagem', name: 'Garagem', icon: '🚗' },
  { id: 'gourmet', name: 'Área gourmet', icon: '🔥' },
  { id: 'externa', name: 'Área externa', icon: '⛱' },
  { id: 'jardim', name: 'Jardim', icon: '🌳' },
  { id: 'piscina', name: 'Piscina', icon: '🏊' },
  { id: 'iluminacao', name: 'Iluminação', icon: '💡' },
  { id: 'eletronicos', name: 'Eletrônicos', icon: '📺' },
  { id: 'eletro', name: 'Eletrodomésticos', icon: '🧊' },
  { id: 'decoracao', name: 'Decoração', icon: '🖼' },
  { id: 'plantas', name: 'Plantas', icon: '🪴' },
  { id: 'infantil', name: 'Infantil', icon: '🧸' },
  { id: 'estrutura', name: 'Estrutura', icon: '🏛' },
];

const d = (
  id: string, name: string, category: string, price: number,
  w: number, dd: number, h: number, extra: Partial<CatalogDef> = {},
): CatalogDef => ({
  id, name, category, price, w, d: dd, h, mount: 'piso', color: '#8a9bab', material: 'tecido', affords: [], ...extra,
});

export const CATALOG: CatalogDef[] = [
  // Sala de estar
  d('sofa3', 'Sofá 3 lugares', 'estar', 3200, 2.2, 0.9, 0.85, { affords: ['sentar', 'deitar'], color: '#8a9bab' }),
  d('sofa_l', 'Sofá em L', 'estar', 5400, 2.7, 1.8, 0.85, { affords: ['sentar', 'deitar'], color: '#b8b2a7' }),
  d('poltrona', 'Poltrona', 'estar', 1400, 0.85, 0.85, 0.9, { affords: ['sentar'], color: '#b07d4f', material: 'couro' }),
  d('mesa_centro', 'Mesa de centro', 'estar', 780, 1.2, 0.6, 0.42, { surface: 0.42, material: 'madeira', color: '#c49a6c' }),
  d('rack_tv', 'Rack de TV', 'estar', 1250, 1.8, 0.45, 0.5, { surface: 0.5, material: 'madeira_escura', color: '#6b4329', affords: ['guardar'] }),
  d('tapete', 'Tapete', 'estar', 520, 2.4, 1.7, 0.02, { color: '#d6b48a', material: 'tecido', affords: ['decorar'] }),
  d('estante', 'Estante de livros', 'estar', 1600, 1.2, 0.35, 2.0, { material: 'madeira', color: '#c49a6c', affords: ['estudar', 'guardar'] }),
  // Sala de jantar
  d('mesa_jantar', 'Mesa de jantar (6)', 'jantar', 2600, 1.8, 0.95, 0.76, { surface: 0.76, material: 'madeira', color: '#c49a6c', affords: ['comer'] }),
  d('mesa_redonda', 'Mesa redonda (4)', 'jantar', 1900, 1.2, 1.2, 0.76, { surface: 0.76, material: 'marmore', color: '#ecebe8', affords: ['comer'] }),
  d('cadeira', 'Cadeira', 'jantar', 380, 0.48, 0.52, 0.9, { material: 'madeira', color: '#c49a6c', affords: ['sentar'] }),
  d('buffet', 'Buffet', 'jantar', 1700, 1.6, 0.45, 0.85, { surface: 0.85, material: 'madeira_escura', color: '#6b4329', affords: ['guardar'] }),
  // Cozinha
  d('balcao', 'Balcão de cozinha', 'cozinha', 1100, 1.0, 0.6, 0.9, { surface: 0.9, material: 'granito', color: '#f1ece3', affords: ['cozinhar'] }),
  d('pia_cozinha', 'Pia de cozinha', 'cozinha', 1500, 1.2, 0.6, 0.9, { surface: 0.9, material: 'granito', color: '#f1ece3', affords: ['cozinhar', 'higiene'] }),
  d('ilha', 'Ilha de cozinha', 'cozinha', 3800, 2.0, 0.9, 0.92, { surface: 0.92, material: 'marmore', color: '#3d3c3a', affords: ['cozinhar', 'comer'] }),
  d('armario_alto', 'Armário aéreo', 'cozinha', 900, 1.0, 0.35, 0.7, { mount: 'parede', material: 'pintura', color: '#f1ece3', affords: ['guardar'] }),
  d('banqueta', 'Banqueta alta', 'cozinha', 320, 0.42, 0.42, 0.75, { material: 'metal_preto', color: '#2c2d30', affords: ['sentar'] }),
  // Quartos
  d('cama_casal', 'Cama de casal', 'quarto', 3400, 1.6, 2.1, 1.0, { affords: ['dormir', 'deitar'], color: '#e8d5b5', material: 'tecido' }),
  d('cama_solteiro', 'Cama de solteiro', 'quarto', 1800, 0.95, 2.0, 0.9, { affords: ['dormir', 'deitar'], color: '#bcd3ea', material: 'tecido' }),
  d('criado', 'Criado-mudo', 'quarto', 450, 0.5, 0.42, 0.55, { surface: 0.55, material: 'madeira', color: '#c49a6c', affords: ['guardar'] }),
  d('guarda_roupa', 'Guarda-roupa', 'quarto', 3900, 2.0, 0.6, 2.3, { material: 'pintura', color: '#f1ece3', affords: ['guardar'] }),
  d('comoda', 'Cômoda', 'quarto', 1200, 1.1, 0.5, 0.85, { surface: 0.85, material: 'madeira', color: '#c49a6c', affords: ['guardar'] }),
  // Banheiros
  d('vaso', 'Vaso sanitário', 'banheiro', 780, 0.4, 0.7, 0.8, { material: 'pintura', color: '#ffffff', affords: ['necessidades'] }),
  d('pia_banheiro', 'Gabinete com cuba', 'banheiro', 1300, 0.9, 0.5, 0.85, { surface: 0.85, material: 'marmore', color: '#ffffff', affords: ['higiene'] }),
  d('chuveiro', 'Box com chuveiro', 'banheiro', 2200, 1.0, 1.0, 2.1, { material: 'vidro', color: '#ffffff', affords: ['banho'] }),
  d('banheira', 'Banheira', 'banheiro', 4200, 1.7, 0.8, 0.6, { material: 'pintura', color: '#ffffff', affords: ['banho'] }),
  d('espelho', 'Espelho', 'banheiro', 420, 0.8, 0.04, 1.0, { mount: 'parede', material: 'vidro', color: '#dbe7ea', affords: ['higiene', 'decorar'] }),
  // Escritório
  d('escrivaninha', 'Escrivaninha', 'escritorio', 1300, 1.4, 0.7, 0.75, { surface: 0.75, material: 'madeira', color: '#c49a6c', affords: ['trabalhar', 'estudar'] }),
  d('cadeira_escritorio', 'Cadeira de escritório', 'escritorio', 900, 0.62, 0.62, 1.1, { material: 'tecido', color: '#3d3c3a', affords: ['sentar'] }),
  d('arquivo', 'Gaveteiro', 'escritorio', 520, 0.45, 0.55, 0.65, { surface: 0.65, material: 'metal', color: '#b9bcc0', affords: ['guardar'] }),
  // Lavanderia
  d('lavadora', 'Máquina de lavar', 'lavanderia', 2600, 0.62, 0.65, 0.9, { surface: 0.9, material: 'pintura', color: '#ffffff', affords: ['lavar_roupa'] }),
  d('tanque', 'Tanque', 'lavanderia', 480, 0.6, 0.55, 0.88, { material: 'pintura', color: '#e9f0f2', affords: ['lavar_roupa', 'higiene'] }),
  d('varal', 'Varal de chão', 'lavanderia', 180, 1.4, 0.55, 1.0, { material: 'metal', color: '#b9bcc0', affords: ['lavar_roupa'] }),
  // Garagem
  d('carro', 'Carro compacto', 'garagem', 68000, 1.75, 4.1, 1.45, { material: 'metal', color: '#3e6a9a' }),
  d('bancada_ferr', 'Bancada de ferramentas', 'garagem', 900, 1.6, 0.6, 0.9, { surface: 0.9, material: 'madeira', color: '#c49a6c', affords: ['trabalhar'] }),
  d('bicicleta', 'Bicicleta', 'garagem', 1500, 0.5, 1.75, 1.0, { material: 'metal', color: '#b5523b', affords: ['exercitar'] }),
  // Área gourmet
  d('churrasqueira', 'Churrasqueira de alvenaria', 'gourmet', 4800, 1.4, 0.7, 2.4, { material: 'tijolo', color: '#a8573a', affords: ['churrasco', 'cozinhar'] }),
  d('mesa_externa', 'Mesa externa (8)', 'gourmet', 2900, 2.4, 1.0, 0.76, { surface: 0.76, material: 'deck', color: '#9b6a42', affords: ['comer'] }),
  d('frigobar', 'Frigobar', 'gourmet', 1300, 0.5, 0.5, 0.85, { surface: 0.85, material: 'metal', color: '#b9bcc0', affords: ['armazenar_comida'] }),
  // Área externa
  d('espreguicadeira', 'Espreguiçadeira', 'externa', 1100, 0.7, 1.9, 0.5, { material: 'deck', color: '#9b6a42', affords: ['deitar'] }),
  d('ombrelone', 'Ombrelone', 'externa', 700, 2.4, 2.4, 2.5, { material: 'tecido', color: '#f1ece3', affords: ['decorar'] }),
  d('pergolado', 'Pergolado', 'externa', 6200, 4.0, 3.0, 2.7, { material: 'madeira', color: '#c49a6c', affords: ['decorar'] }),
  d('banco_jardim', 'Banco de jardim', 'externa', 850, 1.5, 0.55, 0.85, { material: 'madeira', color: '#9b6a42', affords: ['sentar'] }),
  // Jardim
  d('arvore', 'Árvore frondosa', 'jardim', 900, 3.5, 3.5, 6.0, { material: 'grama', color: '#4f7a4a', affords: ['decorar'] }),
  d('palmeira', 'Palmeira', 'jardim', 1200, 3.0, 3.0, 6.5, { material: 'grama', color: '#4f7a4a', affords: ['decorar'] }),
  d('arbusto', 'Arbusto', 'jardim', 180, 1.0, 1.0, 0.9, { material: 'grama', color: '#4f7a4a', affords: ['decorar'] }),
  d('canteiro', 'Canteiro de flores', 'jardim', 260, 1.6, 0.6, 0.45, { material: 'tijolo', color: '#c76d8a', affords: ['decorar'] }),
  d('fonte', 'Fonte', 'jardim', 3600, 1.8, 1.8, 1.6, { material: 'pedra', color: '#8d8478', affords: ['decorar'] }),
  d('cerca', 'Cerca de madeira (2 m)', 'jardim', 220, 2.0, 0.08, 1.1, { material: 'madeira', color: '#f1ece3' }),
  d('muro', 'Muro (2 m)', 'jardim', 480, 2.0, 0.2, 2.0, { material: 'reboco', color: '#e8e1d4' }),
  d('portao', 'Portão', 'jardim', 1900, 3.0, 0.12, 2.0, { material: 'metal_preto', color: '#2c2d30' }),
  d('poste_jardim', 'Poste de jardim', 'jardim', 260, 0.25, 0.25, 0.9, { material: 'metal_preto', color: '#2c2d30', light: true, affords: ['iluminar'] }),
  d('caminho', 'Placa de caminho', 'jardim', 60, 0.6, 0.6, 0.04, { material: 'pedra', color: '#b8b2a7' }),
  // Piscina (objetos de apoio)
  d('piscina_ret', 'Piscina elevada 6×3 m', 'piscina', 18000, 6.0, 3.0, 0.75, { material: 'azulejo', color: '#4f8f95', affords: ['nadar'] }),
  d('piscina_redonda', 'Piscina redonda Ø3,5 m', 'piscina', 11000, 3.5, 3.5, 0.75, { material: 'azulejo', color: '#4f8f95', affords: ['nadar'] }),
  d('ofuro', 'Ofurô', 'piscina', 7400, 1.9, 1.9, 0.8, { material: 'madeira', color: '#9b6a42', affords: ['banho'] }),
  // Iluminação
  d('luminaria_piso', 'Luminária de piso', 'iluminacao', 480, 0.4, 0.4, 1.65, { material: 'metal_preto', color: '#f1ece3', light: true, affords: ['iluminar'] }),
  d('abajur', 'Abajur', 'iluminacao', 220, 0.3, 0.3, 0.5, { mount: 'superficie', material: 'metal', color: '#f1ece3', light: true, affords: ['iluminar'] }),
  d('pendente', 'Pendente', 'iluminacao', 360, 0.4, 0.4, 0.9, { mount: 'teto', material: 'metal_preto', color: '#2c2d30', light: true, affords: ['iluminar'] }),
  d('arandela', 'Arandela', 'iluminacao', 190, 0.22, 0.14, 0.3, { mount: 'parede', material: 'metal', color: '#f1ece3', light: true, affords: ['iluminar'] }),
  // Eletrônicos
  d('tv', 'Smart TV 55"', 'eletronicos', 3200, 1.24, 0.25, 0.78, { mount: 'superficie', material: 'metal_preto', color: '#1f1f22', affords: ['assistir_tv'] }),
  d('tv_parede', 'TV de parede 65"', 'eletronicos', 4800, 1.45, 0.06, 0.84, { mount: 'parede', material: 'metal_preto', color: '#1f1f22', affords: ['assistir_tv'] }),
  d('computador', 'Computador', 'eletronicos', 4200, 0.6, 0.25, 0.45, { mount: 'superficie', material: 'metal_preto', color: '#1f1f22', affords: ['trabalhar', 'estudar'] }),
  d('som', 'Caixa de som', 'eletronicos', 900, 0.3, 0.3, 1.0, { material: 'metal_preto', color: '#1f1f22', affords: ['decorar'] }),
  d('esteira', 'Esteira', 'eletronicos', 3800, 0.8, 1.8, 1.4, { material: 'metal_preto', color: '#2c2d30', affords: ['exercitar'] }),
  // Eletrodomésticos
  d('geladeira', 'Geladeira duplex', 'eletro', 4300, 0.75, 0.72, 1.85, { material: 'metal', color: '#b9bcc0', affords: ['armazenar_comida'] }),
  d('fogao', 'Fogão 5 bocas', 'eletro', 2100, 0.76, 0.65, 0.9, { material: 'metal', color: '#b9bcc0', affords: ['cozinhar'] }),
  d('microondas', 'Micro-ondas', 'eletro', 650, 0.5, 0.38, 0.3, { mount: 'superficie', material: 'metal', color: '#b9bcc0', affords: ['cozinhar'] }),
  d('cafeteira', 'Cafeteira', 'eletro', 450, 0.22, 0.3, 0.35, { mount: 'superficie', material: 'metal_preto', color: '#1f1f22', affords: ['cozinhar'] }),
  // Decoração
  d('quadro', 'Quadro abstrato', 'decoracao', 380, 0.9, 0.04, 0.65, { mount: 'parede', material: 'madeira', color: '#d98b73', affords: ['decorar'] }),
  d('vaso_decor', 'Vaso decorativo', 'decoracao', 140, 0.22, 0.22, 0.4, { mount: 'superficie', material: 'pintura', color: '#4f8f95', affords: ['decorar'] }),
  d('livros', 'Pilha de livros', 'decoracao', 90, 0.3, 0.22, 0.18, { mount: 'superficie', material: 'pintura', color: '#b5523b', affords: ['estudar', 'decorar'] }),
  d('relogio', 'Relógio de parede', 'decoracao', 160, 0.4, 0.05, 0.4, { mount: 'parede', material: 'metal_preto', color: '#f1ece3', affords: ['decorar'] }),
  d('cortina', 'Cortina', 'decoracao', 420, 1.8, 0.12, 2.5, { mount: 'parede', material: 'tecido', color: '#e8d5b5', affords: ['decorar'] }),
  // Plantas
  d('planta_grande', 'Costela-de-adão', 'plantas', 260, 0.7, 0.7, 1.2, { material: 'pintura', color: '#f1ece3', affords: ['decorar'] }),
  d('planta_pequena', 'Suculenta', 'plantas', 45, 0.15, 0.15, 0.2, { mount: 'superficie', material: 'pintura', color: '#d98b73', affords: ['decorar'] }),
  d('palmeira_vaso', 'Palmeira em vaso', 'plantas', 340, 0.6, 0.6, 1.8, { material: 'concreto', color: '#9a9a96', affords: ['decorar'] }),
  // Infantil
  d('berco', 'Berço', 'infantil', 1500, 0.7, 1.3, 1.0, { material: 'pintura', color: '#ffffff', affords: ['dormir'] }),
  d('bau_brinquedos', 'Baú de brinquedos', 'infantil', 380, 0.8, 0.45, 0.5, { surface: 0.5, material: 'pintura', color: '#e0b84f', affords: ['brincar', 'guardar'] }),
  d('ursinho', 'Ursinho de pelúcia', 'infantil', 70, 0.25, 0.2, 0.32, { mount: 'superficie', material: 'tecido', color: '#b07d4f', affords: ['brincar'] }),
  d('escorregador', 'Escorregador', 'infantil', 1200, 0.8, 2.2, 1.4, { material: 'pintura', color: '#e0b84f', affords: ['brincar'] }),
  // Estrutura
  d('coluna_redonda', 'Coluna redonda', 'estrutura', 650, 0.35, 0.35, 3.0, { material: 'concreto', color: '#e8e1d4' }),
  d('pilar', 'Pilar quadrado', 'estrutura', 550, 0.3, 0.3, 3.0, { material: 'pintura', color: '#f1ece3' }),
  d('guarda_corpo', 'Guarda-corpo de vidro (2 m)', 'estrutura', 1400, 2.0, 0.06, 1.05, { material: 'vidro', color: '#bcd7e0' }),
  d('elevador', 'Elevador residencial', 'estrutura', 85000, 1.4, 1.4, 3.0, { material: 'metal', color: '#b9bcc0' }),
];

export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
