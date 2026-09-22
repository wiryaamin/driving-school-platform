# Trafikcloud Collaboration Rules

## Protected baseline
trafikcloud-freeze-2026-09-01

Commit:
7286c59001e695f63d1783acd31e2daaa5ee5380

Mirrored on branch:
freeze/trafikcloud-2026-09-01

This is the immutable recovery point. It must never be moved, force-updated,
deleted, or rebased.

## Integration branch
feature/platform-managed-integrations

This is the controlled integration branch. All completed work merges here.
Do not force-push, rebase, squash, reset, rename, or delete it.

## Developer branches
Each developer works on a separate feature branch, created from
`feature/platform-managed-integrations` (never from `main`, never from the
freeze branch/tag).

**No developer branch exists yet.** A branch for the incoming colleague will
be created FROM the current tip of `feature/platform-managed-integrations`
only after collaboration protection/readiness (this document, plus the
manual GitHub branch-protection settings below) is confirmed complete. An
earlier `feature/colleague-development` branch was created prematurely
(before this documentation existed) and has been deleted — it contained no
unique work, since it was cut from an intermediate point on the same
integration branch. The real starting branch will be cut fresh once
readiness is confirmed.

Example naming for future developer branches:

feature/colleague-<description>

## Pull Requests
All colleague work must return through Pull Request review before being
merged into the integration branch.

## Forbidden
Do not:

- force-push
- rebase shared integration history
- delete protected branches
- modify the freeze tag
- work directly on the freeze branch
- deploy directly from a feature branch

## Database
No direct production SQL.

All schema changes use migration files, reviewed before production
application.

## Production
No direct production deployment by a colleague.

Production deployment occurs only after:
development → review → validation → explicit approval → deployment.

## Credentials
Repository access does NOT include:

- Hostinger FTP credentials
- production Supabase CLI credentials
- production secrets

These remain separately controlled. Git repository access is not the same
thing as production deployment access.

---

## Default branch warning

The repository's GitHub default branch is `main`, and it is currently
**204 commits behind** `feature/platform-managed-integrations` (last updated
2026-06-15). A plain `git clone` or a PR opened against the GitHub default
will land on this stale branch. A change of the GitHub default branch to
`feature/platform-managed-integrations` was attempted as part of collaboration
readiness work but could not be carried out — no authenticated GitHub admin
access (no `gh` CLI, no GitHub API token) has been available in any session
so far. This remains a manual action for whoever holds GitHub admin rights
on the repository (GitHub → Settings → General → Default branch).

NEW DEVELOPERS MUST START FROM
feature/platform-managed-integrations

NOT main.

Do not merge `main` into the integration branch. Do not rebase the
integration branch onto `main`. Cleaning up `main` is a separate, deliberate
task, not something to do incidentally while onboarding a collaborator.

---

## GitHub branch protection

**Current status:** not verified. This environment has no GitHub CLI and no
authenticated GitHub API access, and GitHub's branch-protection endpoints
return 401 without one. Given there is also no `.github/workflows` directory
in the repository (no CI configured at all), it should be assumed **no
protection rule currently exists** on `feature/platform-managed-integrations`
until confirmed otherwise in the GitHub UI.

**Manual settings to apply** (GitHub → Settings → Branches → Add rule, target
`feature/platform-managed-integrations`):

- Require a Pull Request before merging
- Require at least one approving review
- Prevent force pushes
- Prevent branch deletion
- Require successful CI checks (once CI exists — see below)
- Restrict who can push directly to the branch

## CI

There is currently no `.github/workflows` directory — no CI runs today.
Not being created as part of this task.

**Future recommendation:** a Pull Request workflow that runs, at minimum:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- test suite (once one exists at meaningful coverage)

on every PR into `feature/platform-managed-integrations`, wired as a required
status check once branch protection is enabled.

## Production deployment mechanism

Deployment is currently fully manual and is not changing as part of this
task:

- **Frontend:** `pnpm build` → `apps/web/dist/` → FTP upload to Hostinger
  (`trafikcloud.se`).
- **Backend:** `supabase functions deploy` / `supabase db push --linked`
  against the linked hosted Supabase project, run from an authenticated
  local machine.

Git repository access ≠ production deployment access. Deploying requires
separately-held Hostinger FTP credentials and an authenticated Supabase CLI
session for the production project — neither is stored in this repository,
and neither should be shared with a new collaborator as part of granting
them repo/branch access.

## Supabase / database

The repository is linked to the production Supabase project
(`ulgsndzfksphquqakelq`). A collaborator should not be given the means to:

- change the linked project
- change production credentials/secrets
- run migrations directly against production
- deploy Edge Functions directly
- execute ad-hoc SQL against production

All schema changes must be expressed as new migration files under
`supabase/migrations/` (append-only — never edit a historical migration),
reviewed through the normal PR process, and applied to production only as a
separate, deliberate step by whoever holds that access.

## Old Claude worktree (stale local tooling residue)

`.claude/worktrees/agent-a69876ba5df3d52ae` is a leftover local worktree from
an earlier automated session. It contains untracked files
(`apps/web/src/modules/data-migration/`, `supabase/functions/data-migration/`,
one migration file) that were verified during the pre-collaboration audit to
be exact duplicates of content already committed on the integration branch.
It is not part of the collaboration model, was not modified, and does not
need to be given to a new developer. Left in place; cleanup is a separate,
explicit task if ever wanted.

## Other stale local branches

The following local branches are historical ancestors of
`feature/platform-managed-integrations` (already fully contained in its
history) and are not part of the active collaboration workflow. They are not
being deleted as part of this task:

- `development/platform-maturity-v2`
- `release/pr-2-error-schema-standardization`
- `ui/modernization-v2`
- `worktree-agent-a69876ba5df3d52ae`
