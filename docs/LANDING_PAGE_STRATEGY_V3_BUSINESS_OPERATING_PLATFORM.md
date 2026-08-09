# TrafikskolaOS — Landing Page Strategy v3: Business Operating Platform

**Document type:** Strategy revision — supersedes v2's persona and scene-structure recommendations where they conflict. Becomes the implementation blueprint for all further landing page work.
**Status:** Draft — awaiting approval. No code, no UI, no copy has been implemented from this document.
**Preserves, unchanged:** the "Quiet Authority" visual system in full — type scale, single accent color, spacing rhythm, hairline-frame screenshot treatment, animation restraint, no feature grids, no fabricated proof. This document is narrative and structural strategy only.

---

## 1. What Changes From v2, and Why

v2 corrected an under-claiming problem: the page described modules when it should have described a platform. That correction stands. This revision goes further and corrects a **audience** problem: the page (as strategized through v2) still spoke to multiple internal roles — owner, operations, finance, instructor — as if each were a buyer. They are not. **Only the owner or decision-maker buys software.** Instructors, receptionists, and accountants are people who *use* what the owner *chose*. Marketing to them on the page that's supposed to convert the buyer dilutes the one conversation that actually matters and reintroduces the "collection of departments" read that v2 was trying to eliminate in the first place.

The second correction is structural: this project has, until now, treated "the landing page" as the entire scope. It isn't. A driving school owner doesn't experience TrafikskolaOS as a page — they experience it as a **relationship**: discovery, a demo, a decision, an onboarding process with real people involved, and then years of daily use. The page has said almost nothing about that journey. This revision adds it, explicitly, as a first-class part of the story — not as a footnote.

---

## 2. Audience Redefinition

**The landing page is written for one audience: the driving school owner or decision-maker.** Every headline, every scene, every claim is evaluated against one question: *does this help an owner decide to book a demo?* If a piece of content's real audience is an instructor, a receptionist, or a bookkeeper rather than the person who signs the contract, it does not belong on this page.

**What this removes:** the approved Creative Blueprint's Scene 5 ("Roles" — a role-switch interaction showing an owner view, an ops view, a finance view, and an instructor view as if addressing each viewer directly) is retired as an independent scene. It was designed to answer "what does this look like for someone like me," which is the right question only when the visitor *is* that role. On this page, the visitor is always the owner. The underlying proof it offered (the product genuinely works for the whole team) is not lost — it is folded into the Business Transformation narrative (Section 6) as a fact the *owner* needs to hear ("your team adopts this without a fight"), not as a pitch aimed at the team members themselves.

**What this does not remove:** screenshots of different parts of the product (a schedule, a ledger, a mobile view) remain valuable proof — but every one of them is now framed as evidence *for the owner* ("here is what your operation looks like once it's running on this"), never as a second audience being addressed directly.

---

## 3. Three User Journeys

The page must now account for three distinct journeys, not one undifferentiated "visitor":

### Journey A — Prospective Driving School
A school not yet using TrafikskolaOS, likely running on fragmented tools, arriving with skepticism. This is the journey the entire scene sequence (Hero through Call to Action) is built for. Everything in Sections 5–9 below is written for this journey.

### Journey B — New Customer (Onboarding)
A school that has already decided to buy and is now moving through setup. This journey does not happen primarily *on* the marketing page — it happens through direct contact, guided setup, and the product itself. But the marketing page has one job for this journey: **set accurate expectations before the contract is signed**, so nothing in onboarding feels like a surprise. This is why the new Onboarding Journey section (Section 7) exists — it is shown to Journey A visitors *before* they convert, specifically so Journey B never begins with uncertainty.

### Journey C — Existing Customer
A school already running on TrafikskolaOS, returning to the marketing site rarely — mainly to reach a support resource or to log in. This journey's entire need from the marketing page is **one clearly-labeled, fast path back into the product** (Section 4) — nothing narrative, nothing persuasive. An existing customer seeing hero copy and a module map every time they need to log in is a design failure, not a feature.

**Why this matters structurally:** the current page (and every prior version of this strategy) implicitly assumed one journey. Explicitly naming three means the page's navigation, not just its scrolling story, has to do real work — which is the subject of Section 4.

---

## 4. Entry Points (Replaces the Undefined "Login Strategy")

No prior version of this strategy specified what a returning or converting visitor actually clicks. That gap is closed here. The page's navigation (a simple top bar, not yet designed) carries exactly three entry points, each serving exactly one journey:

| Entry point | Serves | Behavior |
|---|---|---|
| **Boka en visning** (Book a Demo) | Journey A | The page's one true conversion action — already Scene 7's approved primary CTA, now also mirrored in the navigation itself so it's reachable from anywhere on the page, not only at the bottom. |
| **Kundinloggning** (Customer Login) | Journey C | A direct, unadorned link into the real product's authenticated sign-in. No marketing copy, no interstitial — a school that already pays for this should never have to scroll past a pitch to reach their own schedule. |
| **Platform Login** (internal use — platform administration only) | Not a customer journey at all | Included for completeness, not prominence. This is TrafikskolaOS's own operating team accessing platform administration — it should be present (e.g., a small, unemphasized footer link) but never positioned with equal visual weight to the two customer-facing entry points. It is not part of the buyer's or customer's experience and should not compete with either. |

**Design note (non-visual, structural only):** this means the page needs a minimal persistent navigation element it did not previously have — the three scenes built so far (Hero, Problem Recognition, System Reveal) currently have no header at all. This is flagged as a real, necessary addition for a future implementation sprint, not specified further here (no UI decisions are made in this document).

---

## 5. Messaging Shift: Outcomes, Not Features, Now Applied at the Platform Level

v2 already established a features-to-outcomes translation principle (retained in full — see v2 Section 4). v3 extends it one level up: the page should stop being organized around *what the product contains* (modules, even reframed as outcomes) and instead be organized around **what kind of business the owner is running before versus after.** This is a shift from "here is what changes" to "here is who you become" — from operator of a fragmented set of tools to operator of one connected business.

Concretely: every scene's copy should be answerable from the position of an owner describing their *business*, not their *software*. "We used to lose track of who owed what" is a business-outcome sentence. "Our invoicing module tracks receivables" is a feature sentence. The former is the standard; the latter should not appear anywhere on the page.

---

## 6. Business Transformation Section (New)

Previously, the "before/after" narrative (fragmented tools → one platform) existed only as *creative-direction grounding* — explicitly, in the original Creative Blueprint, "not a section to be built literally." This revision reverses that decision: **it becomes a real, dedicated section**, positioned after the Proof scene (Swedish Compliance & Accounting) and before the new Onboarding Journey section.

**Purpose:** make the transformation concrete and specific, in the owner's own operational terms, rather than leaving it implicit across other scenes.

**Content shape (narrative, not visual):**
- **Before**: a short, specific composite picture of a school's day on fragmented tools — checking three places to understand the business, a cancellation triggering phone calls instead of a system update, a VAT deadline handled as a fire drill, an instructor working from a schedule that might already be out of date. (This composite already exists, nearly verbatim, in the approved Messaging Strategy's Phase 7 — it is being promoted from background grounding to actual on-page content, not invented fresh.)
- **After**: the same day, one system — one dashboard for the whole business, a cancellation that resolves itself, VAT handled continuously rather than at deadline, a schedule that's always current because it's the only one that exists.
- **The team, mentioned once, briefly, from the owner's point of view**: this is where the retired Roles scene's real value is preserved — a single line acknowledging that operations, finance, and instructors all work from the same system now, offered as reassurance to the owner ("your team adopts this without friction"), not as a pitch to those roles directly.

**Tone constraint:** this section must not become a literal two-column before/after comparison table or a dramatized "pain point" list — that would violate the restraint principle the whole design system is built on (Final Design Direction, Part 3: "whitespace-as-confidence," "no hype"). It should read as one calm, specific paragraph-equivalent of copy, in keeping with every other scene's economy of language.

---

## 7. Onboarding Journey Section (New)

**Purpose:** remove the single largest unaddressed objection on the page — *"even if I believe this is better, how hard is it to actually switch?"* No prior version of this strategy answered that question anywhere on the page.

**Position:** immediately after the Business Transformation section, immediately before Security & Architecture. This ordering is deliberate: the visitor has just been convinced the destination is worth reaching (Business Transformation) and is about to be reassured their data is safe (Security) — the journey between those two beats is exactly when "how do I get there" becomes the visitor's live question.

**Content — the full journey, shown plainly:**

```
Besökare (Visitor)
  → Demo (Boka en visning)
  → Discovery (behovsgenomgång)
  → Prenumeration (avtal tecknas)
  → Tenant-etablering (er isolerade miljö skapas)
  → Organisationsuppsättning (verksamhet, platser, roller)
  → Datamigrering (befintliga elever, scheman, bokföring)
  → Personalutbildning
  → Go Live
  → Kundinloggning
```

**Shared responsibility — the part that actually builds trust:** for each stage from Prenumeration onward, the copy states plainly **who does what** — not as a legal/contractual document, but as a plain-language reassurance that the owner is not doing this alone:

| Stage | TrafikskolaOS's responsibility | Driving school's responsibility |
|---|---|---|
| Tenant-etablering | Provisions the isolated environment, applies the school's configuration | Confirms organizational details (locations, legal/registration info) |
| Organisationsuppsättning | Configures roles, permissions, and location structure | Decides who holds which role, provides staff details |
| Datamigrering | Performs or guides the technical import of existing records | Provides the source data (student lists, schedules, historical bookkeeping) |
| Personalutbildning | Runs guided training sessions for staff | Ensures staff attend and adopt the new system |
| Go Live | Provides support during the transition window | Runs the business on the new system from day one |

**Why this section exists at all, given the design system's restraint principle:** this is the one place on the page where a small amount of structured, list-like content is justified — not because restraint is being abandoned, but because *removing switching-cost anxiety* is a distinct, necessary job no other scene does, and doing it vaguely ("we'll help you migrate!") would be less trustworthy than doing it plainly. It should still be typeset within the existing five-size scale and single-accent-color system — no new visual language, no icon set, no card grid. A simple, linear, calmly-presented sequence is sufcient and appropriate.

---

## 8. Swedish Compliance as Competitive Advantage (Expanded)

v2 already recommended broadening Scene 4's compliance claims beyond the BAS/VAT/SIE4/AGI checklist to include the audit-traceable ledger and Fortnox integration (retained in full). This revision adds one more, real, grounded claim:

- **Personnummer handling, done correctly.** The platform stores personnummer encrypted, with only the last four digits ever displayed, and GDPR-compliant handling throughout (confirmed in the production schema — this is not aspirational). For a Swedish business owner, correct handling of personnummer is not a nice-to-have — mishandling it is a genuine legal and reputational risk. Stating plainly that this is done correctly is a real, checkable trust signal, not a technical detail — it belongs in the same breath as BAS/VAT/SIE4/AGI, not as a footnote.

**Reframing principle:** Scene 4 should stop reading as "a list of standards we comply with" and start reading as **"we were built by people who understand Swedish driving-school administration from the inside — compliance is a side effect of that, not the headline."** The standards (BAS 2020, VAT periods, SIE export, AGI, personnummer) are the *evidence* for that claim, not the claim itself.

---

## 9. Revised Call to Action

The approved Scene 7 CTA ("Boka en visning" / "Vi hör av oss inom en arbetsdag") remains structurally correct — one clear ask, low pressure, honest response-time promise. This revision adds substance behind the ask, directly informed by the new Onboarding Journey section immediately preceding it: the CTA's supporting copy should now explicitly reassure the visitor that booking a demo is the *start of a guided process*, not a sales call followed by silence.

**What the revised CTA should communicate** (content direction, not final copy): the decision to switch is not a leap into the unknown — migration is assisted, staff training is included, and the relationship continues after go-live rather than ending at the sale. This directly answers the emotional state a visitor is in immediately after reading the Onboarding Journey section: reassured about *process*, now needing reassurance about *commitment*. "We hear back within one business day" (already approved) remains the concrete, checkable promise; the new addition is the implicit promise that what follows that first reply is a real, supported process, not a transaction.

---

## 10. Revised Scene Structure (Supersedes the Original Eight-Scene Blueprint)

| # | Scene | Status vs. original Blueprint |
|---|---|---|
| 1 | Hero | Unchanged |
| 2 | Problem Recognition | Unchanged |
| 3 | System Reveal | Unchanged (per v2: diagram kept, copy reframed toward consequence, further reinforced now as "operating platform," not "modules") |
| 4 | Proof: Swedish Compliance & Accounting | Expanded (v2's ledger/Fortnox additions, plus v3's personnummer addition; reframed per Section 8 above) |
| 5 | ~~Roles~~ | **Retired as an independent scene.** Its trust value is preserved as one line inside the new Business Transformation section (Section 6), not as a standalone persona showcase |
| 6 | Business Transformation *(new)* | Promoted from implicit grounding to a real section — Section 6 above |
| 7 | Onboarding Journey *(new)* | Entirely new — Section 7 above |
| 8 | Security & Architecture | Unchanged (v2's audit-trail addition retained) |
| 9 | Call to Action | Unchanged structurally; supporting copy substance expanded per Section 9 above |
| 10 | Quiet Close / Footer | Unchanged, now also carries the Customer Login and Platform Login entry points (Section 4) |

Net effect: eight scenes becomes ten — one retired, two added. This is a deliberate departure from the original Blueprint's "eight, never nine" discipline, justified specifically because the two additions each answer a real, previously-unaddressed buyer question (Section 6: "is this actually better than what I have," made concrete; Section 7: "how hard is switching") rather than adding decoration or repetition. Nothing here reopens the door to feature grids, testimonials, or pricing — those remain excluded for the same reasons recorded originally.

---

## 11. What Does Not Change

- The "Quiet Authority" visual system in its entirety: type scale, one accent color, spacing rhythm, hairline-frame screenshots, restrained motion.
- The three already-built scenes' visual treatment (Hero, Problem Recognition, System Reveal) — only System Reveal's two lines of copy are still pending revision, per v2, now further reinforced by this document's framing.
- The prohibition on feature grids, icon walls, testimonials, and pricing tables.
- The rule that all proof must be real and checkable — the Onboarding Journey's shared-responsibility table describes the platform's actual, real onboarding process, not an idealized or invented one; if the real process differs from what's described here, the copy must be corrected to match reality, not the reverse.

---

## 12. Approval Gate

Before any implementation resumes:

1. Confirm retiring the Roles scene (Section 2) is acceptable — this is the most consequential single change in this document.
2. Confirm the Business Transformation and Onboarding Journey sections (Sections 6–7) as new, permanent additions to the scene sequence.
3. Confirm the three-entry-point navigation concept (Section 4) — noting it requires a header/navigation element that does not yet exist in any built scene.
4. Confirm personnummer handling (Section 8) as an approved claim.

No code, UI, or copy has been changed to produce this document.
