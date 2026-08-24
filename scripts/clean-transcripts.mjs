#!/usr/bin/env node
/**
 * Cleans auto-caption noise in the transcript corpus, in place, before re-loading to ClickHouse.
 * Order matters: jingle-stripping MUST run before brand-name normalization, since the jingle's
 * own text ("raw advantage likes it raw") contains the brand name -- normalizing it first turns
 * "raw advantage likes it wrong" into "The Raw Advantage likes it wrong", which then no longer
 * matches the jingle pattern. (Found live: an earlier version did this in the wrong order and
 * silently under-stripped the jingle on exactly the videos where the brand name appeared inside
 * it.)
 *
 * 1. Strip the recurring intro jingle ("baby I like it raw... raw advantage likes it raw...").
 *    Confirmed present in 7/20 (35%) of the sample corpus, but garbled inconsistently enough by
 *    auto-caption that no single fixed phrase regex catches all of them -- one video has no
 *    "get into it" lead-in at all, another truncates "like it raw" down to "like it ra", another
 *    is a structurally different (non-auto, HTML-entity-laden) caption file entirely. Uses a
 *    cluster-detection approach instead: find repeated "like it ra*" fragments close together and
 *    remove the span between them, rather than matching one exact wording.
 * 2. Normalize brand-name variants ("rawadvantage", "raw Vantage", "rod vantage", ...) to
 *    "The Raw Advantage".
 * 3. Normalize his surname variants (Kendall/Kenel/Kennle/...) to "Chris Kennel".
 *
 * Usage: node scripts/clean-transcripts.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTIONS_DIR = join(__dirname, '..', 'demo-corpus', 'ethnic-foods', 'captions');

// "advanish" confirmed live as a third garbling variant (therawadvanish.com) beyond the
// advantage/vantage pair originally found -- no fixed list will be complete; this covers what's
// been seen, not a claim of exhaustiveness. Leading "the" made optional-and-unspaced (not a
// separate \b-bounded token) because the auto-captioner frequently fuses it directly onto "raw"
// with no space ("therawadvanish.com") -- a plain \b(raw|rod) anchor never fires there, since \b
// only matches between a word char and a non-word char, not between two letters.
const BRAND_RE = /\b(the)?\s*(raw|rod)\.?\s*(advantage|vantage|advanish)\b/gi;
const NAME_RE = /\bChris\s+(Kennel|Kendall|Kenel|Kennle|Kenell)\b/gi;

const FRAGMENT_RE = /like\s*(it)?\s*ra\w*/gi;
const CLUSTER_WINDOW = 160; // chars

function stripJingle(text) {
    const matches = [...text.matchAll(FRAGMENT_RE)];
    if (matches.length < 2) return { text, stripped: false };

    // group matches into clusters where consecutive matches are within CLUSTER_WINDOW chars
    const clusters = [];
    let current = [matches[0]];
    for (let i = 1; i < matches.length; i++) {
        if (matches[i].index - (current[current.length - 1].index + current[current.length - 1][0].length) <= CLUSTER_WINDOW) {
            current.push(matches[i]);
        } else {
            if (current.length >= 2) clusters.push(current);
            current = [matches[i]];
        }
    }
    if (current.length >= 2) clusters.push(current);
    if (clusters.length === 0) return { text, stripped: false };

    // remove each cluster's span (first match start -> last match end), widened slightly to
    // absorb adjacent filler ("baby", "oh", "yeah", "raw advantage/vantage likes it raw/wrong")
    let out = text;
    let removedAny = false;
    for (const cluster of clusters.reverse()) { // reverse so earlier indices stay valid while splicing from the end
        let start = cluster[0].index;
        let end = cluster[cluster.length - 1].index + cluster[cluster.length - 1][0].length;
        // widen forward past a trailing "raw advantage likes it (raw|wrong)" fragment if present
        const after = out.slice(end, end + 60);
        const afterMatch = after.match(/^\.?\s*(oh\s*,?\s*)?(baby\s*,?\s*)?(raw\s*(advantage|vantage)\s*likes\s*it\s*(raw|wrong))?\.?\s*/i);
        if (afterMatch) end += afterMatch[0].length;
        // widen backward past a leading "oh/baby/yeah" filler
        const before = out.slice(Math.max(0, start - 30), start);
        const beforeMatch = before.match(/(oh\s*,?\s*)?(baby\s*,?\s*)?(yeah\s*,?\s*)?$/i);
        if (beforeMatch && beforeMatch[0]) start -= beforeMatch[0].length;

        out = out.slice(0, start) + ' ' + out.slice(end);
        removedAny = true;
    }
    return { text: out.replace(/\s+/g, ' ').trim(), stripped: removedAny };
}

function normalizeBrandAndName(text) {
    return text.replace(BRAND_RE, 'The Raw Advantage').replace(NAME_RE, 'Chris Kennel');
}

const files = readdirSync(CAPTIONS_DIR).filter(f => f.endsWith('.json')).sort();
let brandHits = 0, nameHits = 0, videosWithJingleStripped = 0;

for (const f of files) {
    const path = join(CAPTIONS_DIR, f);
    const rec = JSON.parse(readFileSync(path, 'utf-8'));
    if (!rec.has_transcript) continue;

    let fileJingle = false;
    for (const seg of rec.segments || []) {
        const { text: dejingled, stripped } = stripJingle(seg.text);
        if (stripped) fileJingle = true;
        const normalized = normalizeBrandAndName(dejingled);
        brandHits += (dejingled.match(BRAND_RE) || []).length;
        nameHits += (dejingled.match(NAME_RE) || []).length;
        seg.text = normalized;
    }
    if (fileJingle) videosWithJingleStripped++;

    rec.transcript = (rec.segments || []).map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    rec.word_count = rec.transcript.split(' ').filter(Boolean).length;
    rec.cleaned = true;

    writeFileSync(path, JSON.stringify(rec, null, 2), 'utf-8');
}

console.log(`Brand-name normalizations: ${brandHits}`);
console.log(`Surname normalizations: ${nameHits}`);
console.log(`Videos with jingle stripped: ${videosWithJingleStripped} / ${files.length}`);
