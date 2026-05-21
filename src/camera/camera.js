import './camera.css';

const video = document.querySelector('#cameraPreview');
const fallback = document.querySelector('#fallback');
let stream = null;

startPreview();
window.addEventListener('pagehide', stopPreview);
window.addEventListener('beforeunload', stopPreview);

async function startPreview() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    fallback.hidden = true;
  } catch {
    fallback.hidden = false;
  }
}

function stopPreview() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}
