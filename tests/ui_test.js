// Teste de interface: node tests/ui_test.js  (com o site rodando em http://127.0.0.1:8000)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8000';
const OUT = process.env.OUT || path.join(__dirname, 'screens');
fs.mkdirSync(OUT, { recursive: true });
const mock = fs.readFileSync(path.join(__dirname, 'mock-livekit.js'), 'utf8');
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('ok -', m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 }, permissions: ['camera', 'microphone'] });
  await ctx.route(/livekit-client/, (r) => r.fulfill({ contentType: 'application/javascript', body: mock }));
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + '.png') });

  await p.goto(BASE + '/sala/equipe-semanal');
  await p.waitForFunction(() => !!document.querySelector('#preview').srcObject, null, { timeout: 15000 });
  ok(await p.inputValue('#room') === 'equipe-semanal', 'link de convite preenche a sala');
  ok(await p.evaluate(() => !!document.querySelector('#preview').srcObject), 'pré-visualização da câmera no lobby');
  await p.fill('#name', 'João Pedro');
  await shot('1-lobby');

  await p.click('#joinBtn');
  await p.waitForSelector('#meeting:not([hidden])');
  await p.waitForTimeout(800);
  ok(await p.locator('.tile').count() === 1, 'entrou e mostra o próprio vídeo');
  ok(await p.evaluate(() => __room.localParticipant.isCameraEnabled && __room.localParticipant.isMicrophoneEnabled), 'webcam e microfone publicados');

  await p.evaluate(() => { __mock.addRemote('Vander'); __mock.addRemote('Ana'); __mock.addRemote('Carla', { cam: false }); });
  await p.waitForTimeout(700);
  ok(await p.locator('#grid .tile').count() === 4, 'grade com 4 participantes');
  ok(await p.locator('audio').count() === 3, 'áudio remoto anexado');
  await p.evaluate(() => __mock.speak('id-vander', true));
  await p.waitForTimeout(300);
  ok(await p.locator('.tile.speaking').count() === 1, 'destaque de quem está falando');
  await shot('2-grade');

  await p.click('#micBtn'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !__room.localParticipant.isMicrophoneEnabled) && await p.locator('#micBtn.off').count() === 1, 'desligar microfone');
  await p.click('#camBtn'); await p.waitForTimeout(300);
  ok(await p.locator('.tile.local:not(.has-video)').count() === 1, 'desligar câmera mostra avatar');
  await p.click('#camBtn'); await p.click('#micBtn'); await p.waitForTimeout(300);

  await p.click('#screenBtn'); await p.waitForTimeout(700);
  ok(await p.locator('#stage .tile.screen').count() === 1, 'compartilhamento de tela em destaque');
  ok(await p.locator('#grid .tile').count() === 4, 'câmeras em faixa abaixo da apresentação');
  await p.click('#stage .tile.screen .fs'); await p.waitForTimeout(500);
  ok(await p.locator('#fullShare:not([hidden])').count() === 1, 'abre a apresentação em tela cheia');
  ok(await p.locator('#fullStage .tile.screen').count() === 1, 'bloco da tela vai para a sobreposição');
  ok(await p.evaluate(() => document.querySelector('#fullStage .tile').getBoundingClientRect().width === window.innerWidth), 'sobreposição ocupa a largura da tela');
  await shot('3b-tela-cheia');
  await p.click('#exitFull'); await p.waitForTimeout(500);
  ok(await p.locator('#fullShare[hidden]').count() === 1, 'fecha a tela cheia');
  ok(await p.locator('#stage .tile.screen').count() === 1, 'bloco volta para o destaque');
  await shot('3-tela');
  await p.click('#screenBtn'); await p.waitForTimeout(500);
  ok(await p.locator('#stage .tile').count() === 0, 'parar compartilhamento volta à grade');

  await p.evaluate(() => { __mock.leave('id-ana'); __mock.addRemote('Bruno', { screen: true }); });
  await p.waitForTimeout(600);
  ok(await p.locator('#stage .tile.screen').count() === 1, 'tela de participante remoto em destaque');
  await p.click('#stage .tile.screen .fs'); await p.waitForTimeout(400);
  ok(await p.locator('#fullShare:not([hidden])').count() === 1, 'tela cheia da apresentação remota');
  await p.evaluate(() => { __mock.leave('id-bruno'); __mock.addRemote('Bruno'); }); await p.waitForTimeout(600);
  ok(await p.locator('#fullShare[hidden]').count() === 1, 'tela cheia fecha quando a apresentação termina');

  await p.evaluate(() => __mock.chat('id-vander', 'Bom dia, pessoal!'));
  await p.waitForTimeout(300);
  ok(await p.locator('#unread:not([hidden])').count() === 1, 'aviso de mensagem não lida');
  await p.click('#chatBtn');
  await p.fill('#chatInput', 'Bom dia! Podemos começar.');
  await p.press('#chatInput', 'Enter'); await p.waitForTimeout(300);
  ok(await p.locator('.msg').count() === 2, 'chat recebe e envia');
  ok(await p.evaluate(() => __sent?.[0]?.opts?.topic === 'chat' && __sent[0].opts.reliable), 'mensagem enviada pelo canal de dados');
  await shot('4-chat');

  await p.click('[data-tab=people]'); await p.waitForTimeout(200);
  ok(await p.locator('#people li').count() === 4, 'lista de participantes');
  await shot('5-participantes');

  await p.click('#settingsBtn'); await p.selectOption('#videoDev', 'd2'); await p.waitForTimeout(200);
  ok((await p.evaluate(() => __switched))?.[0] === 'videoinput', 'troca de câmera durante a reunião');
  await p.keyboard.press('Escape');

  await p.click('#leaveBtn'); await p.waitForTimeout(300);
  ok(await p.locator('#left:not([hidden])').count() === 1, 'sair da reunião');

  ok(errors.length === 0, 'sem erros de JavaScript ' + JSON.stringify(errors));
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
