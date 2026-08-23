#!/usr/bin/env node
/**
 * Minimal local retrieval demo proving the "what has Chris said about X" concept
 * against the 20-video ethnic-foods sample corpus — no AWS, no ClickHouse, no
 * ScrapeCreators, no vendor cost. Keyword-scored sentence retrieval only; a real
 * build would replace the scoring with embeddings, but this proves the shape of
 * the answer (which clips, which quotes) cheaply before spending on infra.
 *
 * Usage: node search-demo.mjs "curry"
 */
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTIONS_DIR = join(__dirname, 'ethnic-foods', 'captions');

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
    console.error('Usage: node search-demo.mjs "<question or keyword>"');
    process.exit(1);
}

const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

const files = readdirSync(CAPTIONS_DIR).filter(f => f.endsWith('.json')).sort();
const videos = files.map(f => JSON.parse(readFileSync(join(CAPTIONS_DIR, f), 'utf-8')));

const hits = [];
for (const v of videos) {
    if (!v.has_transcript || !v.segments) continue;
    for (const seg of v.segments) {
        const lower = seg.text.toLowerCase();
        const matchCount = terms.filter(t => lower.includes(t)).length;
        if (matchCount > 0) {
            const mm = Math.floor(seg.start / 60);
            const ss = Math.round(seg.start % 60);
            hits.push({
                video: v,
                sentence: seg.text,
                score: matchCount,
                timestamp: `${mm}:${String(ss).padStart(2, '0')}`,
                deepLink: `${v.url}&t=${Math.floor(seg.start)}s`,
            });
        }
    }
}

hits.sort((a, b) => b.score - a.score);

console.log(`\nQuery: "${query}"`);
console.log(`Corpus: ${videos.length} videos, ${videos.filter(v => v.has_transcript).length} with transcripts\n`);

if (hits.length === 0) {
    console.log('No matches.');
    process.exit(0);
}

const byVideo = new Map();
for (const h of hits) {
    if (!byVideo.has(h.video.video_id)) byVideo.set(h.video.video_id, []);
    byVideo.get(h.video.video_id).push(h);
}

console.log(`Found matches in ${byVideo.size} of 20 videos:\n`);

let shown = 0;
for (const [vid, vHits] of byVideo) {
    const v = vHits[0].video;
    console.log(`--- "${v.title}"`);
    console.log(`    ${v.url}`);
    for (const h of vHits.sort((a, b) => b.score - a.score).slice(0, 2)) {
        const snippet = h.sentence.length > 200 ? h.sentence.slice(0, 200) + '…' : h.sentence;
        console.log(`    [${h.timestamp}] "${snippet}"`);
        console.log(`    -> ${h.deepLink}`);
        shown++;
    }
    console.log('');
    if (shown > 30) break;
}
