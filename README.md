# Archive Assistant — Agentic Cinema hackathon entry

**Turns a creator's unsearchable video back-catalog into something they can actually use again.**
Ask it a question and get a real, cited answer from the creator's own words. Ask it to compile a
themed video and it proposes a real narrative arc — not a topic dump — from real footage, which
you can then edit, reorder, or pull additional real material into before handing it off for
assembly.

**Live demo:** https://postglider-video-agent-731600875541.us-central1.run.app
**Submission:** [Agentic Cinema: The Blockbuster Hackathon](https://agentic-cinema.devpost.com/) — ClickHouse partner track
**Full positioning / judging-criteria writeup:** [`docs/AGENTIC-CINEMA-STRATEGY.md`](docs/AGENTIC-CINEMA-STRATEGY.md)

---

## What's actually in this repo

This repo grew out of an earlier, simpler prototype for the same idea; the folders below reflect
that history. **The hackathon submission is `agent/` — everything else is either a data source it
reads or an earlier exploration kept for context, not part of the judged entry.**

| Path | What it is | Part of the submission? |
|---|---|---|
| `agent/` | The real entry: the Gemini + ClickHouse MCP agent, its FastAPI server, and the editable-storyboard frontend | **Yes — this is it** |
| `demo-corpus/` | Real transcript segments (two creators' YouTube catalogs) loaded into ClickHouse — the data `agent/` queries at runtime | Yes, as the data source |
| `scripts/` | One-off loaders used to build `demo-corpus/`'s ClickHouse table | Supporting, not runtime |
| `server.mjs`, `pitch/` | An earlier, simpler keyword-search prototype and client-facing pitch pages, built before this hackathon existed | No — historical context only |
| `docs/`, `TASKS.md`, `CLAUDE.md` | Internal working notes, decisions, and findings from building this | Reference material, written for transparency about what was tried and why |

---

## How it satisfies the ClickHouse partner track

The rules require *"actively use ClickHouse at runtime via the official ClickHouse MCP server."*
`agent/clickhouse_mcp.py` runs the official [`mcp-clickhouse`](https://pypi.org/project/mcp-clickhouse/)
package as a self-hosted stdio subprocess, authenticated against a real ClickHouse Cloud service,
and every real-time lookup the agent makes goes through it — not a raw SQL driver. See
`docs/AGENTIC-CINEMA-STRATEGY.md` for why self-hosted was chosen over the OAuth-gated
`mcp.clickhouse.cloud` hosted endpoint (OAuth's interactive consent flow doesn't fit an unattended
backend agent cleanly).

## How it satisfies the orchestration requirement

The rules require Gemini + "Google Cloud Agent Builder," but explicitly also accept `google-adk`,
`google-genai`, `google-generativeai`, and `google-cloud-aiplatform` as qualifying packages
(confirmed against the live rules page before writing any code). `agent/app.py` is built on
`google-genai` with Gemini 3.8 Flash, using real multi-step function-calling — not a single-shot
prompt — across two distinct roles:

1. **Retrieval/curation** — a tool-calling loop that queries ClickHouse and, for a compilation
   request, calls a `present_arc` tool to return a structured, human-editable scene sequence
   (never prose).
2. **Refinement** — a separate, structured-output-only call (`/api/refine`) that re-checks arc
   coherence after a human has reordered or removed scenes.

## Running it locally

```bash
cd agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# .env.local (repo root) needs: GEMINI_API_KEY, CLICKHOUSE_HOST/PORT/USER/PASSWORD,
# GOOGLE_CLIENT_ID (for the download sign-in gate), ALLOWED_DOWNLOAD_EMAILS
python3 app.py   # serves on :8421
```

Deploying to Cloud Run: `agent/Dockerfile` builds a self-contained image (includes `ffmpeg` for
`yt-dlp`'s clip-cutting feature). See `docs/AGENTIC-CINEMA-STRATEGY.md` for the exact `gcloud run
deploy` invocation and env var gotchas (`--set-env-vars` replaces the whole set — use
`--update-env-vars` when adding to an already-deployed service).

## Features

- **Real, cited Q&A** over a creator's transcript archive — never invents a quote; says so
  honestly when nothing matches.
- **Editable video-compilation storyboard** — drag-to-reorder, per-scene include/exclude, editable
  transitions, an "optional inserts" tray of real segments the agent found but didn't use, and a
  full searchable pool of every real segment fetched that run (so a human's own hunch about what
  should be in there is directly testable, not gated behind what the agent chose to keep).
- **Real-time progress streaming** (Server-Sent Events) — the agent's actual tool calls stream to
  the UI as they happen, collapsing to a one-line summary once finished.
- **Script export** formatted for Pictory's manual "paste your script" flow (verified against real
  Pictory docs and a live test — the manual flow can't reference existing footage directly, so
  this hands off a script + separate source citations instead of overclaiming automation).
- **Real clip download**, gated behind a Google Sign-In identity check against an explicit
  download allowlist (an IP/rights guard — only the creator's own verified account can pull
  clips) plus a pasted-cookie flow to get past YouTube's bot-detection on Cloud Run's IP range.

## License

MIT — see [`LICENSE`](LICENSE).
