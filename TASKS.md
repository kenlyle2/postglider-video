# PostGlider Video — Deferred Tasks / Findings

---

## Finding + fix 2026-09-09 — a synchronous Gemini call, unwrapped, froze the ENTIRE server on
## any slow response, not just the one request

Ken tested a live "knife techniques" compile while signed in with cookies set. The request went
completely silent for 4+ minutes -- not a slow response, total silence, zero log lines after the
5th ClickHouse query returned. First checked (and ruled out): a stale `KeyError: 'CLICKHOUSE_HOST'`
that showed up in a `severity>=WARNING` log query turned out to be from an OLD, already-fixed
revision (confirmed by filtering logs with an explicit `timestamp>=` bound around the actual
request window -- nothing there at all, not even the stale error).

**Real root cause**: `client.models.generate_content(...)` (google-genai) is a **synchronous**
call. It was being called directly inside `async def ask_agent_stream(...)` and
`async def refine_arc(...)`, never wrapped in `asyncio.to_thread` the way the ClickHouse MCP call
and the yt-dlp subprocess call already were. A synchronous call made directly inside an `async`
function blocks Python's single-threaded event loop for its ENTIRE duration -- not just that one
request, the whole server, every concurrent request, including the ability to emit further log
lines. This had been silently "working" because Gemini calls are usually fast (a few seconds), so
the blocking was never long enough to notice -- until one call was slow (network hiccup, an
internal SDK retry, real Google-side latency), at which point the entire app appeared to hang with
zero diagnostic output, which is exactly what made it look mysterious at first.

**Fix**: new `generate_with_timeout()` wraps every `generate_content` call in
`asyncio.to_thread(...)` (so it can't block the loop) plus `asyncio.wait_for(..., timeout=60)` (so
a genuinely hung call fails loudly with a clear message instead of hanging forever). **Verified
the actual mechanism, not just "it didn't crash this time"**: fired a slow compile request, then
a fast unrelated request while the slow one was still in flight -- before the fix this would have
queued behind the slow one; after the fix the fast request returned in 8ms while the slow one was
still running 40+ seconds later.

**Lesson for any future call added to this codebase**: every call to a synchronous SDK/library
inside an `async def` here must go through `asyncio.to_thread` (or be a genuinely async client).
This is the same category of bug this workspace's own `avoid_fake_sync_hacks`/async-discipline
conventions exist to prevent, just newly relevant because `agent/app.py` is a from-scratch Python
service, not an extension of the existing Node/TS codebase where this pattern is already enforced.

---

## Finding 2026-09-09 — `gcloud run deploy --set-env-vars` REPLACES the whole env var set, silently
## breaking a previously-working deploy

Deploying the OAuth/download gate, ran `gcloud run deploy ... --set-env-vars="^##^GOOGLE_CLIENT_ID=...##ALLOWED_DOWNLOAD_EMAILS=..."`
to add two new env vars. The deploy reported success ("serving 100 percent of traffic") and the
new vars were present -- but `CLICKHOUSE_HOST`/`CLICKHOUSE_PORT`/`CLICKHOUSE_USER`/
`CLICKHOUSE_SECURE` (set in an earlier, separate deploy) silently vanished, because
**`--set-env-vars` replaces the entire env var set, it does not merge with what's already
deployed** -- unlike `--set-secrets`, which is additive. Real user-facing failure: every
`/api/ask` request appeared to hang (a live Playwright browser test timed out waiting 100s for
the storyboard to render), and a direct `curl -N` on the streaming endpoint showed the connection
close after only 4.6s. Root cause found in Cloud Run logs, not guessed: `KeyError:
'CLICKHOUSE_HOST'` inside `clickhouse_mcp.py`, thrown mid-stream after the first status event had
already been sent (which is why it looked like a slow hang rather than an immediate error -- the
SSE response had already started, so FastAPI/Starlette couldn't send a clean error status, it just
killed the connection).

**Fix**: use `gcloud run services update --update-env-vars=...` (merges) instead of `gcloud run
deploy --set-env-vars=...` (replaces) whenever adding env vars to a service that already has
others configured from a prior deploy. If `--set-env-vars` must be used (e.g. as part of a full
`gcloud run deploy`), always pass the COMPLETE current set, not just the new additions.

**Verification habit that caught this**: a real headless-browser (Playwright) end-to-end check
against the live URL caught a failure mode a bare `curl` health-check on `/` would have missed
entirely (the index page and `/api/auth/config` both returned 200 fine -- only the actual
multi-step agent flow touched the broken env var). Worth keeping this kind of full-flow browser
check as the real pre-demo verification, not just a 200-status spot check.

---

## Decision 2026-09-09 — Skipped the ssyoutube.com-style downloader-mirror fallback for clip cutting

Ken suggested a third-party "youtube downloader" mirror site (e.g. ssyoutube.com) as a fallback if
yt-dlp's cookie-based download didn't work. Once the cookie-paste UI proved to be a real, working
fix (see the OAuth/cookie-gate commit), decided not to build the mirror-site fallback:

- These sites are built for human interactive use (ad clicks, CAPTCHA, changing DOM) not API
  integration -- scraping them is inherently fragile and could break without notice, unlike
  yt-dlp's maintained extractor.
- Many operate in a legal/ToS gray area themselves (re-serving YouTube content through their own
  ad-supported domain) -- associating a public hackathon submission's source code with scraping
  one is a real reputational risk for a judged entry, for no remaining functional benefit once
  cookies-based download works.
- Not needed: the cookie-paste path is the legitimate fix and is already live.

If cookies-based download turns out to be unreliable in practice (e.g. cookies expire faster than
expected), the right next step is investigating yt-dlp's own PO token / cookie-refresh options
first, not reaching for a scraped mirror site.

---

## Finding 2026-09-09 — Pictory has no fade-in/fade-out duration control, no inline script directives

While building the Agentic Cinema hackathon agent's "export as script" feature (paste the
agent-curated compilation into Pictory's manual "Idea to video" script box, no paid API needed),
considered adding a "fade duration" input box that would inject "[fade in Xs]"/"[fade out Xs]"
markers into the exported script text.

**Checked live against Pictory's own docs before building — verified this would not work, so it
was not built:**
- Pictory's storyboard API does have a real per-scene `sceneTransition` field ("fade",
  "wiperight", "smoothleft", "radial", "circlecrop", "hblur", "none") — but the docs explicitly
  state: *"Transition duration is automatically optimized by the API... you cannot manually
  control transition duration."* No duration override exists anywhere in the API.
- No inline script syntax/directives exist for the manual "paste your script" flow either —
  Pictory's script parser only understands two scene-splitting modes ("one scene per sentence" /
  "one scene per line break"), confirmed via a real screenshot of the Scene settings panel. Any
  bracketed text like `[fade in 2s]` typed into the script box would just be read aloud by
  Pictory's AI voiceover as narration, not interpreted as a control command — actively worse than
  not having the feature.

**What this means for future Pictory work:** if/when the paid storyboard API is wired in directly
(not the manual paste-script flow), `sceneTransition` per scene is real and worth using for the
already-built `transition_to_next` field (hard cut ≈ "none", cross-dissolve ≈ "fade", text card
has no direct equivalent — would need a real overlay scene). Fade *duration* specifically is
never controllable, so don't design any feature around it.

**Confirmed correct instead**: the export script's one-quote-per-blank-line format matches
Pictory's "One scene per line break" setting exactly — the UI now tells the user to pick that
setting explicitly (not "per sentence," since several curated quotes are multi-sentence and
should stay as one scene each).

---

## Finding 2026-09-09 — Pictory's "Idea to Video" chatbot cannot reference our existing source
## clips at all; final assembly has to be done manually

Live-tested (Ken, in the real Pictory UI) pasting the agent's exported script into "Idea to
Video." The chatbot has no way to point a scene at one of our actual source clips (the real
YouTube video + timestamp the agent picked) — it only generates/searches its own stock footage or
AI visuals for whatever narration text you give it. This matches what the docs review already
found (`visualUrl` — the field that *would* let a scene use our own hosted clip — only exists in
the paid storyboard API's JSON body, not in the "Idea to Video" script-paste UI at all), just
confirmed live end-to-end instead of by reading docs alone.

**Net effect, and why this is fine, not a setback:** final video assembly (pulling each real
clip, trimming to the agent's suggested window, ordering, applying the suggested transition) has
to be done by a human in Pictory's manual editor (or any editor) — there is no path, free or paid
without the storyboard API, to hand Pictory a list of "use THIS clip at THIS timestamp" instructions
directly. This was already the plan (see the earlier finding above and `research/decisions.md` —
Pictory's API was deliberately not purchased for this hackathon). It also reinforces the honest
framing for the submission: **the agent does the hard, real part** — real-time ClickHouse
retrieval via the official MCP server, narrative-arc sequencing, human-editable storyboard, and a
correctly-formatted script/citation handoff — and a human does final creative assembly. That's a
credible, coherent product story (a real editor's actual workflow: AI does research/pre-editing,
human finishes), not a claim that the whole pipeline is automated end-to-end. Ken's own framing:
"the app is still doing 90% of the work."
