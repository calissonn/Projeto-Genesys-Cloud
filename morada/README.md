# Morada — construa, decore e viva

Jogo mobile 3D de construção, decoração residencial e (nas próximas etapas) simulação de vida.
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
npm run test:e2e   # teste ponta a ponta no Chromium (requer Playwright e o preview rodando)
```

Para instalar no celular, abra a URL do build no Chrome (Android) ou no Safari (iOS) e escolha
**Instalar app** / **Adicionar à Tela de Início**. Depois do primeiro acesso, o app funciona offline.

## O que já funciona (Etapa 1 + parte da Etapa 2)

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
  ui/        HUD, menus, catálogo com miniaturas 3D, ícones SVG
```
- O estado do jogo é um objeto `Project` serializável. Todas as alterações passam por `editor.commit()`, que guarda um snapshot para o
  desfazer, valida o saldo e reconstrói a cena. Durante os arrastos, `beginLive()` e `endLive()` agrupam a alteração em um único passo.
- As paredes são poligonais extrudadas, com normais suaves e vãos recortados por intervalos ao longo do comprimento, o que funciona para retas e curvas.
- Os novos módulos (personagens, cidade) se conectam ao `Editor` e ao `World` sem alterar o modelo de construção.

Pendências e próximas etapas: veja [PENDENCIAS.md](./PENDENCIAS.md).
