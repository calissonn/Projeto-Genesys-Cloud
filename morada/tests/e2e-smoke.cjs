const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(800);
  // Modo simulação, terreno pequeno
  await p.getByText('Novo jogo').click();
  await p.locator('.card', { hasText: 'Modo Simulação' }).click();
  await p.locator('.card', { hasText: 'Pequeno' }).click();
  await p.getByText('Comprar terreno e começar').click();
  await p.waitForTimeout(500);
  const ed = (f) => p.evaluate(f);
  const scr = (x, z, y = 0) => p.evaluate(([x, y, z]) => { const e = window.__morada.editor; const V = e.rig.camera.position.constructor; const s = e.rig.project(new V(x, y, z)); return [s.x, s.y]; }, [x, y, z]);
  const drag = async (a, bb) => { await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(bb[0], bb[1], { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(150); };
  console.log('saldo inicial', await ed(() => window.__morada.editor.project.funds));
  // Paredes livres formando um polígono (cômodo livre) sem piso, depois preencher
  await p.locator('.tool-btn[title="Paredes"]').click();
  await p.locator('.options button', { hasText: 'Cômodo livre' }).click();
  await p.locator('.options button', { hasText: 'Criar piso' }).click();
  for (const [x, z] of [[-4, -4], [3, -4], [4, 1], [0, 4], [-4, 2]]) await p.mouse.click(...(await scr(x, z)));
  await p.mouse.click(...(await scr(-4, -4)));
  await p.waitForTimeout(200);
  console.log('paredes polígono', await ed(() => window.__morada.editor.project.walls.length), 'pisos', await ed(() => window.__morada.editor.project.floors.length));
  await p.locator('.tool-btn[title="Pisos"]').click();
  await p.locator('.options button', { hasText: 'Preencher cômodo' }).click();
  await p.mouse.click(...(await scr(0, 0)));
  await p.waitForTimeout(200);
  console.log('pisos após preencher', await ed(() => window.__morada.editor.project.floors.map(f => f.points.length)));
  // Pintar uma parede de tijolo
  await p.locator('.tool-btn[title="Pintar"]').click();
  await p.locator('.options .seg.mats button', { hasText: 'Tijolo aparente' }).click();
  await p.mouse.click(...(await scr(-0.5, -4, 1.5)));
  await p.waitForTimeout(200);
  console.log('materiais paredes', await ed(() => window.__morada.editor.project.walls.map(w => w.material).join(',')));
  // Bloqueio por saldo: tentar colocar 3 elevadores (85 mil cada) com saldo ~612 mil - obra
  const bal = await ed(() => { const e = window.__morada.editor; return e.project.funds; });
  await ed(() => { const e = window.__morada.editor; e.project.funds = 20000; });
  await p.locator('.tool-btn[title="Objetos"]').click();
  await p.locator('.cat-tabs button', { hasText: 'Estrutura' }).click();
  await p.locator('.cat-item', { hasText: 'Elevador' }).click();
  await p.mouse.click(...(await scr(0, 0)));
  await p.waitForTimeout(300);
  console.log('itens após tentativa sem saldo', await ed(() => window.__morada.editor.project.items.length), await p.locator('.toast').allInnerTexts());
  await ed((b) => { window.__morada.editor.project.funds = b; }, bal);
  // Demolir uma parede
  await p.locator('.tool-btn[title="Demolir"]').click();
  const n0 = await ed(() => window.__morada.editor.project.walls.length);
  await p.mouse.click(...(await scr(-0.5, -4, 1.5)));
  await p.waitForTimeout(200);
  console.log('demolir parede', n0, '->', await ed(() => window.__morada.editor.project.walls.length));
  // Salvamento persistente: recarrega e continua
  await ed(() => window.__morada.editor.saveNow());
  await p.reload();
  await p.waitForTimeout(800);
  await p.getByText('Continuar').click();
  await p.waitForTimeout(400);
  console.log('após recarregar', await ed(() => { const pr = window.__morada.editor.project; return `${pr.mode} paredes=${pr.walls.length} pisos=${pr.floors.length} lote=${pr.lot.w}x${pr.lot.d}`; }));
  if (errs.length) { console.error(errs.join('\n')); process.exitCode = 1; } else console.log('OK: nenhum erro de página');
  await b.close();
})();
