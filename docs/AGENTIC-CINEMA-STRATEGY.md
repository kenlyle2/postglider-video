# Agentic Cinema Strategy — the "Archive Assistant" entry

**Competition:** Agentic Cinema: The Blockbuster Hackathon (Google Cloud + partners, Devpost)
**Deadline:** 2026-09-09, 2:00 PM PDT
**URL:** https://agentic-cinema.devpost.com/
**Partner track:** ClickHouse (official `mcp-clickhouse` MCP server, at runtime)
**Sibling doc:** `postglider-auto/docs/XPRIZE-STRATEGY.md` — this is the equivalent doc for this
entry, scoped to a hackathon (not a 90-day revenue competition), so it's shorter and more
tactical. Don't conflate the two: XPRIZE judges `postglider-auto` on live revenue and production
maturity; this hackathon judges a much younger build on Technological Implementation, Design,
Potential Impact, and Quality of the Idea (Devpost's own four, equally weighted).

---

## Rules that matter

| Rule | What it means for us |
|---|---|
| Orchestration: "Gemini and Google Cloud Agent Builder" — but rules also explicitly accept `google-adk`, `google-genai`, `google-generativeai`, `google-cloud-aiplatform` | We built code-first on `google-genai` + Gemini 3.8 Flash, not the no-code Agent Builder UI. Confirmed live against the real rules page before writing a line of code — avoided fighting an unfamiliar UI under deadline pressure for no requirement benefit. (Not yet logged as its own `decisions.md` entry — do that alongside the final submission writeup.) |
| ClickHouse: "must actively use ClickHouse **at runtime** via the **official ClickHouse MCP server**" | Self-hosted `mcp-clickhouse` (official PyPI package) as a stdio subprocess, authenticated with our own ClickHouse Cloud data-plane credentials — not a raw SQL driver, not the hosted `mcp.clickhouse.cloud` OAuth endpoint (deliberately avoided — OAuth doesn't fit an unattended backend agent cleanly under time pressure). Verified live, repeatedly, in production logs. |
| Public repo, OSS license visible at top, all source + instructions to run | `github.com/kenlyle2/postglider-video`, MIT license, `agent/` is the whole submission surface (Dockerfile included — anyone can build and run it). |
| Demo video: "functioning as built," ≤3 min, public YouTube/Vimeo | Script this around what's actually live — the search, the honest-refusal case, the editable storyboard, the real clip download. Don't show anything that isn't actually working end to end. |
| Judged equally on 4 axes (see below) | Weight the pitch/description across all four, not just "look, it works." |

---

## Unfair advantage / positioning

Most hackathon entries in this track are a single demo call showing "AI made a video." Ours is
built on top of a real, already-operating product (PostGlider) with an existing philosophy this
entry is a direct extension of: **don't manufacture new content when a business already has real,
valuable, unindexed assets — mine what exists first.** That's not a hackathon slogan invented for
judges; it's the same principle already shipping in `postglider-auto` (vault/backlog photo reuse
in pack assembly — see that repo's own `CLAUDE.md`). A judge who wants evidence this isn't a
one-off toy idea has a real, running sibling product to point to.

**The concrete artifact, stated as one sentence** (the "Ultimate Batch" of this entry): *A creator
with hundreds of unsearchable YouTube videos gets, in one query, a fully-cited answer sourced from
their own words — or a human-editable, narrative-arc video compilation plan, built from real
segments an official ClickHouse MCP connection retrieved at runtime, with every quote traceable
back to an exact timestamp.*

---

## Judging-criteria mapping (use this to shape the description + demo narration)

1. **Technological Implementation** ("how well built, how effectively uses Google Cloud + partner
   services") —
   - Real multi-step Gemini 3.8 Flash tool-calling loop (not a single-shot prompt), calling the
     official self-hosted `mcp-clickhouse` server over stdio.
   - A second, distinct model role: `/api/refine` is a structured-output-only call (JSON schema,
     no tools) that does a coherence pass over a *human-edited* scene list — this is a genuine
     two-role agent system (retrieval/curation vs. refinement), not one call reused.
   - Real engineering iteration, not first-try perfection: found and fixed a redundant-query bug
     where the agent burned its entire tool-call budget re-verifying counts it already had,
     causing real production failures ("avocados" query) — root-caused via production logs, fixed
     with an efficiency instruction, verified fixed live. Worth a line in the writeup; judges who
     build things themselves recognize the difference between "worked once" and "diagnosed a real
     failure mode and closed it."
2. **Design** ("complete, coherent product experience, not just a technical proof of concept") —
   - The compilation output is not a text blob — it's an editable, drag-to-reorder storyboard with
     per-scene include/exclude, editable transitions, an "optional inserts" tray (real segments
     the agent found but didn't use), and a full searchable "everything else it looked at" pool so
     a human's own hunch (e.g. "there must be a guacamole mention somewhere") is directly testable,
     not gated behind what the agent chose to keep.
   - Real-time progress streaming (SSE) shows the actual tool calls as they happen, not a static
     spinner — the agent's reasoning process is part of the product experience, not hidden.
   - The "Export as script" feature is shaped by real vendor research, not assumption: verified
     Pictory's manual paste-script flow can't reference existing footage (checked docs, then
     confirmed live), so the export is honestly scoped as a script + citation handoff for manual
     assembly, with the correct Pictory scene-splitting setting called out explicitly.
3. **Potential Impact** ("credible, specific case for solving a real problem for a real
   audience") —
   - Two real, differently-shaped datasets prove this isn't one fixed pipeline: therawadvantage
     (recipe/technique content) and Johanna's Raw Foods (health-coach testimonials/webinars) —
     same agent, same schema, genuinely different content shape.
   - Named, real prospective customers (not synthetic personas) with real Devpost-independent
     business context already on file (`research/decisions.md` D-2026-08-23i, D-2026-08-24c).
   - Direct product-line continuation: this is explicitly scoped in `postglider-video/CLAUDE.md`
     as a planned monthly subscription add-on to PostGlider's core product, not a one-off idea
     that dies after judging.
4. **Quality of the Idea** ("creative, non-obvious use of Google Cloud + partner services") —
   - Using ClickHouse as a fast, queryable index over unstructured creator speech (not the
     "dashboard over structured business metrics" use case most entries will reach for) is a real,
     slightly unusual fit worth stating explicitly, not left implicit.
   - The optional-inserts + full-pool-search pattern is a genuine answer to a real failure mode of
     naive RAG/agent demos: "the agent didn't pick the thing I know is in there somewhere" — most
     entries hide the agent's discards; this one exposes and makes them actionable.

---

## Demo video shot list (≤3 min, timed to leave a real buffer)

Record in this order against the LIVE URL. Before recording, re-verify each beat still works --
don't trust that a fix from earlier in the day still holds (see "verify live immediately before
recording," below).

| Time | Beat | What to say / show |
|---|---|---|
| 0:00-0:08 | Problem | "Chris has ~700 real videos on YouTube. Almost none of it is findable -- not by him, not by his audience." |
| 0:08-0:33 | Real search | Type a real question ("what has Chris said about curry?"). Let the step log run visibly, then show the cited, timestamped answer. Say: "Every quote is real, pulled live via the official ClickHouse MCP server -- not generated." |
| 0:33-0:45 | Honest refusal | Ask something you know isn't in the corpus ("red curry"). Point out the 0-result, non-hallucinated answer. "It never makes something up just to have an answer." |
| 0:45-1:40 | Compile + edit | "Compile a video about knife techniques." Let the log collapse to the accordion, then show the storyboard: drag a scene to reorder, uncheck one to exclude, open Optional Inserts and add one, search the full result pool for something specific and drag it into the arc. "This isn't one fixed answer -- it's a real editable draft." |
| 1:40-2:10 | Ownership gate + real download | Show the sign-in-restricted download button, sign in with Google, click "Cut & download" on a scene, show the real mp4 land. "Only the creator's own verified account can pull clips -- this is a rights guard, not an open scraper." |
| 2:10-2:35 | Script export | Click Export as Script, show the Pictory-ready text + the scene-setting callout. "For full video assembly, hand this straight to Pictory -- or any editor." |
| 2:35-2:50 | Close | "Real ClickHouse Cloud, real Gemini 3.8 Flash, real repo, real prospects already lined up -- and this is the same 'use what you already have' principle already shipping in PostGlider's core product today." |

**Total: ~2:50**, leaving a ~10s buffer for pacing. If something runs long, cut from the compile/edit
beat (1:40 is the most compressible) before cutting the honest-refusal or ownership-gate beats --
those two carry the most judging-criteria weight per scene-second (trust + rights-safety).

**Before recording, verify live (don't assume yesterday's/this-morning's fix still holds):**
- [ ] Plain question returns a real cited answer
- [ ] The refusal-case question actually returns 0 rows (recheck the exact phrase -- corpus can
      shift if re-indexed)
- [ ] Compile produces scenes + optional_inserts + a non-empty pool
- [ ] Google Sign-In button renders and completes (needs the Cloud Run origin authorized on the
      OAuth Client ID -- one-time Console step, confirm it's still there)
- [ ] `/api/cut` actually returns a playable mp4 with cookies pasted in (YouTube's bot-check on
      Cloud Run's IP range is the known failure point -- see TASKS.md)

---

## Draft project description (paste-ready, tune before submitting)

> **Archive Assistant** turns a creator's entire, unsearchable video back-catalog into something
> they can actually use again. Ask it anything — "what has Chris said about curry?" — and it
> answers from real transcripts with an exact, clickable timestamp, never a guess. Ask it to
> compile a themed video and it doesn't just search: a Gemini 3.8 Flash agent proposes a real
> narrative arc (context → technique → payoff → bonus), which you can then drag-reorder, exclude
> scenes from, pull in an "optional insert" the agent almost used, or search the *entire* pool of
> everything it looked at — because sometimes you know there's a guacamole mention in there
> somewhere, even if the agent didn't surface it. Every real segment is retrieved at runtime
> through the official ClickHouse MCP server against a ClickHouse Cloud service indexing two real
> creators' catalogs. This isn't a hackathon-only idea — it's the seed of a planned PostGlider
> product add-on, built on the same "mine what a business already has" principle already shipping
> in PostGlider's core product today.

---

## What NOT to claim (keep the submission honest)

- Do not claim full automated video rendering — Pictory's paid storyboard API was deliberately
  not purchased; the manual "Idea to Video" script-paste flow cannot reference existing footage
  (verified live, see `TASKS.md`). The product's honest claim is: real retrieval + real curation +
  a correctly-formatted handoff for manual assembly, or a directly downloadable real clip.
- Do not claim the clip-download feature works in all cases if the YouTube bot-detection /
  cookies issue (see `TASKS.md`) isn't resolved before recording — verify live immediately before
  it appears in the demo video, don't assume yesterday's fix holds.
- Do not claim CI integration, a production/live-app scan, or any Strix-adjacent security testing
  for this entry — unrelated, not built, not needed for this track.
