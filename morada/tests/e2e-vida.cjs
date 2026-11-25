/* Teste ponta a ponta do modo Vida (Chromium/Playwright). Uso: node tests/e2e-vida.cjs [url] */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  const fail = (m) => { errs.push(m); };
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
  await p.waitForTimeout(600);
  await p.locator('.cas-add button', { hasText: '+ Adulto' }).click();
  await p.locator('.cas-tabs button', { hasText: 'Relações' }).click();
  await p.locator('.cas-panel .cas-row').first().locator('button', { hasText: 'Cônjuges' }).click();
  await p.getByText('Concluir e mudar para a casa').click();
  await p.waitForTimeout(600);
  const ev = (f, a) => p.evaluate(f, a);
  const n = await ev(() => window.__morada.sim.household.length);
  console.log('família:', n);
  if (n !== 2) fail('família não foi criada');
  // Cozinhar pelo menu de interação
  const stove = await ev(() => { const e = window.__morada.editor; const it = e.project.items.find((i) => i.catalogId === 'fogao'); e.rig.target.set(it.pos.x, 0, it.pos.y); e.rig.distance = 10; e.rig.update(); const V = e.rig.camera.position.constructor; const s = e.rig.project(new V(it.pos.x, 0.92, it.pos.y)); return [s.x, s.y]; });
  await p.waitForTimeout(200);
  await p.mouse.click(stove[0], stove[1]);
  await p.waitForTimeout(450);
  await p.locator('.pie button', { hasText: 'Cozinhar refeição' }).click();
  const fome = await ev(() => {
    const s = window.__morada.sim; const id = window.__morada.life.selected; const a = s.agents.get(id);
    a.sim.needs.fome = 20;
    for (let i = 0; i < 900; i++) s.update(0.1);
    return a.sim.needs.fome;
  });
  console.log('fome após cozinhar e comer:', fome.toFixed(0));
  if (fome < 60) fail('personagem não comeu');
  // Festa, pet e bebê
  await p.locator('.lifeside .tabs button', { hasText: 'Família' }).click().catch(() => {});
  const res = await ev(() => {
    const s = window.__morada.sim;
    s.throwParty();
    s.adoptPet('cachorro', 'Bolinha');
    const [a, c] = s.household;
    s.rel(a.id, c.id).romance = 90;
    a.pregnantUntil = s.now + 30;
    s.speed = 3;
    for (let i = 0; i < 3000; i++) s.update(0.1);
    return { family: s.household.map((x) => x.age).join(','), pets: s.life.pets.length, log: s.life.log.length };
  });
  console.log('após festa/bebê:', JSON.stringify(res));
  if (!res.family.includes('bebe') && !res.family.includes('crianca')) fail('bebê não nasceu');
  // Desfazer da construção não altera a família
  await p.locator('.life .mode-switch button', { hasText: 'Construir' }).click();
  const before = await ev(() => window.__morada.sim.life.sims.length);
  await ev(() => { const e = window.__morada.editor; e.commit('t', (pr) => { pr.walls.push({ id: 'wt', level: 0, a: { x: 8, y: 8 }, b: { x: 9, y: 8 }, bulge: 0, height: 3, thickness: 0.15, kind: 'parede', material: 'pintura', color: '#fff' }); }); e.undo(); });
  const after = await ev(() => window.__morada.sim.life.sims.length);
  console.log('sims antes/depois do desfazer:', before, after);
  if (before !== after) fail('desfazer alterou a família');
  if (errs.length) { console.error(errs.join('\n')); process.exitCode = 1; } else console.log('OK: modo Vida sem erros');
  await b.close();
})();
