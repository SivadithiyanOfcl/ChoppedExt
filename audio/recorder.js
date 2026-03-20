// Audio Recorder Module

const LOG_PREFIX = '[recorder]';

let mediaRecorder = null;
let audioChunks = [];
let recordingState = 'idle';
let audioBuffer = null;
let duration = 0;
let stream = null;
let audioContext = null;

async function captureActiveTabAudio() {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture(
      { audio: true, video: false },
      capturedStream => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!capturedStream) {
          reject(new Error('chrome.tabCapture.capture returned no stream.'));
          return;
        }
        resolve(capturedStream);
      }
    );
  });
}

async function captureTargetTabAudio(targetTabId) {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId });

  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });
}

function log(message, details) {
  if (details !== undefined) {
    console.log(`${LOG_PREFIX} ${message}`, details);
    return;
  }
  console.log(`${LOG_PREFIX} ${message}`);
}

function logError(message, error) {
  console.error(`${LOG_PREFIX} ${message}`, error);
}

function setRecordingState(nextState) {
  if (recordingState !== nextState) {
    log(`state change: ${recordingState} -> ${nextState}`);
    recordingState = nextState;
  }
}

function dispatchRecorderEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function cleanupRecorderResources() {
  log('cleaning up recorder resources');

  if (stream) {
    stream.getTracks().forEach(track => {
      log(`stopping track`, { kind: track.kind, readyState: track.readyState });
      track.stop();
    });
    stream = null;
  }

  mediaRecorder = null;
  audioChunks = [];

  if (audioContext) {
    const contextToClose = audioContext;
    audioContext = null;
    contextToClose.close().catch(error => {
      logError('failed to close audio context', error);
    });
  }
}

export function getRecordingState() {
  return recordingState;
}

export async function startRecording(targetTabId = null) {
  log('startRecording invoked', { recordingState, targetTabId });
  if (recordingState !== 'idle') {
    log('startRecording ignored because recorder is not idle');
    return false;
  }

  try {
    audioBuffer = null;
    duration = 0;

    log('requesting tab capture stream', {
      mode: targetTabId === null ? 'active-tab' : 'target-tab',
      targetTabId
    });
    stream = targetTabId === null
      ? await captureActiveTabAudio()
      : await captureTargetTabAudio(targetTabId);

    log('tab capture stream acquired', {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.createMediaStreamSource(stream);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    setRecordingState('recording');

    mediaRecorder.onstart = () => {
      log('MediaRecorder started');
    };

    mediaRecorder.ondataavailable = event => {
      log('MediaRecorder dataavailable fired', {
        chunkSize: event.data?.size ?? 0,
        mimeType: event.data?.type ?? 'unknown'
      });
      if (event.data?.size > 0) {
        audioChunks.push(event.data);
      }
    };
@@ -189,26 +212,26 @@ export function resumeRecording() {
  }
  log('resumeRecording ignored because recorder is not paused');
  return false;
}

export function stopRecording() {
  log('stopRecording invoked', { recordingState });
  if (mediaRecorder && (recordingState === 'recording' || recordingState === 'paused')) {
    mediaRecorder.stop();
    return true;
  }
  log('stopRecording ignored because recorder is not active');
  return false;
}

export async function getAudioBuffer() {
  log('getAudioBuffer requested', {
    hasAudioBuffer: Boolean(audioBuffer)
  });
  return audioBuffer;
}

export function getDuration() {
  log('getDuration requested', { duration });
  return duration;
}