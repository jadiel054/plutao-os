import * as ort from 'onnxruntime-web';
import { Style, TextToSpeech } from './helper_tts.js';
import { UnicodeProcessor } from './helper_core.js';

export async function loadVoiceStyle(voiceStylePaths, verbose = false) {
    const bsz = voiceStylePaths.length;
    const firstResponse = await fetch(voiceStylePaths[0]);
    const firstStyle = await firstResponse.json();
    const ttlDims = firstStyle.style_ttl.dims;
    const dpDims = firstStyle.style_dp.dims;
    const ttlDim1 = ttlDims[1];
    const ttlDim2 = ttlDims[2];
    const dpDim1 = dpDims[1];
    const dpDim2 = dpDims[2];
    const ttlFlat = new Float32Array(bsz * ttlDim1 * ttlDim2);
    const dpFlat = new Float32Array(bsz * dpDim1 * dpDim2);
    for (let i = 0; i < bsz; i++) {
        const response = await fetch(voiceStylePaths[i]);
        const voiceStyle = await response.json();
        ttlFlat.set(voiceStyle.style_ttl.data.flat(Infinity), i * ttlDim1 * ttlDim2);
        dpFlat.set(voiceStyle.style_dp.data.flat(Infinity), i * dpDim1 * dpDim2);
    }
    const ttlTensor = new ort.Tensor('float32', ttlFlat, [bsz, ttlDim1, ttlDim2]);
    const dpTensor = new ort.Tensor('float32', dpFlat, [bsz, dpDim1, dpDim2]);
    if (verbose) console.log(`Loaded ${bsz} voice styles`);
    return new Style(ttlTensor, dpTensor);
}

export async function loadCfgs(onnxDir) {
    const response = await fetch(`${onnxDir}/tts.json`);
    return await response.json();
}

export async function loadTextProcessor(onnxDir) {
    const response = await fetch(`${onnxDir}/unicode_indexer.json`);
    const indexer = await response.json();
    return new UnicodeProcessor(indexer);
}

export async function loadOnnx(onnxPath, options) {
    return await ort.InferenceSession.create(onnxPath, options);
}

export async function loadTextToSpeech(onnxDir, sessionOptions = {}, progressCallback = null) {
    const cfgs = await loadCfgs(onnxDir);
    const modelPaths = [
        { name: 'Duration Predictor', path: `${onnxDir}/duration_predictor.onnx` },
        { name: 'Text Encoder', path: `${onnxDir}/text_encoder.onnx` },
        { name: 'Vector Estimator', path: `${onnxDir}/vector_estimator.onnx` },
        { name: 'Vocoder', path: `${onnxDir}/vocoder.onnx` },
    ];
    const sessions = [];
    for (let i = 0; i < modelPaths.length; i++) {
        if (progressCallback) progressCallback(modelPaths[i].name, i + 1, modelPaths.length);
        sessions.push(await loadOnnx(modelPaths[i].path, sessionOptions));
    }
    const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = sessions;
    const textProcessor = await loadTextProcessor(onnxDir);
    const textToSpeech = new TextToSpeech(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt);
    return { textToSpeech, cfgs };
}

export function writeWavFile(audioData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const dataSize = audioData.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true);
    view.setUint16(32, numChannels * bitsPerSample / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    const int16Data = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
        const s = Math.max(-1, Math.min(1, audioData[i]));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    new Uint8Array(buffer, 44).set(new Uint8Array(int16Data.buffer));
    return buffer;
}
