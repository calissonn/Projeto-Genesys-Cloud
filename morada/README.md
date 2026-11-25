# Morada — construa, decore e viva

Jogo mobile 3D de construção, decoração residencial e simulação de vida.
Identidade visual, personagens, interface, ícones e modelos são originais e procedurais. Não há recursos de terceiros.

- **Tecnologia:** Three.js + TypeScript + Vite, empacotado como **PWA** (instalável no Android e no iOS e funciona offline).
- **Idioma:** português do Brasil.
- **Orientação:** horizontal, com controles por toque (o mouse e o teclado também funcionam).

> Esta pasta é independente do restante do repositório (que contém outro projeto).

## Como executar

```bash
cd morada
npm install
npm run dev        # servidor de desenvolvimento (acessível na rede local)
npm run build      # gera dist/ (PWA pronto para hospedar em qualquer servidor estático)
npm run preview    # serve o build em http://localhost:4173
npm test           # testes unitários (Vitest)
npm run test:e2e   # testes ponta a ponta (construção e modo Vida) no Chromium; requer Playwright e o preview rodando
```

Para instalar no celular, abra a URL do build no Chrome (Android) ou no Safari (iOS) e escolha
**Instalar app** / **Adicionar à Tela de Início**. Depois do primeiro acesso, o app funciona offline.

## Modos de jogo
Use o seletor **🔨 Construir | 🏠 Viver** no canto superior esquerdo. Ao entrar no modo Viver pela primeira vez, o editor de personagens se abre para você criar a família.

## Modo Vida (Etapa 3)

### Criação de personagens e famílias
- Até 8 membros, cada um com nome, sobrenome e idade: bebê, criança, adolescente, jovem adulto, adulto ou idoso.
- **Rosto:** largura, mandíbula, tamanho e cor dos olhos, nariz, sobrancelhas e barba.
- **Corpo:** altura, estrutura corporal e 8 tons de pele.
- **Cabelo:** 9 penteados e 12 cores.
- **Roupas:** 6 partes de cima, 4 de baixo, cores livres, calçados e 6 acessórios (óculos, óculos de sol, chapéu, boné, brincos e colar).
- **Personalidade:** até 3 de 12 traços (alegre, ativo, preguiçoso, sociável, solitário, romântico, nerd, glutão, limpinho, criativo, família, ambicioso), que alteram a velocidade das necessidades, as preferências da autonomia e o ganho de habilidades.
- **Profissão** (8 carreiras com 5 níveis cada) e **aspiração** (7 objetivos de vida, com progresso acompanhado no painel).
- **Laços familiares:** cônjuges, noivos, namorados, pai ou mãe, filho, irmãos e colegas de casa.
- Prévia 3D giratória com animação, botões de personagem e roupa aleatórios, e edição posterior pelo botão 👥.

### Simulação
- **7 necessidades:** fome, energia, higiene, diversão, social, conforto e bexiga. O humor é calculado pelas necessidades, pelos traços e pelos sentimentos temporários (promoção, festa, casamento, discussão etc.).
- **Interações com objetos:** os móveis do catálogo têm funções reais (dormir, cochilar, sentar, lanchar, cozinhar e comer à mesa, café, churrasco, banho de chuveiro e de banheira, banheiro, lavar as mãos, TV sentado no sofá voltado para ela, freelance e jogos no computador, ler, lição de casa, desenhar, exercitar-se, nadar, lavar roupa, brincar, admirar, cuidar de plantas, dançar).
- **Autonomia:** quem está sem ordens escolhe sozinho o que fazer, conforme as necessidades, a distância, a hora (à noite prefere dormir) e a personalidade. Pode ser desligada.
- **Fila de ações:** toque em objetos, pessoas, pets ou no chão para dar ordens e toque em uma ação da fila para cancelá-la.
- **Navegação:** busca de caminho (A*) em vários andares, contornando paredes e móveis. Os personagens passam por portas (que se abrem sozinhas), sobem e descem escadas retas, em L, em U, espirais e curvas, e usam o elevador.
- **Social:** conversar, piada, elogio, abraço, discussão, flerte, beijo, pedido de namoro, pedido de casamento, casamento, tentar ter um bebê (exige cama de casal), cuidar do bebê, brincar com crianças, convidar para morar junto e despedir-se. Amizade e romance evoluem a cada interação, e o painel **Relações** mostra os vínculos.
- **Bebês, crianças e envelhecimento:** a gravidez leva 1 dia e o bebê herda traços físicos dos pais. Bebês dormem no berço e precisam de cuidados. Todos fazem aniversário e mudam de fase (o envelhecimento pode ser desligado).
- **Trabalho e escola:** os personagens saem no horário, voltam e recebem salário no Modo Simulação. O desempenho depende do humor e da habilidade da área e leva a promoções ou rebaixamentos. O freelance rende dinheiro em casa.
- **Habilidades:** lógica, culinária, condicionamento, carisma e criatividade, de 0 a 10.
- **Visitas e festas:** convide visitantes (personagens gerados pelo jogo, com autonomia) ou dê uma festa com 4 convidados e dança.
- **Animais de estimação:** cães e gatos com fome, diversão e energia. Eles passeiam, seguem a família e dormem, e os personagens podem alimentá-los, brincar e fazer carinho.
- **Situações críticas:** desmaio de sono, "acidente" com a bexiga (ninguém espera até o fim: a bexiga apertada interrompe o que estiver fazendo) e humor de fome.
- **Tempo:** relógio com dias da semana, controles ⏸ ▶ ▶▶ ▶▶▶ e ciclo dia/noite real (o sol, o céu e as luminárias acompanham a hora).
- **Câmeras:** livre, seguindo o personagem ou em **primeira pessoa** (arraste para olhar ao redor).
- **Diário da família** com os acontecimentos. O estado do modo Vida é salvo junto com o jogo e **não** é afetado pelo desfazer do modo Construção.

## Modo Construção (Etapas 1 e 2)

### Construção
| Recurso | Como usar |
|---|---|
| Paredes retas e diagonais | **Paredes → Reta**: arraste o dedo. O app mostra o comprimento em metros e o ângulo. |
| Paredes curvas | **Paredes → Curva**: arraste para definir a corda e ajuste a **Curvatura** (−50% a 50%; 50% = semicírculo). Paredes existentes também têm curvatura editável. |
| Paredes circulares | **Paredes → Círculo**: arraste do centro até o raio. Cria um cômodo redondo, com piso. |
| Cômodo retangular | **Paredes → Cômodo ▭**: cria 4 paredes e o piso, mostrando largura, profundidade e área. |
| Cômodo de formato livre | **Paredes → Cômodo livre**: toque nos vértices e feche no primeiro ponto. Serve para ambientes irregulares e ângulos personalizados. |
| Meia parede e divisória | Escolha o **Tipo** na barra de opções. Altura e espessura são editáveis em cada parede. |
| Editar paredes | Selecione a parede e arraste as alças amarelas. As paredes conectadas acompanham. Também é possível arrastar a parede inteira. |
| Grade × livre | Botão **grade**: encaixe em 10/25/50/100 cm (ou desligado). Botão **ímã**: encaixa nos vértices e em ângulos de 15°. |
| Pisos e plataformas | **Pisos**: retângulo, polígono livre ou **Preencher cômodo** (detecta o contorno das paredes, inclusive em junções T). A elevação cria plataformas e fundações. |
| Portas e janelas | 7 modelos: porta simples, dupla, de correr de vidro, janela, basculante, panorâmica e fachada de vidro. Largura, altura, peitoril, lado de abertura e cor são editáveis, e a abertura pode ser arrastada ao longo da parede (inclusive em paredes curvas). |
| Vários andares | Botões ▲▼ (até 5 andares). Os pisos superiores funcionam como laje e recebem o vão da escada automaticamente. |
| Escadas | Reta, em L, em U, espiral e curva, com largura e rotação ajustáveis. Cada escada liga o andar atual ao de cima. |
| Telhados | Duas águas, quatro águas, uma água, laje plana com platibanda e curvo. Inclinação, beiral, dimensões, rotação e material são ajustáveis. Há também o **Telhado automático**. |
| Varandas, sacadas e mezaninos | Basta um piso no andar superior que avance além das paredes, com guarda-corpo de vidro (catálogo **Estrutura**). |
| Colunas, pilares e elevador | Disponíveis no catálogo **Estrutura**. |

### Ferramentas de arquitetura
- Desfazer e refazer ilimitados por sessão (até 120 passos), também com Ctrl+Z / Ctrl+Shift+Z.
- Duplicar qualquer elemento. Copiar, mover e redimensionar cômodos inteiros (piso, paredes, aberturas, objetos e escadas).
- Rotação livre (0 a 359°), altura em relação ao chão e tamanho (50% a 200%) para os objetos.
- Planta baixa 2D ortográfica ↔ 3D, paredes inteiras/baixas/ocultas, exibição do andar atual ou de todos, telhados visíveis ou ocultos.
- **Demolir**: remove um elemento por toque ou o andar inteiro.
- **Orçamento** automático, detalhado por paredes, pisos, aberturas, escadas, telhados e objetos, conforme o material e a área.
- **Projetos de casas**: salve a construção como modelo, aplique-a em outro terreno (o app verifica se cabe) e exporte ou importe arquivos `.json`.

### Decoração
- 84 objetos em 19 categorias (sala de estar, jantar, cozinha, quartos, banheiros, escritório, lavanderia, garagem,
  área gourmet, área externa, jardim, piscina, iluminação, eletrônicos, eletrodomésticos, decoração, plantas, infantil e estrutura).
  Todos são modelados por peças (estrutura, almofadas, pés, puxadores, telas etc.) e cada um tem uma **miniatura 3D** gerada no próprio aparelho.
- Os objetos de parede (quadros, TVs, espelhos, armários aéreos, arandelas) encaixam na parede tocada. Objetos pequenos podem ficar
  **sobre mesas, bancadas, racks e criados-mudos**, e os pendentes ficam presos ao teto.
- Colisão: o app impede que um móvel atravesse paredes.
- 21 materiais com texturas procedurais (madeira clara e escura, mármore, granito, porcelanato, azulejo, concreto, tijolo,
  pedra, vidro, metais, tecido, couro, telhas, grama, deck etc.) e uma paleta de cores com seletor livre.
- Cada objeto declara suas **funções** para a simulação (dormir, sentar, cozinhar, banho…), já exibidas no painel.

### Mundo e visual
- Terreno com lote demarcado, calçada, rua, árvores e casas vizinhas.
- Iluminação dinâmica com sol, céu, sombras suaves e reflexos por mapa de ambiente. A **hora do dia** é ajustável e, à noite, as luminárias acendem.
- Configurações gráficas: qualidade (baixa/média/alta), sombras, grade e passo da grade.

### Economia (base)
- **Modo Criativo:** dinheiro ilimitado.
- **Modo Simulação:** capital inicial de R$ 650.000. A compra do terreno e cada obra são descontadas do saldo, e o app bloqueia
  alterações que o deixariam negativo. Demolir ou desfazer devolve o valor.
- 5 terrenos padrão (15×20, 20×30, 30×40, 50×50 e 64×64 m) e um terreno personalizado, cada um com bairro e preço próprios.

### Salvamento
- Salvamento automático no aparelho (localStorage), feito 1,2 s após cada alteração e também ao sair do app.
- Vários jogos salvos, com exportação e importação.

## Controles
| Gesto | Ação |
|---|---|
| Arrastar com 1 dedo (vazio) | Mover a câmera |
| Pinça com 2 dedos | Zoom |
| Girar 2 dedos / arrastar 2 dedos na vertical | Rotacionar / inclinar a câmera |
| Toque | Selecionar ou usar a ferramenta |
| Arrastar objeto | Mover (móveis, escadas, telhados, portas e janelas ao longo da parede) |
| Toque longo | Seleciona e abre o painel de opções |
| Mouse | Botão direito gira, roda dá zoom; Delete exclui, Esc cancela |

## Arquitetura
```
src/
  core/      eventos, histórico (snapshots), armazenamento
  model/     tipos, geometria (arcos, projeções, polígonos), projeto/custos, materiais, catálogo, casa modelo
  render/    engine (renderizador, sol, céu, terreno), câmera, texturas procedurais,
             malhas de paredes (curvas + vãos), pisos/aberturas/escadas/telhados, móveis procedurais, world (sincroniza cena)
  editor/    editor (estado, commits com validação de saldo, seleção, cômodos), entrada por toque, ferramentas
  sim/       navegação A* multinível, interações (objetos, sociais, pets) e motor da simulação
  ui/        HUD de construção e de vida, criação de personagens (CAS), menus, catálogo e retratos 3D, ícones SVG
```
- O estado do jogo é um objeto `Project` serializável. Todas as alterações passam por `editor.commit()`, que guarda um snapshot para o
  desfazer, valida o saldo e reconstrói a cena. Durante os arrastos, `beginLive()` e `endLive()` agrupam a alteração em um único passo.
- As paredes são poligonais extrudadas, com normais suaves e vãos recortados por intervalos ao longo do comprimento, o que funciona para retas e curvas.
- O modo Vida guarda seu estado em `project.life` (família, relações, relógio, saldo da vida). O desfazer da construção usa snapshots sem esse campo, para que reformas não "voltem no tempo".
- Personagens são humanoides procedurais articulados (quadril, coluna, cabeça, ombros, cotovelos, quadris e joelhos), com mais de 20 animações procedurais (andar, sentar, dormir, comer, cozinhar, banho, exercício, natação, conversar, abraçar, beijar, dançar…).
- A grade de navegação é refeita automaticamente quando a casa muda. Se uma reforma prender alguém, a pessoa é reposicionada no ponto livre mais próximo ao voltar para o modo Vida.
- O próximo módulo (cidade) se conecta ao `Simulation` e ao `World` sem alterar os modelos existentes.

Pendências e próximas etapas: veja [PENDENCIAS.md](./PENDENCIAS.md).
