#!/usr/bin/env node
/**
 * Ugly-on-purpose one-page demo: search therawadvantage's transcript corpus (ClickHouse-backed)
 * with real AND / OR / "quoted phrase" support. Built to let Chris play with exactly the kind of
 * questions explored earlier (curry vs sushi, Thai vs Indian, red/yellow/green) and see honestly
 * which ones the data actually supports.
 *
 * Usage: node server.mjs [port]   (default 8420)
 */
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8420;

const env = {};
for (const line of readFileSync(join(__dirname, '.env.local'), 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
}
const CH_URL = `https://${env.CLICKHOUSE_HOST}:${env.CLICKHOUSE_PORT}/`;
const CH_AUTH = Buffer.from(`${env.CLICKHOUSE_USER}:${env.CLICKHOUSE_PASSWORD}`).toString('base64');

async function chQuery(sql) {
    const res = await fetch(CH_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${CH_AUTH}` },
        body: sql,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${text}`);
    return text;
}

function escapeSqlStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Parse a query like:  curry AND thai   |   sushi OR nori   |   "red curry"   |   curry AND "lime leaf"
 * Rules: "quoted phrase" = exact substring match. Bare words with no operator between them = AND.
 * AND/OR are left-to-right, no operator precedence or parentheses (deliberately simple).
 */
function parseQuery(q) {
    const tokenRe = /"([^"]+)"|(\S+)/g;
    const raw = [];
    let m;
    while ((m = tokenRe.exec(q)) !== null) {
        raw.push(m[1] !== undefined ? { type: 'phrase', value: m[1] } : { type: 'word', value: m[2] });
    }

    const terms = [];
    const ops = [];
    for (const tok of raw) {
        if (tok.type === 'word' && /^(and|or)$/i.test(tok.value)) {
            ops.push(tok.value.toUpperCase());
        } else {
            terms.push(tok.value);
        }
    }
    if (terms.length === 0) return null;

    // build SQL: term[0] OP term[1] OP term[2] ... left to right
    let sql = `text ILIKE '%${escapeSqlStr(terms[0])}%'`;
    for (let i = 1; i < terms.length; i++) {
        const op = ops[i - 1] || 'AND'; // default to AND if user just listed bare words
        sql = `(${sql}) ${op} text ILIKE '%${escapeSqlStr(terms[i])}%'`;
    }
    return { sql, terms, ops };
}

const PAGE = (results, q, error) => `<!doctype html>
<html><head><title>therawadvantage — video Q&A demo (rough)</title>
<style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#222}
h1{font-size:1.3rem}
input[type=text]{width:70%;padding:.5rem;font-size:1rem}
button{padding:.5rem 1rem;font-size:1rem}
.hit{border-bottom:1px solid #ddd;padding:.75rem 0}
.meta{color:#666;font-size:.85rem}
.snippet{margin:.25rem 0}
mark{background:#ffe08a}
.help{color:#666;font-size:.85rem;margin:.5rem 0 1.5rem}
.error{color:#b00;margin:1rem 0}
</style></head>
<body>
<h1>therawadvantage transcript search (prototype, ClickHouse-backed, 20 videos)</h1>
<form method="get" action="/">
  <input type="text" name="q" value="${q ? q.replace(/"/g, '&quot;') : ''}" placeholder='curry AND thai, or "red curry"' autofocus>
  <button type="submit">Search</button>
</form>
<div class="help">Supports <b>AND</b> / <b>OR</b> between bare words (default is AND if you leave it out), and <b>"exact phrases"</b> in quotes. Try: <code>curry</code>, <code>curry AND thai</code>, <code>sushi OR nori</code>, <code>"red curry"</code> (try it — it's genuinely empty), <code>"indian curry"</code>.</div>
${error ? `<div class="error">${error}</div>` : ''}
${results ? `<div>${results.length} matching segment(s)${q ? ` for <code>${q}</code>` : ''}</div>` : ''}
${(results || []).map(r => `
<div class="hit">
  <div><a href="${r.deepLink}" target="_blank">${r.title}</a></div>
  <div class="meta">[${r.timestamp}]</div>
  <div class="snippet">${r.snippet}</div>
</div>`).join('')}
</body></html>`;

function highlight(text, terms) {
    let out = text.length > 400 ? text.slice(0, 400) + '…' : text;
    for (const t of terms) {
        try {
            out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>');
        } catch { /* skip bad regex from weird input */ }
    }
    return out;
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/') {
        res.writeHead(404).end('not found');
        return;
    }
    const q = url.searchParams.get('q') || '';
    if (!q.trim()) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE(null, ''));
        return;
    }

    const parsed = parseQuery(q);
    if (!parsed) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE([], q));
        return;
    }

    try {
        const sql = `SELECT video_id, title, url, start_seconds, text FROM default.video_segments WHERE ${parsed.sql} ORDER BY video_id, start_seconds FORMAT JSONEachRow`;
        const raw = await chQuery(sql);
        const rows = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
        const results = rows.map(r => {
            const mm = Math.floor(r.start_seconds / 60);
            const ss = Math.round(r.start_seconds % 60);
            return {
                title: r.title,
                timestamp: `${mm}:${String(ss).padStart(2, '0')}`,
                deepLink: `${r.url}&t=${Math.floor(r.start_seconds)}s`,
                snippet: highlight(r.text, parsed.terms),
            };
        });
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE(results, q));
    } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE(null, q, String(err.message || err)));
    }
});

server.listen(PORT, () => {
    console.log(`Demo running at http://localhost:${PORT}`);
});
