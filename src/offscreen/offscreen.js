import { CAMERA_POSITION_DEFAULT, DEFAULT_OPTIONS, MESSAGE, RECORDING_STATUS } from '../utils/constants.js';
import { saveRecording } from '../utils/storage.js';

const screenVideo = document.querySelector('#screenVideo');
const cameraVideo = document.querySelector('#cameraVideo');
const canvas = document.querySelector('#recordingCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

let recorder = null;
let chunks = [];
let screenStream = null;
let microphoneStream = null;
let cameraStream = null;
let composedStream = null;
let audioContext = null;
let audioDestination = null;
let frameTimer = 0;
let startedAt = 0;
let pausedAt = 0;
let elapsedBeforePause = 0;
let micEnabled = true;
let cameraEnabled = true;
let cameraPosition = { ...CAMERA_POSITION_DEFAULT };
let lastOptions = { ...DEFAULT_OPTIONS };

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOffscreenMessage(message?.type)) {
    return false;
  }

  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      const errorMessage = error?.message || 'Recording failed.';
      notifyError(errorMessage);
      sendResponse({ ok: false, error: errorMessage });
    });
  return true;
});

function isOffscreenMessage(type) {
  return [
    MESSAGE.OFFSCREEN_START,
    MESSAGE.OFFSCREEN_START_CAPTURE,
    MESSAGE.OFFSCREEN_STOP,
    MESSAGE.OFFSCREEN_PAUSE,
    MESSAGE.OFFSCREEN_RESUME,
    MESSAGE.OFFSCREEN_TOGGLE_MIC,
    MESSAGE.OFFSCREEN_TOGGLE_CAMERA,
    MESSAGE.OFFSCREEN_CAMERA_POSITION
  ].includes(type);
}

async function handleMessage(message) {
  switch (message?.type) {
    case MESSAGE.OFFSCREEN_START:
      await prepareRecording(message.payload);
      return { ok: true };
    case MESSAGE.OFFSCREEN_START_CAPTURE:
      await startCapture();
      return { ok: true };
    case MESSAGE.OFFSCREEN_STOP:
      await stopRecording();
      return { ok: true };
    case MESSAGE.OFFSCREEN_PAUSE:
      pauseRecording();
      return { ok: true };
    case MESSAGE.OFFSCREEN_RESUME:
      resumeRecording();
      return { ok: true };
    case MESSAGE.OFFSCREEN_TOGGLE_MIC:
      toggleMicrophone();
      return { ok: true };
    case MESSAGE.OFFSCREEN_TOGGLE_CAMERA:
      await toggleCamera();
      return { ok: true };
    case MESSAGE.OFFSCREEN_CAMERA_POSITION:
      updateCameraPosition(message.position);
      return { ok: true };
    default:
      return undefined;
  }
}

async function prepareRecording({ streamId, sourceType = 'screen', options }) {
  if (recorder && recorder.state !== 'inactive') {
    throw new Error('A recording is already active.');
  }

  lastOptions = { ...DEFAULT_OPTIONS, ...options };
  chunks = [];
  startedAt = 0; // Don't set yet
  pausedAt = 0;
  elapsedBeforePause = 0;
  micEnabled = Boolean(lastOptions.captureMicrophone);
  cameraEnabled = Boolean(lastOptions.captureCamera);

  try {
    screenStream = sourceType === 'tab'
      ? await getTabStream(streamId, lastOptions.captureSystemAudio)
      : await getDisplayStream(sourceType, lastOptions.captureSystemAudio);
    
    if (lastOptions.captureMicrophone) {
      microphoneStream = await getMicrophoneStream();
    }

    await prepareVideoElements();
    composedStream = createRecordingStream();

    const mimeType = pickMimeType();
    recorder = new MediaRecorder(composedStream, {
      mimeType,
      videoBitsPerSecond: lastOptions.bitsPerSecond
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => notifyError(event.error?.message || 'MediaRecorder failed.');
    recorder.onstop = persistRecording;

    screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      if (recorder && recorder.state !== 'inactive') stopRecording();
    });

    sendState({ status: RECORDING_STATUS.STARTING });
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function startCapture() {
  if (!recorder || recorder.state !== 'inactive') return;
  
  startedAt = Date.now();
  recorder.start(1000);
  startDrawingFrames();
  sendState({ status: RECORDING_STATUS.RECORDING });
}

async function getDisplayStream(sourceType, includeAudio) {
  const displaySurface = sourceType === 'window' ? 'window' : 'monitor';
  const constraints = {
    video: {
      frameRate: { ideal: 30, max: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      displaySurface
    },
    audio: includeAudio,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: includeAudio ? 'include' : 'exclude',
    monitorTypeSurfaces: sourceType === 'screen' ? 'include' : 'exclude'
  };

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    validateDisplaySurface(stream, sourceType);
    return stream;
  } catch (error) {
    if (!includeAudio) {
      throw new Error(`Could not capture ${sourceType === 'window' ? 'a window' : 'the screen'}: ${error.message}`);
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ ...constraints, audio: false });
      validateDisplaySurface(stream, sourceType);
      return stream;
    } catch (videoOnlyError) {
      throw new Error(`Could not capture ${sourceType === 'window' ? 'a window' : 'the screen'}: ${videoOnlyError.message}`);
    }
  }
}

function validateDisplaySurface(stream, sourceType) {
  const track = stream.getVideoTracks()[0];
  const displaySurface = track?.getSettings?.().displaySurface;
  if (!displaySurface) return;

  const valid = sourceType === 'window'
    ? displaySurface === 'window'
    : displaySurface === 'monitor';

  if (!valid) {
    stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
    throw new Error(sourceType === 'window'
      ? 'Window mode records one selected window. Please choose a window in Chrome’s share dialog.'
      : 'Full Screen mode records the entire screen. Please choose an entire screen in Chrome’s share dialog.');
  }
}

async function getTabStream(streamId, includeAudio) {
  const mandatory = {
    chromeMediaSource: 'tab',
    chromeMediaSourceId: streamId
  };
  const constraints = {
    video: { mandatory },
    audio: includeAudio ? { mandatory } : false
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    if (!includeAudio) {
      throw new Error(`Could not capture the current tab: ${error.message}`);
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { mandatory }, audio: false });
    } catch (videoOnlyError) {
      throw new Error(`Could not capture the current tab: ${videoOnlyError.message}`);
    }
  }
}

async function getMicrophoneStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
  } catch {
    micEnabled = false;
    return null;
  }
}

async function prepareVideoElements() {
  screenVideo.srcObject = screenStream;
  await screenVideo.play();
  const settings = screenStream.getVideoTracks()[0].getSettings();
  canvas.width = settings.width || screenVideo.videoWidth || 1920;
  canvas.height = settings.height || screenVideo.videoHeight || 1080;
}

function createRecordingStream() {
  const output = canvas.captureStream(30);
  const audioTrack = createMixedAudioTrack([screenStream, microphoneStream].filter(Boolean));
  if (audioTrack) output.addTrack(audioTrack);
  return output;
}

function createMixedAudioTrack(streams) {
  const audioStreams = streams.filter((stream) => stream.getAudioTracks().length);
  if (!audioStreams.length) return null;

  audioContext = new AudioContext();
  audioDestination = audioContext.createMediaStreamDestination();
  audioStreams.forEach((stream) => {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioDestination);
  });
  return audioDestination.stream.getAudioTracks()[0] || null;
}

function pickMimeType() {
  if (MediaRecorder.isTypeSupported(lastOptions.mimeType)) return lastOptions.mimeType;
  if (MediaRecorder.isTypeSupported(lastOptions.fallbackMimeType)) return lastOptions.fallbackMimeType;
  return 'video/webm';
}

function startDrawingFrames() {
  stopDrawingFrames();
  drawFrame();
  frameTimer = window.setInterval(() => {
    drawFrame();
  }, 1000 / 30);
}

function stopDrawingFrames() {
  if (frameTimer) {
    clearInterval(frameTimer);
  }
  frameTimer = 0;
}

function drawFrame() {
  if (!screenStream) return;
  ctx.fillStyle = '#050816';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

  const canvasVideoTrack = composedStream?.getVideoTracks?.()[0];
  if (canvasVideoTrack?.requestFrame) {
    canvasVideoTrack.requestFrame();
  }
}

function pauseRecording() {
  if (!recorder || recorder.state !== 'recording') return;
  recorder.pause();
  pausedAt = Date.now();
  sendState({ status: RECORDING_STATUS.PAUSED, pausedAt });
}

function resumeRecording() {
  if (!recorder || recorder.state !== 'paused') return;
  elapsedBeforePause += Date.now() - pausedAt;
  pausedAt = 0;
  recorder.resume();
  sendState({ status: RECORDING_STATUS.RECORDING, elapsedBeforePause, pausedAt: null });
}

async function stopRecording() {
  if (!recorder || recorder.state === 'inactive') {
    cleanup();
    sendState({ status: RECORDING_STATUS.IDLE });
    return;
  }
  sendState({ status: RECORDING_STATUS.STOPPING });
  await new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.requestData();
    recorder.stop();
  });
}

function toggleMicrophone() {
  micEnabled = !micEnabled;
  microphoneStream?.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  sendState({ micEnabled });
}

async function toggleCamera() {
  cameraEnabled = !cameraEnabled;
  sendState({ cameraEnabled });
}

function updateCameraPosition(position) {
  if (!position) return;
  cameraPosition = {
    x: clamp(Number(position.x), 0, 1),
    y: clamp(Number(position.y), 0, 1),
    size: clamp(Number(position.size || cameraPosition.size), 0.12, 0.28)
  };
}

async function persistRecording() {
  try {
    stopDrawingFrames();
    const duration = Math.max(0, Date.now() - startedAt - elapsedBeforePause - (pausedAt ? Date.now() - pausedAt : 0));
    const type = recorder?.mimeType || 'video/webm';
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('The recording did not contain media data.');

    const id = crypto.randomUUID();
    const recording = {
      id,
      name: `Prism Recording ${new Date().toLocaleString()}`,
      blob,
      type,
      size: blob.size,
      duration,
      createdAt: Date.now()
    };
    await saveRecording(recording);
    chrome.runtime.sendMessage({ type: MESSAGE.RECORDING_COMPLETE, recording: { id } });
  } catch (error) {
    notifyError(error?.message || 'Unable to save recording.');
  } finally {
    cleanup();
  }
}

function cleanup() {
  stopDrawingFrames();
  [screenStream, microphoneStream, cameraStream, composedStream].filter(Boolean).forEach((stream) => {
    stream.getTracks().forEach((track) => track.stop());
  });
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
  }
  screenVideo.srcObject = null;
  cameraVideo.srcObject = null;
  recorder = null;
  chunks = [];
  screenStream = null;
  microphoneStream = null;
  cameraStream = null;
  composedStream = null;
  audioContext = null;
  audioDestination = null;
  startedAt = 0;
  pausedAt = 0;
  elapsedBeforePause = 0;
}

function sendState(patch) {
  chrome.runtime.sendMessage({
    type: MESSAGE.OFFSCREEN_STATE,
    state: {
      ...patch,
      startedAt,
      pausedAt,
      elapsedBeforePause,
      micEnabled,
      cameraEnabled
    }
  });
}

function notifyError(error) {
  chrome.runtime.sendMessage({ type: MESSAGE.RECORDING_ERROR, error });
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
