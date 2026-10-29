/* Reunião · cliente web (LiveKit JS SDK v2) */
'use strict';

const LK = window.LivekitClient;
const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ ícones */
const P = {
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<path d="M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>',
  cam: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h8A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 15.5v-7Z"/><path d="m16 10.7 4.2-2.6a.5.5 0 0 1 .8.4v7a.5.5 0 0 1-.8.4L16 13.3"/>',
  camOff: '<path d="M3 3l18 18M8 6h5.5A2.5 2.5 0 0 1 16 8.5V12m0 4a2.5 2.5 0 0 1-2.5 2h-8A2.5 2.5 0 0 1 3 15.5v-7A2.5 2.5 0 0 1 5 6"/><path d="m16 10.7 4.2-2.6a.5.5 0 0 1 .8.4v7a.5.5 0 0 1-.8.4"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M12 13V7M9.5 9.5 12 7l2.5 2.5"/>',
  chat: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4V5.5Z"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5ZM12 14v6"/>',
  expand: '<path d="M9 4H4v5M15 20h5v-5M15 4h5v5M9 20H4v-5"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24">${P[n]}</svg>`;

/* --------------------------------------------------------------- utilidades */
const store = {
  get(k, d) { try { const v = localStorage.getItem('reuniao.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('reuniao.' + k, JSON.stringify(v)); } catch { /* sem storage */ } },
};
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function initials(name) { const p = String(name || '?').trim().split(/\s+/); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function colorFor(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 45% 42%)`; }
function slug(t) { return String(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63); }
function randomRoom() {
  const a = ['azul', 'verde', 'sol', 'rio', 'mar', 'lua', 'serra', 'vento', 'luz', 'ipe'];
  const r = () => a[Math.floor(Math.random() * a.length)];
  return `${r()}-${r()}-${Math.random().toString(36).slice(2, 6)}`;
}
let toastT;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }
const isMediaErr = (e) => e && /NotAllowed|Permission|NotFound|NotReadable|Overconstrained/i.test(e.name + ' ' + e.message);

/* ==================================================================== LOBBY */
const prefs = { mic: store.get('mic', true), cam: store.get('cam', true), videoDev: store.get('videoDev', ''), audioDev: store.get('audioDev', '') };
let cfg = { livekitUrl: '', requiresCode: false };
let previewStream = null;

function paintPreviewBtns() {
  $('#pvMic').className = 'round' + (prefs.mic ? ' on' : ''); $('#pvMic').innerHTML = ic(prefs.mic ? 'mic' : 'micOff');
  $('#pvCam').className = 'round' + (prefs.cam ? ' on' : ''); $('#pvCam').innerHTML = ic(prefs.cam ? 'cam' : 'camOff');
  $('#previewOff').hidden = !!(prefs.cam && previewStream?.getVideoTracks().length);
  $('#previewAvatar').textContent = initials($('#name').value);
  $('#previewAvatar').style.setProperty('--c', colorFor($('#name').value || '?'));
}
function stopPreview() { previewStream?.getTracks().forEach((t) => t.stop()); previewStream = null; $('#preview').srcObject = null; }

async function startPreview() {
  stopPreview();
  if (!prefs.cam || !navigator.mediaDevices?.getUserMedia) return paintPreviewBtns();
  try {
    previewStream = await navigator.mediaDevices.getUserMedia({ video: prefs.videoDev ? { deviceId: { exact: prefs.videoDev } } : true });
    $('#preview').srcObject = previewStream;
  } catch (e) {
    if (prefs.videoDev) { prefs.videoDev = ''; return startPreview(); }
    showLobbyErr('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
  }
  paintPreviewBtns();
}

async function fillDevices(kind, sel, current) {
  let list = [];
  try { list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === kind && d.deviceId); } catch { /* sem suporte */ }
  sel.innerHTML = list.length
    ? list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `${kind === 'videoinput' ? 'Câmera' : 'Microfone'} ${i + 1}`)}</option>`).join('')
    : '<option value="">Padrão do sistema</option>';
  if (current && list.some((d) => d.deviceId === current)) sel.value = current;
}

async function askPermissionsOnce() {
  // Pede permissão de áudio e vídeo uma vez para liberar os nomes dos dispositivos.
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); s.getTracks().forEach((t) => t.stop()); }
  catch { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch { /* segue sem */ } }
}

function showLobbyErr(msg) { const e = $('#lobbyErr'); e.textContent = msg; e.hidden = !msg; }

async function initLobby() {
  const m = location.pathname.match(/^\/sala\/([^/]+)/);
  $('#room').value = m ? decodeURIComponent(m[1]) : randomRoom();
  $('#name').value = store.get('name', '');
  paintPreviewBtns();

  if (!LK) { showLobbyErr('Não foi possível carregar o SDK do LiveKit (livekit-client). Verifique a conexão com a internet.'); $('#joinBtn').disabled = true; }
  try { cfg = await (await fetch('/api/config')).json(); $('#codeWrap').hidden = !cfg.requiresCode; } catch { showLobbyErr('Servidor indisponível.'); }

  if (navigator.mediaDevices?.getUserMedia) {
    await askPermissionsOnce();
    await fillDevices('videoinput', $('#pvVideoDev'), prefs.videoDev);
    await fillDevices('audioinput', $('#pvAudioDev'), prefs.audioDev);
    await startPreview();
  } else {
    showLobbyErr('Este navegador não permite acesso à câmera. Use HTTPS ou localhost.');
  }
  (m ? $('#name') : $('#name')).focus();
}

$('#pvMic').onclick = () => { prefs.mic = !prefs.mic; store.set('mic', prefs.mic); paintPreviewBtns(); };
$('#pvCam').onclick = () => { prefs.cam = !prefs.cam; store.set('cam', prefs.cam); startPreview(); };
$('#pvVideoDev').onchange = (e) => { prefs.videoDev = e.target.value; store.set('videoDev', prefs.videoDev); startPreview(); };
$('#pvAudioDev').onchange = (e) => { prefs.audioDev = e.target.value; store.set('audioDev', prefs.audioDev); };
$('#name').oninput = paintPreviewBtns;
$('#newRoom').onclick = () => { $('#room').value = randomRoom(); };

$('#joinForm').onsubmit = async (ev) => {
  ev.preventDefault();
  showLobbyErr('');
  const name = $('#name').value.trim();
  const roomName = slug($('#room').value);
  if (!name) return showLobbyErr('Informe seu nome.');
  if (roomName.length < 2) return showLobbyErr('Informe um nome de sala com pelo menos 2 caracteres.');
  store.set('name', name);
  const btn = $('#joinBtn'); btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const r = await fetch('/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, room: roomName, code: $('#code').value }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao entrar.');
    stopPreview();
    await joinRoom(data);
  } catch (e) {
    showLobbyErr(e.message || String(e));
    btn.disabled = false; btn.textContent = 'Entrar na reunião';
    if (!previewStream) startPreview();
  }
};

/* ==================================================================== SALA */
let room = null;
let roomName = '';
let startedAt = 0;
let timerI = 0;
let pinned = null;            // chave do bloco fixado
let fullKey = null;           // bloco aberto em tela cheia
let layoutMode = 'auto';      // 'auto' (tela em destaque) | 'grid'
let leftByUser = false;
const tiles = new Map();      // chave -> { el, video, track }
const audioEls = new Map();   // trackSid -> elementos <audio>

async function joinRoom({ token, url, room: rn }) {
  roomName = rn;
  const VP = LK.VideoPresets;
  room = new LK.Room({
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: { deviceId: prefs.videoDev || undefined, resolution: VP?.h720?.resolution },
    audioCaptureDefaults: { deviceId: prefs.audioDev || undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: { simulcast: true, screenShareEncoding: LK.ScreenSharePresets?.h1080fps15?.encoding },
  });
  bindRoomEvents(room);

  await room.connect(url, token);

  $('#lobby').hidden = true; $('#meeting').hidden = false;
  $('#roomTitle').textContent = roomName;
  history.replaceState(null, '', '/sala/' + encodeURIComponent(roomName));
  document.title = `${roomName} · Reunião`;
  startedAt = Date.now(); timerI = setInterval(tick, 1000); tick();

  // Publica áudio e vídeo conforme o que foi escolhido no lobby.
  try { await room.localParticipant.setMicrophoneEnabled(prefs.mic); } catch (e) { mediaError('microfone', e); }
  try { await room.localParticipant.setCameraEnabled(prefs.cam); } catch (e) { mediaError('câmera', e); }

  if (!navigator.mediaDevices?.getDisplayMedia) $('#screenBtn').hidden = true;
  if (!room.canPlaybackAudio) $('#audioUnlock').hidden = false;
  paintControls(); sync();
}

function bindRoomEvents(r) {
  const E = LK.RoomEvent;
  const resync = () => sync();
  [E.ParticipantConnected, E.ParticipantDisconnected, E.TrackPublished, E.TrackUnpublished,
    E.TrackSubscribed, E.TrackUnsubscribed, E.TrackMuted, E.TrackUnmuted, E.LocalTrackPublished,
    E.LocalTrackUnpublished, E.ActiveSpeakersChanged, E.ConnectionQualityChanged,
    E.ParticipantNameChanged].forEach((ev) => ev && r.on(ev, resync));

  r.on(E.ParticipantConnected, (p) => toast(`${p.name || p.identity} entrou`));
  r.on(E.ParticipantDisconnected, (p) => toast(`${p.name || p.identity} saiu`));

  r.on(E.TrackSubscribed, (track) => {
    if (track.kind !== 'audio') return;
    const el = track.attach(); el.hidden = true; document.body.appendChild(el);
    audioEls.set(track.sid, el);
  });
  r.on(E.TrackUnsubscribed, (track) => {
    if (track.kind !== 'audio') return;
    track.detach().forEach((el) => el.remove()); audioEls.delete(track.sid);
  });
  r.on(E.LocalTrackPublished, paintControls);
  r.on(E.LocalTrackUnpublished, paintControls);
  r.on(E.TrackMuted, paintControls);
  r.on(E.TrackUnmuted, paintControls);

  r.on(E.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== 'chat') return;
    try { const m = JSON.parse(dec.decode(payload)); addMessage(participant?.name || participant?.identity || 'Alguém', m.text, m.ts, false); } catch { /* ignora */ }
  });

  r.on(E.AudioPlaybackStatusChanged, () => { $('#audioUnlock').hidden = r.canPlaybackAudio; });
  r.on(E.Reconnecting, () => { $('#netBadge').hidden = false; });
  r.on(E.Reconnected, () => { $('#netBadge').hidden = true; toast('Conexão restabelecida'); });
  r.on(E.MediaDevicesError, (e) => mediaError('dispositivo', e));
  r.on(E.Disconnected, (reason) => onDisconnected(reason));
}

function mediaError(what, e) {
  console.warn(what, e);
  toast(isMediaErr(e) ? `Sem acesso ao ${what}. Verifique as permissões do navegador.` : `Erro no ${what}: ${e.message || e}`, 4000);
}

function onDisconnected(reason) {
  clearInterval(timerI);
  closeFull();
  tiles.forEach((t) => t.track?.detach(t.video)); tiles.clear();
  audioEls.forEach((el) => el.remove()); audioEls.clear();
  $('#meeting').hidden = true; $('#left').hidden = false;
  const R = LK.DisconnectReason || {};
  let msg = 'A conexão com a reunião foi encerrada.';
  if (leftByUser || reason === R.CLIENT_INITIATED) msg = 'Até a próxima!';
  else if (reason === R.DUPLICATE_IDENTITY) msg = 'Você entrou na mesma sala em outra aba.';
  else if (reason === R.PARTICIPANT_REMOVED) msg = 'Você foi removido da sala.';
  else if (reason === R.ROOM_DELETED) msg = 'A sala foi encerrada.';
  $('#leftReason').textContent = msg;
  document.title = 'Reunião';
}

function tick() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  $('#timer').textContent = (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

/* --------------------------------------------------------- renderização */
let syncQueued = false;
function sync() { if (syncQueued) return; syncQueued = true; requestAnimationFrame(() => { syncQueued = false; render(); }); }

function allParticipants() { return room ? [room.localParticipant, ...room.remoteParticipants.values()] : []; }

function videoTrackOf(p, source) {
  const pub = p.getTrackPublication(source);
  if (!pub || pub.isMuted || !pub.track) return null;
  return pub.track;
}

function render() {
  if (!room) return;
  const S = LK.Track.Source;
  const wanted = [];
  for (const p of allParticipants()) {
    const screen = videoTrackOf(p, S.ScreenShare);
    if (screen) wanted.push({ key: p.identity + ':screen', p, kind: 'screen', track: screen });
    wanted.push({ key: p.identity + ':camera', p, kind: 'camera', track: videoTrackOf(p, S.Camera) });
  }
  const keys = new Set(wanted.map((w) => w.key));
  for (const [k, t] of tiles) if (!keys.has(k)) { t.track?.detach(t.video); t.el.remove(); tiles.delete(k); }
  if (pinned && !keys.has(pinned)) pinned = null;
  if (fullKey && !keys.has(fullKey)) closeFull();

  for (const w of wanted) updateTile(w);

  // Escolhe o bloco em destaque: fixado > tela compartilhada (layout automático).
  let stageKey = pinned;
  if (!stageKey && layoutMode === 'auto') stageKey = wanted.find((w) => w.kind === 'screen')?.key || null;

  const stage = $('#stage'), grid = $('#grid'), full = $('#fullStage');
  $('#stageWrap').classList.toggle('has-stage', !!stageKey);
  stage.hidden = !stageKey;
  const order = [...wanted].sort((a, b) => (b.kind === 'screen') - (a.kind === 'screen'));
  for (const w of order) {
    const el = tiles.get(w.key).el;
    const parent = w.key === fullKey ? full : w.key === stageKey ? stage : grid;
    if (el.parentElement !== parent) { parent.appendChild(el); tiles.get(w.key).video.play?.().catch(() => {}); }
  }
  // mantém a ordem na grade
  order.filter((w) => w.key !== stageKey && w.key !== fullKey).forEach((w) => grid.appendChild(tiles.get(w.key).el));

  layoutGrid();
  renderPeople();
}

/* ------------------------------------------------- apresentação em tela cheia */
// A sobreposição cobre a tela sempre; onde a Fullscreen API existir (Android,
// desktop) ela também esconde as barras do navegador. No iPhone a API não
// existe, e a sobreposição sozinha já dá o mesmo efeito de uso.
function requestNativeFull(el) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return;
  try { fn.call(el, { navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* sem suporte */ }
}
function exitNativeFull() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn || !(document.fullscreenElement || document.webkitFullscreenElement)) return;
  try { fn.call(document)?.catch?.(() => {}); } catch { /* ignora */ }
}
function openFull(key) {
  if (!tiles.has(key)) return;
  fullKey = key;
  document.body.classList.add('fullsharing');
  const box = $('#fullShare');
  box.hidden = false;
  requestNativeFull(box);
  sync();
}
function closeFull() {
  if (!fullKey && $('#fullShare').hidden) return;
  fullKey = null;
  document.body.classList.remove('fullsharing');
  $('#fullShare').hidden = true;
  exitNativeFull();
  sync();
}
function toggleFull(key) { if (fullKey === key) closeFull(); else openFull(key); }

['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
  document.addEventListener(ev, () => {
    if (fullKey && !(document.fullscreenElement || document.webkitFullscreenElement)) closeFull();
  });
});
$('#exitFull').onclick = closeFull;

function updateTile({ key, p, kind, track }) {
  let t = tiles.get(key);
  if (!t) {
    const el = document.createElement('div');
    el.className = `tile ${kind}${p.isLocal ? ' local' : ''}`;
    el.innerHTML = `<video autoplay playsinline muted></video><div class="avatar"></div>
      <div class="label"></div>${kind === 'screen' ? `<button class="fs" title="Ver em tela cheia">${ic('expand')}</button>` : ''}<button class="pin" title="Fixar em destaque">${ic('pin')}</button><div class="q"><i></i><i></i><i></i></div>`;
    const togglePin = () => { if (fullKey === key) return closeFull(); pinned = pinned === key ? null : key; sync(); };
    el.querySelector('.pin').onclick = togglePin;
    el.querySelector('.fs')?.addEventListener('click', (ev) => { ev.stopPropagation(); toggleFull(key); });
    el.ondblclick = togglePin;
    t = { el, video: el.querySelector('video'), track: null };
    tiles.set(key, t);
  }
  if (t.track !== track) {
    t.track?.detach(t.video);
    if (track) track.attach(t.video);
    t.track = track;
  }
  const name = p.name || p.identity;
  const av = t.el.querySelector('.avatar');
  av.textContent = initials(name); av.style.setProperty('--c', colorFor(p.identity));
  t.el.classList.toggle('has-video', !!track);
  t.el.classList.toggle('speaking', kind === 'camera' && p.isSpeaking);
  t.el.classList.toggle('pinned', pinned === key);
  const micOff = !p.isMicrophoneEnabled;
  const label = kind === 'screen' ? `Tela de ${name}${p.isLocal ? ' (você)' : ''}` : `${name}${p.isLocal ? ' (você)' : ''}`;
  t.el.querySelector('.label').innerHTML = `${kind === 'camera' && micOff ? `<span class="muted-ic">${ic('micOff')}</span>` : ''}<span>${esc(label)}</span>`;
  const q = t.el.querySelector('.q');
  q.hidden = kind !== 'camera' || p.isLocal;
  q.dataset.q = p.connectionQuality || 'unknown';
}

function layoutGrid() {
  const grid = $('#grid');
  if ($('#stageWrap').classList.contains('has-stage')) { grid.style.removeProperty('--cols'); grid.style.removeProperty('--rowh'); return; }
  const n = grid.children.length || 1;
  const W = grid.clientWidth, H = grid.clientHeight, gap = 10;
  let best = { cols: 1, size: 0, rowh: H };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = (W - gap * (cols - 1)) / cols;
    const h = Math.min(w * 9 / 16, (H - gap * (rows - 1)) / rows);
    const area = h * Math.min(w, h * 16 / 9);
    if (area > best.size) best = { cols, size: area, rowh: h };
  }
  grid.style.setProperty('--cols', best.cols);
  grid.style.setProperty('--rowh', Math.max(80, Math.floor(best.rowh)) + 'px');
}
new ResizeObserver(() => layoutGrid()).observe(document.getElementById('grid'));

function renderPeople() {
  const ps = allParticipants();
  $('#peopleCount').textContent = ps.length;
  $('#people').innerHTML = ps.map((p) => {
    const name = p.name || p.identity;
    return `<li><div class="avatar" style="--c:${colorFor(p.identity)}">${esc(initials(name))}</div>
      <span class="nm">${esc(name)}${p.isLocal ? ' (você)' : ''}</span>
      ${p.isScreenShareEnabled ? `<span title="Compartilhando tela">${ic('screen')}</span>` : ''}
      <span class="${p.isCameraEnabled ? '' : 'off'}">${ic(p.isCameraEnabled ? 'cam' : 'camOff')}</span>
      <span class="${p.isMicrophoneEnabled ? '' : 'off'}">${ic(p.isMicrophoneEnabled ? 'mic' : 'micOff')}</span></li>`;
  }).join('');
}

/* ------------------------------------------------------------ controles */
function paintControls() {
  if (!room) return;
  const lp = room.localParticipant;
  const mic = lp.isMicrophoneEnabled, cam = lp.isCameraEnabled, scr = lp.isScreenShareEnabled;
  $('#micBtn').className = 'ctrl' + (mic ? '' : ' off'); $('#micBtn').innerHTML = ic(mic ? 'mic' : 'micOff');
  $('#camBtn').className = 'ctrl' + (cam ? '' : ' off'); $('#camBtn').innerHTML = ic(cam ? 'cam' : 'camOff');
  $('#screenBtn').className = 'ctrl' + (scr ? ' active' : ''); $('#screenBtn').innerHTML = ic('screen') + `<span class="lbl">${scr ? 'Parar' : 'Apresentar'}</span>`;
  $('#screenBtn').title = scr ? 'Parar de compartilhar' : 'Compartilhar tela';
  sync();
}

let busy = false;
async function guarded(fn) { if (busy || !room) return; busy = true; try { await fn(); } finally { busy = false; paintControls(); } }

async function toggleMic() {
  await guarded(async () => {
    try { await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled); store.set('mic', room.localParticipant.isMicrophoneEnabled); }
    catch (e) { mediaError('microfone', e); }
  });
}
async function toggleCam() {
  await guarded(async () => {
    try { await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled); store.set('cam', room.localParticipant.isCameraEnabled); }
    catch (e) { mediaError('câmera', e); }
  });
}
async function toggleScreen() {
  await guarded(async () => {
    const on = !room.localParticipant.isScreenShareEnabled;
    try {
      await room.localParticipant.setScreenShareEnabled(on, { audio: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include' });
      if (on) toast('Você está apresentando. Clique em “Parar” para encerrar.');
    } catch (e) {
      if (e?.name === 'NotAllowedError' || /Permission denied|cancel/i.test(e?.message)) return; // usuário cancelou a escolha
      toast('Não foi possível compartilhar a tela: ' + (e.message || e), 4000);
    }
  });
}

$('#micBtn').onclick = toggleMic;
$('#camBtn').onclick = toggleCam;
$('#screenBtn').onclick = toggleScreen;
$('#chatBtn').innerHTML = ic('chat') + $('#chatBtn').innerHTML;
$('#peopleBtn').innerHTML = ic('people');
$('#settingsBtn').innerHTML = ic('gear');
$('#leaveBtn').onclick = async () => { leftByUser = true; await room?.disconnect(); };
$('#audioUnlock').onclick = async () => { try { await room.startAudio(); } catch { /* tenta de novo no próximo clique */ } $('#audioUnlock').hidden = room.canPlaybackAudio; };
$('#layoutBtn').onclick = () => { layoutMode = layoutMode === 'auto' ? 'grid' : 'auto'; pinned = null; toast(layoutMode === 'auto' ? 'Layout: destaque para apresentação' : 'Layout: grade'); sync(); };
$('#copyLink').onclick = async () => {
  const link = `${location.origin}/sala/${encodeURIComponent(roomName)}`;
  try { await navigator.clipboard.writeText(link); toast('Link copiado: ' + link); }
  catch { toast(link, 6000); }
};

document.addEventListener('keydown', (e) => {
  if (!room || $('#meeting').hidden) return;
  if (e.key === 'Escape' && fullKey) { closeFull(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleMic(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); toggleCam(); }
});
window.addEventListener('beforeunload', () => { room?.disconnect(); });

/* ----------------------------------------------------------- painel lateral */
let sideTab = 'chat';
function openSide(tab) {
  const side = $('#side');
  if (!side.hidden && sideTab === tab) { side.hidden = true; return layoutGrid(); }
  sideTab = tab; side.hidden = false;
  document.querySelectorAll('.side-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + tab));
  if (tab === 'chat') { $('#unread').hidden = true; setTimeout(() => $('#chatInput').focus(), 0); }
  layoutGrid();
}
$('#chatBtn').onclick = () => openSide('chat');
$('#peopleBtn').onclick = () => openSide('people');
$('#closeSide').onclick = () => { $('#side').hidden = true; layoutGrid(); };
document.querySelectorAll('.side-tabs [data-tab]').forEach((b) => { b.onclick = () => openSide(b.dataset.tab); });

/* ------------------------------------------------------------------- chat */
function addMessage(who, text, ts, mine) {
  const box = $('#messages');
  box.querySelector('.center')?.remove();
  const d = document.createElement('div');
  d.className = 'msg' + (mine ? ' me' : '');
  const time = new Date(ts || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  d.innerHTML = `<b>${esc(mine ? 'Você' : who)}</b><time>${time}</time><p>${esc(text)}</p>`;
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  if (!mine && ($('#side').hidden || sideTab !== 'chat')) { $('#unread').hidden = false; toast(`${who}: ${String(text).slice(0, 80)}`); }
}
$('#chatForm').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('#chatInput').value.trim();
  if (!text || !room) return;
  const msg = { text, ts: Date.now() };
  try {
    await room.localParticipant.publishData(enc.encode(JSON.stringify(msg)), { reliable: true, topic: 'chat' });
    addMessage('', text, msg.ts, true); $('#chatInput').value = '';
  } catch (err) { toast('Mensagem não enviada: ' + (err.message || err)); }
};

/* ---------------------------------------------------------- dispositivos */
$('#settingsBtn').onclick = async () => {
  const kinds = [['videoinput', '#videoDev'], ['audioinput', '#audioDev'], ['audiooutput', '#outputDev']];
  for (const [kind, sel] of kinds) {
    let list = [];
    try { list = await LK.Room.getLocalDevices(kind, false); } catch { /* sem permissão */ }
    const el = $(sel);
    el.closest('label').hidden = kind === 'audiooutput' && !list.length;
    el.innerHTML = list.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Dispositivo ${i + 1}`)}</option>`).join('') || '<option value="">Padrão do sistema</option>';
    const active = room.getActiveDevice?.(kind);
    if (active) el.value = active;
    el.onchange = async () => {
      try {
        await room.switchActiveDevice(kind, el.value);
        if (kind === 'videoinput') store.set('videoDev', el.value);
        if (kind === 'audioinput') store.set('audioDev', el.value);
      } catch (e) { mediaError('dispositivo', e); }
    };
  }
  $('#devDialog').showModal();
};

initLobby();
