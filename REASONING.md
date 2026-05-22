# Document of Reasoning: Cancel Recording Feature

## Overview
This document outlines the reasoning and technical implementation details for adding a "Cancel/Delete" recording feature to the Prism recorder, providing functionality similar to Loom where a user can discard an ongoing recording session.

## Problem Statement
Previously, users could only "Stop" a recording, which always triggered the saving process and opened a preview. There was no way to abort a recording if it was a "bad take," leading to unnecessary storage usage and a cluttered user experience.

## Architectural Decisions

### 1. Multi-Script Coordination
The Prism recorder architecture is distributed across three main environments:
- **Content Script (`src/content/content.js`)**: Handles the floating UI and user interactions.
- **Background Service Worker (`src/background/service-worker.js`)**: Orchestrates the recording state and message passing.
- **Offscreen Document (`src/offscreen/offscreen.js`)**: Manages the `MediaRecorder` and media streams.

**Decision**: The cancel action must propagate through all three layers to ensure the UI is cleared immediately, the background state is reset to `IDLE`, and the `MediaRecorder` is stopped without triggering its `onstop` persistence logic.

### 2. Immediate UI Feedback
**Decision**: In `src/content/content.js`, I implemented `clearToolbarImmediately()` for the cancel action.
**Reasoning**: Providing immediate visual confirmation that the recording has been discarded improves perceived performance and user confidence. Waiting for a round-trip message from the offscreen document would introduce a slight lag.

### 3. Graceful Abort in Offscreen Script
**Decision**: In `src/offscreen/offscreen.js`, the `cancelRecording` function sets `recorder.onstop = null` before calling `recorder.stop()`.
**Reasoning**: The standard "Stop" flow uses `recorder.onstop` to trigger `persistRecording`. By nullifying this handler during a cancel action, we prevent the "bad take" from being saved to storage or triggering a preview tab, while still ensuring that hardware resources (camera, mic) are correctly released via the `cleanup()` function.

## Implementation Details

### Message Protocol
A new message type `OFFSCREEN_CANCEL` was added to `src/utils/constants.js`. This allows the background script to explicitly tell the offscreen document to discard the current buffer instead of finalizing it.

### UI Integration
- **Icon**: A custom trash icon SVG was added to match the existing stroke-based icon set (mic, camera).
- **Styling**: A specific hover style `.lumina-btn.lumina-cancel:hover` with a red background tint was added. This uses the principle of "Visual Affordance" to warn the user that the action is destructive/non-reversible.

## Risk Mitigation
- **Logic Integrity**: By strictly separating the `stop` and `cancel` paths in the offscreen script, we ensured that the primary "Stop and Save" logic remained untouched and risk-free.
- **State Management**: The background service worker explicitly sets the status to `RECORDING_STATUS.IDLE` upon cancellation, ensuring the extension doesn't get stuck in a "Stopping" or "Recording" state if a cancel fails midway.

## Conclusion
The implementation provides a high-quality, responsive user experience that aligns with modern recording tool standards while maintaining the technical integrity and clean separation of concerns within the Prism codebase.
