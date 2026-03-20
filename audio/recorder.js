// Audio Recorder Module

const LOG_PREFIX = '[recorder]';

let mediaRecorder = null;
let audioChunks = [];
let recordingState = 'idle';
let audioBuffer = null;
let duration = 0;
let stream = null;
let audioContext = null;

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

export async function startRecording() {
  log('startRecording invoked', { recordingState });
  if (recordingState !== 'idle') {
    log('startRecording ignored because recorder is not idle');
    return false;
  }

  try {
    audioBuffer = null;
    duration = 0;

    log('requesting tab capture for the active tab');
    stream = await new Promise((resolve, reject) => {
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

    mediaRecorder.onpause = () => {
      log('MediaRecorder paused');
    };

    mediaRecorder.onresume = () => {
      log('MediaRecorder resumed');
    };

    mediaRecorder.onerror = event => {
      logError('MediaRecorder error event fired', event.error || event);
      dispatchRecorderEvent('audioRecordingError', {
        message: event.error?.message || 'MediaRecorder error event fired.'
      });
    };

    mediaRecorder.onstop = async () => {
      log('MediaRecorder stopped', { chunkCount: audioChunks.length });
      try {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        log('created recording blob', { size: blob.size, type: blob.type });

        const arrayBuffer = await blob.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        duration = audioBuffer.duration;
        log('decoded audio buffer', {
          duration,
          sampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels
        });
        dispatchRecorderEvent('audioRecordingStopped', { duration });
      } catch (error) {
        logError('failed to finalize recording', error);
        dispatchRecorderEvent('audioRecordingError', {
          message: error.message || 'Failed to finalize recording.'
        });
      } finally {
        cleanupRecorderResources();
        setRecordingState('idle');
      }
    };

    mediaRecorder.start();
    return true;
  } catch (error) {
    logError('startRecording failed', error);
    cleanupRecorderResources();
    setRecordingState('idle');
    dispatchRecorderEvent('audioRecordingError', {
      message: error.message || 'Unable to start recording.'
    });
    return false;
  }
}

export function pauseRecording() {
  log('pauseRecording invoked', { recordingState });
  if (mediaRecorder && recordingState === 'recording') {
    mediaRecorder.pause();
    setRecordingState('paused');
    return true;
  }
  log('pauseRecording ignored because recorder is not actively recording');
  return false;
}

export function resumeRecording() {
  log('resumeRecording invoked', { recordingState });
  if (mediaRecorder && recordingState === 'paused') {
    mediaRecorder.resume();
    setRecordingState('recording');
    return true;
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