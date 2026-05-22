# Prism Recorder

Prism Recorder is a Chrome Extension Manifest V3 screen recorder built with Vite, Tailwind CSS, and vanilla JavaScript. It records screen/window/tab capture in an offscreen document so recording continues after the popup closes, mixes microphone and available system audio, composites a circular webcam overlay into the video, provides a floating toolbar, and stores recordings locally in IndexedDB for preview and download.

## Project Structure

```text
public/
  manifest.json
src/
  background/
    service-worker.js
  content/
    content.js
  offscreen/
    index.html
    offscreen.js
  popup/
    index.html
    popup.js
  preview/
    index.html
    preview.js
  styles/
    app.css
  utils/
    constants.js
    format.js
    messaging.js
    storage.js
package.json
postcss.config.js
tailwind.config.js
vite.config.js
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [NPM](https://www.npmjs.com/) (comes with Node.js)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/deepanshu-verma-codes/prism.git
    cd lumina-v3
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Development

To start the development build with hot-reloading (Vite watch mode):

```bash
npm run dev
```

This will generate and update the extension files in the `dist/` directory.

### Production Build

To create a minified production-ready build:

```bash
npm run build
```

The output will be in the `dist/` directory.

## Loading in Chrome

1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** using the toggle in the top-right corner.
3.  Click the **Load unpacked** button.
4.  Select the `dist` folder in this project's directory.
5.  The **Prism Recorder** extension should now appear in your list of extensions.

## Usage Guide

1.  **Pin the Extension:** For easy access, pin Prism Recorder from the extensions menu (puzzle piece icon).
2.  **Start Recording:**
    - Click the Prism Recorder icon in the toolbar.
    - Configure your recording preferences:
        - **Microphone:** Toggle audio capture.
        - **Camera:** Toggle webcam overlay.
        - **System Audio:** Enable if you want to capture browser/system sounds.
    - Click **Start Recording**.
3.  **Capture Selection:** Select the screen, window, or tab you wish to record from the Chrome dialog.
4.  **Manage Recording:** Use the floating toolbar to:
    - **Pause/Resume** the recording.
    - **Mute/Unmute** your microphone.
    - **Show/Hide** the camera overlay.
    - **Drag** the camera bubble to any position on the screen.
5.  **Stop & Save:** Click the **Stop** button on the toolbar.
6.  **Preview & Export:**
    - A preview page will automatically open.
    - Review your recording, check file size, and duration.
    - Click **Download** to save the video locally.
    - Recordings are stored in your browser's IndexedDB for privacy.
