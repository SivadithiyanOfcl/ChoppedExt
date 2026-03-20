import { startRecording, stopRecording, pauseRecording, resumeRecording, getRecordingState, getAudioBuffer, getDuration } from '../audio/recorder.js';
import { getTrimmedBuffer, exportWav } from '../audio/audioProcessor.js';
import { updateWaveformZoom, setTrimHandles, getTrimPositions, loadWaveform } from '../waveform/waveformViewer.js';
import { validateFilename, getFilenameWithExtension } from '../utils/fileUtils.js';
import { formatTime, startTimer, stopTimer } from '../utils/timerUtils.js';

const LOG_PREFIX = '[popup]';

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

// UI Elements
const recordBtn = document.getElementById('record-btn');
const timerDisplay = document.getElementById('timer');
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
let audioBuffer = null;
let trimmedBuffer = null;
let zoomLevel = 1;

function setError(message) {
  filenameError.textContent = message;
  if (message) {
    log('displaying error to user', { message });
  }
}

// --- Recording Controls ---
function updateRecordBtn(state) {
  log('updating record button', { state });
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
  const formatted = `${formatTime(elapsedSeconds)} / ${formatTime(MAX_SECONDS)}`;
  timerDisplay.textContent = formatted;
  log('timer updated', { elapsedSeconds, formatted });
}

function handleTimerTick() {
  elapsedSeconds++;
  updateTimerDisplay();
  if (elapsedSeconds >= MAX_SECONDS) {
    log('recording duration limit reached');
    stopRecording();
    showLimitReached();
  }
}

function showLimitReached() {
  log('showing limit reached state');
  timerDisplay.textContent = 'Recording limit reached (10:00)';
  updateRecordBtn('idle');
}

recordBtn.addEventListener('click', async () => {
  const state = getRecordingState();
  log('record button clicked', { state });
  setError('');

  try {
    if (state === 'idle') {
      const started = await startRecording();
      if (!started) {
        setError('Unable to start recording. Check the extension console for details.');
        return;
      }
      elapsedSeconds = 0;
      updateRecordBtn('recording');
      updateTimerDisplay();
      timerInterval = startTimer(handleTimerTick, 1000);
      saveBtn.disabled = true;
      log('recording started from popup');
    } else if (state === 'recording') {
      const paused = pauseRecording();
      if (!paused) {
        setError('Unable to pause recording.');
        return;
      }
      updateRecordBtn('paused');
      stopTimer(timerInterval);
      log('recording paused from popup');
    } else if (state === 'paused') {
      const resumed = resumeRecording();
      if (!resumed) {
        setError('Unable to resume recording.');
        return;
      }
      updateRecordBtn('recording');
      timerInterval = startTimer(handleTimerTick, 1000);
      log('recording resumed from popup');
    }
  } catch (error) {
    logError('record button handler failed', error);
    setError(error.message || 'Unexpected recording error.');
  }
});

window.addEventListener('audioRecordingStopped', async event => {
  log('audioRecordingStopped event received', event.detail || {});
  stopTimer(timerInterval);
  updateRecordBtn('idle');
  audioBuffer = await getAudioBuffer();
  if (!audioBuffer) {
    setError('Recording finished, but no audio data was available.');
    return;
  }
  await loadWaveform(waveformDiv, audioBuffer);
  saveBtn.disabled = false;
  elapsedSeconds = getDuration();
  updateTimerDisplay();
  setTrimHandles(leftTrim, rightTrim, audioBuffer.duration);
});

window.addEventListener('audioRecordingLimitReached', () => {
  log('audioRecordingLimitReached event received');
  showLimitReached();
  saveBtn.disabled = false;
});

window.addEventListener('audioRecordingError', event => {
  const message = event.detail?.message || 'Recording failed.';
  logError('audioRecordingError event received', event.detail);
  stopTimer(timerInterval);
  updateRecordBtn('idle');
  saveBtn.disabled = !audioBuffer;
  setError(message);
});

// --- Waveform Controls ---
zoomInBtn.addEventListener('click', () => {
  zoomLevel = Math.min(zoomLevel + 1, 5);
  log('zoom in clicked', { zoomLevel });
  updateWaveformZoom(waveformDiv, zoomLevel);
});
zoomOutBtn.addEventListener('click', () => {
  zoomLevel = Math.max(zoomLevel - 1, 1);
  log('zoom out clicked', { zoomLevel });
  updateWaveformZoom(waveformDiv, zoomLevel);
});

// --- Cropping Sliders ---
[leftTrim, rightTrim].forEach(slider => {
  slider.addEventListener('input', () => {
    log('trim slider changed', {
      left: leftTrim.value,
      right: rightTrim.value,
      hasAudioBuffer: Boolean(audioBuffer)
    });
    if (audioBuffer) {
      setTrimHandles(leftTrim, rightTrim, audioBuffer.duration);
    }
  });
});

// --- Filename Input ---
filenameInput.addEventListener('input', () => {
  const value = filenameInput.value.trim();
  const valid = validateFilename(value);
  log('filename input changed', { value, valid });
  if (!valid) {
    setError('Invalid filename. Use letters, numbers, dash, or underscore.');
    saveBtn.disabled = true;
  } else {
    setError('');
    if (audioBuffer) saveBtn.disabled = false;
  }
});

// --- Save Functionality ---
saveBtn.addEventListener('click', async () => {
  log('save button clicked', { hasAudioBuffer: Boolean(audioBuffer) });
  if (!audioBuffer) return;
  const filename = filenameInput.value.trim();
  if (!validateFilename(filename)) {
    setError('Invalid filename.');
    return;
  }

  try {
    const [start, end] = getTrimPositions(leftTrim, rightTrim, audioBuffer.duration);
    log('preparing trimmed export', { start, end, duration: audioBuffer.duration });
    trimmedBuffer = await getTrimmedBuffer(audioBuffer, start, end);
    const wavBlob = await exportWav(trimmedBuffer);
    const finalFilename = getFilenameWithExtension(filename, 'wav');
    const askLocation = askLocationToggle.checked;

    log('sending download message', {
      finalFilename,
      askLocation,
      blobSize: wavBlob.size
    });
    chrome.runtime.sendMessage({
      action: 'download',
      blobUrl: URL.createObjectURL(wavBlob),
      filename: finalFilename,
      askLocation
    });
  } catch (error) {
    logError('failed to save recording', error);
    setError(error.message || 'Unable to save recording.');
  }
});

// --- Download Location Toggle ---
askLocationToggle.addEventListener('change', () => {
  log('ask location toggle changed', { checked: askLocationToggle.checked });
  chrome.storage.local.set({ askLocation: askLocationToggle.checked });
});

// --- Load Download Location Preference ---
chrome.storage.local.get(['askLocation'], result => {
  askLocationToggle.checked = !!result.askLocation;
  log('loaded askLocation preference', { askLocation: askLocationToggle.checked });
});

log('popup initialized');
updateRecordBtn('idle');
updateTimerDisplay();
saveBtn.disabled = true;