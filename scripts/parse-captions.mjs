#!/usr/bin/env node
/**
 * Reusable VTT -> caption-JSON parser, generalized after building it twice ad hoc (once for the
 * therawadvantage ethnic-foods corpus, once here for Johanna's mastermind-coaching corpus).
 *
 * Parses YouTube's rolling 2-line auto-caption VTT format correctly: takes each cue's LAST line
 * (the newest/growing content) and dedupes consecutive identical values -- confirmed live against
 * known word counts to be the correct general-purpose rule (see postglider-video/CLAUDE.md
 * Tenants section, "real parsing gotcha" note, for the two other approaches that were tried and
 * failed on some videos before this one).
 *
 * Usage: node scripts/parse-captions.mjs <corpus-dir> <video-manifest.json>
 *   corpus-dir must contain a raw-vtt/ subdirectory with files named `<NN>-<videoId>.en.vtt`
 *   video-manifest.json: [{ index, video_id, title, url }, ...]
 * Writes corpus-dir/captions/<NN>-<videoId>.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, globSync } from 'fs';
import { join } from 'path';

const [, , corpusDir, manifestPath] = process.argv;
if (!corpusDir || !manifestPath) {
    console.error('Usage: node scripts/parse-captions.mjs <corpus-dir> <video-manifest.json>');
    process.exit(1);
}

const VTT_DIR = join(corpusDir, 'raw-vtt');
const CAP_DIR = join(corpusDir, 'captions');
if (!existsSync(CAP_DIR)) mkdirSync(CAP_DIR, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

function parseVtt(text) {
    const blocks = text.split(/\n\n+/);
    const events = [];
    const tsRe = /(\d+):(\d+):(\d+)\.(\d+)\s*-->/;
    for (const block of blocks) {
        const lines = block.split('\n').filter(l => l.trim());
        if (!lines.length) continue;
        const m = lines[0].match(tsRe);
        if (!m) continue;
        const [, h, mnt, s, ms] = m;
        const start = Number(h) * 3600 + Number(mnt) * 60 + Number(s) + Number(ms) / 1000;
        const textLines = lines.slice(1);
        if (!textLines.length) continue;
        const clean = textLines[textLines.length - 1].replace(/<[^>]+>/g, '').trim();
        if (clean) events.push([start, clean]);
    }
    return events;
}

function groupIntoSegments(events, windowSec = 30) {
    const segments = [];
    if (!events.length) return segments;
    let segStart = events[0][0];
    let words = [];
    let lastText = null;
    for (const [start, text] of events) {
        if (text === lastText) continue;
        lastText = text;
        if (start - segStart > windowSec && words.length) {
            segments.push({ start: Math.round(segStart * 10) / 10, text: words.join(' ').trim() });
            segStart = start;
            words = [];
        }
        words.push(text);
    }
    if (words.length) segments.push({ start: Math.round(segStart * 10) / 10, text: words.join(' ').trim() });
    return segments;
}

let count = 0;
for (const rec of manifest) {
    const n = String(rec.index).padStart(2, '0');
    const matches = globSync(join(VTT_DIR, `${n}-${rec.video_id}*.vtt`));
    if (!matches.length) {
        console.log(`no vtt for ${rec.video_id}, skipping`);
        continue;
    }
    const events = parseVtt(readFileSync(matches[0], 'utf-8'));
    const segments = groupIntoSegments(events, 30);
    const transcript = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();

    const out = {
        index: rec.index,
        video_id: rec.video_id,
        title: rec.title,
        url: rec.url,
        has_transcript: segments.length > 0,
        word_count: transcript.split(' ').filter(Boolean).length,
        transcript,
        segments,
    };
    writeFileSync(join(CAP_DIR, `${n}-${rec.video_id}.json`), JSON.stringify(out, null, 2), 'utf-8');
    console.log(`${rec.video_id}: ${segments.length} segments, ${out.word_count} words`);
    count++;
}
console.log(`\nParsed ${count} videos`);
