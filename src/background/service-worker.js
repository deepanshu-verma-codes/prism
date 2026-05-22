import { MESSAGE, RECORDING_STATUS } from '../utils/constants.js';

const OFFSCREEN_URL = 'offscreen/index.html';

let state = {
  status: RECORDING_STATUS.IDLE,
  startedAt: null,
  pausedAt: null,
  elapsedBeforePause: 0,
  micEnabled: true,
  cameraEnabled: true,
  toolbarTabId: null,
  error: '',
  recordingId: null
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ luminaState: state });
});

chrome.runtime.onStartup.addListener(() => {
  updateState({ status: RECORDING_STATUS.IDLE, startedAt: null, pausedAt: null, elapsedBeforePause: 0, error: '' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isBackgroundMessage(message?.type)) {
    return false;
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      const errorMessage = error?.message || 'Unexpected extension error.';
      updateState({ status: RECORDING_STATUS.ERROR, error: errorMessage });
      sendResponse({ ok: false, error: errorMessage });
    });
  return true;
});

function isBackgroundMessage(type) {
  return [
    MESSAGE.START_RECORDING,
    MESSAGE.TOOLBAR_ACTION,
    MESSAGE.GET_STATE,
    MESSAGE.OFFSCREEN_STATE,
    MESSAGE.RECORDING_COMPLETE,
    MESSAGE.RECORDING_ERROR,
    MESSAGE.OPEN_PREVIEW,
    MESSAGE.TOOLBAR_READY
  ].includes(type);
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case MESSAGE.START_RECORDING:
      return startRecording(message.payload);
    case MESSAGE.TOOLBAR_ACTION:
      return handleToolbarAction(message.action, message.payload);
    case MESSAGE.GET_STATE:
      return { ok: true, state };
    case MESSAGE.OFFSCREEN_STATE:
      updateState(message.state);
      return { ok: true };
    case MESSAGE.RECORDING_COMPLETE:
      await handleRecordingComplete(message.recording);
      return { ok: true };
    case MESSAGE.RECORDING_ERROR:
      updateState({ status: RECORDING_STATUS.ERROR, error: message.error || 'Recording failed.' });
      await broadcastState();
      return { ok: true };
    case MESSAGE.OPEN_PREVIEW:
      await openPreview(message.id);
      return { ok: true };
    case MESSAGE.TOOLBAR_READY:
      if (sender.tab?.id && sender.tab.id === state.toolbarTabId) {
        chrome.tabs.sendMessage(sender.tab.id, { type: MESSAGE.STATE_CHANGED, state }).catch(() => {});
        return { ok: true, state };
      }
      return { ok: true, state: { ...state, status: RECORDING_STATUS.IDLE } };
    default:
      return undefined;
  }
}

async function startRecording(payload) {
  if (state.status === RECORDING_STATUS.RECORDING || state.status === RECORDING_STATUS.PAUSED || state.status === RECORDING_STATUS.STARTING) {
    return { ok: false, error: 'A recording is already in progress.' };
  }

  const normalizedPayload = await prepareCapturePayload(payload);
  await ensureOffscreenDocument();

  // Phase 1: Prepare (Acquire streams/Share dialog)
  updateState({
    status: RECORDING_STATUS.STARTING,
    startedAt: null,
    pausedAt: null,
    elapsedBeforePause: 0,
    micEnabled: Boolean(normalizedPayload.options.captureMicrophone),
    cameraEnabled: Boolean(normalizedPayload.options.captureCamera),
    toolbarTabId: normalizedPayload.toolbarTabId,
    error: '',
    recordingId: null
  });

  try {
    // This waits for the user to pick a screen/window in the Chrome dialog
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_START, payload: normalizedPayload });

    // Phase 2: Countdown (Only after streams are ready)
    await injectToolbarIntoTab(normalizedPayload.toolbarTabId);
    if (normalizedPayload.toolbarTabId) {
      chrome.tabs.sendMessage(normalizedPayload.toolbarTabId, { type: MESSAGE.START_COUNTDOWN }).catch(() => {});
    }

    // Wait for 3 seconds countdown
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Phase 3: Start Capture
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_START_CAPTURE });
    await broadcastState();
    
    return { ok: true, state };
  } catch (error) {
    updateState({ status: RECORDING_STATUS.IDLE, error: error.message });
    throw error;
  }
}

async function prepareCapturePayload(payload) {
  const toolbarTab = await getActiveHttpTab();
  if (payload.sourceType !== 'tab') {
    return {
      ...payload,
      streamId: null,
      sourceType: payload.sourceType === 'window' ? 'window' : 'screen',
      toolbarTabId: toolbarTab?.id || null
    };
  }

  if (!toolbarTab?.id) {
    throw new Error('Current tab capture only works on normal http or https pages.');
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: toolbarTab.id });
  return {
    ...payload,
    streamId,
    sourceType: 'tab',
    targetTabId: toolbarTab.id,
    toolbarTabId: toolbarTab.id
  };
}

async function getActiveHttpTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id || !/^https?:/.test(activeTab.url || '')) {
    return null;
  }
  return activeTab;
}

async function handleToolbarAction(action, payload = {}) {
  await ensureOffscreenDocument();
  if (action === 'pause') {
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_PAUSE });
  }
  if (action === 'resume') {
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_RESUME });
  }
  if (action === 'stop') {
    updateState({ status: RECORDING_STATUS.STOPPING });
    await broadcastState();
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_STOP });
  }
  if (action === 'cancel') {
    updateState({ status: RECORDING_STATUS.IDLE });
    await broadcastState();
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_CANCEL });
  }
  if (action === 'toggleMic') {
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_TOGGLE_MIC });
  }
  if (action === 'toggleCamera') {
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_TOGGLE_CAMERA });
  }
  if (action === 'cameraPosition') {
    await sendOffscreenCommand({ type: MESSAGE.OFFSCREEN_CAMERA_POSITION, position: payload.position });
  }
  return { ok: true, state };
}

async function sendOffscreenCommand(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response && response.ok === false) {
    throw new Error(response.error || 'The recorder document rejected the command.');
  }
  return response;
}

async function handleRecordingComplete(recording) {
  updateState({
    status: RECORDING_STATUS.IDLE,
    startedAt: null,
    pausedAt: null,
    elapsedBeforePause: 0,
    toolbarTabId: null,
    error: '',
    recordingId: recording.id
  });
  await broadcastState();
  await openPreview(recording.id);
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL(OFFSCREEN_URL);
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [url]
    });
    if (contexts.length) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA', 'DISPLAY_MEDIA', 'BLOBS'],
      justification: 'Record screen, microphone, webcam, and compose recordings while the popup is closed.'
    });
  } catch (error) {
    if (!String(error?.message || '').includes('Only a single offscreen document')) {
      throw error;
    }
  }
}

async function openPreview(id) {
  if (!id) return;
  const url = chrome.runtime.getURL(`preview/index.html?id=${encodeURIComponent(id)}`);
  await chrome.tabs.create({ url });
}

function updateState(patch) {
  state = { ...state, ...patch };
  chrome.storage.local.set({ luminaState: state });
  broadcastState();
}

async function broadcastState() {
  chrome.runtime.sendMessage({ type: MESSAGE.STATE_CHANGED, state }).catch(() => {});
  if (!state.toolbarTabId) return;
  await chrome.tabs.sendMessage(state.toolbarTabId, { type: MESSAGE.STATE_CHANGED, state }).catch(() => {});
}

async function injectToolbarIntoTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['assets/content.js']
    });
    await chrome.tabs.sendMessage(tabId, { type: MESSAGE.STATE_CHANGED, state });
  } catch {
    // Some pages cannot run extension scripts. Recording still continues from the offscreen document.
  }
}
