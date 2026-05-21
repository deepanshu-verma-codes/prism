import '../styles/app.css';
import { DEFAULT_OPTIONS, MESSAGE, RECORDING_STATUS } from '../utils/constants.js';
import { formatBytes, formatDuration } from '../utils/format.js';
import { sendRuntimeMessage } from '../utils/messaging.js';
import { listRecordings } from '../utils/storage.js';

const app = document.querySelector('#app');

let state = {
  status: RECORDING_STATUS.IDLE,
  micEnabled: true,
  cameraEnabled: true
};
let options = {
  captureSource: 'screen',
  captureMicrophone: true,
  captureCamera: false,
  captureSystemAudio: true
};
let recents = [];
let busy = false;
let statusText = '';

init();

async function init() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MESSAGE.STATE_CHANGED) {
      state = message.state;
      render();
    }
  });
  const response = await sendRuntimeMessage({ type: MESSAGE.GET_STATE });
  if (response.ok) state = response.state;
  await loadRecents();
  render();
}

async function loadRecents() {
  try {
    recents = (await listRecordings()).slice(0, 5);
  } catch {
    recents = [];
  }
}

function render() {
  const isActive = [RECORDING_STATUS.STARTING, RECORDING_STATUS.RECORDING, RECORDING_STATUS.PAUSED, RECORDING_STATUS.STOPPING].includes(state.status);
  app.innerHTML = `
    <section class="p-4">
      <div class="glass-panel rounded-[28px] p-4 animate-floatIn">
        <header class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-glow">
              ${brandIcon()}
            </div>
            <div>
              <h1 class="text-base font-bold tracking-normal text-slate-950">Prism Recorder</h1>
              <p class="text-xs font-medium text-slate-500">${isActive ? activeLabel() : 'Screen, camera, mic, and audio'}</p>
            </div>
          </div>
          <div class="rounded-full px-3 py-1 text-[11px] font-bold ${isActive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}">
            ${isActive ? 'LIVE' : 'READY'}
          </div>
        </header>

        ${busy && !isActive ? busyPanel() : capturePanel(isActive)}

        <section class="mt-5">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-bold text-slate-900">Recent recordings</h2>
            <button data-refresh class="focusable rounded-full px-3 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Refresh</button>
          </div>
          <div class="space-y-2">
            ${recents.length ? recents.map(recentItem).join('') : emptyRecent()}
          </div>
        </section>
      </div>
    </section>
  `;
  bindEvents();
}

function capturePanel(isActive) {
  return `
    <div class="mt-5 rounded-3xl bg-slate-950 p-4 text-white shadow-panel">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-400">Capture mode</p>
              <p class="mt-1 text-xl font-black tracking-normal">${sourceTitle()}</p>
            </div>
            <div class="grid h-12 w-12 place-items-center rounded-2xl bg-white/10">
              ${recordIcon()}
            </div>
          </div>
          <div class="mt-4 grid grid-cols-3 rounded-2xl bg-white/10 p-1">
            ${sourceButton('screen', 'Full Screen')}
            ${sourceButton('window', 'Window')}
            ${sourceButton('tab', 'Current Tab')}
          </div>
          <div class="mt-5 grid grid-cols-3 gap-2">
            ${toggleCard('captureMicrophone', 'Mic', options.captureMicrophone, micIcon())}
            ${toggleCard('captureCamera', 'Camera', options.captureCamera, cameraIcon())}
            ${toggleCard('captureSystemAudio', 'Audio', options.captureSystemAudio, audioIcon())}
          </div>
          ${isActive ? activeControls() : startControl()}
          ${statusText ? `<p class="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-xs font-medium text-slate-200">${escapeHtml(statusText)}</p>` : ''}
        </div>
  `;
}

function busyPanel() {
  return `
    <div class="mt-5 rounded-3xl bg-slate-950 p-5 text-white shadow-panel">
      <div class="flex items-center gap-3">
        ${spinnerIcon()}
        <div>
          <p class="text-sm font-black">Waiting for Chrome permission</p>
          <p class="mt-1 text-xs font-semibold text-slate-400">Use the browser dialog to choose what to share.</p>
        </div>
      </div>
      ${statusText ? `<p class="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-xs font-medium text-slate-200">${escapeHtml(statusText)}</p>` : ''}
    </div>
  `;
}

function bindEvents() {
  app.querySelectorAll('[data-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.option;
      options = { ...options, [key]: !options[key] };
      render();
    });
  });
  app.querySelectorAll('[data-source]').forEach((button) => {
    button.addEventListener('click', () => {
      options = { ...options, captureSource: button.dataset.source };
      render();
    });
  });

  app.querySelector('[data-start]')?.addEventListener('click', startRecording);
  app.querySelector('[data-refresh]')?.addEventListener('click', async () => {
    await loadRecents();
    render();
  });
  app.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      sendRuntimeMessage({ type: MESSAGE.TOOLBAR_ACTION, action: button.dataset.action });
    });
  });
  app.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      sendRuntimeMessage({ type: MESSAGE.OPEN_PREVIEW, id: button.dataset.open });
    });
  });
}

async function startRecording() {
  if (busy) return;
  busy = true;
  statusText = 'Choose the screen, window, or tab you want to record.';
  render();

  try {
    const response = await sendRuntimeMessage({
      type: MESSAGE.START_RECORDING,
      payload: {
        streamId: null,
        sourceType: options.captureSource,
        options: { ...DEFAULT_OPTIONS, ...options }
      }
    });
    if (!response.ok) throw new Error(response.error || 'The recorder could not start. Reload the extension and try again.');
    window.close();
  } catch (error) {
    statusText = error?.message || 'Unable to start recording. Reload the extension and try again.';
  } finally {
    busy = false;
    render();
  }
}

function sourceButton(source, label) {
  const selected = options.captureSource === source;
  return `
    <button data-source="${source}" class="focusable rounded-xl px-3 py-2 text-xs font-black transition ${selected ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}">
      ${label}
    </button>
  `;
}

function sourceTitle() {
  if (options.captureSource === 'tab') return 'Current tab';
  if (options.captureSource === 'window') return 'Window recording';
  return 'Full screen recording';
}

function activeControls() {
  const pauseAction = state.status === RECORDING_STATUS.PAUSED ? 'resume' : 'pause';
  return `
    <div class="mt-5 grid grid-cols-[1fr_1fr_56px] gap-2">
      <button data-action="${pauseAction}" class="focusable rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:scale-[1.015]">
        ${state.status === RECORDING_STATUS.PAUSED ? 'Resume' : 'Pause'}
      </button>
      <button data-action="toggleMic" class="focusable rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15">
        ${state.micEnabled ? 'Mute' : 'Unmute'}
      </button>
      <button data-action="stop" class="focusable grid place-items-center rounded-2xl bg-rose-500 text-white transition hover:scale-[1.04] hover:bg-rose-400" title="Stop">
        ${stopIcon()}
      </button>
    </div>
  `;
}

function startControl() {
  return `
    <button data-start class="focusable mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-slate-950 shadow-lg shadow-black/15 transition hover:scale-[1.015] disabled:cursor-not-allowed disabled:opacity-70" ${busy ? 'disabled' : ''}>
      ${busy ? spinnerIcon() : recordDotIcon()}
      ${busy ? 'Starting...' : 'Start recording'}
    </button>
  `;
}

function toggleCard(key, label, enabled, icon) {
  return `
    <button data-option="${key}" class="focusable rounded-2xl border border-white/10 px-3 py-3 text-left transition ${enabled ? 'bg-white text-slate-950' : 'bg-white/8 text-slate-300 hover:bg-white/12'}">
      <span class="mb-2 grid h-8 w-8 place-items-center rounded-xl ${enabled ? 'bg-slate-950 text-white' : 'bg-white/10 text-slate-300'}">${icon}</span>
      <span class="block text-xs font-black">${label}</span>
      <span class="mt-0.5 block text-[11px] font-semibold ${enabled ? 'text-slate-500' : 'text-slate-500'}">${enabled ? 'On' : 'Off'}</span>
    </button>
  `;
}

function recentItem(item) {
  return `
    <button data-open="${item.id}" class="focusable flex w-full items-center justify-between rounded-2xl bg-white/65 p-3 text-left transition hover:bg-white">
      <span class="min-w-0">
        <span class="block truncate text-sm font-bold text-slate-900">${escapeHtml(item.name)}</span>
        <span class="mt-0.5 block text-xs font-semibold text-slate-500">${formatDuration(item.duration)} · ${formatBytes(item.size)}</span>
      </span>
      <span class="ml-3 grid h-9 w-9 place-items-center rounded-full bg-slate-950 text-white">${playIcon()}</span>
    </button>
  `;
}

function emptyRecent() {
  return '<div class="rounded-2xl border border-dashed border-slate-300 bg-white/45 p-4 text-center text-sm font-semibold text-slate-500">Your recordings will appear here.</div>';
}

function activeLabel() {
  if (state.status === RECORDING_STATUS.STARTING) return 'Preparing capture';
  if (state.status === RECORDING_STATUS.PAUSED) return 'Recording paused';
  if (state.status === RECORDING_STATUS.STOPPING) return 'Saving recording';
  return 'Recording in progress';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function brandIcon() {
  return '<svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="14" height="17" rx="4" fill="currentColor"/><path d="M16.5 9.2 21 6.8v10.4l-4.5-2.4V9.2Z" fill="currentColor"/><circle cx="9.5" cy="12" r="4.2" fill="#f43f5e"/><circle cx="9.5" cy="12" r="1.7" fill="white"/></svg>';
}

function recordIcon() {
  return '<svg viewBox="0 0 24 24" class="h-6 w-6" fill="currentColor"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/></svg>';
}

function recordDotIcon() {
  return '<span class="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,.12)]"></span>';
}

function spinnerIcon() {
  return '<span class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950"></span>';
}

function stopIcon() {
  return '<svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M7 7h10v10H7V7Z"/></svg>';
}

function playIcon() {
  return '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg>';
}

function micIcon() {
  return '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/></svg>';
}

function cameraIcon() {
  return '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5 3V8l-5 3v2Z"/><rect x="3" y="6" width="13" height="12" rx="2"/></svg>';
}

function audioIcon() {
  return '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
}
