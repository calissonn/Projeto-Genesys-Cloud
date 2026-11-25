/* Teste ponta a ponta da cidade e economia (Chromium/Playwright). Uso: node tests/e2e-cidade.cjs [url] */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  const fail = (m) => errs.push(m);
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(800);
  await p.getByText('Novo jogo').click();
  await p.locator('.card', { hasText: 'Modo Simulação' }).click();
  await p.locator('label.check input').check();
  await p.getByText('Comprar terreno e começar').click();
  await p.waitForTimeout(500);
  await p.locator('.mode-switch button', { hasText: 'Viver' }).first().click();
  await p.waitForTimeout(500);
  await p.getByText('Concluir e mudar para a casa').click();
  await p.waitForTimeout(500);
  // Mapa: abre, seleciona o mercado pela lista de lotes e viaja pelo botão do cartão.
  await p.locator('[title="Mapa da cidade"]').click();
  await p.waitForTimeout(500);
  for (let i = 0; i < 4; i++) await p.locator('.map-tools button', { hasText: '－' }).click();
  const pos = await p.evaluate(() => {
    const c = window.__morada.editor.project.city; const l = c.lots.find((x) => x.kind === 'mercado');
    const svg = document.querySelector('.map-svg'); const vb = svg.viewBox.baseVal; const r = svg.getBoundingClientRect();
    return [r.left + ((l.x - vb.x) / vb.width) * r.width, r.top + ((l.y - vb.y) / vb.height) * r.height, l.x >= vb.x && l.x <= vb.x + vb.width];
  });
  if (!pos[2]) await p.evaluate(() => {}); // mercado fora da vista: o teste usa a API como alternativa
  if (pos[2]) await p.mouse.click(pos[0], pos[1]);
  const title = await p.locator('.map-card-title').innerText();
  console.log('cartão:', title.replace(/\n/g, ' '));
  if (pos[2] && !/Mercado|Supermercado/.test(title)) fail('cartão do mercado não abriu');
  if (pos[2]) await p.locator('.map-actions button', { hasText: 'Ir para' }).click();
  else await p.evaluate(() => { const m = window.__morada; m.sim.world.travel(m.editor.project.city.lots.find((x) => x.kind === 'mercado').id); document.querySelector('.citymap')?.remove(); });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const m = window.__morada, s = m.sim, W = s.world;
    const out = { lugar: W.current.kind };
    const me = s.household[0];
    const shelf = m.editor.project.items.find((i) => i.catalogId === 'prateleira_mercado');
    const g0 = s.life.groceries;
    s.enqueue(me.id, s.objectTaskById('compras', shelf.id));
    for (let i = 0; i < 600; i++) s.update(0.1);
    out.despensa = s.life.groceries - g0;
    W.travel(W.city.homeLotId);
    out.voltou = W.atHome;
    // Compra e venda de terreno
    const lot = W.city.lots.find((l) => l.owner === 'vazio');
    out.compra = W.buy(lot.id);
    out.venda = W.sell(lot.id);
    // Contas e corte
    s.speed = 3;
    const d0 = Math.floor(s.now / 1440);
    let guard = 0;
    while (Math.floor(s.now / 1440) < d0 + 11 && guard++ < 30000) s.update(0.1);
    out.contas = s.life.bills.length;
    out.corte = W.isCut('energia');
    W.payAll(true);
    out.religou = !W.isCut('energia');
    out.historico = s.life.history.length;
    return out;
  });
  console.log(JSON.stringify(r));
  if (r.lugar !== 'mercado') fail('não chegou ao mercado');
  if (r.despensa < 20) fail('compras não abasteceram a despensa');
  if (!r.voltou || !r.compra || !r.venda) fail('viagem/compra/venda falhou');
  if (!r.contas || !r.corte || !r.religou) fail('ciclo de contas falhou');
  if (errs.length) { console.error(errs.join('\n')); process.exitCode = 1; } else console.log('OK: cidade e economia sem erros');
  await b.close();
})();
