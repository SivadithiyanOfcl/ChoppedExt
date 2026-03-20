import { startRecording, stopRecording, pauseRecording, resumeRecording, getRecordingState, getAudioBuffer, getDuration } from '../audio/recorder.js';
import { processAudioBuffer, getTrimmedBuffer, exportWav } from '../audio/audioProcessor.js';
import { updateWaveformZoom, setTrimHandles, getTrimPositions, loadWaveform } from '../waveform/waveformViewer.js';
import { validateFilename, getFilenameWithExtension } from '../utils/fileUtils.js';
import { formatTime, startTimer, stopTimer } from '../utils/timerUtils.js';

// UI Elements
const recordBtn = document.getElementById('record-btn');
const timerDisplay = document.getElementById('timer');
const waveformContainer = document.getElementById('waveform-container');
const waveformDiv = document.getElementById('waveform');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const leftTrim = document.getElementById('left-trim');
const rightTrim = document.getElementById('right-trim');
const filenameInput = document.getElementById('filename-input');
const filenameError = document.getElementById('filename-error');
const saveBtn = document.getElementById('save-btn');
const askLocationToggle = document.getElementById('ask-location-toggle');

let timerInterval = null;
let elapsedSeconds = 0;
const MAX_SECONDS = 600;
let waveform = null;
let audioBuffer = null;
let trimmedBuffer = null;
let zoomLevel = 1;

// --- Recording Controls ---
function updateRecordBtn(state) {
  recordBtn.classList.remove('idle', 'recording', 'paused');
  recordBtn.classList.add(state);
  if (state === 'idle') {
    recordBtn.title = 'Start Recording';
  } else if (state === 'recording') {
    recordBtn.title = 'Pause Recording';
  } else if (state === 'paused') {
    recordBtn.title = 'Resume Recording';
  }
}

function updateTimerDisplay() {
  timerDisplay.textContent = `${formatTime(elapsedSeconds)} / ${formatTime(MAX_SECONDS)}`;
}

function handleTimerTick() {
  elapsedSeconds++;
  updateTimerDisplay();
  if (elapsedSeconds >= MAX_SECONDS) {
    stopRecording();
    showLimitReached();
  }
}

function showLimitReached() {
  timerDisplay.textContent = 'Recording limit reached (10:00)';
  updateRecordBtn('idle');
}

recordBtn.addEventListener('click', async () => {
  const state = getRecordingState();
  if (state === 'idle') {
    await startRecording();
    elapsedSeconds = 0;
    updateRecordBtn('recording');
    updateTimerDisplay();
    timerInterval = startTimer(handleTimerTick, 1000);
    saveBtn.disabled = true;
  } else if (state === 'recording') {
    pauseRecording();
    updateRecordBtn('paused');
    stopTimer(timerInterval);
  } else if (state === 'paused') {
    resumeRecording();
    updateRecordBtn('recording');
    timerInterval = startTimer(handleTimerTick, 1000);
  }
});

window.addEventListener('audioRecordingStopped', async () => {
  stopTimer(timerInterval);
  updateRecordBtn('idle');
  audioBuffer = await getAudioBuffer();
  await loadWaveform(waveformDiv, audioBuffer);
  saveBtn.disabled = false;
  elapsedSeconds = getDuration();
  updateTimerDisplay();
  setTrimHandles(leftTrim, rightTrim, audioBuffer.duration);
});

window.addEventListener('audioRecordingLimitReached', () => {
  showLimitReached();
  saveBtn.disabled = false;
});

// --- Waveform Controls ---
zoomInBtn.addEventListener('click', () => {
  zoomLevel = Math.min(zoomLevel + 1, 5);
  updateWaveformZoom(waveformDiv, zoomLevel);
});
zoomOutBtn.addEventListener('click', () => {
  zoomLevel = Math.max(zoomLevel - 1, 1);
  updateWaveformZoom(waveformDiv, zoomLevel);
});

// --- Cropping Sliders ---
[leftTrim, rightTrim].forEach(slider => {
  slider.addEventListener('input', () => {
    if (audioBuffer) {
      setTrimHandles(leftTrim, rightTrim, audioBuffer.duration);
    }
  });
});

// --- Filename Input ---
filenameInput.addEventListener('input', () => {
  const value = filenameInput.value.trim();
  const valid = validateFilename(value);
  if (!valid) {
    filenameError.textContent = 'Invalid filename. Use letters, numbers, dash, or underscore.';
    saveBtn.disabled = true;
  } else {
    filenameError.textContent = '';
    if (audioBuffer) saveBtn.disabled = false;
  }
});

// --- Save Functionality ---
saveBtn.addEventListener('click', async () => {
  if (!audioBuffer) return;
  const filename = filenameInput.value.trim();
  if (!validateFilename(filename)) {
    filenameError.textContent = 'Invalid filename.';
    return;
  }
  const [start, end] = getTrimPositions(leftTrim, rightTrim, audioBuffer.duration);
  trimmedBuffer = await getTrimmedBuffer(audioBuffer, start, end);
  const wavBlob = await exportWav(trimmedBuffer);
  const finalFilename = getFilenameWithExtension(filename, 'wav');
  const askLocation = askLocationToggle.checked;
  chrome.runtime.sendMessage({
    action: 'download',
    blobUrl: URL.createObjectURL(wavBlob),
    filename: finalFilename,
    askLocation
  });
});

// --- Download Location Toggle ---
askLocationToggle.addEventListener('change', () => {
  chrome.storage.local.set({ askLocation: askLocationToggle.checked });
});

// --- Load Download Location Preference ---
chrome.storage.local.get(['askLocation'], (result) => {
  askLocationToggle.checked = !!result.askLocation;
});

// --- Initial UI State ---
updateRecordBtn('idle');
updateTimerDisplay();
saveBtn.disabled = true;// JavaScript source code
