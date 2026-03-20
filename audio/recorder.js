// Audio Recorder Module

let mediaRecorder = null;
let audioChunks = [];
let recordingState = 'idle';
let audioBuffer = null;
let duration = 0;
let stream = null;
let audioContext = null;

export function getRecordingState() {
  return recordingState;
}

export async function startRecording() {
  if (recordingState !== 'idle') return;
  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    alert('No active tab found for audio capture.');
    return;
  }
  stream = await new Promise((resolve, reject) => {
    chrome.tabCapture.capture(
      { audio: true, video: false, targetTabId: tab.id },
      s => s ? resolve(s) : reject(chrome.runtime.lastError)
    );
  });
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  audioChunks = [];
  recordingState = 'recording';
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    duration = audioBuffer.duration;
    window.dispatchEvent(new Event('audioRecordingStopped'));
    stream.getTracks().forEach(track => track.stop());
    audioContext.close();
  };
  mediaRecorder.start();
}

export function pauseRecording() {
  if (mediaRecorder && recordingState === 'recording') {
    mediaRecorder.pause();
    recordingState = 'paused';
  }
}

export function resumeRecording() {
  if (mediaRecorder && recordingState === 'paused') {
    mediaRecorder.resume();
    recordingState = 'recording';
  }
}

export function stopRecording() {
  if (mediaRecorder && (recordingState === 'recording' || recordingState === 'paused')) {
    mediaRecorder.stop();
    recordingState = 'idle';
  }
}

export async function getAudioBuffer() {
  return audioBuffer;
}

export function getDuration() {
  return duration;
}