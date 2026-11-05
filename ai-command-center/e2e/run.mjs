/**
 * Teste ponta a ponta: sobe orquestrador (modo demo) + web, abre o navegador e percorre
 * o fluxo completo verificando que as animações seguem o estado real dos agentes.
 *
 * Pré-requisitos: `npm run build` e Playwright com Chromium disponível
 * (`npm i -D playwright && npx playwright install chromium`).
 * Capturas de tela: e2e/screenshots/
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'e2e/screenshots');
const ORCH_PORT = '4417';
const WEB_PORT = '3100';
const TOKEN = 'token-do-teste-ponta-a-ponta-123456';
const dataDir = mkdtempSync(path.join(os.tmpdir(), 'acc-e2e-'));
mkdirSync(SHOTS, { recursive: true });

const env = { ...process.env, ACC_MODE: 'demo', ACC_PORT: ORCH_PORT, ACC_TOKEN: TOKEN, ACC_DATA_DIR: dataDir, ACC_DEMO_SPEED: process.env.ACC_DEMO_SPEED ?? '1', ACC_ALLOWED_ORIGIN: `http://localhost:${WEB_PORT}` };
const procs = [];
function start(name, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  p.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${name}] ${d}`));
  procs.push(p);
  return p;
}
async function waitHttp(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Servidor não respondeu: ${url}`);
}

let failures = 0;
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`  ✔ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (err) {
    failures++;
    console.log(`  ✖ ${name}\n    ${err.message.split('\n')[0]}`);
    throw err;
  }
};

start('orq', 'node', ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/main.ts'], path.join(ROOT, 'apps/orchestrator'));
start('web', 'npx', ['next', 'start', '-p', WEB_PORT], path.join(ROOT, 'apps/web'));

const browser = await chromium.launch();
try {
  await waitHttp(`http://127.0.0.1:${ORCH_PORT}/api/health`);
  await waitHttp(`http://localhost:${WEB_PORT}/`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const actors = () => page.evaluate(() => window.__acc?.actors() ?? []);
  const actor = async (id) => (await actors()).find((a) => a.id === id);
  /** Espera até o personagem chegar ao destino com a pose esperada (sem estar andando). */
  const waitActor = async (id, check, label, ms = 40000) => {
    const end = Date.now() + ms;
    let last;
    while (Date.now() < end) {
      last = await actor(id);
      if (last && !last.moving && check(last)) return last;
      await page.waitForTimeout(150);
    }
    throw new Error(`${label}: último estado ${JSON.stringify(last)}`);
  };
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

  console.log('Fluxo ponta a ponta (modo demonstração)');
  await page.goto(`http://localhost:${WEB_PORT}/`);

  await step('carrega o prédio, a faixa de demonstração e os 4 agentes', async () => {
    await page.getByTestId('demo-banner').waitFor();
    await page.waitForFunction(() => (window.__acc?.actors().length ?? 0) === 4, null, { timeout: 20000 });
    for (const id of ['ag-coordinator', 'ag-programmer', 'ag-designer', 'ag-tester']) {
      await waitActor(id, (a) => a.state === 'idle' && a.pose === 'coffee' && a.badge === null, `${id} ocioso`);
    }
    await shot('01-ociosos');
  });

  await step('criar projeto pela interface: coordenadora vai à reunião planejar', async () => {
    await page.getByPlaceholder('Portal de clientes').fill('Portal de clientes');
    await page.getByPlaceholder('Portal com login, lista de pedidos e API').fill('Página institucional com formulário de contato');
    await page.getByRole('button', { name: 'Criar projeto' }).click();
    await waitActor('ag-coordinator', (a) => a.state === 'meeting' && a.pose === 'talk' && a.badge === 'meeting' && a.floor === 5, 'coordenadora em reunião', 10000);
    await shot('02-reuniao-planejamento');
  });

  await step('plano aguarda aprovação: coordenadora levanta a mão na central de aprovações', async () => {
    await waitActor('ag-coordinator', (a) => a.state === 'awaiting_approval' && a.pose === 'raise' && a.badge === 'alert', 'coordenadora aguardando');
    await page.getByTestId('approvals').getByText('Aprovar plano').waitFor();
    // Nada começa antes da aprovação.
    for (const id of ['ag-programmer', 'ag-designer', 'ag-tester']) {
      const a = await actor(id);
      if (a.state !== 'idle') throw new Error(`${id} saiu do ócio antes da aprovação`);
    }
    await shot('03-aprovacao-do-plano');
    await page.getByTestId('approvals').getByRole('button', { name: 'Aprovar' }).first().click();
  });

  await step('designer trabalha na mesa: digitando com código no monitor', async () => {
    await waitActor('ag-designer', (a) => a.state === 'typing' && a.pose === 'type' && a.badge === 'code' && a.floor === 3, 'designer digitando');
    await shot('04-designer-digitando');
  });

  await step('programador recebe o resultado da designer (conversa no 3º andar) e depois pede aprovação', async () => {
    await waitActor('ag-programmer', (a) => a.state === 'talking' && a.floor === 3 && a.pose === 'talk', 'programador conversando no andar da designer');
    await shot('05-repasse-entre-agentes');
    await waitActor('ag-programmer', (a) => a.state === 'awaiting_approval' && a.pose === 'raise' && a.badge === 'alert' && a.floor === 4, 'programador pedindo aprovação');
    await page.getByTestId('approvals').getByText('Instalar dependência').waitFor();
    await shot('06-pedido-de-aprovacao');
  });

  await step('clicar no personagem abre o painel com tarefa, histórico e detalhes da execução', async () => {
    const a = await actor('ag-programmer');
    await page.mouse.click(a.clientX, a.clientY);
    const panel = page.getByTestId('agent-panel');
    await panel.getByRole('heading', { name: 'Téo' }).waitFor();
    await panel.getByText('Aguardando aprovação', { exact: false }).first().waitFor();
    await panel.getByTestId('agent-history').getByText('Pediu aprovação', { exact: false }).first().waitFor();
    await shot('07-painel-do-agente');
    await panel.getByTestId('run-details-button').click();
    await page.getByRole('dialog', { name: 'Detalhes da execução' }).getByText('Iniciou a execução', { exact: false }).waitFor();
    await shot('08-detalhes-da-execucao');
    await page.getByRole('dialog', { name: 'Detalhes da execução' }).getByRole('button', { name: 'Fechar' }).click();
    await panel.getByRole('button', { name: 'Fechar painel' }).click();
    await page.getByTestId('approvals').getByRole('button', { name: 'Aprovar' }).first().click();
  });

  await step('testador executa os testes no laboratório', async () => {
    await waitActor('ag-tester', (a) => a.state === 'testing' && a.floor === 2 && a.pose === 'type' && a.badge === 'test' && a.x > 330, 'testador no laboratório', 60000);
    await shot('09-testes-no-laboratorio');
  });

  await step('conclusão: projeto concluído e balão de sucesso', async () => {
    await waitActor('ag-tester', (a) => a.state === 'done' && a.badge === 'check', 'testador concluiu', 30000);
    await page.getByTestId('projects').getByText('Concluído').first().waitFor();
    await shot('10-concluido');
  });

  await step('projeto com erro: testador sinaliza erro', async () => {
    await page.getByPlaceholder('Portal de clientes').fill('Projeto com erro');
    await page.getByPlaceholder('Portal com login, lista de pedidos e API').fill('Página simples para demonstrar falha #erro');
    await page.getByRole('button', { name: 'Criar projeto' }).click();
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const btn = page.getByTestId('approvals').getByRole('button', { name: 'Aprovar' }).first();
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
      const t = await actor('ag-tester');
      if (t.state === 'error' && !t.moving && t.badge === 'error' && t.pose === 'sad') break;
      await page.waitForTimeout(250);
    }
    await waitActor('ag-tester', (a) => a.state === 'error' && a.badge === 'error', 'testador com erro', 1000);
    await page.getByTestId('projects').getByText('Com falhas').first().waitFor();
    await shot('11-erro');
  });

  await step('celular: layout sem rolagem horizontal', async () => {
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await mobile.goto(`http://localhost:${WEB_PORT}/`);
    await mobile.waitForFunction(() => (window.__acc?.actors().length ?? 0) === 4, null, { timeout: 20000 });
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) throw new Error(`rolagem horizontal de ${overflow}px`);
    await mobile.screenshot({ path: path.join(SHOTS, '12-celular.png') });
    await mobile.close();
  });

  if (errors.length) {
    failures++;
    console.log('  ✖ erros de JavaScript na página:\n    ' + errors.join('\n    '));
  }
} catch {
  /* falha já registrada */
} finally {
  await browser.close();
  // Encerra o grupo de processos inteiro (npx inicia processos filhos).
  for (const p of procs) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      /* já encerrado */
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} falha(s)` : `\nTudo certo. Capturas em ${path.relative(process.cwd(), SHOTS)}/`);
process.exit(failures ? 1 : 0);
