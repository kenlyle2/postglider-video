# DWP: YouTuber onboarding variant + background-plate extraction (Chris/therawadvantage)

Started 2026-08-24, while Ken was away and asked to advance this repo as far as responsibly
possible. **Nothing paid has been spent on this yet** — everything below is either a free/verified
feasibility test or a scoped proposal awaiting Ken's go-ahead, per the workspace's standing rule
that new spend/product decisions get proposed, not silently executed. This mirrors the pattern
Ken named explicitly: "a YouTuber variant of our onboarding process, like we added Partners for
Kelleen."

## The core idea

`postglider-auto`'s onboarding (`runOnboardingPipeline.ts`) already handles physical local
businesses (GMB enrichment, metro area, local competitor discovery) as the default assumption.
**YouTubers are virtual businesses** — Chris has a real website and ~700 videos but no GMB, no
physical storefront, no metro area in the sense the pipeline currently assumes. Per this session's
own earlier governance correction (Ken: "all the learning has to be in or called by that ONE
script for every onboarding... may have branches and conditionals, but all the learning has to be
in or called by that ONE script"), this should land as a **business-type branch inside the
existing canonical onboarding pipeline**, not a parallel one-off script — same pattern as the
Local Partners opt-in and Layer 3 signal seeding already added this session.

**Not yet scoped in detail — needs its own follow-on pass**, but the shape is:
- A `businessType: 'physical' | 'virtual-creator'` (or similar) flag on `PipelineInput`.
- When `'virtual-creator'`: skip GMB/local-competitor discovery entirely (nothing to find), accept
  a YouTube channel handle as a first-class input alongside the existing Instagram/Facebook
  handles, and extend `seedOwnEngagementSignal`/the cross-channel competitive-intel agent to pull
  YouTube data (transcript-based Layer 3 signal, not just engagement metrics — YouTube's transcript
  endpoints have no length cap, unlike IG/FB/Twitter, so this is a genuinely richer signal source
  for this business type, not a lesser one).
- This DWP does not build that flag/branch yet — it's flagged as the next real step once the
  concrete Chris-specific work below (which needs to exist first to know what the onboarding
  variant should actually collect/produce) has a working shape.

## Chris-specific ask: background-plate extraction from his real video library

Ken's exact ask: "import and clean up as many as 5 kitchen/workspace backgrounds, even if we have
to edit him out of individual video frames." Riffing on this (invited — "Likely you can riff on
this"): the real value isn't just clean background images for their own sake — it's the same
retrieval/compilation infrastructure this whole thread has been building, extended one layer
further: once his own physical spaces are captured as clean plates, new content (recipes,
generated video, a future client's own content) can be composited into a space that's genuinely
*his*, recognizable to his audience, without needing him on camera for every new piece.

### Free feasibility test — actually run, not just proposed

Downloaded two real videos and inspected real frames (no paid API used):

1. **Confirmed: fixed-camera setup, not handheld** — critical, since background extraction only
   works cleanly against a static camera. His wide kitchen-island shot doesn't move throughout.
2. **Confirmed: videos are internally multi-shot, not one continuous take** — the same video cuts
   from a wide kitchen shot to close-up overhead cutting-board shots. "5 backgrounds" likely means
   5 recurring physical *setups* (a specific room + camera position combination), not 5 rooms.
3. **Confirmed: the same physical kitchen recurs across different videos**, and even across
   *different camera angles within that one kitchen* — a wide-shot video (`ZVEIY3AZxsk`, sushi
   recipe) and a close-up talking-head video (`yNTkk6KPM4U`, curry recipe) show the same oak
   cabinetry, same window, same hanging fruit basket. This is real, direct evidence that
   cross-video clustering by background is viable at scale across his ~700-video catalog.
4. **Tested the free removal technique — temporal median stacking** (`numpy.median` across 90
   frames sampled 1fps from one video's wide-shot segment). Result: **partial success, not
   complete.** All static kitchen items (counter, cabinets, appliances) came out perfectly clean —
   confirms most of the frame *is* genuinely static background. But Chris himself, since he mostly
   stood in roughly the same spot presenting rather than moving around, only partially ghosted out
   rather than disappearing entirely. **Conclusion: single-video median stacking alone is
   insufficient; cross-video median stacking (pooling frames from many videos that share the same
   setup, where he's standing/moving in different positions each time) is the next thing to test,
   and is the technique this finding actually points toward** — not yet tried, needs a first
   clustering pass to identify which videos share a setup before it can be tested.

### Recommended pipeline shape (proposed, not built)

1. **Cluster videos by background setup** — needs a cheap visual-similarity pass across
   representative frames from many/most of his ~700 videos (a Gemini vision call per video,
   comparing against a small set of known-setup reference frames, or an embedding-based
   nearest-neighbor cluster). Real cost, not yet estimated with a real billed call — per this
   workspace's own rule, needs one real test before assuming a per-video cost figure.
2. **For each cluster (candidate: aim for ~5 largest), pull frames from many videos in that
   cluster and median-stack them.** Should perform much better than the single-video test above,
   since a real person's position varies far more across dozens of independent
   videos than within one 90-second segment of one video.
3. **Light inpainting cleanup pass on any residual ghosting** — likely still needed even after
   cross-video stacking, but should be a much smaller/cheaper touch-up than full-frame person
   removal. Real vendor options exist (Gemini image editing/Imagen, dedicated inpainting APIs) —
   not researched or chosen yet; that's a real product/cost decision for Ken, not made here.
4. **Output**: up to 5 clean background plates, stored (same S3 bucket already planned for the
   video-library work), tagged by setup/room in the same ClickHouse table pattern already proven
   working in this session's search demo.

### What this DWP does NOT do

- Does not call any paid image-editing/inpainting API — the median-stacking test above used only
  free/already-installed tools (`ffmpeg`, `numpy`, `yt-dlp`).
- Does not attempt the clustering pass across all 700 videos — that's a real, non-trivial cost
  (hundreds of Gemini vision calls) that needs Ken's go-ahead and a real cost test first.
- Does not build the `businessType`/onboarding-variant branch in `runOnboardingPipeline.ts` yet —
  correctly sequenced *after* this feasibility work, not before, since the onboarding variant
  should be scoped around what actually turns out to be collectible/producible for a YouTuber
  business, not designed speculatively first.
- Does not have Chris's explicit consent for large-scale frame/video pulling beyond the two test
  videos used here — same open item as Phase 1's video-library consent question in
  `agentic-cinema-hackathon.md`, applies here too.

## Tools installed this session, reusable going forward

- `ffmpeg` (via `brew install ffmpeg`, user-local, no sudo) — frame extraction, video processing.
- `numpy`/`PIL` (already present) — median stacking, image processing.
- `yt-dlp` (already installed earlier this session) — video download.

## Open decisions needing Ken's sign-off before building further

1. **Clustering-pass cost/go-ahead** — real Gemini vision-call spend across up to ~700 videos,
   needs a real billed-call cost estimate before committing to full-catalog scope; could start
   with a small sample (~20-30 videos) to validate the approach cheaply first.
2. **Inpainting vendor choice** — not researched yet; a real product decision once the clustering
   step shows how much residual cleanup is actually needed.
3. **Chris's consent for full-catalog video pulling** — same open item as the video-library Phase
   1 work; a direct conversation, not assumed from the teaser email already sent.
4. **`businessType` onboarding-variant design** — sequenced after this feasibility work, not
   started.

## Likely files (once building starts)

Not yet created. Candidates: `postglider-video/scripts/cluster-video-backgrounds.mjs`,
`postglider-video/scripts/median-stack-background.mjs` (generalize the ad hoc test above into a
reusable script), a new ClickHouse table for background-plate metadata, S3 keys under a
`backgrounds/` prefix.
