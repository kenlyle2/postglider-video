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
