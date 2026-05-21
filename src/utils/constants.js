export const MESSAGE = Object.freeze({
  START_RECORDING: 'lumina:start-recording',
  OFFSCREEN_START: 'lumina:offscreen-start',
  OFFSCREEN_STOP: 'lumina:offscreen-stop',
  OFFSCREEN_PAUSE: 'lumina:offscreen-pause',
  OFFSCREEN_RESUME: 'lumina:offscreen-resume',
  OFFSCREEN_TOGGLE_MIC: 'lumina:offscreen-toggle-mic',
  OFFSCREEN_TOGGLE_CAMERA: 'lumina:offscreen-toggle-camera',
  OFFSCREEN_CAMERA_POSITION: 'lumina:offscreen-camera-position',
  OFFSCREEN_STATE: 'lumina:offscreen-state',
  RECORDING_COMPLETE: 'lumina:recording-complete',
  RECORDING_ERROR: 'lumina:recording-error',
  GET_STATE: 'lumina:get-state',
  STATE_CHANGED: 'lumina:state-changed',
  TOOLBAR_ACTION: 'lumina:toolbar-action',
  TOOLBAR_READY: 'lumina:toolbar-ready',
  PREVIEW_RECORDING: 'lumina:preview-recording',
  DELETE_RECORDING: 'lumina:delete-recording',
  GET_RECENTS: 'lumina:get-recents',
  OPEN_PREVIEW: 'lumina:open-preview'
});

export const RECORDING_STATUS = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  ERROR: 'error'
});

export const DEFAULT_OPTIONS = Object.freeze({
  captureMicrophone: true,
  captureCamera: false,
  captureSystemAudio: true,
  mimeType: 'video/webm;codecs=vp9,opus',
  fallbackMimeType: 'video/webm;codecs=vp8,opus',
  bitsPerSecond: 6_000_000
});

export const CAMERA_POSITION_DEFAULT = Object.freeze({
  x: 0.74,
  y: 0.68,
  size: 0.18
});
