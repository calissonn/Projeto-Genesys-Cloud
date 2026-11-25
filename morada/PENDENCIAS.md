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

## Etapa 3 — simulação de vida (implementada; melhorias pendentes)
- [ ] Animais de estimação com raças e carinho autônomo dos pets em relação à família.
- [ ] Desvio entre personagens (hoje eles podem se atravessar nos corredores).
- [ ] Malhas com pele e esqueleto (skinning) e expressões faciais detalhadas. Hoje o rosto tem boca que reage ao humor e o corpo é articulado por partes.
- [ ] Morte e herança na velhice. Hoje a fase de idoso não termina.
- [ ] Gravidez com etapas visíveis e gêmeos.
- [ ] Mais interações em grupo (refeições em família, conversas a três).
- [ ] Interface de "arrastar a ação para reordenar" a fila.
- [ ] Faltar ao trabalho ou sair mais cedo.

## Etapa 4 — cidade e economia
- [ ] Mapa da cidade com bairros, condomínios, parques, comércio, escolas, hospitais e locais de trabalho.
- [ ] Compra e venda de imóveis existentes e troca de terreno. Hoje o terreno é escolhido ao criar o jogo.
- [ ] Locais de trabalho visitáveis, contas de água e energia, despesas domésticas recorrentes e gráfico de evolução patrimonial. Já existem profissões, salários, freelance, compras (refeições, ração, festa, adoção) e o patrimônio exibido no painel.
- [ ] Clima (chuva, nuvens, estações). O ciclo dia/noite acompanha o relógio do modo Vida.

## Técnico
- [ ] Mesclagem de geometrias por andar (instancing) para casas muito grandes em aparelhos simples.
- [ ] Salvamento em IndexedDB para projetos grandes (o localStorage tem limite de cerca de 5 MB).
- [ ] Empacotamento nativo (Capacitor) para publicação nas lojas.
