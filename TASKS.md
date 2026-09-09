# PostGlider Video — Deferred Tasks / Findings

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
