// Waveform Viewer Module

let wavesurfer = null;

export async function loadWaveform(container, audioBuffer) {
    if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
    }
    wavesurfer = WaveSurfer.create({
        container: container,
        waveColor: '#fbc02d',
        progressColor: '#e53935',
        backgroundColor: '#23272e',
        height: 80,
        responsive: true,
        scrollParent: true,
        minPxPerSec: 100
    });
    const blob = await bufferToWavBlob(audioBuffer);
    const url = URL.createObjectURL(blob);
    wavesurfer.load(url);
}

export function updateWaveformZoom(container, zoomLevel) {
    if (wavesurfer) {
        wavesurfer.zoom(zoomLevel * 100);
    }
}

export function setTrimHandles(leftSlider, rightSlider, duration) {
    // Optionally update UI overlays for handles
    // Sliders already reflect trim positions
}

export function getTrimPositions(leftSlider, rightSlider, duration) {
    const left = (parseInt(leftSlider.value, 10) / 100) * duration;
    const right = (parseInt(rightSlider.value, 10) / 100) * duration;
    return [Math.min(left, right), Math.max(left, right)];
}

async function bufferToWavBlob(buffer) {
    // WAV encoding (same as exportWav)
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2;
    const wavBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(wavBuffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = buffer.getChannelData(ch)[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}