import '../styles/app.css';
import { fileTimestamp, formatBytes, formatDuration } from '../utils/format.js';
import { deleteRecording, getRecording, listRecordings } from '../utils/storage.js';

const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
let recordingId = params.get('id');
let recording = null;
let videoUrl = '';
let recents = [];
let notice = '';

init();

async function init() {
  await load();
  render();
}

async function load() {
  recents = await listRecordings();
  recording = recordingId ? await getRecording(recordingId) : recents[0];
  recordingId = recording?.id || '';
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = recording ? URL.createObjectURL(recording.blob) : '';
}

function render() {
  app.innerHTML = `
    <section class="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 pt-6 pb-2">
      <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-glow">${brandIcon()}</div>
          <div>
            <h1 class="text-lg font-black tracking-normal text-slate-950">Prism Recorder</h1>
            <p class="text-sm font-semibold text-slate-500">Preview and export your local recording</p>
          </div>
        </div>
        <button data-copy class="focusable rounded-full bg-white/75 px-4 py-2 text-sm font-black text-slate-900 shadow-sm transition hover:bg-white">
          Copy share link
        </button>
      </header>

      ${recording ? previewLayout() : emptyLayout()}
    </section>
  `;
  bindEvents();
}

function previewLayout() {
  return `
    <div class="grid flex-1 gap-5 lg:grid-cols-[1fr_340px] max-h-[55vh] mb-2">
      <section class="glass-panel overflow-hidden rounded-[28px] p-3 max-h-screen">
        <div class="overflow-hidden rounded-3xl bg-slate-950">
          <video class="aspect-video w-full bg-black" src="${videoUrl}" controls autoplay playsinline></video>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 p-4 pb-2">
          <div class="min-w-0">
            <h2 class="truncate text-xl font-black text-slate-950">${escapeHtml(recording.name)}</h2>
            <p class="mt-1 text-sm font-semibold text-slate-500">${formatDuration(recording.duration)} · ${formatBytes(recording.size)} · ${new Date(recording.createdAt).toLocaleString()}</p>
          </div>
          <div class="flex items-center gap-2">
            <button data-download class="focusable rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:scale-[1.015]">Download</button>
            <button data-delete class="focusable rounded-2xl bg-white px-4 py-3 text-sm font-black text-rose-600 shadow-sm transition hover:bg-rose-50">Delete</button>
          </div>
        </div>
        ${notice ? `<div class="mx-4 mb-4 rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-bold text-emerald-800">${escapeHtml(notice)}</div>` : ''}
      </section>

      <aside class="glass-panel rounded-[28px] p-4 pb-2">
        <h3 class="text-sm font-black text-slate-950">Recent recordings</h3>
        <div class="mt-3 space-y-2">
          ${recents.length ? recents.map(recentItem).join('') : '<p class="text-sm font-semibold text-slate-500">No saved recordings.</p>'}
        </div>
      </aside>
    </div>
  `;
}

function emptyLayout() {
  return `
    <div class="glass-panel grid flex-1 place-items-center rounded-[28px] p-8 text-center">
      <div>
        <div class="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-slate-950 text-white">${brandIcon()}</div>
        <h2 class="mt-5 text-2xl font-black text-slate-950">No recording found</h2>
        <p class="mt-2 max-w-sm text-sm font-semibold text-slate-500">Start a recording from the extension popup. Local recordings saved in IndexedDB will appear here.</p>
      </div>
    </div>
  `;
}

function bindEvents() {
  app.querySelector('[data-download]')?.addEventListener('click', downloadRecording);
  app.querySelector('[data-delete]')?.addEventListener('click', removeRecording);
  app.querySelector('[data-copy]')?.addEventListener('click', copyShareLink);
  app.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', async () => {
      recordingId = button.dataset.open;
      history.replaceState(null, '', `?id=${encodeURIComponent(recordingId)}`);
      await load();
      notice = '';
      render();
    });
  });
}

function downloadRecording() {
  if (!recording) return;
  const a = document.createElement('a');
  a.href = videoUrl;
  a.download = `prism-recording-${fileTimestamp(new Date(recording.createdAt))}.webm`;
  a.click();
}

async function removeRecording() {
  if (!recording) return;
  await deleteRecording(recording.id);
  notice = 'Recording deleted.';
  recordingId = '';
  history.replaceState(null, '', location.pathname);
  await load();
  render();
}

async function copyShareLink() {
  const link = recording ? `https://prism.local/share/${recording.id}` : 'https://prism.local/share/new';
  await navigator.clipboard.writeText(link);
  notice = 'Share link copied. Upload is intentionally local-only in this build.';
  render();
}

function recentItem(item) {
  const selected = item.id === recordingId;
  return `
    <button data-open="${item.id}" class="focusable flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selected ? 'bg-slate-950 text-white' : 'bg-white/65 text-slate-900 hover:bg-white'}">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-white/12' : 'bg-slate-950 text-white'}">${playIcon()}</span>
      <span class="min-w-0">
        <span class="block truncate text-sm font-black">${escapeHtml(item.name)}</span>
        <span class="mt-0.5 block text-xs font-semibold ${selected ? 'text-slate-300' : 'text-slate-500'}">${formatDuration(item.duration)} · ${formatBytes(item.size)}</span>
      </span>
    </button>
  `;
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

function playIcon() {
  return '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg>';
}
