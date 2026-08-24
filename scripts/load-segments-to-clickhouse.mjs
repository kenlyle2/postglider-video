#!/usr/bin/env node
/**
 * Loads the ethnic-foods demo corpus (captions/*.json, already built via yt-dlp) into the
 * ClickHouse `default.video_segments` table. Uses the data-plane HTTP credential in .env.local
 * (POST — ClickHouse's HTTP interface treats GET as read-only by protocol design).
 *
 * Usage: node scripts/load-segments-to-clickhouse.mjs
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env.local');
const CAPTIONS_DIR = join(__dirname, '..', 'demo-corpus', 'ethnic-foods', 'captions');

const env = {};
for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
}

const BASE_URL = `https://${env.CLICKHOUSE_HOST}:${env.CLICKHOUSE_PORT}/`;
const AUTH = Buffer.from(`${env.CLICKHOUSE_USER}:${env.CLICKHOUSE_PASSWORD}`).toString('base64');

async function chQuery(sql) {
    const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${AUTH}` },
        body: sql,
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`ClickHouse error (${res.status}): ${text}`);
    }
    return text;
}

function escapeStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const files = readdirSync(CAPTIONS_DIR).filter(f => f.endsWith('.json')).sort();

let totalRows = 0;
const rows = [];
for (const f of files) {
    const rec = JSON.parse(readFileSync(join(CAPTIONS_DIR, f), 'utf-8'));
    if (!rec.has_transcript || !rec.segments) continue;
    for (const seg of rec.segments) {
        rows.push(
            `('${escapeStr(rec.video_id)}', '${escapeStr(rec.title)}', '${escapeStr(rec.url)}', ${seg.start}, '${escapeStr(seg.text)}')`
        );
    }
    totalRows += rec.segments.length;
}

console.log(`Loading ${totalRows} segments from ${files.length} videos...`);

// clear any prior run's rows for idempotency
await chQuery('TRUNCATE TABLE default.video_segments');

const BATCH = 200;
for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const sql = `INSERT INTO default.video_segments (video_id, title, url, start_seconds, text) VALUES ${batch.join(',')}`;
    await chQuery(sql);
    console.log(`  inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}

const countResult = await chQuery('SELECT count() FROM default.video_segments FORMAT TabSeparated');
console.log(`\nDone. Row count in ClickHouse: ${countResult.trim()}`);
