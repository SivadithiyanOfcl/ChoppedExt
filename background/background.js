// Background Service Worker for ChoppedExtension

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'download') {
        const { blobUrl, filename, askLocation } = message;
        chrome.downloads.download({
            url: blobUrl,
            filename: filename,
            saveAs: askLocation
        });
    }
});