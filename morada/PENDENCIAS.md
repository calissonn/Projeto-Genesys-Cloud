# Pendências — Morada

Itens solicitados que ainda **não** estão implementados. Nenhum deles aparece como botão no jogo; não há funções fictícias.

## Etapa 1 / 2 — construção e decoração
- [ ] **Porões** (andares abaixo do térreo): exigem recortar o terreno.
- [ ] **Terreno com níveis de altura** (relevo, taludes) e **lagos artificiais** escavados.
- [ ] **Piscinas escavadas com formato personalizado.** Hoje existem piscinas elevadas (retangular e redonda) e ofurô no catálogo.
- [ ] **Claraboias** (recorte no telhado).
- [ ] **Telhados automáticos para plantas irregulares.** O telhado automático usa o retângulo envolvente das paredes do andar; em formas em L, combine vários telhados manuais.
- [ ] **Telhados curvos com vários segmentos** e encaixe automático entre telhados.
- [ ] Redimensionar cômodos com formato livre por arrasto de aresta. Hoje há botões ±0,5 m de largura e profundidade.
- [ ] Copiar e colar um **conjunto selecionado arbitrário** (seleção múltipla). Hoje a cópia é por elemento ou por cômodo.
- [ ] Revestimento diferente em cada face da parede (interna × externa).
- [ ] Colisão entre móveis. Hoje só há colisão de móveis com paredes.
- [ ] Iluminação com sombras projetadas pelas luminárias (as luzes pontuais existem, mas sem sombra, para preservar o desempenho).
- [ ] Carregamento de modelos 3D externos (glTF) para móveis de alta fidelidade. Hoje todos os modelos são procedurais.
- [ ] Câmera em primeira pessoa. Ela depende do personagem controlável (Etapa 3).

## Etapa 3 — simulação de vida
- [ ] Criação de personagens (nome, rosto, corpo, pele, cabelo, olhos, roupas, idade, personalidade, aspirações).
- [ ] Famílias e relacionamentos.
- [ ] Necessidades (fome, energia, higiene, diversão, social, conforto, bexiga) e autonomia.
- [ ] Navegação (pathfinding com portas, escadas e elevador) e interação com os objetos. As funções de cada objeto já estão catalogadas em `CatalogDef.affords`.
- [ ] Modo Vida com controle de velocidade do tempo.
- [ ] Animais de estimação, festas, visitas, namoro, casamento e filhos.

## Etapa 4 — cidade e economia
- [ ] Mapa da cidade com bairros, condomínios, parques, comércio, escolas, hospitais e locais de trabalho.
- [ ] Compra e venda de imóveis existentes e troca de terreno. Hoje o terreno é escolhido ao criar o jogo.
- [ ] Profissões, salários, contas de água e energia, despesas domésticas e evolução patrimonial.
- [ ] Clima (chuva) e passagem automática do tempo. A hora do dia e a iluminação dinâmica já existem, com ajuste manual.

## Técnico
- [ ] Mesclagem de geometrias por andar (instancing) para casas muito grandes em aparelhos simples.
- [ ] Salvamento em IndexedDB para projetos grandes (o localStorage tem limite de cerca de 5 MB).
- [ ] Empacotamento nativo (Capacitor) para publicação nas lojas.
