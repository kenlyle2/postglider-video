# PostGlider Video — Deferred Tasks / Findings

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
