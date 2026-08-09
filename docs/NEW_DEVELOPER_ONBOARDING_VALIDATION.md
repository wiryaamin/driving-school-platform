# New Developer Onboarding Validation

**Document type:** Onboarding experience audit — simulated first-day walkthrough with no prior project knowledge.
**Produced by:** Sprint 4E — Environment Setup Validation Exercise.
**Method:** Read the repository exactly as a brand-new engineer would (root directory first, then whatever a normal person clicks into next), cross-checked every quantitative claim against the actual repository state rather than trusting the document, and traced conflicting instructions to ground truth. No architecture, business logic, or working code was changed — this document is the only deliverable.

---

## 1. Environment Setup Validation Report

| Step | Documented? | Validated this sprint | Result |
|---|---|---|---|
| Node ≥ 20, pnpm ≥ 9 | ✅ `DEPLOY.md` Prerequisites table, `package.json` `engines` field | Cross-checked, consistent | Pass |
| `pnpm install` | ✅ | Already proven clean this session (Sprints 4/4A/4D) | Pass |
| `pnpm typecheck` | ✅ | 9/9 packages clean, re-confirmed multiple times this session | Pass |
| `pnpm lint` | ✅ | 0 errors, 67 pre-existing warnings (documented baseline) | Pass |
| `pnpm build` | ✅ | Clean, re-confirmed multiple times this session | Pass |
| Auth hook secret generation | ✅ `DEPLOY.md` Step 2, with a **correctly prominent** warning about the `v1,whsec_` prefix requirement (this exact mistake was a real, documented footgun earlier in this project's history — the warning earns its prominence) | N/A (secret already live) | Pass |
| Hosted vs. local Supabase | ✅ Both `DEPLOY.md` and `local-development.md` correctly and consistently frame local Docker as optional-only | Read both in full | Pass — see Section 5 for a corrected initial hypothesis |
| Migration count claim | ⚠️ `DEPLOY.md` states "139 migrations" | **Actual count: 224 files** in `supabase/migrations/` | **Fail — stale, quantified drift** |
| Demo seed data | ⚠️ `local-development.md` walks through 3 of 11 seed files | `supabase/seed/` actually contains 11 files | **Fail — under-documented** |
| Bootstrap script path | ✅ `supabase/seed/bootstrap_org_admin.sql` | File exists at the documented path | Pass |

**No step in the documented path is actually broken.** Everything that's wrong here is a documentation-accuracy problem (stale numbers, under-explained files), not a build/setup defect — a new developer following the hosted-project path (the one CLAUDE.md and both setup docs actually recommend) would successfully get a working environment. The friction is real but not fatal.

---

## 2. Missing Documentation Report

- **No root `README.md` exists at all.** This is the single most significant finding of this sprint. `CLAUDE.md` (AI agent instructions) and `BASELINE_v1.md` (a 58 KB technical snapshot) sit at the root instead — neither is written for "I just cloned this, what is it and how do I start." A human engineer landing on this repository for the first time has no canonical entry point.
- **No index or reading-order guide for `docs/`** (50 markdown files, flat, no ordering signal). A newcomer cannot tell `PILOT.md` (confirmed stale this engagement — still describes the Student Portal as "not yet built") from `PLATFORM_FOUNDATION_CLOSURE.md` (current, authoritative) without reading enough of each to notice the contradiction themselves.
- **Demo seed files are 73% undocumented.** `local-development.md` explains `bootstrap_org_admin.sql`, `demo_data.sql`, `demo_continuity.sql`. It says nothing about `demo_full_data.sql`, `demo_schedule.sql`, `demo_schedule_slots.sql`, `demo_sprint_1_10.sql`, `quiz_questions.sql`, `seed_demo_slots_now.sql`, `seed_lesson_types.sql`, or `bootstrap_platform_admin.sql` — a newcomer has no way to know which of these are current, superseded, or required.
- **No "who do I ask" / escalation note anywhere** — consistent with this sprint's own premise (assume nobody is available), but worth naming explicitly: the documentation set doesn't even acknowledge this as a real onboarding condition anywhere, e.g. with a "if you're stuck, check X first" pointer.

---

## 3. Configuration Gap Report

| Area | Documented? | Notes |
|---|---|---|
| Supabase (hosted) | ✅ Clear, complete, correct | `DEPLOY.md`, `.env.example` |
| Supabase (local Docker) | ✅ Clear, correctly marked optional | `local-development.md`, `supabase/config.toml` |
| Auth Hook | ✅ Clear, with a well-placed critical-mistake warning | — |
| SMTP | ✅ Extensively documented this engagement (`INTEGRATION_CONFIGURATION_GUIDE.md` §4.2, `operational-runbook.md` §13) — but genuinely **not yet operationally configured** (a real, disclosed gap carried from earlier sprints, not a documentation gap) | — |
| BankID | ✅ Documented as intentionally not configured (`VITE_FEATURE_BANKID=false`), consistent everywhere checked | Not a gap — correctly represented as future work |
| Stripe | ✅ `INTEGRATION_CONFIGURATION_GUIDE.md` §4.3 covers webhook setup | Not independently re-verified this sprint (out of this sprint's live-check scope) |
| Storage | Not separately audited this sprint | No evidence of a gap found, but also no dedicated check performed |
| Authentication / Authorization | ✅ Thoroughly documented (`AUTHENTICATION_ARCHITECTURE.md`), current as of this engagement | Pass |
| Monitoring (Sentry) | ✅ Documented as inert-by-default, correctly | Consistent with `PHASE_2_HANDOVER.md`'s finding — an operational gap, not a doc gap |
| Environment variables | ✅ `ENVIRONMENT_VARIABLE_REFERENCE.md`, `.env.example` files are clear and match each other | Pass |
| Secrets | ✅ `SECRETS_MANAGEMENT_GUIDE.md` | Pass |

**A new developer could configure every area above without asking a question**, except two things that aren't documentation problems: SMTP isn't actually turned on yet (operational, already tracked), and the demo-seed-file ambiguity (Section 2) would produce a "which one do I actually run" pause.

---

## 4. Onboarding Improvement Recommendations

1. **Write a root `README.md`.** Minimum viable content: one paragraph on what the platform is, a link to `CLAUDE.md` for AI-agent conventions, a link to `DEPLOY.md` for human setup, and the three commands (`pnpm install`, `pnpm typecheck`, `pnpm --filter @platform/web dev`) that get someone to a running app fastest. This is the highest-leverage single fix available.
2. **Add a one-page `docs/README.md` index** grouping the 50 files by purpose (architecture reference / operational runbook / historical sprint record) and explicitly marking known-superseded documents rather than leaving a newcomer to discover staleness by contradiction.
3. **Correct or remove the "139 migrations" claim** in `DEPLOY.md` — either state the real count at time of writing with a "check `ls supabase/migrations | wc -l` for the current number" caveat, or drop the specific number entirely and just describe the mechanism.
4. **Document (or prune) the 8 unexplained seed files** in `supabase/seed/` — at minimum, one line per file in `local-development.md` stating whether it's current, superseded, or sprint-specific historical data.
5. **Remove the two tracked PDFs from the repository** (`Multi-Tenant SaaS Development.pdf`, `Vagmarken.pdf`, ~7.2 MB combined) if they're not actively referenced by any documentation — a `git log`/`grep` check found no doc pointing to either. If they are meaningful reference material, move them somewhere linked from a doc rather than sitting unexplained at repo root; either way, their current placement adds clone weight with zero onboarding signal.

None of these require touching architecture, business logic, or working code — all are pure documentation/repository-hygiene changes, consistent with this sprint's constraints.

---

## 5. Repository Readiness Assessment

**Corrected finding, worth stating plainly:** my working hypothesis going into this sprint — that `local-development.md` and `DEPLOY.md` might actively contradict `CLAUDE.md`'s hosted-only guidance — turned out to be **wrong**. Both documents open with a clear, consistent, correctly-worded disclaimer that the local Docker path is optional and hosted is the real workflow. This is good, deliberate documentation, not an accidental gap — worth recording so this doesn't get "fixed" by someone who only skims the surface finding without reading what's actually there.

What's genuinely true: the software setup path is sound and validated; the documentation *entry point* is missing (no README); and two specific factual claims within otherwise-good documents have drifted from reality (migration count, seed file coverage).

---

## 6. New Developer Experience Review

**Estimated time required:** 2–4 hours to a running local app connected to the hosted project, *for someone who happens to start by opening `CLAUDE.md`* (the only document that actually functions as an entry point today). Add 30–60 minutes of avoidable confusion for someone who instead starts by browsing `docs/` first and encounters `PILOT.md`'s stale claims or the unexplained seed-file list before finding the documents that would resolve their confusion.

**Difficulty:** Low-to-Moderate. Every individual document, once found, is well-written and accurate (with the two specific exceptions above). The difficulty is entirely in *finding the right document first* — a navigation problem, not a comprehension problem.

**Biggest pain point:** No root README. Everything else in this report is secondary to this one gap.

**Most confusing area:** The seed-data directory — 11 files, 3 explained, no visible ordering or superseded-status signal.

**Biggest risk:** A new developer follows `docs/PILOT.md` at face value (it reads as an authoritative checklist) and makes decisions based on its stale "Student Portal not yet built" / feature-flag table without realizing three sprints of this engagement have already superseded parts of it.

**Most likely setup failure:** Not a build failure — the build path is solid. The most likely failure mode is a new developer accidentally starting the local Docker stack (`supabase start`) for what they believe is "the real project," working against it for a while, and being confused when nothing they see matches what colleagues describe (because colleagues are working against the hosted project with 42 real organizations, not the empty local stack). Both `local-development.md` and `DEPLOY.md` warn against exactly this — but only if the newcomer reads the warning, which requires already being in the right document.

---

## 7. Final Recommendation

**🟡 Repository Ready After Documentation Improvements**

Not 🔴 — the underlying software, build process, and configuration are genuinely sound; every documented setup step that was checked actually works, and the local-vs-hosted guidance, once found, is correct and unambiguous. Not 🟢 — a new developer's very first experience with this repository is a directory listing with no README and 50 undifferentiated docs, which is a real, high-friction, easily-fixed gap that shouldn't be waved through as "ready." Recommend the five items in Section 4 — starting with the root README — before onboarding is treated as a solved problem. None of it touches the frozen Platform Foundation or requires reopening any architecture decision.
