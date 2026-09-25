/**
 * Supertonic Web helper — adapted from official MIT source:
 * https://github.com/supertone-inc/supertonic/blob/main/web/helper.js
 * Copyright (c) Supertone Inc. — MIT License.
 * Used by Plutão OS for on-device pt-BR multi-voice TTS (runtime download only).
 */
import * as ort from 'onnxruntime-web';

// Available languages for multilingual TTS
export const AVAILABLE_LANGS = ['en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na'];

export function isValidLang(lang) {
    return AVAILABLE_LANGS.includes(lang);
}

/**
 * Unicode Text Processor
 */
export class UnicodeProcessor {
    constructor(indexer) {
        this.indexer = indexer;
    }

    call(textList, langList) {
        const processedTexts = textList.map((text, i) => this.preprocessText(text, langList[i]));
        
        const textIdsLengths = processedTexts.map(text => text.length);
        const maxLen = Math.max(...textIdsLengths);
        
        const textIds = processedTexts.map(text => {
            const row = new Array(maxLen).fill(0);
            for (let j = 0; j < text.length; j++) {
                const codePoint = text.codePointAt(j);
                row[j] = (codePoint < this.indexer.length) ? this.indexer[codePoint] : -1;
            }
            return row;
        });
        
        const textMask = this.getTextMask(textIdsLengths);
        return { textIds, textMask };
    }

    preprocessText(text, lang) {
        text = text.normalize('NFKD');

        const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
        text = text.replace(emojiPattern, '');

        const replacements = {
            '–': '-',
            '‑': '-',
            '—': '-',
            '_': ' ',
            '\u201C': '"',
            '\u201D': '"',
            '\u2018': "'",
            '\u2019': "'",
            '´': "'",
            '`': "'",
            '[': ' ',
            ']': ' ',
            '|': ' ',
            '/': ' ',
            '#': ' ',
            '→': ' ',
            '←': ' ',
        };
        for (const [k, v] of Object.entries(replacements)) {
            text = text.replaceAll(k, v);
        }

        text = text.replace(/[♥☆♡©\\]/g, '');

        const exprReplacements = {
            '@': ' at ',
            'e.g.,': 'for example, ',
            'i.e.,': 'that is, ',
        };
        for (const [k, v] of Object.entries(exprReplacements)) {
            text = text.replaceAll(k, v);
        }

        text = text.replace(/ ,/g, ',');
        text = text.replace(/ \./g, '.');
        text = text.replace(/ !/g, '!');
        text = text.replace(/ \?/g, '?');
        text = text.replace(/ ;/g, ';');
        text = text.replace(/ :/g, ':');
        text = text.replace(/ '/g, "'");

        while (text.includes('""')) {
            text = text.replace('""', '"');
        }
        while (text.includes("''")) {
            text = text.replace("''", "'");
        }
        while (text.includes('``')) {
            text = text.replace('``', '`');
        }

        text = text.replace(/\s+/g, ' ').trim();

        if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) {
            text += '.';
        }

        if (!isValidLang(lang)) {
            throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(', ')}`);
        }

        text = `<${lang}>${text}</${lang}>`;

        return text;
    }

    getTextMask(textIdsLengths) {
        const maxLen = Math.max(...textIdsLengths);
        return this.lengthToMask(textIdsLengths, maxLen);
    }

    lengthToMask(lengths, maxLen = null) {
        const actualMaxLen = maxLen || Math.max(...lengths);
        return lengths.map(len => {
            const row = new Array(actualMaxLen).fill(0.0);
            for (let j = 0; j < Math.min(len, actualMaxLen); j++) {
                row[j] = 1.0;
            }
            return [row];
        });
    }
}

// silence unused ort in this module (used by sibling modules)
void ort;
