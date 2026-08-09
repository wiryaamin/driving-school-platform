# TrafikskolaOS — Landing Page Creative Blueprint

**Document Type:** Creative Direction & Storyboard (no wireframes, no UI, no code)
**Status:** Draft — awaiting review and approval before wireframes/visual design/implementation
**Date:** 2026-07-09
**Grounded in:** `docs/LANDING_PAGE_STRATEGY.md` (Product Design Strategy — approved), `docs/LANDING_PAGE_MESSAGING_STRATEGY.md` (Messaging & Storytelling Strategy — approved), `docs/ENTERPRISE_ARCHITECTURE_HANDBOOK_V1.0.md`
**Prepared as:** Creative Director, Product Design Director, Enterprise SaaS Product Strategist, UX Storytelling Specialist, Information Architect, Conversion Rate Optimization Expert, Swedish B2B Marketing Specialist (combined perspective)

> **Continuity note.** This blueprint does not re-litigate decisions already approved: the recommended concept (system-led, Swedish-restrained execution, role-aware layer folded in), the audience definitions, the core narrative arc, and the specific Swedish-language headline/CTA copy are all inherited from the two approved prior documents and referenced, not rewritten. What's new here is *creative direction*: how the approved story is experienced, scene by scene, screenshot by screenshot, motion by motion.

---

## Executive Summary

The question this blueprint answers is not "what does the page say" (answered in the Messaging Strategy) or "what's the underlying concept" (answered in the Product Design Strategy) — it's **what does a driving school owner feel, in sequence, while scrolling**. The answer: recognition → validation → surprise (real depth, shown not told) → specific confidence (Swedish accounting proof) → personal relevance (their own role reflected) → institutional trust (security/architecture stated plainly) → a calm, low-pressure invitation to talk. Every one of the eight scenes below exists because it moves the visitor exactly one step along that emotional arc — Phase 10 of this document explicitly tests each scene against that requirement and would cut anything that fails it. Nothing did, but the discipline of asking is preserved as a permanent check for future revisions.

---

## Creative Vision — What Makes Stripe/Linear/Vercel/Notion/Figma/Framer's Storytelling Work, and How It Adapts Here

The Product Design Strategy's Phase 2 already established the underlying principles (real product at real fidelity, density balanced by whitespace, marketing-structure-mirrors-product-structure, proof over persuasion). This section translates those principles into *storytelling* craft specifically:

- **Stripe** doesn't describe payments — it shows a real API call and lets the visitor recognize competence from the code itself. *Adaptation*: TrafikskolaOS shouldn't describe the ledger — it should show a real trial-balance or SIE4 export screen and let a finance manager recognize competence from the interface itself.
- **Linear** builds momentum through pacing — short scenes, fast visual rhythm, never lingering on a single idea longer than it takes to land. *Adaptation*: each scene in this blueprint is scoped to one idea, one screenshot, one emotional beat — resist the urge to over-explain.
- **Vercel** uses restraint as a confidence signal — silence and whitespace between claims make each claim feel more certain. *Adaptation*: the "Quiet Close" footer and the calm CTA (Messaging Strategy, Phase 9) are Vercel's restraint principle applied to Swedish B2B tone specifically.
- **Notion** structures its own marketing site the way its product structures information — blocks composing a page, mirroring "a tool for building pages of blocks." *Adaptation*: the System Overview scene (below) should structure the page itself as a small system — modules that visibly connect — mirroring the product's own module architecture.
- **Figma** shows the *interaction model*, not just the static UI — cursors, comments, live collaboration are visible in its marketing screenshots. *Adaptation*: where possible, screenshots should imply a live, real business in motion (a populated schedule, a real ledger with entries) rather than an empty-state screenshot.
- **Framer** makes the site's own motion demonstrate the product's own quality — the storytelling medium and the product are the same craft. *Adaptation*: motion in this blueprint (Phase 5) is used exclusively to reveal real structure (module connections, role-switching), never as decoration.

**What this is explicitly not**: dark-mode developer aesthetics, monospace type, or a literal Stripe/Linear visual skin. The *adaptation* is entirely about storytelling discipline — restraint, real proof, structural mirroring — filtered through the Swedish B2B tone established in the Messaging Strategy (Phase 10: calm, precise, no hype).

---

## Phase 1 — Visitor Psychology: The Complete Emotional Journey

| Stage | Thinking | Feeling | Questions | Concerns | What builds confidence | What motivates continued scrolling |
|---|---|---|---|---|---|---|
| **Arrival** ("I already have software.") | "Another driving school tool. Probably the same as what I have." | Mild skepticism, low investment | "Is this actually different?" | Wasting time on a page that's just marketing | A headline that names their real situation, not a generic pitch | Curiosity — the hero claim is specific enough to be worth ten more seconds |
| **Problem recognition** | "...that's actually exactly what's wrong with what I use now." | Recognition, mild validation | "Do they actually understand my business, or is this generic?" | Being sold to before being understood | The problem-naming scene names the *category's* shallowness specifically (diary-with-a-payment-button), which only someone who's evaluated this market would know | Wants to see what "different" actually looks like |
| **System reveal** | "Okay — this is bigger than I expected." | Surprise, growing interest | "How does this all actually connect?" | Complexity/overwhelm — is this too much for my school? | A real, structured module map, not a feature list — shown, not claimed | Wants to see if the depth is real or just a diagram |
| **Proof (finance/compliance)** | "They actually know BAS 2020 / SIE4 / AGI. That's specific." | Confidence, relief | "Will my accountant trust this?" | Compliance risk, migration risk | Specific, checkable claims plus a real screenshot of the ledger/export | Wants to know if *they specifically* (their role) are served |
| **Role recognition** | "This is for someone like me." | Personal relevance, warmth | "What does my day actually look like with this?" | "Will my staff (instructors, admin) actually adopt this?" | Role-specific micro-proof — the owner's dashboard, the finance view, the instructor's schedule | Wants final reassurance before acting |
| **Security/trust** | "This feels like something built by people who take this seriously." | Institutional trust, calm | "Is my data actually safe? Is this company legitimate?" | Data safety, vendor legitimacy | A plainly stated architectural fact (database-level tenant isolation) that reads as serious without being technical jargon | Ready to act, low residual friction |
| **Decision** ("I need to book a demo.") | "I want to talk to someone about this." | Calm confidence, mild anticipation | "What happens after I submit this form?" | Being pushed into a hard sell | Low-pressure CTA language, an honest response-time promise | — (conversion point) |

---

## Phase 2 — The Scrolling Story (Scenes, Not Rows)

Eight scenes, each a single idea with a single emotional beat, forming one continuous story rather than eight independent sections stacked on a page.

### Scene 1 — Arrival
- **Purpose**: earn the next ten seconds.
- **Message**: "Allt din trafikskola behöver, i ett system." (hero headline, Messaging Strategy Phase 5)
- **Visual focus**: a single, real, high-fidelity screenshot of the actual product — not a mockup, not a phone.
- **Emotional objective**: recognition + curiosity.
- **Business objective**: establish category positioning ("operating system," not "app") before any feature claim.
- **Trust objective**: the presence of a *real* screenshot, immediately, is itself a trust signal — no competitor researched does this in the hero.
- **Transition**: the hero's confidence needs to be earned — the very next scene names the problem specifically, so the bold claim doesn't float unsupported.

### Scene 2 — Problem Recognition
- **Purpose**: prove understanding of the visitor's actual daily reality before pitching anything.
- **Message**: "De flesta system för trafikskolor är egentligen bara en instruktörsdagbok med en betalknapp." (Messaging Strategy, supporting statement)
- **Visual focus**: quiet, text-forward — deliberately no screenshot here; this scene is about *language*, not proof, and should feel like a pause, not a pitch.
- **Emotional objective**: validation ("yes, exactly").
- **Business objective**: earn the right to introduce a system-level answer.
- **Trust objective**: specificity of the critique signals genuine market understanding.
- **Transition**: from naming the gap to showing the actual system that closes it.

### Scene 3 — System Reveal (Module Map)
- **Purpose**: show breadth and interconnection at once, structurally.
- **Message**: "Ett system, hela din verksamhet."
- **Visual focus**: the module map — scheduling, students, instructors, vehicles, finance, communication shown as connected nodes, not a feature grid.
- **Emotional objective**: surprise at real depth.
- **Business objective**: establish structural credibility before any single-feature deep dive.
- **Trust objective**: the map should look like a real system diagram (data flowing, not decorative icons) — legibility over decoration.
- **Transition**: pick the single highest-differentiation node (finance/compliance) and zoom into it.

### Scene 4 — Proof: Swedish Accounting Depth
- **Purpose**: deliver the hardest-to-copy differentiator with specific, checkable claims.
- **Message**: "Byggt för svensk bokföring, inte anpassat i efterhand."
- **Visual focus**: a real screenshot of the ledger/trial balance or SIE4 export screen, populated with realistic (not empty-state) data.
- **Emotional objective**: confidence, specifically for the finance-minded reader.
- **Business objective**: convert "is this really different?" skepticism into belief.
- **Trust objective**: this is the single strongest trust beat on the page — the claim is checkable by anyone who knows Swedish accounting.
- **Transition**: from financial depth to the human structure — who actually uses this, day to day.

### Scene 5 — Roles ("Every role gets the right tool")
- **Purpose**: let owner, operations, finance, and instructor each recognize themselves specifically.
- **Message**: "Varje roll får rätt verktyg."
- **Visual focus**: a role-switch interaction (tab or scroll-linked) revealing a different, real screenshot per role — owner's KPI overview, ops's calendar, finance's ledger view, instructor's schedule.
- **Emotional objective**: personal relevance.
- **Business objective**: serve multiple buyer personas (Messaging Strategy, Phase 1) without splitting into separate page journeys.
- **Trust objective**: seeing four distinct, real interfaces (not one generic dashboard relabeled) proves the platform's actual multi-role depth.
- **Transition**: from individual relevance back to institutional, company-level trust.

### Scene 6 — Security & Architecture
- **Purpose**: remove the latent "is my data safe" objection before the ask.
- **Message**: "Säkert från grunden" / "Varje trafikskolas data är helt separerad, på databasnivå."
- **Visual focus**: minimal, almost no screenshot — a simple, confident structural statement, possibly a very restrained isolation diagram (one tenant's data, walled off, not a stock padlock icon).
- **Emotional objective**: calm reassurance.
- **Business objective**: clear the last objection before the CTA.
- **Trust objective**: plain architectural language read as fact, not marketing.
- **Transition**: directly into the ask — trust is now built, nothing more needs proving.

### Scene 7 — Call to Action
- **Purpose**: convert accumulated trust into a real conversation.
- **Message**: "Boka en visning. Vi hör av oss inom en arbetsdag."
- **Visual focus**: the quietest visual moment on the page — generous whitespace, one clear action, no competing elements.
- **Emotional objective**: calm confidence, no pressure.
- **Business objective**: generate a qualified demo request.
- **Trust objective**: an honest, specific response-time promise reduces the anxiety of "what happens after I submit this."
- **Transition**: to the footer — closing, not re-pitching.

### Scene 8 — Quiet Close
- **Purpose**: end exactly the way the page has felt throughout.
- **Message**: "TrafikskolaOS byggs för den svenska trafikskolebranschen."
- **Visual focus**: minimal — a single closing statement, standard footer utility links.
- **Emotional objective**: settled trust.
- **Business objective**: reinforce category positioning one final time without repetition of the pitch.
- **Trust objective**: restraint at the very end confirms the restraint was genuine throughout, not just a hero-section device.
- **Transition**: none — end of page.

---

## Phase 3 — Section Blueprint (Detailed, Per Scene)

*(Headlines/CTAs below are the approved Swedish copy from the Messaging Strategy; this phase adds the creative-direction layer — visual concept, screenshot, illustration, animation, and expected outcomes — that document didn't specify.)*

| Section | Why it exists | Visitor question answered | Primary headline | Supporting message | Visual concept | Suggested screenshot | Suggested illustration | Suggested animation | Primary CTA | Secondary CTA | Expected emotional response | Expected business outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hero | Earn attention with a checkable claim, not a superlative | "Is this different?" | "Allt din trafikskola behöver, i ett system." | "Schemaläggning, elever, ekonomi och kommunikation — i en plattform byggd för svensk bokföring." | Real product, front and center | Admin dashboard overview (desktop) | None — the real screenshot *is* the illustration | Gentle fade/rise on load, no looping motion | — (none in hero; this scene is about landing, not converting) | — | Curiosity | Extended time on page |
| Problem Naming | Prove market understanding before pitching | "Do they get my actual frustration?" | "De flesta system... en instruktörsdagbok med en betalknapp." | (none — let the line stand alone) | Text-forward, quiet, no screenshot | None (deliberate) | A single restrained line-drawing motif (optional, not required) | None or a very slow, subtle reveal-on-scroll | None | None | Validation | Continued scroll, not yet a conversion moment |
| System Reveal | Establish structural depth | "How much does this actually cover?" | "Ett system, hela din verksamhet." | "Schemaläggning, elever, instruktörer, fordon, ekonomi och kommunikation — kopplade till varandra." | A real module map/system diagram | None yet — the diagram is the visual | A structural diagram: modules as nodes, connections as lines | Scroll-linked: connection lines draw in as the visitor scrolls through the map | "Se hela systemet" (scroll-anchor, not a form) | None | Surprise at real breadth | Sets up the finance deep-dive that follows |
| Proof — Finance & Compliance | Deliver the hardest-to-copy differentiator | "Will my accountant trust this?" | "Byggt för svensk bokföring, inte anpassat i efterhand." | "BAS 2020, dubbel bokföring, momsperioder, SIE4 och AGI — inbyggt, inte tillagt." | A single, real, populated finance screen | Ledger/trial balance or SIE4 export screen (desktop) | None — real screenshot only | Static or a very subtle number-count-in on key figures (restrained, not gimmicky) | None | None | Confidence | The strongest single trust-conversion beat on the page |
| Roles | Serve multiple personas without splitting the journey | "What does this look like for someone like me?" | "Varje roll får rätt verktyg." | "Ägare, administratör, ekonomiansvarig och instruktör ser det de behöver." | Role-switch interaction, four real screens | Owner overview (desktop), ops calendar (desktop), finance ledger (desktop), instructor schedule (**mobile**) | None | Cross-fade between role screenshots on tab/scroll interaction | "Se det som administratör" (per-role scroll-anchor, optional) | None | Personal relevance | Multi-persona resonance without four separate page journeys |
| Security & Architecture | Remove the data-safety objection | "Is my data safe? Is this company legitimate?" | "Säkert från grunden." | "Varje trafikskolas data är helt separerad, på databasnivå." | Minimal — a simple isolation diagram or none at all | Optional, very restrained | A single tenant-isolation motif (one walled block among several, understated) | None or a single, slow fade-in | None | None | Calm reassurance | Clears the final objection before the ask |
| Call to Action | Convert trust into a conversation | "What happens if I act now?" | "Boka en visning." | "Vi hör av oss inom en arbetsdag." | Maximum whitespace, one action | None | None | None (deliberately still) | "Boka en visning" | "Kontakta oss" | Calm confidence | Qualified demo requests |
| Footer | Close consistently with the page's own restraint | (none — closing, not persuading) | "TrafikskolaOS byggs för den svenska trafikskolebranschen." | — | Minimal utility footer | None | None | None | None (utility links only) | None | Settled trust | Reinforced category positioning, no re-pitch |

**Sections deliberately excluded** (tested against Phase 10's criteria below): a generic testimonials wall (none exist yet, and the Messaging Strategy's Phase 8 explicitly avoids relying on testimonials alone), a pricing table (neither Swedish competitor shows one, and TrafikskolaOS's onboarding is sales-assisted — pricing belongs in the demo conversation, not the page), a feature-count/icon-grid section (directly the failure mode every Phase-1 competitor exhibits), and a "trusted by" logo wall (no customer logos exist yet — fabricating implied social proof would violate the honesty discipline carried through every prior document).

---

## Phase 4 — Screenshot Strategy: The Complete Journey

| Order | Screenshot | Purpose | Workflow represented | Business problem solved | Why here | Supports which copy | Leads to |
|---|---|---|---|---|---|---|---|
| 1 | Admin dashboard overview (**desktop**) | Establish immediate product legitimacy | The owner's/admin's daily landing view | "Is this a real, mature product?" | First thing the visitor sees — must be unimpeachable | Hero headline | The system map (breadth) |
| 2 | *(none — System Reveal is a diagram, not a screenshot)* | Show structure before individual proof | — | "How does this all connect?" | A diagram, not a screenshot, is correct here — screenshots at this stage would fragment the "one system" message | System headline | The finance proof screenshot |
| 3 | Ledger / trial balance or SIE4 export screen (**desktop**) | Deliver the hardest-to-copy proof point | Year-end close / VAT reconciliation | "Will my accountant trust this?" | Placed immediately after the system claim, at peak attention, because it's the single strongest differentiator | Finance/compliance headline | The role-based screenshots |
| 4a | Owner KPI overview (**desktop**) | Role-specific relevance | Business-health check-in | "What do *I* see?" | Part of the role-switch scene | Roles headline | 4b |
| 4b | Operations calendar / multi-instructor grid (**desktop**) | Role-specific relevance | Daily scheduling coordination | "Will this actually reduce double-booking?" | Part of the role-switch scene | Roles headline | 4c |
| 4c | Finance ledger view (**desktop**) | Role-specific relevance (reinforces Screenshot 3 from a different angle) | Day-to-day bookkeeping, not just year-end | "Is this useful monthly, not just annually?" | Part of the role-switch scene | Roles headline | 4d |
| 4d | Instructor's schedule (**mobile**) | Role-specific relevance, and the only mobile screenshot on the page | Checking today's lessons between sessions | "Will my instructors actually use this?" | Deliberately mobile — instructors work from a phone in a car, and showing this specific screen on mobile (while everything else is desktop) itself communicates "built for how you actually work," without saying so explicitly | Roles headline | Security scene (no screenshot needed) |

**Desktop vs. mobile rule**: every screenshot is desktop **except** the instructor's schedule, which is mobile — deliberately, because it is the one workflow in the whole story that genuinely happens on a phone in real life. This selective mobile use is itself a storytelling device (per Framer's principle: the medium demonstrates the claim) rather than a literal "show both platforms" checklist.

**Screenshot fidelity requirement**: every screenshot must show realistic, populated data (a real-looking schedule with actual bookings, a ledger with actual entries) — never an empty state. This directly follows Figma's principle (Product Design Strategy, Phase 2) of showing the product *in use*, not the product *at rest*.

---

## Phase 5 — Animation Strategy

- **Scroll interactions**: reserved for two moments only — the module-map connection-line draw-in (Scene 3) and the role cross-fade (Scene 5). Everywhere else, scroll simply reveals static content. This scarcity is deliberate: if everything animates, nothing communicates.
- **Micro-animations**: a gentle fade/rise on the hero screenshot at load; a very restrained number-count-in on 1–2 key financial figures in Scene 4 (e.g., a balance figure settling into place) — never more than a one-second effect, never looping.
- **Dashboard transitions**: cross-fade only, never a slide/zoom/3D-tilt effect — a cross-fade communicates "this is real software, calmly presented," where a flashy transition would undercut the restrained tone established in Messaging Strategy Phase 10.
- **Module transitions**: the connection lines in the system map should draw progressively as the visitor scrolls through that scene, then hold still — motion communicates the *system's* connectivity, not decorative page liveliness.
- **Content reveals**: simple opacity/position fade-ins on scroll for text blocks, no staggered "fly-in from four directions" effects.
- **Hover behaviour**: minimal — a subtle elevation or brightness shift on interactive elements (the role-switch tabs, the CTA button), nothing more elaborate.
- **Motion hierarchy**: system map (most motion, because motion *is* the message there) → role switch (moderate motion, functional) → everything else (near-static). Motion budget should be spent almost entirely on the two scenes where motion actually carries meaning.
- **Animation restraint as a design principle**: per Vercel's whitespace-as-confidence principle (Creative Vision, above), restraint is not the absence of craft — it is the craft. A page that moves constantly reads as trying to compensate for thin content; a page that moves only when motion means something reads as confident in what it's showing.

---

## Phase 6 — Visual Hierarchy: The Rhythm of the Page

| Moment type | Where | Why |
|---|---|---|
| **Large moment** | Hero (Scene 1) | First impression must be unimpeachable — full-width, high-fidelity screenshot, generous surrounding space |
| **Quiet moment** | Problem Naming (Scene 2) | A deliberate pause — no visual competing with the line itself; quiet moments make the surrounding large moments feel larger by contrast |
| **High-information section** | System Reveal (Scene 3) | The one place density is earned — this is where the visitor should feel "there's a lot here," matching Stripe/Linear's principle that density signals capability when given room to breathe |
| **Breathing space** | Between every scene | Generous vertical spacing at every scene boundary — the page should never feel like sections are competing for the same breath |
| **Dashboard showcase** | Scene 4 (finance proof) | The single most important screenshot on the page — given the most visual weight of any individual image |
| **Illustration** | Scene 3 (system diagram), optionally Scene 6 (isolation motif) | The only two places illustration (rather than screenshot or plain text) is used — kept rare so it stays meaningful |
| **Statistics** | None planned | No fabricated or unverifiable statistics ("saves 70% of admin time!") appear anywhere — consistent with the honesty discipline; if real, specific, sourced statistics become available later (e.g., from actual pilot customers), they could earn a small, restrained placement, but none exist to use today |
| **Trust signal** | Scene 6 (security/architecture) | The dedicated, deliberate trust beat — everything before it builds toward it, nothing after it re-litigates it |
| **Call to action** | Scene 7 only | A single, unambiguous conversion moment — not repeated as sticky headers or multiple competing buttons throughout the page |

**Why this rhythm keeps visitors engaged**: it alternates tension and release — large/quiet/dense/spacious — rather than a flat, evenly-paced scroll of identical feature cards (the exact failure mode of every Phase-1 competitor). Each shift in visual weight signals "something changed," which is what keeps a visitor scrolling without fatigue.

---

## Phase 7 — Business Transformation Story

**Before TrafikskolaOS** — a composite day at a typical Swedish trafikskola running on fragmented tools (a booking calendar, a spreadsheet, a separate SMS tool, manual bookkeeping):

The **owner** starts the day checking three different places to understand what's actually happening — the booking tool for today's lessons, a spreadsheet for last week's revenue, and a mental note to call the accountant about the VAT period closing soon. There's no single moment where they can see the whole business at once. The **operations/admin staff** spend the morning manually reconciling instructor availability against vehicle availability against student requests — a cancellation means several phone calls, not one system update. **Finance** spends the days before a VAT deadline exporting data from the booking tool, reformatting it, and manually checking it against the accounting software, hoping nothing was missed. **Instructors** carry a paper or personal-app schedule that may not reflect the latest change from the office, discovering a rebooking only when they check their phone between lessons. Growth — adding a second location, taking on a corporate B2B contract — feels like it would multiply this friction, not just the business.

**After TrafikskolaOS** — the same day, one system:

The **owner** opens one dashboard and sees the whole business — today's schedule, this month's revenue, outstanding invoices — in one place, without switching tools. **Operations** sees instructor, vehicle, and student availability in a single scheduling view; a cancellation automatically opens the slot to the waitlist instead of triggering a chain of phone calls. **Finance** watches VAT periods, ledger entries, and SIE4 exports build continuously through the month instead of scrambling at the deadline — the export at year-end is a formality, not a fire drill. **Instructors** check one schedule on their phone that's always current, because it's the same system everyone else is using, not a copy of it. And when the school wants to grow — a second location, a corporate contract with a local employer — the system already has the structure (multi-tenant, multi-branch-ready, corporate customer support) to hold it, rather than requiring a re-platforming project.

**This is the story the page tells implicitly through its structure** (Scene 3's system map, Scene 4's finance proof, Scene 5's role views) — not through a literal "before/after" comparison section on the page itself, which would read as a marketing device rather than an earned realization. The story above is creative-direction grounding for how each scene's copy and visuals should *feel*, not a section to be built literally.

---

## Phase 8 — Content Hierarchy

| Layer | Content | Placement rule | Why this order maximizes conversion |
|---|---|---|---|
| **Hero message** | Category claim + real screenshot | First, unconditionally | Must earn the next scroll before anything else can matter |
| **Supporting copy** | One-line problem naming | Second, alone | Validates before persuading — persuasion without validation reads as generic |
| **Proof points** | System map, then finance/compliance specifics | Third and fourth | Structural proof before financial proof — breadth first, then the single deepest differentiator |
| **Business outcomes** | Implicit in Scene 4/5 copy (not a separate "outcomes" section) | Woven into proof scenes, not isolated | A standalone "benefits" section would repeat what proof scenes already demonstrate — redundant sections dilute pacing |
| **Customer outcomes** | Role-specific relevance (Scene 5) | After general proof, before trust | Personal relevance lands better once general credibility is already established |
| **Trust elements** | Security/architecture (Scene 6) | Second-to-last, deliberately | The last objection cleared right before the ask — not earlier, where it would be premature, and not absent, where the ask would feel unsupported |
| **CTA placement** | Scene 7 only | Single placement, not repeated | One clean ask preserves the low-pressure tone established throughout; repeated CTAs read as urgency, which contradicts Phase 10 of the Messaging Strategy |
| **Footer purpose** | Closing statement + utility links | Last | Confirms the page's restraint held all the way through, reinforcing trust retroactively |

**Why this order maximizes conversion**: it mirrors exactly the emotional journey in Phase 1 — nothing is asked of the visitor before the corresponding confidence has been built, and nothing is repeated once it's landed. Conversion-rate discipline here is about sequencing trust correctly, not about maximizing the number of CTAs on the page (the opposite of what most competitor pages do).

---

## Phase 9 — Mobile Experience

The story does not simply stack the same eight desktop scenes vertically at a narrower width — it is re-paced for how mobile visitors actually behave (faster scrolling, shorter attention per scene, thumb-driven interaction):

- **How the story changes**: Scenes 2 (Problem Naming) and 6 (Security) — the two most text-only, quiet scenes — should be tightened to their essential single line each; mobile visitors scroll through quiet text-only moments faster than desktop visitors, so brevity matters more here than on desktop.
- **How screenshots change**: desktop screenshots (dashboard, ledger, calendar) should be shown as clearly-labeled, cropped/zoomed excerpts rather than shrunk whole-screen captures — a full desktop dashboard shrunk to mobile width is illegible and undermines the "real product" trust signal it's meant to deliver. The instructor's schedule screenshot (already mobile-native) needs no adaptation — it becomes even more relevant, since the mobile visitor is likely evaluating this exact experience for their own instructors.
- **How scrolling changes**: the module-map connection-line animation (Scene 3) should simplify to a vertical, sequential reveal rather than the desktop's more spatial, multi-directional connection diagram — mobile scroll is single-axis, and the animation should respect that rather than forcing a diagram designed for a wide viewport into a narrow one.
- **What should be simplified**: the four-way role-switch interaction (Scene 5) — on mobile, this should become a simple vertical sequence (owner, then ops, then finance, then instructor) rather than a tab-switch interaction, since tab-switching is a weaker interaction pattern on mobile than a natural scroll.
- **What should become interactive**: very little — mobile storytelling favors linear scroll over interactive exploration; the desktop's optional "scroll-anchor" secondary CTAs (e.g. "Se hela systemet") are less necessary on mobile, where the natural scroll already carries the visitor through everything.
- **What should remain visible regardless of device**: the finance/compliance proof scene (Scene 4) and the primary CTA (Scene 7) — these two moments are the actual conversion-critical beats of the entire story and must never be de-prioritized, truncated, or hidden behind a "read more" interaction on any device.

---

## Phase 10 — Creative Director Review

Every scene tested against five questions. Nothing below failed all five, but the reasoning is preserved so future revisions can be held to the same bar.

| Scene | Educates? | Builds trust? | Creates desire? | Differentiates? | Justifies booking a demo? | Verdict |
|---|---|---|---|---|---|---|
| Hero | Partially (positioning) | Yes (real screenshot) | Yes (curiosity) | Yes (category claim) | Sets up, doesn't yet justify | **Keep** |
| Problem Naming | Yes (names the market gap) | Moderate | Moderate | Yes (specific critique) | No, not yet | **Keep** — earns the right to the next scene |
| System Reveal | Yes (real structure) | Yes (shown, not claimed) | Yes (surprise at depth) | Yes (no competitor shows this) | Contributes | **Keep** |
| Proof — Finance | Yes (specific standards named) | Strongest scene for trust | Yes, for finance-minded visitors specifically | Yes — the single hardest-to-copy claim | Yes, strongly | **Keep — highest-priority scene** |
| Roles | Yes (shows real multi-role depth) | Yes (four real interfaces, not one relabeled) | Yes (personal relevance) | Yes (no competitor serves multiple personas) | Contributes | **Keep** |
| Security & Architecture | Moderate | Strong (clears final objection) | Low (not meant to excite, meant to reassure) | Moderate | Yes, by removing a blocker | **Keep** |
| Call to Action | No (not its job) | Reinforces via honest micro-copy | No (not its job) | No (not its job) | Yes — this is the ask | **Keep** |
| Footer | No | Mild (consistency) | No | Mild (reinforces category claim) | No | **Keep** — closes the story properly |

**Sections considered and cut** (per Phase 3's exclusions, re-confirmed here under the five-question test): testimonials wall (fails "builds trust" today — none exist, and fabricating implied ones would fail every honesty check applied throughout this program), pricing table (fails "justifies booking a demo" — showing a number without context could trigger premature comparison-shopping before the differentiation has landed; the demo conversation is where pricing belongs), feature-icon-grid (fails "differentiates" — this is exactly what every Phase-1 competitor already does), and a fabricated statistics/social-proof bar (fails the honesty discipline outright).

---

## Final Recommendation

This Creative Blueprint is the complete creative master plan for the TrafikskolaOS landing page: eight scenes, one continuous emotional and narrative arc, a specific and disciplined screenshot journey, a restrained and meaningful animation strategy, and a content hierarchy sequenced to match how trust is actually built rather than how much can be said. It resolves cleanly into the approved Product Design Strategy's Concept A + C synthesis and the approved Messaging Strategy's exact copy — nothing here contradicts either prior document; this layer adds *how it should feel*, scene by scene, without yet specifying *how it should be built*.

No wireframes, visual design, or code have been produced. Waiting for review and approval before proceeding to wireframes, visual design, or React implementation.
