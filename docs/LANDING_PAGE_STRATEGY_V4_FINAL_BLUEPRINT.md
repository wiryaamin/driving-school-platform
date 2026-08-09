# TrafikskolaOS — Landing Page Strategy v4: Final Implementation Blueprint

**Document type:** Strategy refinement — supersedes v3's navigation and CTA-wording specifics where they conflict. Scene sequence, buyer journey, and onboarding strategy from v3 are **preserved, not reopened**, per this revision's explicit instruction.
**Status:** Draft — awaiting approval. No code, no UI, no copy has been implemented from this document.
**Unchanged from v3:** the ten-scene structure (Section 10 of v3), the retirement of the Roles scene, the Business Transformation and Onboarding Journey sections, the audience redefinition (owner/decision-maker only), and the entire "Quiet Authority" visual system.

---

## 1. What This Revision Does

v3 established *that* the page needs navigation-level entry points beyond a single CTA button, and sketched three (Book a Demo, Customer Login, Platform Login). This revision does not change that decision — it finishes it. Three entry points turned out to under-serve two real visitors: a prospective owner who isn't ready to book anything yet but wants to self-serve information first, and an existing customer who isn't logging in to work but is stuck on something and needs help. Both were previously invisible in the navigation model. This revision adds them, sharpens the CTA's tone, demotes Platform Login further, and states the Sweden-first position as a durable, quotable line.

Nothing here touches the scene sequence, the onboarding funnel, the retired Roles decision, or any already-built scene's visual treatment.

---

## 2. CTA Positioning — Consultative, Not Generic

**Problem being corrected:** "Book a Demo" is the single most overused phrase in B2B SaaS — every competitor researched in this program's own competitive analysis uses some form of it. It reads as a scheduling widget, not a conversation with someone who understands the visitor's specific school.

**What is preserved exactly as approved:** the underlying CTA philosophy from the Messaging Strategy and Creative Blueprint — one clear ask, low pressure, an honest response-time promise, no urgency language. The already-built, already-approved Scene 7 primary action, **"Boka en visning,"** is not being replaced — changing already-approved, already-implemented copy is exactly the kind of reopening this revision was told to avoid unless absolutely necessary, and it isn't necessary here: "Boka en visning" is already calm and concrete.

**What changes:** everywhere this action is *referenced outside Scene 7 itself* — specifically, in the new persistent navigation (Section 3) — it is framed with slightly more consultative specificity: **"Boka en personlig visning"** (book a *personal* viewing/demo). The single added word does the positioning work: it signals a real person walking through the *visitor's* school's situation, not a generic scheduling link. This is an additive refinement to existing approved copy, not a replacement of it.

---

## 3. Navigation — Complete Revision

v3 specified three entry points. This revision replaces that table with a complete, five-path model, one for each visitor type this project has now explicitly named (Section 7).

| Entry point | Visible in | Serves | Behavior |
|---|---|---|---|
| **Boka en personlig visning** | Primary navigation (persistent) + Scene 7 | Prospective Customer | The page's one true conversion action. Unchanged in substance from v3; wording sharpened per Section 2. |
| **Resurser** (Resources) | Primary navigation | Prospective Customer (self-serve / due-diligence phase) | A dropdown or dedicated page grouping future informational content (Section 4). Not a conversion action — a trust-building, self-service path for visitors not yet ready to talk to anyone. |
| **Kundinloggning** (Customer Login) | Primary navigation | Existing Customer (routine use) | Unchanged from v3 — direct, unadorned link into the authenticated product. No marketing copy, no interstitial. |
| **Support** | Primary navigation, visually adjacent to but distinct from Kundinloggning | Existing Customer needing help | New in this revision (Section 5). A separate path from Customer Login because "I want to do my job" and "I'm stuck and need help" are different intents that shouldn't be merged into one ambiguous button. |
| **Platform Login** | Footer only, low visual weight | Platform Administrator (TrafikskolaOS's own team, not a customer) | Further demoted from v3: no longer positioned in primary navigation at all, per this revision's explicit instruction. A small, unemphasized footer link only — present for completeness, never competing visually with any customer-facing entry point. |

**Why five, not three:** each entry point above answers a genuinely different question a real visitor arrives with ("I want to buy," "I want to research first," "I want to use what I already pay for," "I'm stuck," "I work here"). Collapsing any two of these into one button would force a visitor to guess which of two different intents a shared label actually serves — the exact ambiguity a "Quiet Authority" navigation should not have.

---

## 4. Resources — New Navigation Grouping (Content Not Yet Built)

**Purpose:** serve the Prospective Customer who is not yet ready to book a personal viewing — the due-diligence visitor who wants to self-verify claims before talking to anyone. This is a distinct, legitimate stage of the buyer journey that the page previously offered no path for other than reading the scroll story once.

**Contents (named as future placeholders — none of this content exists yet, and none of it should be implied to exist until it is actually written):**
- **Migreringsguide** (Migration Guide) — a detailed, self-serve version of the Onboarding Journey section's data-migration stage (v3, Section 7), for a visitor who wants specifics before booking a call.
- **FAQ** — direct answers to the objections the scene sequence already addresses narratively (switching cost, data safety, staff adoption) in a scannable, reference format.
- **Säkerhet** (Security) — an expanded version of the Security & Architecture scene's claims, for a visitor (or their IT-literate colleague) who wants more technical depth than the calm, restrained on-page version provides.
- **Svensk regelefterlevnad** (Swedish Compliance) — an expanded version of the Proof scene's compliance claims (BAS, VAT, SIE, AGI, personnummer), same logic as Security above.
- **Dokumentation** — product documentation, relevant primarily post-purchase but valuable pre-purchase for a technically diligent buyer.
- **Versionsnyheter** (Release Notes) — evidence the product is actively maintained and improving, a real trust signal for a buyer worried about vendor longevity.
- **Kundframgång** (Customer Success) — marked explicitly **future** — this is where real customer stories would eventually live, once real customers exist to feature. Until then, this item should not appear in the navigation at all rather than appearing and leading nowhere (see Section 8 guardrail on not implying content that doesn't exist).

**Design note (non-visual):** Resources is content infrastructure, not a scene — it does not participate in the scroll-story sequence (v3, Section 10) and should not be designed as one. It is reference material a visitor opts into, structurally closer to documentation than to marketing narrative.

---

## 5. Support — New, Distinct From Customer Login

**Problem being corrected:** v3 gave the Existing Customer exactly one path (Customer Login) and assumed all their needs were "get into the product." That's true for routine use, but not for a customer who is blocked, confused, or has a question they can't resolve by logging in.

**What Support is:** a clearly separate, clearly labeled path for an existing, paying customer who needs help — distinct from the sales conversation (Boka en personlig visning, for people who aren't customers yet) and distinct from routine product access (Kundinloggning). Positioning it as its own navigation item, rather than burying it inside the product after login, respects that a customer might need help *before* they can even get into the product (e.g., a login problem itself).

**Relationship to the rest of the page:** Support is not part of the narrative scroll-story and is not trying to persuade anyone of anything — it is utility, and should be styled with the same restraint as Customer Login: no marketing copy, a direct path to whatever support channel the business actually offers (this document does not specify what that channel is — email, a ticket system, a phone number — since that is an operational decision outside this strategy's scope, not a marketing-copy decision).

---

## 6. Partnership Messaging — Strengthened Beyond the Sale

v3 already established that the Call to Action (Scene 9) and the Onboarding Journey section (Scene 7) should reassure a visitor that switching is a guided process, not a leap into the unknown. This revision sharpens that into an explicit, standing principle: **every mention of what TrafikskolaOS provides after a visitor says yes must span the full relationship — onboarding, migration, training, go-live, and ongoing use — never stopping at "we'll get you set up."**

**Concretely, this affects two already-planned pieces of content, not new ones:**
- The Onboarding Journey section's funnel (v3, Section 7) currently ends at "Kundinloggning" (Customer Login) — as if the relationship's interesting part ends at go-live. The terminal state of that journey should be understood, in whatever copy is eventually written, as the *start* of ongoing use, not a finish line — the same "Kundinloggning" entry point a returning customer uses every day is also, narratively, where "support becomes ongoing, not one-time" belongs. This does not require adding a new stage to the funnel diagram — it requires the copy describing that final stage to say so explicitly, rather than implying the relationship is complete once the school is logged in.
- The Call to Action's supporting copy (v3, Section 9) should make the same point from the other direction: the promise isn't just "we reply within one business day" (a promise about the *sales* process) — it's that the same team stays involved through migration, training, and beyond. This is a copy-substance instruction for whoever eventually writes Scene 9's final sentences, not a new claim requiring new proof — the Onboarding Journey section already describes exactly this process; the CTA should simply not let the visitor forget it right before they act.

---

## 7. Sweden Positioning — Durable, Not Exclusionary

**New governing line:** **"Byggt för svenska trafikskolor, först."** (*"Built for Swedish driving schools, first."*)

**Why this specific phrasing, and where it applies:** the word "först" ("first") does two things simultaneously — it states genuine specialization (this was not adapted from a generic international product, it was built for this market specifically, which is the same honesty claim Scene 4's proof already makes) while deliberately not claiming Sweden is the only market this will ever serve. This matters for a durable strategy document: it lets every current Swedish-specific claim (BAS, VAT, SIE, AGI, personnummer) stand exactly as strong as it is today, without the page ever having to be rewritten from a defensive position if the product expands to another Nordic or European market later.

**Where this principle applies:** as a governing framing for any *future* copy describing the product's Swedish focus (Proof scene refinements, Resources' "Swedish Compliance" page, any future positioning statement). It does **not** require rewriting the already-approved, already-built Hero or Problem Recognition copy — neither currently makes an exclusivity claim that conflicts with this principle, so no existing approved copy needs to change. This is a standing principle for what gets written next, not a retroactive edit.

---

## 8. Complete Journey-to-Navigation Verification

Every visitor type this project has now named, and exactly which path serves them — the explicit check this revision was asked to perform:

| Visitor type | Primary path | Secondary path (if applicable) |
|---|---|---|
| **Prospective Customer** — hasn't decided, evaluating | The full scroll-story (Scenes 1–9) leading to "Boka en personlig visning" | "Resurser" for self-serve due diligence before committing to a conversation |
| **New Customer (Onboarding)** | Not primarily served by the marketing page — served by the guided process the Onboarding Journey section (v3, Section 7) describes in advance | The page's job for this visitor is expectation-setting *before* they convert, not a separate navigation path |
| **Existing Customer (routine use)** | "Kundinloggning" — direct, no narrative, no delay | — |
| **Existing Customer needing Support** | "Support" — new, distinct entry point (Section 5) | — |
| **Platform Administrator** | Footer-only "Platform Login" (Section 3) — deliberately not in primary navigation | — |

**Guardrail carried over from every prior version of this strategy:** none of the above changes what's real. If "Support" or "Resources" content doesn't exist yet at implementation time, the navigation should not link to empty pages or imply capability that isn't built — this is the same honesty discipline that has governed every decision in this program since the very first strategy document (no fabricated screenshots, no fabricated testimonials, now: no fabricated resource content). Where content isn't ready, the correct choice is to not show the navigation item yet, not to show it pointing at nothing.

---

## 9. What Does Not Change (Restated, Now Final)

- The ten-scene structure and sequence from v3, Section 10 — unchanged.
- The retirement of the Roles scene — unchanged.
- The Business Transformation and Onboarding Journey sections as approved in v3 — unchanged in position and purpose; Section 6 above adds a copy-substance instruction to content already planned, not a new section.
- The "Quiet Authority" visual system in full.
- The prohibition on feature grids, icon walls, testimonials, and pricing tables.
- The rule that nothing on the page — including, now, Resources and Support content — may claim more than actually exists.

---

## 10. Approval Gate

This document is intended to be the **final implementation blueprint** — once approved, implementation should proceed directly against it rather than triggering a further strategy revision, absent a genuinely new consideration. Before implementation resumes:

1. Confirm "Boka en personlig visning" as the navigation-level CTA label (Scene 7's own button copy is unchanged).
2. Confirm the Resources content list (Section 4) as the intended future set — noting none of it exists yet and won't be implied to exist until it's actually written.
3. Confirm Support as a distinct entry point from Customer Login (Section 5), and confirm what support channel it should point to (an operational decision this document deliberately does not make).
4. Confirm the Sweden positioning line (Section 7) for future use in Proof-scene and Resources copy.
5. Confirm Platform Login's footer-only placement (Section 3) as final.

No code, UI, or copy has been changed to produce this document.

---
---

# Website Information Architecture

**Document type:** Architecture addendum to the approved v4 strategy above — appended, not a replacement. Nothing in Sections 1–10 above is modified by what follows.
**Status:** Draft — awaiting approval. No code, no UI, no page mockups have been produced.
**Scope:** this section defines the complete public TrafikskolaOS website that the approved landing page (Home) sits inside — the pages surrounding it, how they're organized, and how every visitor type reaches the correct one. It documents structure only: no visual design, no layout, no copy beyond what's needed to state a page's purpose.

---

## 11. Public Website Sitemap

```
trafikskolaos.se
├── Home                        (the approved 10-scene landing page)
├── Platform
├── Solutions
├── Onboarding
├── Resurser (Resources)
│   ├── Migreringsguide
│   ├── FAQ
│   ├── Säkerhet
│   ├── Svensk regelefterlevnad
│   ├── Dokumentation
│   ├── Versionsnyheter
│   └── Kundframgång (future — not published until real content exists)
├── Support
│   ├── Kontakta support
│   ├── Hjälpcenter
│   ├── Komma igång
│   ├── Felsökning
│   ├── Utbildning
│   └── Produktuppdateringar
├── Kontakt (Contact)
├── Boka en personlig visning
├── Kundinloggning
└── Platform Login              (footer only, not in this hierarchy's primary nav)
```

| Page | Purpose | Primary Audience | Business Goal | Primary CTA |
|---|---|---|---|---|
| **Home** | Tell the full "Quiet Authority" scroll-story (v3, Section 10) — recognition through decision | Prospective Customer | Convert skepticism into a booked conversation | Boka en personlig visning |
| **Platform** | A structured, non-narrative deep-dive into what the platform actually does — for a visitor who has already been convinced *emotionally* by Home and now wants the *structured* version to share internally or re-read before deciding | Prospective Customer (later-stage, doing internal due diligence) | Give a visitor something concrete to reference or forward to a co-owner/partner without re-scrolling the whole story | Boka en personlig visning |
| **Solutions** | Organize proof by the *situation* a school is in — e.g., a school still running on spreadsheets, a school with more than one location, a growing school, a school serving corporate/B2B training contracts — never by internal job role (the Roles scene stays retired everywhere on the site, not just on Home) | Prospective Customer, self-identifying with a specific starting situation | Make the Business Transformation story (v3, Section 6) concrete for the visitor's *own* circumstances, not a generic composite | Boka en personlig visning |
| **Onboarding** | The full, detailed expansion of the Onboarding Journey section (v3, Section 7) — every stage, every shared responsibility, in complete depth rather than the homepage's restrained summary | Prospective Customer (evaluating switching cost) and New Customer (actively onboarding, needing a working reference) | Remove switching-cost anxiety completely, and give a converted customer a real reference document during onboarding itself | Boka en personlig visning (Prospective) / none — reference only (New Customer) |
| **Resources** | A self-serve hub for a visitor who wants to verify claims before ever talking to a person | Prospective Customer (due-diligence stage) | Build trust without requiring a conversation; reduce the number of people who bounce because they weren't ready to talk yet | None primary — Resources educates, it does not convert (Section 15) |
| **Support** | Help existing, paying customers who are stuck | Existing Customer needing Support | Resolve problems and preserve trust in an existing relationship — explicitly not a sales function | Kontakta support |
| **Contact** | A general-purpose path for anyone whose need doesn't fit Boka en personlig visning, Resources, or Support — press, partnership inquiries, general questions | Anyone not otherwise served | Capture inquiries that don't fit the primary funnel rather than forcing them into a mismatched CTA | Skicka meddelande (send message) |
| **Boka en personlig visning** | The dedicated page/flow behind the site's one true conversion action | Prospective Customer, ready to act | Generate a qualified conversation | The booking action itself |
| **Kundinloggning** | Direct, unadorned entry into the authenticated product | Existing Customer | Zero-friction daily access | Log in |
| **Platform Login** | Internal entry for TrafikskolaOS's own platform administration | Platform Administrator | Internal operational access only | Log in |

---

## 12. Resources Information Architecture

Organized into four logical categories — the same seven items named in v4, Section 4, now grouped by the job each does rather than listed flat:

### Category: Getting Started & Switching
| Resource | Purpose | Target Audience | Customer Journey Stage |
|---|---|---|---|
| Migreringsguide | Detailed, self-serve answer to "how hard is switching, specifically" | Prospective Customer doing due diligence | Late Prospective, pre-decision |
| FAQ | Scannable, reference-format answers to the objections the scroll-story already addresses narratively | Prospective Customer who wants quick answers without reading the full story again | Any point in Prospective |

### Category: Trust & Compliance
| Resource | Purpose | Target Audience | Customer Journey Stage |
|---|---|---|---|
| Säkerhet | Expanded technical depth behind the Security & Architecture scene's restrained on-page claims | Prospective Customer or their technically-literate colleague/advisor | Late Prospective, risk-verification |
| Svensk regelefterlevnad | Expanded depth behind the Proof scene's compliance claims (BAS, VAT, SIE, AGI, personnummer) | Prospective Customer, especially one consulting their accountant before deciding | Late Prospective, risk-verification |

### Category: Product
| Resource | Purpose | Target Audience | Customer Journey Stage |
|---|---|---|---|
| Dokumentation | Reference material for how the product actually works | Primarily New/Existing Customer; secondarily a diligent Prospective Customer | New Customer (onboarding) and Existing Customer (routine reference) |
| Versionsnyheter | Evidence the product is actively maintained — a vendor-longevity trust signal | Prospective Customer (trust) and Existing Customer (operational awareness — see Section 13's Produktuppdateringar for the customer-facing framing of the same underlying content) | Late Prospective (trust) / Existing (ongoing) |

### Category: Proof (Future)
| Resource | Purpose | Target Audience | Customer Journey Stage |
|---|---|---|---|
| Kundframgång | Real customer outcomes, once real customers exist to feature | Prospective Customer | Late Prospective, social proof |

**Governance note carried forward:** Kundframgång is documented here as *architecture*, not as a page to publish today — per v4 Section 4, it should not appear in navigation until real content exists to put on it.

---

## 13. Support Information Architecture

Support is architected as strictly separate from sales — no item below leads to, or is framed around, a purchasing decision.

| Support content | Purpose | Notes |
|---|---|---|
| **Kontakta support** | The entry point itself — how an existing customer reaches a real person or channel when self-serve content doesn't resolve their issue | The one item on this list that is a true "contact" action; everything else below is self-serve |
| **Hjälpcenter** (Help Center) | Searchable, self-serve knowledge base for common questions | Reduces load on direct contact for problems that already have a documented answer |
| **Komma igång** (Getting Started) | Post-access quick-reference for a customer who has just gone live | Distinct from the public Onboarding page (Section 11): that page persuades and sets expectations for someone not yet a customer; this one assists someone who already has access and needs the practical first-week reference |
| **Felsökning** (Troubleshooting) | Specific, problem-oriented self-serve content ("X isn't working — here's why and what to do") | The most utilitarian content on the entire site — no narrative voice, no positioning, purely functional |
| **Utbildning** (Training) | Ongoing and refresher training resources for existing staff, distinct from the one-time onboarding training the Onboarding Journey describes | Serves staff turnover at an existing customer (a new instructor joining a school already using the platform, for example) — a real, ongoing need the original Onboarding Journey funnel doesn't cover since it only describes a school's *first* training |
| **Produktuppdateringar** (Product Updates) | The existing-customer-facing framing of the same release information published as Versionsnyheter under Resources | Same underlying content, different intent: Resources' version builds pre-purchase trust ("this vendor is active"); this version keeps an existing customer operationally current ("here's what changed in the tool you use every day") |

---

## 14. Navigation Architecture — Path Validation

Every visitor type named across this program's strategy documents, walked through explicitly, confirming no dead ends:

| Visitor type | Entry point | Path | Destination | Dead end? |
|---|---|---|---|---|
| **Prospective Customer** | Any page, via persistent navigation | Home (full story) → optionally Platform/Solutions/Resources for deeper verification → Boka en personlig visning | A booked personal demo | None — every page in this category leads back to the one conversion action, never away from it |
| **New Customer (Onboarding)** | Not the marketing site's job to route this visitor — they arrive via the guided process itself | Onboarding page (as a working reference during actual onboarding) | Kundinloggning, once go-live is reached | None — this visitor is handed off by a real process, not left to navigate alone |
| **Existing Customer (routine use)** | Persistent navigation, "Kundinloggning" | Direct | The authenticated product | None — one click, no detours |
| **Existing Customer needing Support** | Persistent navigation, "Support" | Support hub → Hjälpcenter/Felsökning (self-serve) or Kontakta support (direct) | Resolution, or a real support channel | None — explicitly not merged with Kundinloggning, so this visitor is never forced to pretend they just want to log in |
| **Platform Administrator** | Footer, "Platform Login" | Direct | Platform administration | None — deliberately unadvertised, but present and functional, never blocking a real need to reach it |

**Ambiguity check (explicitly confirmed, not assumed):** no navigation label on this site now serves two visitor types with different intents — the exact failure mode this revision's v4 predecessor identified (Section 3) and corrected by separating Support from Kundinloggning and by removing Platform Login from primary navigation entirely.

---

## 15. Website Governance

Standing principles for this site, now and as it grows — every future page added to this architecture must be checked against all eight:

1. **Every page has one business purpose.** If a page can't state its single purpose in one sentence (Section 11's "Purpose" column is the enforced format for exactly this reason), it should be split or cut, not left ambiguous.
2. **Every CTA has one objective.** A page may inform in many ways, but it asks for exactly one action — mirroring the same discipline the approved Creative Blueprint already applies to Scene 7 (v3, Section 9), now extended site-wide.
3. **Navigation follows the customer journey, not the org chart.** Every navigation item maps to a real visitor intent (Section 14), never to an internal department or team structure.
4. **Sales and Support remain separate**, always. No Support content is framed to sell; no sales content is disguised as support. This is the same principle that justified retiring the Roles scene and separating Support from Kundinloggning — one conversation should never be quietly doing the job of another.
5. **Marketing ends where the product begins.** Kundinloggning and Platform Login are functional doors, not marketing surfaces — no persuasive copy, no scene structure, no restatement of the pitch belongs on either.
6. **Customer Login never functions as a sales page.** Stated as its own explicit rule because it's the single easiest principle to accidentally violate (a well-meaning "upsell" banner on a login screen is a common pattern this site must never adopt).
7. **Platform Login remains internal and low visibility**, permanently — not just at launch. Any future redesign of the footer or navigation must re-confirm this placement rather than treat it as available for repositioning.
8. **Resources educate rather than sell.** Every Resources page may build trust and may end with a quiet, secondary path to Boka en personlig visning — but its primary content must stand on its own as genuinely useful information, not as a pretext for a pitch.

---

## 16. Approval Gate — Website Information Architecture

Before this becomes final, alongside the already-approved v4 sections above:

1. Confirm the four new top-level pages (Platform, Solutions, Onboarding as a standalone page, Contact) as approved architecture — none of these existed as distinct pages in any prior version of this strategy.
2. Confirm Solutions is organized by school situation (spreadsheet-era schools, multi-location schools, growing schools, corporate/B2B providers) and not by internal role — consistent with the Roles-scene retirement holding site-wide, not just on Home.
3. Confirm the Resources category grouping (Section 12) and the Support content list (Section 13).
4. Confirm the Versionsnyheter/Produktuppdateringar relationship (same content, two audience framings) rather than two separately maintained resources.
5. Confirm the eight governance principles (Section 15) as binding for all future pages added to this site, not only the ones named here.

No code, UI, or page mockups have been produced to create this section.

---
---

# Website Information Architecture — Final Refinements

**Document type:** Final refinement to Sections 11–16 above. Nothing in the Landing Page Strategy (Sections 1–10) or the base Information Architecture (Sections 11–16) is reopened — this adds one new page, resolves one naming question, confirms one content deferral, and produces the final sitemap those sections were building toward.
**Status:** Draft — awaiting approval. No code, no UI, no page mockups have been produced.

---

## 17. About TrafikskolaOS — New Page

**The distinction this page has to hold:** everywhere else on this site, the job is to convince a visitor to act. This page's job is different — it exists so a skeptical reader can answer "who actually built this, and can I trust they'll still be here in five years?" without being sold to while they look for the answer. Per the instruction, this is a credibility page, not a marketing page — its success is measured by whether it reads as calm and factual, not by how well it converts.

| Field | Definition |
|---|---|
| **Purpose** | Establish who TrafikskolaOS is, as a company — separate from what the product does (Home, Platform) or how it's positioned against alternatives (Business Challenges). Answers "is this a serious, durable company" rather than "is this good software." |
| **Primary Audience** | Prospective Customer, late-stage — specifically the diligence-minded owner (or their accountant/advisor, the same skeptical reader the Messaging Strategy names as its hardest audience) who checks a vendor's legitimacy before signing a multi-year commitment |
| **Business Goal** | Reduce vendor-legitimacy risk as an objection — not generate a lead directly. This page's success is measured by whether it removes a doubt, not by clicks on a CTA |
| **Primary CTA** | None in the sales sense. If any link forward is offered, it is Kontakt (Section 11) — quiet, optional, appropriate for a reader who came here to verify something, not to be asked for anything |

**Content, per the instruction, and no more than this:**
- **Vision** — what TrafikskolaOS believes the future of Swedish driving-school operations should look like
- **Mission** — what the company is actually doing about that belief, today
- **Why TrafikskolaOS exists** — the founding motivation, stated plainly (this is the one place on the site a brief origin narrative belongs — everywhere else, per Section 15's governance, the product's own evidence does the persuading, not a story about the company)
- **Company overview** — factual: what kind of company this is, where it operates, how it's structured, to the extent that's normally public
- **Karriär** (Careers) — marked future, same discipline as Kundframgång: not published until there's real hiring content, not a placeholder page pointing at nothing
- **Press** — marked future, same discipline: populated only once there's something real to put there (press mentions, a press-kit, contact details for journalists)

**What this page must not become:** a second Home page. No scroll-story pacing, no product screenshots, no restatement of the Business Transformation narrative, no CTA pressure. If a future draft of this page starts to read like marketing copy, that is the signal it has drifted from its actual job.

---

## 18. Solutions — Naming Review and Recommendation

**Finding: "Solutions" should be replaced.** It was flagged for review because it's the single most generic word in B2B SaaS navigation — nearly every competitor researched across this entire program uses it, and it was already the specific failure mode this program has spent its whole history rejecting: generic category language standing in for a specific claim. Keeping it here would quietly reintroduce the exact problem the rest of this site has been built to avoid.

**Options considered:**
- *Use Cases* — rejected. Equally generic, and reads as technical/product-centric ("here's a list of things the software can be used for") rather than situational — closer to a feature list wearing a different label than a genuine business-situation framing.
- *Growing Your Driving School* — rejected as the page's *name*, though the phrase is good raw material. It implies the page only serves schools actively trying to grow, but one of the four situations this page organizes around (a school still running on spreadsheets) isn't a growth story — it's a modernization story. Naming the page after one situation would misrepresent the other three.
- ***Business Challenges*** — **recommended.** It does two things the others don't: it continues the emotional thread Scene 2 already established (naming the visitor's actual situation specifically, before pitching anything — Problem Recognition's whole method, now extended into a dedicated page), and it stays genuinely organized around a *situation* rather than a *capability list*, which is the one hard requirement this page has always had.

**Swedish on-site label:** a literal translation ("Affärsutmaningar") is workable but slightly stiff; **"Er situation"** ("Your situation") is worth strong consideration as the on-site Swedish label even though "Business Challenges" is the clearer internal/strategic name for this document — it's warmer, more personal, and matches the direct-address register already used in approved copy elsewhere (e.g., "Vi hör av oss inom en arbetsdag"). This is a copywriting decision to finalize at implementation time, not a structural one — either label sits on the same page, organized the same way.

**What does not change:** the underlying organizing principle from v4 — this page groups content by the *situation a school is in* (still running on spreadsheets, multi-location, actively growing, serving corporate/B2B contracts), never by internal job role or by software module. That requirement, not the page's name, was always the one that mattered structurally.

---

## 19. Customer Success — Reserved, Not Built

**Confirmed: no testimonials are published anywhere on the site.** This holds a line established in the very first approved strategy document in this entire program and is not being reconsidered here.

**How it already fits without requiring structural change, when it's ready:** this was, in fact, already solved when the Resources architecture was built (Section 12) — Kundframgång already has an assigned category (**Proof**, currently marked *Future*), an assigned position in the Resources hub, and an assigned audience/journey mapping (Prospective Customer, late-stage, social proof) in that section's table. Nothing about the site's structure needs to be redesigned to eventually publish it — the only two things that change on the day it's ready are:

1. Real content is written (real customer outcomes, with real permission to publish them — never composited, never anonymized-but-implied-real, per the honesty discipline that has governed every claim on this site).
2. The Kundframgång item is added to the Resources navigation, exactly where its table row already places it.

No page is renamed, no category is restructured, no other Resources content needs to move. This is precisely what "reserved" should mean: a known, already-designed slot, empty until there's something honest to put in it.

---

## 20. Final Public Website Sitemap

```
trafikskolaos.se
│
├── Home                          (the approved 10-scene landing page — the site's one narrative, persuasive surface)
│
├── Platform                      (structured, non-narrative product depth — for sharing internally / re-reading)
│
├── Business Challenges           (formerly "Solutions" — organized by school situation, not role or module)
│
├── Onboarding                    (full switching-cost/process depth — serves both late Prospective and New Customer)
│
├── About TrafikskolaOS           (new — company credibility, not marketing; Careers and Press reserved, future)
│
├── Resurser (Resources)          (self-serve trust-building, never a pitch)
│   ├── Migreringsguide
│   ├── FAQ
│   ├── Säkerhet
│   ├── Svensk regelefterlevnad
│   ├── Dokumentation
│   ├── Versionsnyheter
│   └── Kundframgång              (reserved — not published until real content exists)
│
├── Support                       (existing-customer help, strictly separate from sales)
│   ├── Kontakta support
│   ├── Hjälpcenter
│   ├── Komma igång
│   ├── Felsökning
│   ├── Utbildning
│   └── Produktuppdateringar
│
├── Kontakt                       (catch-all for inquiries that fit no other path)
│
├── Boka en personlig visning     (the one true conversion action, reachable from persistent navigation and Home's Scene 7)
│
├── Kundinloggning                (direct, zero-marketing entry for Existing Customers)
│
└── Platform Login                (footer only — internal, low-visibility, Platform Administrators)
```

**Relationships worth stating explicitly, since they're easy to lose in a flat list:**
- **Home** is the only page that tells the full narrative arc; every other page exists because a specific visitor question (Section 14's journeys) needs an answer Home's restrained scroll-story deliberately doesn't stop to give.
- **Platform**, **Business Challenges**, and **Onboarding** are all, in different ways, *expansions* of scenes that already exist on Home (System Reveal/Proof, Business Transformation, Onboarding Journey respectively) — none of them introduce a claim Home doesn't already make; they go deeper on one already-made claim each.
- **About TrafikskolaOS** is the one page on the site that isn't trying to prove the product is good — it's the only page whose job is proving the *company* is real, separate from every other page's product-focused argument.
- **Resources** and **Support** are both self-serve and both non-narrative, but serve opposite ends of the relationship — Resources exists before a visitor is a customer; Support exists only because they already are one.
- **Boka en personlig visning**, **Kundinloggning**, and **Platform Login** remain the site's only three *functional* (non-narrative, non-educational) destinations — everything else on this sitemap exists to inform, reassure, or build trust; these three exist to let someone actually do the thing they came to do.

---

## 21. Approval Gate — Final

1. Confirm **About TrafikskolaOS** as a new page, with the explicit constraint that it must not become a second marketing surface (Section 17).
2. Confirm **"Business Challenges"** as the replacement for "Solutions" (Section 18), with the Swedish on-site label ("Er situation" vs. a literal translation) left open for the copywriting stage.
3. Confirm **Kundframgång remains reserved** — no testimonials, no placeholder page, structure already accommodates it without future rework (Section 19).
4. Confirm the **Final Public Website Sitemap** (Section 20) as the complete, final public website blueprint.

This is presented as the final structural document in this strategy line. No code, UI, or page mockups have been produced to create it.
