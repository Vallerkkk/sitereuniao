/* Simulação mínima da API do livekit-client v2, usada só nos testes de interface
   (substitui o SDK real do CDN quando não há servidor LiveKit disponível). */
(() => {
  const RoomEvent = Object.fromEntries(['ParticipantConnected', 'ParticipantDisconnected', 'TrackPublished', 'TrackUnpublished',
    'TrackSubscribed', 'TrackUnsubscribed', 'TrackMuted', 'TrackUnmuted', 'LocalTrackPublished', 'LocalTrackUnpublished',
    'ActiveSpeakersChanged', 'ConnectionQualityChanged', 'ParticipantNameChanged', 'DataReceived', 'AudioPlaybackStatusChanged',
    'Reconnecting', 'Reconnected', 'MediaDevicesError', 'Disconnected'].map((k) => [k, k]));
  const Source = { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screen_share' };
  let n = 0;

  function canvasTrack(label, color) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d'); let f = 0;
    setInterval(() => { g.fillStyle = color; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText(label, 30, 80); g.fillRect((f++ * 6) % 640, 300, 40, 40); }, 50);
    return c.captureStream(20).getVideoTracks()[0];
  }
  class Track {
    constructor(kind, mst) { this.kind = kind; this.sid = 'TR_' + (++n); this.mediaStreamTrack = mst; this.els = new Set(); }
    attach(el) { el = el || document.createElement(this.kind); if (this.mediaStreamTrack) el.srcObject = new MediaStream([this.mediaStreamTrack]); el.play?.().catch(() => {}); this.els.add(el); return el; }
    detach(el) { const list = el ? [el] : [...this.els]; list.forEach((e) => { e.srcObject = null; this.els.delete(e); }); return list; }
  }
  class Pub { constructor(source, track) { this.source = source; this.track = track; this.isMuted = false; this.isSubscribed = true; } }
  class Participant {
    constructor(identity, name, isLocal) { this.identity = identity; this.name = name; this.isLocal = isLocal; this.isSpeaking = false; this.connectionQuality = 'excellent'; this.pubs = new Map(); }
    getTrackPublication(s) { return this.pubs.get(s); }
    _on(s) { const p = this.pubs.get(s); return !!p && !p.isMuted; }
    get isMicrophoneEnabled() { return this._on(Source.Microphone); }
    get isCameraEnabled() { return this._on(Source.Camera); }
    get isScreenShareEnabled() { return this._on(Source.ScreenShare); }
  }
  class LocalParticipant extends Participant {
    constructor(room, id, name) { super(id, name, true); this.room = room; }
    async _set(source, on, kind, label, color) {
      if (on && !this.pubs.has(source)) {
        const pub = new Pub(source, new Track(kind, kind === 'video' ? canvasTrack(label, color) : null));
        this.pubs.set(source, pub); this.room._emit('LocalTrackPublished', pub, this);
      } else if (!on && this.pubs.has(source)) {
        const pub = this.pubs.get(source); this.pubs.delete(source); pub.track.mediaStreamTrack?.stop(); this.room._emit('LocalTrackUnpublished', pub, this);
      }
    }
    setMicrophoneEnabled(on) { return this._set(Source.Microphone, on, 'audio'); }
    setCameraEnabled(on) { return this._set(Source.Camera, on, 'video', 'Minha câmera', '#2a6'); }
    setScreenShareEnabled(on) { return this._set(Source.ScreenShare, on, 'video', 'Minha tela', '#336'); }
    async publishData(bytes, opts) { (window.__sent ||= []).push({ text: new TextDecoder().decode(bytes), opts }); }
  }
  class Room {
    constructor(opts) { this.opts = opts; this.handlers = {}; this.remoteParticipants = new Map(); this.canPlaybackAudio = true; window.__room = this; }
    on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }
    _emit(ev, ...a) { (this.handlers[ev] || []).forEach((f) => f(...a)); }
    async connect(url, token) { this.url = url; this.token = token; const c = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); this.name = c.video.room; this.localParticipant = new LocalParticipant(this, c.sub, c.name); }
    async disconnect() { this._emit('Disconnected', 1); }
    async startAudio() { this.canPlaybackAudio = true; }
    getActiveDevice() { return ''; }
    async switchActiveDevice(kind, id) { window.__switched = [kind, id]; }
    static async getLocalDevices(kind) { return [{ deviceId: 'd1', label: 'Dispositivo falso 1', kind }, { deviceId: 'd2', label: 'Dispositivo falso 2', kind }]; }
  }

  window.__mock = {
    addRemote(name, { cam = true, screen = false, mic = true } = {}) {
      const r = window.__room; const p = new Participant('id-' + name.toLowerCase(), name, false);
      r.remoteParticipants.set(p.identity, p); r._emit('ParticipantConnected', p);
      const add = (s, kind, label, color) => { const pub = new Pub(s, new Track(kind, kind === 'video' ? canvasTrack(label, color) : null)); p.pubs.set(s, pub); r._emit('TrackSubscribed', pub.track, pub, p); };
      if (mic) add(Source.Microphone, 'audio');
      if (cam) add(Source.Camera, 'video', name, '#a53');
      if (screen) add(Source.ScreenShare, 'video', 'Tela de ' + name, '#335');
      return p;
    },
    speak(identity, on) { const r = window.__room; const p = r.remoteParticipants.get(identity); p.isSpeaking = on; r._emit('ActiveSpeakersChanged', on ? [p] : []); },
    chat(identity, text) { const r = window.__room; r._emit('DataReceived', new TextEncoder().encode(JSON.stringify({ text, ts: Date.now() })), r.remoteParticipants.get(identity), 0, 'chat'); },
    leave(identity) { const r = window.__room; const p = r.remoteParticipants.get(identity); r.remoteParticipants.delete(identity); r._emit('ParticipantDisconnected', p); },
  };
  window.LivekitClient = { Room, RoomEvent, Track: { Source }, VideoPresets: { h720: { resolution: { width: 1280, height: 720 } } },
    ScreenSharePresets: { h1080fps15: { encoding: {} } }, DisconnectReason: { CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 } };
})();
