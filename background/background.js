// Background Service Worker for ChoppedExtension

const LOG_PREFIX = '[background]';

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

chrome.runtime.onMessage.addListener((message, sender) => {
  log('message received', {
    action: message?.action,
    sender: sender?.id,
    hasUrl: Boolean(message?.blobUrl)
  });

  if (message.action === 'download') {
    const { blobUrl, filename, askLocation } = message;
    chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: askLocation
    }, downloadId => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        logError('download failed', runtimeError.message);
        return;
      }
      log('download started', { downloadId, filename, askLocation });
    });
  }
});