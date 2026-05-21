(() => {
const ROOT_ID = 'lumina-recorder-root';
const MESSAGE = Object.freeze({
  TOOLBAR_ACTION: 'lumina:toolbar-action',
  TOOLBAR_READY: 'lumina:toolbar-ready',
  STATE_CHANGED: 'lumina:state-changed'
});
const RECORDING_STATUS = Object.freeze({
  STARTING: 'starting',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPING: 'stopping'
});
const CAMERA_POSITION_DEFAULT = Object.freeze({
  x: 0.025,
  y: 0.72,
  size: 0.16
});
let state = null;
let timerInterval = 0;
let toolbarPosition = null;
let cameraPosition = { ...CAMERA_POSITION_DEFAULT };
let stopRequested = false;
let lastStartedAt = null;

if (!window.__luminaRecorderInjected) {
  window.__luminaRecorderInjected = true;
  boot();
}

function boot() {
  createRoot();
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MESSAGE.STATE_CHANGED) {
      state = message.state;
      if (state?.startedAt && state.startedAt !== lastStartedAt && state.status === RECORDING_STATUS.STARTING) {
        stopRequested = false;
        lastStartedAt = state.startedAt;
      }
      if (!state?.startedAt) {
        stopRequested = false;
      }
      render();
    }
  });
  chrome.runtime.sendMessage({ type: MESSAGE.TOOLBAR_READY }, (response) => {
    if (response?.state) {
      state = response.state;
      lastStartedAt = state?.startedAt || null;
      render();
    }
  });
}
function createRoot() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.position = 'fixed';
  root.style.inset = '0';
  root.style.zIndex = '2147483647';
  root.style.pointerEvents = 'none';
  root.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  document.documentElement.appendChild(root);
}

function render() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const active = state && [RECORDING_STATUS.STARTING, RECORDING_STATUS.RECORDING, RECORDING_STATUS.PAUSED, RECORDING_STATUS.STOPPING].includes(state.status);

  if (!active || stopRequested) {
    root.innerHTML = '';
    clearInterval(timerInterval);
    timerInterval = 0;
    return;
  }

  ensureBaseStructure(root);
  updateToolbar();
  updateCamera();
  updateTimer();
  
  if (!timerInterval) timerInterval = window.setInterval(updateTimer, 500);
}
function ensureBaseStructure(root) {
  if (root.querySelector('style')) return;

  const shellHtml = `<div class="lumina-shell" id="lumina-shell">
      <div class="lumina-grip" title="Drag toolbar" aria-label="Drag toolbar">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="lumina-live" id="lumina-live"><i></i><span>Recording</span></div>
      <div class="lumina-timer" data-timer>00:00</div>
      <button class="lumina-btn" data-action="pause" id="lumina-pause-btn"></button>
      <button class="lumina-btn" data-action="toggleMic" id="lumina-mic-btn"></button>
      <button class="lumina-btn" data-action="toggleCamera" id="lumina-camera-btn"></button>
      <button class="lumina-stop" data-action="stop" title="Stop recording">${stopIcon()}</button>
    </div>`;

  const cameraHtml = `<div class="lumina-camera" id="lumina-camera">
      <div id="lumina-camera-container"></div>
      <div class="lumina-camera-ring"></div>
    </div>`;

  root.innerHTML = `<style>${styles()}</style>${shellHtml}${cameraHtml}`;
  bindToolbar(root);
}
function updateToolbar() {
  const shell = document.getElementById('lumina-shell');
  if (!shell) return;

  if (!toolbarPosition) { toolbarPosition = getToolbarPosition(); }
  shell.style.transform = `translate(${toolbarPosition.x}px, ${toolbarPosition.y}px)`;

  const liveText = document.querySelector('#lumina-live span');
  if (liveText) {
    const expectedText = state.status === RECORDING_STATUS.PAUSED ? 'Paused' : 'Recording';
    if (liveText.textContent !== expectedText) {
      liveText.textContent = expectedText;
    }
  }

  const pauseBtn = document.getElementById('lumina-pause-btn');
  if (pauseBtn) {
    const isPaused = state.status === RECORDING_STATUS.PAUSED;
    const action = isPaused ? 'resume' : 'pause';
    const title = isPaused ? 'Resume' : 'Pause';
    const icon = isPaused ? playIcon() : pauseIcon();
    
    if (pauseBtn.dataset.action !== action || !pauseBtn.innerHTML) {
      pauseBtn.dataset.action = action;
      pauseBtn.title = title;
      pauseBtn.innerHTML = icon;
    }
  }

  const micBtn = document.getElementById('lumina-mic-btn');
  if (micBtn) {
    const title = state.micEnabled ? 'Mute microphone' : 'Unmute microphone';
    const icon = state.micEnabled ? micIcon() : micOffIcon();
    if (micBtn.classList.contains('is-off') === state.micEnabled || !micBtn.innerHTML) {
      micBtn.classList.toggle('is-off', !state.micEnabled);
      micBtn.title = title;
      micBtn.innerHTML = icon;
    }
  }

  const cameraBtn = document.getElementById('lumina-camera-btn');
  if (cameraBtn) {
    const title = state.cameraEnabled ? 'Hide camera' : 'Show camera';
    const icon = state.cameraEnabled ? cameraIcon() : cameraOffIcon();
    if (cameraBtn.classList.contains('is-off') === state.cameraEnabled || !cameraBtn.innerHTML) {
      cameraBtn.classList.toggle('is-off', !state.cameraEnabled);
      cameraBtn.title = title;
      cameraBtn.innerHTML = icon;
    }
  }
}
function updateCamera() {
  const camera = document.getElementById('lumina-camera');
  const container = document.getElementById('lumina-camera-container');
  if (!camera || !container) return;

  const size = cameraBubbleSize();
  camera.style.width = `${size}px`;
  camera.style.height = `${size}px`;
  camera.style.left = `${Math.round(cameraPosition.x * window.innerWidth)}px`;
  camera.style.top = `${Math.round(cameraPosition.y * window.innerHeight)}px`;

  const currentContent = container.dataset.enabled === String(state.cameraEnabled);
  if (!currentContent) {
    container.dataset.enabled = state.cameraEnabled;
    container.innerHTML = state.cameraEnabled 
      ? `<iframe class="lumina-camera-frame" src="${chrome.runtime.getURL('camera/index.html')}" allow="camera"></iframe>`
      : `<div class="lumina-camera-placeholder" style="width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#374151,#111827);">${avatarIcon()}</div>`;
  }
}
function bindToolbar(root) {
  root.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'stop') { clearToolbarImmediately(); }
      chrome.runtime.sendMessage({ type: MESSAGE.TOOLBAR_ACTION, action });
    });
  });

  makeDraggable(root.querySelector('.lumina-shell'), {
    onMove: (x, y) => { toolbarPosition = { x, y }; }
  });

  makeDraggable(root.querySelector('.lumina-camera'), {
    onMove: (x, y, element) => {
      const rect = element.getBoundingClientRect();
      cameraPosition = { ...cameraPosition, x: clamp(x / window.innerWidth, 0, 0.92), y: clamp(y / window.innerHeight, 0, 0.86) };
      chrome.runtime.sendMessage({
        type: MESSAGE.TOOLBAR_ACTION, action: 'cameraPosition', payload: { position: { x: clamp((x + rect.width / 2) / window.innerWidth, 0, 1), y: clamp((y + rect.height / 2) / window.innerHeight, 0, 1), size: cameraPosition.size } }
      });
    }, useLeftTop: true
  });
}

function makeDraggable(element, { onMove, useLeftTop = false }) {
  if (!element) return;
  let startX = 0, startY = 0, originX = 0, originY = 0;

  element.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    const rect = element.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left;
    originY = rect.top;
  });

  element.addEventListener('pointermove', (event) => {
    if (!element.hasPointerCapture(event.pointerId)) return;
    const nextX = clamp(originX + event.clientX - startX, 8, window.innerWidth - element.offsetWidth - 8);
    const nextY = clamp(originY + event.clientY - startY, 8, window.innerHeight - element.offsetHeight - 8);

    if (useLeftTop) {
      element.style.left = `${nextX}px`;
      element.style.top = `${nextY}px`;
    } else {
      element.style.transform = `translate(${nextX}px, ${nextY}px)`;
    }
    onMove(nextX, nextY, element);
  });
}

function updateTimer() {
  const timer = document.querySelector(`#${ROOT_ID} [data-timer]`);
  if (!timer || !state?.startedAt) return;
  const pausedDelta = state.pausedAt ? Date.now() - state.pausedAt : 0;
  const elapsed = Date.now() - state.startedAt - (state.elapsedBeforePause || 0) - pausedDelta;
  timer.textContent = formatDuration(elapsed);
}

function styles() {
  const toolbar = getToolbarPosition();
  return `
    .lumina-shell{position:absolute;top:0;left:0;display:flex;align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.42);border-radius:999px;background:rgba(17,24,39,.76);color:#fff;box-shadow:0 18px 58px rgba(15,23,42,.34);backdrop-filter:blur(18px);pointer-events:auto;user-select:none;animation:luminaIn .18s ease-out}
    .lumina-grip{display:grid;grid-template-columns:repeat(2,3px);gap:3px;padding:7px 6px;cursor:grab;opacity:.75}.lumina-grip span{width:3px;height:3px;border-radius:999px;background:#d1d5db}
    .lumina-live{display:flex;align-items:center;gap:7px;padding:0 6px 0 2px;font:600 12px/1 Inter,system-ui;letter-spacing:0;color:#f9fafb}.lumina-live i{width:8px;height:8px;border-radius:50%;background:#f43f5e;box-shadow:0 0 0 5px rgba(244,63,94,.16)}
    .lumina-timer{min-width:52px;padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.12);font:700 13px/1 Inter,system-ui;text-align:center;font-variant-numeric:tabular-nums}
    .lumina-btn,.lumina-stop{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:999px;color:#fff;background:rgba(255,255,255,.12);cursor:pointer;transition:transform .16s ease,background .16s ease}.lumina-btn:hover{background:rgba(255,255,255,.2);transform:translateY(-1px)}.lumina-btn.is-off{color:#cbd5e1;background:rgba(148,163,184,.16)}.lumina-stop{background:linear-gradient(135deg,#fb7185,#ef4444);box-shadow:0 8px 24px rgba(239,68,68,.35)}.lumina-stop:hover{transform:translateY(-1px) scale(1.03)}
    .lumina-btn svg,.lumina-stop svg{width:17px;height:17px;display:block}
    .lumina-camera{position:absolute;overflow:hidden;border-radius:999px;background:linear-gradient(135deg,#111827,#312e81);box-shadow:0 18px 54px rgba(15,23,42,.28);pointer-events:auto;cursor:grab;animation:luminaBubbleIn .2s ease-out}.lumina-camera-placeholder{display:grid;place-items:center;width:100%;height:100%;color:rgba(255,255,255,.92)}.lumina-camera-placeholder svg{width:100%;height:100%}.lumina-camera-frame{display:block;width:100%;height:100%;border:0;background:#111827;pointer-events:none}.lumina-camera-ring{position:absolute;inset:0;border:3px solid rgba(255,255,255,.88);border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(17,24,39,.12);pointer-events:none}
    @keyframes luminaIn{from{opacity:0;transform:translate(${toolbar.x}px, ${toolbar.y + 8}px) scale(.98)}to{opacity:1;transform:translate(${toolbar.x}px, ${toolbar.y}px) scale(1)}}@keyframes luminaBubbleIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
  `;
}

function getToolbarPosition() {
  if (!toolbarPosition) {
    toolbarPosition = {
      x: Math.max(8, Math.round((window.innerWidth - 340) / 2)),
      y: Math.max(8, window.innerHeight - 74)
    };
  }
  return toolbarPosition;
}

function cameraBubbleSize() {
  return Math.round(cameraPosition.size * Math.min(window.innerWidth, window.innerHeight));
}

function clearToolbarImmediately() {
  stopRequested = true;
  const root = document.getElementById(ROOT_ID);
  if (root) root.innerHTML = '';
  clearInterval(timerInterval);
  timerInterval = 0;
  state = null;
}

function pauseIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5h3v14H8V5Zm5 0h3v14h-3V5Z"/></svg>'; }
function playIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7L8 5Z"/></svg>'; }
function stopIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v10H7V7Z"/></svg>'; }
function micIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>'; }
function micOffIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="22"/></svg>'; }
function cameraIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5 3V8l-5 3v2Z"/><rect x="3" y="6" width="13" height="12" rx="2"/></svg>'; }
function cameraOffIcon() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5 3V8l-5 3v2Z"/><path d="M3 3l18 18"/><path d="M13 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>'; }
function avatarIcon() { return '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="rgba(255,255,255,.12)"/><circle cx="32" cy="25" r="11" fill="currentColor"/><path d="M14 56c3.2-12.5 12.1-18.5 18-18.5s14.8 6 18 18.5" fill="currentColor"/></svg>'; }

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function formatDuration(ms = 0) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padded = [minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  return hours > 0 ? `${hours}:${padded}` : padded;
}
})();
