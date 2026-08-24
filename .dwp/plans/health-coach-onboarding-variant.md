# DWP: Health-coach onboarding variant (Johanna's Raw Foods) + Features table

Started 2026-08-24. Companion to `youtuber-onboarding-variant.md` — both are business-type
branches of the same eventual `businessType` flag on `runOnboardingPipeline.ts`'s `PipelineInput`,
kept as separate DWPs because the two prospects (Chris, Johanna) surfaced genuinely different
needs, not because they're unrelated. A health coach with a YouTube channel (Johanna has one) is
not automatically "the YouTuber variant" — the core differentiator here is testimonials +
structured program/recipe content, not video-back-catalog retrieval, which is why this gets its
own DWP rather than folding into the other one.

## Real research done before proposing anything

Checked `johannasrawfoods.com` (homepage + `/coaching-.html`) and her YouTube channel
(`@johannasrawfoods8929`) live before writing this — nothing below is guessed.

- **Real testimonials confirmed on the homepage**, with specific health outcomes named: a
  blood-pressure drop from 180 to 130, Type 2 diabetes management, improved mobility with an HIV
  diagnosis, plus direct quotes ("It's astonishing to me!... From the first meal in Johanna's
  program, I was SATISFIED," "I want to eat your food every day, Johanna!"). This is real,
  usable social-proof content, not aspirational.
- **Real coaching program structure and pricing** on the coaching page: five distinct offers from
  a $147 single session up to a $3,500 "3-Month Super Happy Body Intensive" and a $6,000+ (at
  original price) 12-month coaching certification. A health coach's site is fundamentally a
  program-sales page, not a recipe blog — shapes what's worth extracting.
- **Photos exist on the site** but the page-fetch tool used for research strips images, so
  headshot/bodyshot presence is confirmed structurally (images are there) but not yet visually
  verified — flagged as a real gap, not assumed solved.
- **YouTube channel is coaching/testimonial-heavy, not recipe-heavy** — confirmed by pulling the
  real title list (`yt-dlp`, free): a long-running numbered "Mastermind" series (at least 9
  episodes), a "Fitness Over Fifty" series, chronic-disease webinars, and — directly relevant to
  Ken's testimonial interest — a real client testimonial video ("JS CBM a'Ali de Sousa
  testimonial ad1," appearing twice under different titles/IDs). Only two food-recipe-shaped
  titles were visible ("Bikini banana ice cream," "Smoothie Feast explanation") out of dozens
  checked — this is a coach's channel, not a cooking channel, and the 20-video sample built below
  reflects that (Mastermind + Fitness Over Fifty + the real testimonial video), not a forced
  recipe theme.

## Built and verified live: 20-video sample + ClickHouse + multi-channel search

Reused the exact `postglider-video` pipeline built for Chris, generalized (not duplicated) to
handle a second channel:
- `scripts/parse-captions.mjs` and `scripts/load-segments-to-clickhouse.mjs` were hardcoded to one
  corpus; generalized to take a corpus directory and channel name as arguments now that there are
  two real corpora to support, rather than copy-pasting a second set of scripts.
- `default.video_segments` now holds both channels (844 rows for `therawadvantage`, 2,228 for
  `johannasrawfoods`), isolated by a `channel` column, verified live with zero cross-contamination.
- `server.mjs` extended with a channel switcher. Verified live: `"chronic disease"` → 26 real,
  timestamped, deep-linked matches into her actual Mastermind/webinar videos — the same "ask a
  real question, get a real answer from her own words" mechanic proven for Chris, now proven for
  a genuinely different content shape (long-form coaching talk vs. short recipe demos).

## Proposed, NOT built: testimonial-focused website extraction

**The real gap**: `postglider-auto`'s existing website scraper (`websiteIntelligence.ts`'s
`mineWebsite()`) already crawls a site for team/staff pages and does Gemini-based page
classification (confirmed via the codebase graph during earlier onboarding work — see
`postglider-gtm/.dwp/plans/00-ultimate-marketing-system.md`'s reference to it). It does not
currently have a testimonial-extraction pass. For a health coach, testimonials are arguably the
single highest-value piece of content on the whole site — social proof is the actual sales
mechanism for a $3,500 program — and they're currently invisible to onboarding.

**Proposed addition** (not built — real change to a shared, production onboarding path, needs
Ken's go-ahead per the standing rule that onboarding logic lives in/is called by the one canonical
pipeline, not a side script):
1. New pass in `mineWebsite()` (or a sibling function it calls): crawl the homepage plus any
   dedicated testimonials/reviews/about page, and use Gemini to identify and structure testimonial
   blocks — quote text, author name/detail if given, and any named outcome (matches the real shape
   found on Johanna's site: a name-optional quote plus a specific health result).
2. Write structured results into the new `features` table (below), `category = 'testimonial'`.
3. **Gated by the same `businessType` concept** as the YouTuber variant — this isn't necessarily
   only for health coaches; any service business with real testimonials benefits, but it's being
   scoped here because Johanna's case made the gap concrete. Whether it becomes a universal pass or
   a business-type-gated one is a real product call, not decided here.

## Proposed, NOT built: headshot/bodyshot capture from the website

Same category of proposal — real gap, not yet built. Physical businesses already get owner/staff
photos via GMB photo enrichment; a virtual/coach business has no GMB, so this path is currently
empty for someone like Johanna. Proposed: extend the website-crawl pass to identify and pull real
photos of the site owner (About/Coaching pages are the likely source, per the confirmed-real image
presence on her coaching page) — likely needs a Gemini vision classification step to distinguish
"a photo of the coach" from stock/decorative imagery, mirroring the same kind of judgment call
`websiteIntelligence.ts` already makes for team-page detection. Not scoped in more technical depth
than this — a real vision-classification design pass is its own follow-on once Ken confirms this
is worth building.

## Proposed, NOT built: a `features` table (Testimonials + Recipes, JSON blob + unfurl function)

Ken's own proposal, verbatim: "a new table called Features, with at least two categories, starting
with Testimonials and Recipes, with their data as a single JSON field and a function that knows
how to unfurl the metadata." Concrete design, not yet migrated:

**Where it lives — recommend Supabase/Postgres, not ClickHouse, and this is worth being explicit
about rather than defaulting silently.** ClickHouse (already live for the video-segment corpus) is
an append-optimized analytical store — cheap fast reads over large immutable row sets, but `UPDATE`
and `DELETE` are lightweight-but-async bolt-ons, not its native model. Testimonials and recipes are
low-cardinality, per-tenant content a business owner will want to edit or remove — that's squarely
Postgres/Supabase's actual strength, and it's already where `business_profiles` and every other
per-tenant table lives. Putting `features` in ClickHouse would be optimizing for a workload
(analytical scale-out) this table will never actually have, at the cost of losing cheap, native
updates it will need constantly.

**Proposed schema:**
```sql
create table public.features (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references business_profiles(id),
  category text not null,              -- 'testimonial' | 'recipe' | future categories
  data jsonb not null,                 -- category-specific shape, validated before write
  source_url text,                     -- where it was extracted from
  source_type text,                    -- 'website' | 'youtube' | manual entry
  extracted_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index features_business_category_idx on public.features (business_profile_id, category);
```

**The "unfurl" function** — a typed, per-category interpreter, matching the Zod-validation pattern
`lib/autonomous/schemas.ts` already uses for agent output (per `postglider-auto/CLAUDE.md`'s own
"All agent outputs are validated against a Zod schema" rule — this should follow the same
convention, not invent a new one):
```ts
const TestimonialDataSchema = z.object({
  quote: z.string(),
  authorName: z.string().nullable(),
  authorDetail: z.string().nullable(),   // e.g. "Type 2 diabetic, 3 months in"
  outcome: z.string().nullable(),        // e.g. "blood pressure 180 -> 130"
});

const RecipeDataSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
  prepTime: z.string().nullable(),
});

const FEATURE_SCHEMAS = {
  testimonial: TestimonialDataSchema,
  recipe: RecipeDataSchema,
} as const;

function unfurlFeature<C extends keyof typeof FEATURE_SCHEMAS>(category: C, data: unknown) {
  return FEATURE_SCHEMAS[category].parse(data);
}
```
Adding a third category later is one schema entry, not a migration — validates Ken's "at least two
categories" framing as a real extensible design, not a hardcoded two-category table.

**Recipes specifically — Ken's own stated preference, recorded so it isn't lost**: "I would suggest
moving them to WP Recipe Maker as structured data" as the real destination once extraction proves
out — `features.category = 'recipe'` is explicitly an interim/staging capture, not meant to be the
permanent home for recipe content. WP Recipe Maker is already a known, real tool in this business's
stack (see the Chris/therawadvantage WP Recipe Maker recipe-access blocker discussed the same
session this DWP was written) — worth checking whether a WP Recipe Maker import path exists before
building a from-scratch recipe renderer against the `features` table long-term.

## Open decisions needing Ken's sign-off before building further

1. **`features` table migration** — real production schema change, not executed here.
2. **Testimonial-extraction pass in `mineWebsite()`** — real change to the shared onboarding
   pipeline every business runs through.
3. **Headshot/bodyshot capture design** — needs its own vision-classification scoping pass once
   confirmed worth building.
4. **`businessType` flag itself** — still not built (same open item as the YouTuber DWP); both
   this and that DWP are now real candidates gating on it, which strengthens the case for actually
   building the flag next, rather than a reason to build it here unprompted.
5. **Whether testimonial extraction is health-coach-specific or universal** — a real product-scope
   question, not decided here.

## Files

Built: `postglider-video/demo-corpus/mastermind-coaching/` (20-video corpus + manifest),
`postglider-video/scripts/parse-captions.mjs` + `load-segments-to-clickhouse.mjs` (generalized),
`postglider-video/server.mjs` (channel switcher). Not built: `features` table, testimonial
extraction, headshot capture, `businessType` flag.
