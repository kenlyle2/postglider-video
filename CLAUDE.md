@../CLAUDE.md

# postglider-video — Claude Working Instructions

This repo inherits all PostGlider workspace instructions from the upstream `../CLAUDE.md`. The
rules below are additions specific to `postglider-video`.

---

## This repo's purpose

Started 2026-08-23, spun out of `postglider-auto`'s Agentic Cinema hackathon DWP
(`postglider-auto/.dwp/plans/agentic-cinema-hackathon.md`) once the work outgrew "one hackathon
entry" into a real potential product line: **video storage, autotagging, and AI-assisted
compilation for PostGlider customers with an existing video back-catalog** (the original concrete
case: Lenny Calisthenics — pull his public Instagram/Facebook videos, tag them by movement/body
part/difficulty, index for fast retrieval, and compile new themed videos from tagged clips via the
Pictory API). Ken's framing: this is likely an **optional monthly subscription add-on** on top of
the core PostGlider product, not a feature bundled into `postglider-auto` itself.

**Why a separate repo, not folded into `postglider-auto` or `postglider-gtm`:** same reasoning
`postglider-gtm`'s own `CLAUDE.md` already documents for itself — a distinct, growing capability
with its own schema/infra (AWS S3, ClickHouse, video processing) deserves its own boundary rather
than blurring `postglider-auto`'s XPRIZE-judged product scope or `postglider-gtm`'s GTM/CRM scope.
`postglider-video` is neither outbound sales tooling nor the core social-posting product — it's a
new, potentially separately-priced capability that both call into.

**Cross-repo call contract:** reaches into `postglider-auto` for business/profile context (the
same `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` direct-DB-access pattern `postglider-gtm` and
`pg-admin` already use — see `postglider-gtm/CLAUDE.md`'s own contract note) and will eventually
be called *from* `postglider-auto` once a "generate a video" feature exists in the product UI.
Do not duplicate `runOnboardingPipeline.ts`, agent logic, or ScrapeCreators client code here —
reuse `postglider-auto`'s real implementations directly, same rule every sibling repo follows.

## Relationship to the Agentic Cinema hackathon DWP

The hackathon entry (`postglider-auto/.dwp/plans/agentic-cinema-hackathon.md`, deadline
2026-09-09) is this repo's first real build — Phase 1 (video capture/storage/tagging) and Phase 2
(ClickHouse retrieval + Pictory compilation) land here, not in `postglider-auto`. See that DWP for
the full plan, open decisions, and non-goals.

**Demo client pivoted from Lenny Calisthenics to therawadvantage (Chris Kennel), 2026-08-23.**
Lenny is out for this round (a separate, longstanding WP Recipe Maker recipe-access/subscription
project for Chris is the actual blocker on introducing this to him — scheduled separately, not
this repo's concern). therawadvantage is a better technical fit anyway: YouTube long-form content
has no transcript length cap (unlike ScrapeCreators' <2min cap on IG/FB/Twitter), so the
"knowledge-base/Q&A over a creator's body of work" use case (`what has X said about Y`, `every
clip of X doing Y`) is much stronger here than it would have been for Lenny's Reels-heavy catalog.
See `research/decisions.md` D-2026-08-23i.

## Tenants

- **`demo-corpus/ethnic-foods/`** 🟢 built and verified live, 2026-08-23. A 20-video sample from
  `@therawadvantage` (curry/sushi/pad thai/falafel/Korean BBQ/Ethiopian — Ken's steer, "ethnic
  foods themed"), captions pulled via `yt-dlp --write-auto-sub` (**free, no ScrapeCreators, no
  AWS** — proves the concept before spending on either). Real parsing gotcha, now fixed: YouTube's
  auto-caption VTT uses a rolling 2-line karaoke display, not one-line-per-cue; naive parsing
  either 3x-duplicated the transcript or dropped ~95% of it depending on which caption format a
  given video used. Fixed by taking each cue's last line and deduping consecutive identical
  values — verified against known word counts across all 20 videos. Transcripts chunked into 30s
  timestamped segments (`captions/*.json`, `segments: [{start, text}]`).
- **`demo-corpus/search-demo.mjs`** 🟢 verified live. Minimal keyword-scored retrieval over the
  20-video corpus's segments — proves "what has Chris said about curry/sushi" returns real,
  timestamped, deep-linked quotes (`&t=<seconds>s`), zero infra cost. Not the production approach
  (plain keyword match, no embeddings/semantic search) — proves the *shape* of the answer, not the
  final retrieval quality. `node demo-corpus/search-demo.mjs "<query>"`.
- **AWS access (see "AWS access" section above)** 🟢 provisioned, not yet used for anything beyond
  the toolkit verification call — Phase 1's real S3/ClickHouse build is still ahead.
- **ClickHouse Cloud** 🟡 org + service provisioned 2026-08-24, MCP not yet enabled. Org
  "PostGlider" (`770a28dc-e6d7-4510-a34a-47114a791f38`), service `postglider-video`
  (`003ef1f0-4700-460f-8369-461a37fd3103`), GCP `us-central1` (Iowa — colocated with
  `postglider-autonomous`'s own Cloud Run region, Ken's deliberate call, better than what was
  first suggested). Scaling: 8↔32 GiB/replica, 2 replicas, idle auto-suspend on (15min timeout) —
  matches what was recommended to protect the $400 hackathon signup credit. Host
  `wr59ykdj7l.us-central1.gcp.clickhouse.cloud` (HTTPS :8443, native-secure :9440), IP access
  currently open (`0.0.0.0/0` — fine for a demo, tighten later, not urgent).
  **`mcpEnabled: true`** (flipped on by Ken 2026-08-24 via Connect → MCP on the service — not
  discoverable from the Data Sources screen or the `mcp-sessions` console page, which only lists
  already-approved connections; the actual toggle lives on the service's own Connect menu).
  Confirmed live via the Management API. This is ClickHouse's own hosted Remote MCP endpoint
  (`mcp.clickhouse.cloud`, OAuth 2.0) — satisfies the hackathon's "official ClickHouse MCP server"
  requirement without self-hosting `mcp-clickhouse`. Not yet connected to any client (Claude Code,
  Agent Builder) — that's the next step. `.env.local` holds
  `CLICKHOUSE_ADMIN_KEY_ID`/`CLICKHOUSE_ADMIN_KEY_SECRET` — **Management API only, explicitly
  no data access** (Ken's own key naming/scoping choice, "Claude Infra 1") — a separate
  data-plane credential is needed before this app can read/write rows via SQL or MCP.

## Conventions

Same as `postglider-gtm` and `postglider-auto`: Node.js/`.cjs`/`.ts`, secrets in `.env.local`
(gitignored, never committed), never log tokens/credentials/callback URLs. Every significant build
gets a dated entry in this file's Tenants section (once one exists) and, where the decision has
real tradeoffs, a `research/decisions.md` entry.

## AWS access

Set up 2026-08-23 via the AWS Agent Toolkit (`aws configure agent-toolkit`), profile `postglider`,
authenticated via `aws login` browser flow (root account `817345470415` — not an IAM user; create
a scoped IAM identity before any real production credential use, root was only what the browser
flow returned). Region `us-east-1` (also the toolkit service's own required region, per AWS —
independent of which region actual resources like S3/ClickHouse end up in). `~/.claude.json`'s
`aws-mcp` entry configured to proxy through this profile.

**Unconfirmed: whether this account uses AWS's newer "AWS experience" signup model**
(`settings.aws.com`, "project" not "account" terminology, single-Region-per-project lock, spend
limits) — the rules below assume that model since that's what the AWS Agent Toolkit setup
installs by default for a "new account" answer, but a root-ARN browser login doesn't by itself
confirm which signup path was used. Treat the single-Region/spend-limit-specific constraints below
as unconfirmed until checked directly (`AWS Settings > View all projects > Overview` per the rules
themselves) rather than assumed to apply.

<!-- BEGIN AWS AGENT TOOLKIT STARTER RULES (installed 2026-08-23, from
     https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/rules/aws-starter-rules.md ) -->

# AWS Guidance for the new AWS experience

This user has signed up for the new AWS experience. This experience lets you sign into AWS using a social provider and requires the following additional context.

## Context

### Terminology:

- Say "project" instead of "account" — a project contains an AWS account and settings for sharing with other collaborators
- Say "team member" instead of "IAM user" — users are invited by email, not created or federated in IAM
- Say "AWS Settings" when referring to management tasks at [settings.aws.com](https://settings.aws.com/) (project management, billing, team members, spend limits). Users view their actual AWS resources in the AWS Management Console.
- Say "selected Region" when referring to the user's Region — not "home Region"
- The user has a managed IAM experience. This includes a managed service control policies (SCP) and resource control policies (RCP) that govern the use of AWS. They will still need to use IAM to create policies to let services work with each other. If there are questions about the SCPs or RCPs, go to the documentation at https://docs.aws.amazon.com/accounts/latest/reference/scps-and-rcps-for-projects.html

### Constraints:

- All projects share a single AWS Region determined by the user's contact address. Resources cannot be created in other Regions
- When developing:
  - MUST create all Regional resources in the project's assigned Region
  - MUST NOT attempt to create Lambda, API Gateway, or other Regional resources in any other Region
  - MUST direct users to confirm their Region in AWS Settings > View all projects > Overview > Additional Info > Region. If the user cannot confirm their Region, check in ~/.aws/config
  - MUST NOT use Lambda@Edge — excluded from both Lambda and CloudFront
  - MUST NOT use CloudFormation StackSets — no multi-account or multi-Region deployments
  - MUST NOT attempt cross-Region actions — no cross-Region replication for DynamoDB/S3/RDS, no multi-Region KMS keys
  - MUST NOT use Route 53 cross-Region routing — geolocation, latency-based, and failover routing policies are not available
  - CloudFront is a global service and its actions ARE allowed in `us-east-1`. A user can create a CloudFront distribution pointing to their project-region Lambda function URL or API Gateway. However, Lambda and API Gateway themselves MUST NOT be created in `us-east-1` — they must be in the project Region.
  - Reduced availability in `eu-north-1` specifically: Amazon Rekognition, Amazon Textract, Amazon Personalize, AWS App Runner are not available in that Region.
- IAM permissions for human access are managed by AWS. Don't assign roles to team members unless absolutely necessary
- The user may have a spend limit if they are on the paid plan. The limit that pauses their project if it's exceeded. If resources suddenly become inaccessible, ask if they have a spend limit configured. Only project owners can modify a spend limit.
- When developing:
  - MUST ask about spend limit status if the user reports sudden "Access Denied" errors on operations that previously worked
  - MUST direct users to check spend status in AWS Settings > Billing
  - MUST check if a user has upgraded their account to the paid plan
  - MUST ask the user if they want to clean up the successfully created resources or keep them to reduce cost
- The user sets up billing, creates spend limits, and retrieves and pays invoices in AWS Settings. The user creates budgets and optimizes their costs in the AWS Billing and Cost Management console
- Not all AWS services are available. If a service isn't working, do the following:
  1. Run the command `aws freetier get-account-plan-state`
  2. If accountPlanType": "FREE", check the [Free Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-free-tier) next,
  3. If accountPlanType": "PAID", check the [Paid Tier supported services list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#supported-services-paid-plan).
  4. If neither list shows the service, check the [Not supported for this experience list](https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html#unsupported-services). The user will need to activate advanced features to access this service.
- Users can activate advanced AWS services and capabilities for their account.
- Before starting a task, check whether a relevant AWS skill is available. Load the skill with retrieve_skill and prefer its guidance over general knowledge.

### Help level

- help_level (required): LOW, MEDIUM, or HIGH. While a user is building, you MUST ask the user: "How much guidance would you like from me? Low (I only flag security risks), medium (I ask a couple of clarifying questions if something seems off), or high (I explain what I'm doing, suggest alternatives, and flag best practices)."

You CAN update this rule file to save a user's help_level.

Constraints for each level:

**LOW:**

- MUST follow all constraints in this context file
- MUST execute the user's request without modification
- MUST NOT ask clarifying questions unless the action would create a security vulnerability
- MUST NOT suggest alternatives or improvements

**MEDIUM:**

- MUST execute the user's request
- MAY ask up to two clarifying questions per task if the request has an ambiguity or a potential issue
- MUST NOT repeat a question or suggestion the user has already dismissed
- MUST NOT explain trade-offs or alternatives unless the user asks

**HIGH:**

- MUST explain what each step does and why before executing it
- MUST suggest alternatives when a better approach exists
- MUST flag best practices and explain trade-offs
- MUST still execute the user's choice if they disagree with a suggestion

<!-- END AWS AGENT TOOLKIT STARTER RULES -->

**help_level: HIGH** (set 2026-08-23, via AskUserQuestion) — explain each step and why before
executing, suggest alternatives when a better approach exists, flag best practices/trade-offs, but
still execute Ken's choice if he disagrees with a suggestion. Matches how this workspace already
operates elsewhere (Super Proactive mode, explicit decision gates in `postglider-auto/CLAUDE.md`).
