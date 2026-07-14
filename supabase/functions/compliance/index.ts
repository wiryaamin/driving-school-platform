/**
 * compliance — Swedish compliance & regulatory reporting infrastructure.
 *
 * Routes:
 *   GET  /compliance/events                          — compliance events (recent)
 *   GET  /compliance/agi/submissions                 — AGI submissions list
 *   POST /compliance/agi/generate                    — generate AGI submission
 *   POST /compliance/agi/certify/:submission_id      — certify AGI submission
 *   POST /compliance/agi/correct/:submission_id      — create AGI correction
 *   GET  /compliance/vat/declarations                — VAT declarations list
 *   POST /compliance/vat/generate                    — generate VAT declaration
 *   POST /compliance/vat/certify/:declaration_id     — certify VAT declaration
 *   POST /compliance/vat/correct/:declaration_id     — create VAT correction
 *   POST /compliance/saft/generate                   — generate SAF-T export
 *   GET  /compliance/saft/exports                    — SAF-T exports list
 *   POST /compliance/filings/validate                — validate filing replay hash
 *   GET  /compliance/retention/policies              — retention policies
 *   POST /compliance/retention/enforce               — enforce retention policy
 *   GET  /compliance/hashes                          — regulatory export hashes
 *   POST /compliance/payload/build                   — build canonical entity payload (Phase 5A.2)
 *   GET  /compliance/validate/serialization          — run canonical serialization validation suite (Phase 5A.3)
 *   POST /compliance/certifications/certify          — certify_regulatory_filing (Phase 5B)
 *   POST /compliance/certifications/certificate      — generate_filing_certificate (Phase 5B)
 *   POST /compliance/certifications/verify           — verify_filing_certificate (Phase 5B)
 *   GET  /compliance/certifications                  — list regulatory_certifications (Phase 5B)
 *   POST /compliance/evidence/build                  — build_regulatory_evidence_package (Phase 5B)
 *   GET  /compliance/evidence                        — list regulatory_evidence_packages (Phase 5B)
 *   POST /compliance/lineage/verify                  — verify_export_lineage (Phase 5B)
 *   GET  /compliance/lineage                         — list export_lineage_records (Phase 5B)
 *   POST /compliance/replay/certify                  — generate_replay_certificate (Phase 5B)
 *   GET  /compliance/validate/phase5b               — run Phase 5B validation suite (Phase 5B)
 *   POST /compliance/signatures/sign                — sign_regulatory_certificate (Phase 5C)
 *   POST /compliance/signatures/verify              — verify_certificate_signature (Phase 5C)
 *   GET  /compliance/signatures                     — list certificate_signatures (Phase 5C)
 *   GET  /compliance/keys                           — list signing_key_registry (Phase 5C)
 *   POST /compliance/receipts/register              — register_authority_receipt (Phase 5C)
 *   POST /compliance/receipts/verify                — verify_authority_receipt (Phase 5C)
 *   GET  /compliance/receipts                       — list authority_receipts (Phase 5C)
 *   POST /compliance/envelopes/build                — build_submission_envelope (Phase 5C)
 *   POST /compliance/envelopes/integrity            — verify_submission_integrity (Phase 5C)
 *   GET  /compliance/envelopes                      — list submission_envelopes (Phase 5C)
 *   GET  /compliance/validate/phase5c               — run Phase 5C validation suite (Phase 5C)
 *   POST /compliance/endpoints/register             — register_regulatory_endpoint (Phase 5D)
 *   POST /compliance/endpoints/verify               — verify_endpoint_trust (Phase 5D)
 *   GET  /compliance/endpoints                      — list regulatory_endpoints (Phase 5D)
 *   POST /compliance/manifests/build                — build_transport_manifest (Phase 5D)
 *   GET  /compliance/manifests                      — list transport_manifests (Phase 5D)
 *   POST /compliance/deliveries/create              — create_submission_delivery (Phase 5D)
 *   POST /compliance/deliveries/attempt             — register_delivery_attempt (Phase 5D)
 *   POST /compliance/deliveries/finalize            — finalize_regulatory_delivery (Phase 5D)
 *   POST /compliance/deliveries/integrity           — verify_delivery_integrity (Phase 5D)
 *   GET  /compliance/deliveries                     — list submission_deliveries (Phase 5D)
 *   GET  /compliance/validate/phase5d               — run Phase 5D validation suite (Phase 5D)
 *   POST /compliance/pki/anchors/register           — register_trust_anchor (Phase 5E)
 *   GET  /compliance/pki/anchors                    — list trust_anchors (Phase 5E)
 *   POST /compliance/pki/chains/register            — register_certificate_chain (Phase 5E)
 *   GET  /compliance/pki/chains                     — list certificate_chains (Phase 5E)
 *   POST /compliance/pki/chains/validate            — validate_certificate_chain (Phase 5E)
 *   POST /compliance/pki/chains/revocation          — verify_revocation_status (Phase 5E)
 *   POST /compliance/pki/signed-receipts/register   — register_signed_authority_receipt (Phase 5E)
 *   GET  /compliance/pki/signed-receipts            — list signed_authority_receipts (Phase 5E)
 *   POST /compliance/pki/signed-receipts/verify     — verify_authority_signature (Phase 5E)
 *   POST /compliance/pki/authenticity               — verify_transport_authenticity (Phase 5E)
 *   GET  /compliance/validate/phase5e               — run Phase 5E validation suite (Phase 5E)
 *   POST /compliance/temporal/authorities/register  — register_timestamp_authority (Phase 5F)
 *   GET  /compliance/temporal/authorities           — list timestamp_authorities (Phase 5F)
 *   POST /compliance/temporal/evidence/issue        — issue_timestamp_evidence (Phase 5F)
 *   GET  /compliance/temporal/evidence              — list temporal_evidence_records (Phase 5F)
 *   POST /compliance/temporal/evidence/verify-signature   — verify_timestamp_signature (Phase 5F)
 *   POST /compliance/temporal/evidence/verify-nonrepudiation — verify_temporal_nonrepudiation (Phase 5F)
 *   GET  /compliance/temporal/chronology            — list chronology_lineage (Phase 5F)
 *   POST /compliance/temporal/chronology/integrity  — verify_temporal_chain_integrity (Phase 5F)
 *   POST /compliance/temporal/snapshots/create      — create_temporal_snapshot (Phase 5F)
 *   GET  /compliance/temporal/snapshots             — list temporal_trust_snapshots (Phase 5F)
 *   POST /compliance/temporal/replay/certificate    — generate_temporal_replay_certificate (Phase 5F)
 *   GET  /compliance/temporal/replay                — list replay_validation_snapshots (Phase 5F)
 *   POST /compliance/temporal/validate-at-timestamp — validate_certificate_at_timestamp (Phase 5F)
 *   GET  /compliance/validate/phase5f               — run Phase 5F validation suite (Phase 5F)
 *   POST /compliance/temporal/serializers/register  — register_serializer_profile (Phase 5F-Audit)
 *   GET  /compliance/temporal/serializers           — list canonical_serializer_registry (Phase 5F-Audit)
 *   POST /compliance/temporal/serializers/validate-compatibility — validate_serializer_compatibility (Phase 5F-Audit)
 *   POST /compliance/temporal/serializers/verify-replay — verify_serializer_replay_compatibility (Phase 5F-Audit)
 *   POST /compliance/temporal/serializers/reconstruct  — reconstruct_serializer_version (Phase 5F-Audit)
 *   POST /compliance/temporal/security/assert       — assert_temporal_security_context (Phase 5F-Audit)
 *   POST /compliance/temporal/replay/range-window   — create_replay_range_window (Phase 5F-Audit)
 *   GET  /compliance/temporal/replay/range-windows  — list replay_range_windows (Phase 5F-Audit)
 *   POST /compliance/temporal/chronology/archive    — prepare_chronology_archive_batch (Phase 5F-Audit)
 *   GET  /compliance/temporal/chronology/archives   — list chronology_archive_batches (Phase 5F-Audit)
 *   GET  /compliance/validate/phase5f-audit         — run Phase 5F-Audit validation suite (Phase 5F-Audit)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse, buildSuccessResponse } from '../_shared/errors.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}
// Runtime defect fix (Action 4): `ok()` was called 31 times below but never
// defined or imported — every call threw ReferenceError. Mirrors `err()`
// above: delegates to the canonical ADR-003 success helper rather than a
// bespoke shortcut, exactly as `err()` already delegates to
// `buildErrorResponse`. Response body shape ({ data }) and status code
// (default 200, matching every existing call site) are unchanged.
function ok<T>(ctx: EdgeRequestContext, data: T, status = 200): Response {
  return buildSuccessResponse(ctx, data, status);
}
function hasPermission(ctx: EdgeRequestContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetEvents(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url   = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

  const { data, error } = await client
    .from('compliance_events')
    .select('*')
    .eq('organization_id', orgId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetAgiSubmissions(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:payroll:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? null;

  let q = client
    .from('agi_submissions')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (status !== null) q = q.eq('submission_status', status);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateAgi(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:payroll:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { agi_export_id } = body as { agi_export_id?: string };
  if (!agi_export_id || !UUID_RE.test(agi_export_id)) {
    return err(ctx, 'agi_export_id (UUID) is required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('generate_agi_submission', {
    p_org_id:        orgId,
    p_agi_export_id: agi_export_id,
    p_actor_id:      ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'GENERATION_FAILED');
  return json({ submission_id: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCertifyAgi(submissionId: string, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:payroll:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('certify_agi_submission', {
    p_submission_id: submissionId,
    p_actor_id:      ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CERTIFICATION_FAILED');
  return json({ certification_hash: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateAgiCorrection(submissionId: string, req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:payroll:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { correction_reason, description } = body as { correction_reason?: string; description?: string };
  if (!correction_reason || !description) {
    return err(ctx, 'correction_reason and description are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('create_agi_correction', {
    p_org_id:                 orgId,
    p_original_submission_id: submissionId,
    p_correction_reason:      correction_reason,
    p_description:            description,
    p_actor_id:               ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CORRECTION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetVatDeclarations(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:vat:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? null;

  let q = client
    .from('vat_declarations')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (status !== null) q = q.eq('declaration_status', status);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateVat(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:vat:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { vat_period_id } = body as { vat_period_id?: string };
  if (!vat_period_id || !UUID_RE.test(vat_period_id)) {
    return err(ctx, 'vat_period_id (UUID) is required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('generate_vat_declaration', {
    p_org_id:        orgId,
    p_vat_period_id: vat_period_id,
    p_actor_id:      ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'GENERATION_FAILED');
  return json({ declaration_id: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCertifyVat(declarationId: string, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:vat:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('certify_vat_declaration', {
    p_declaration_id: declarationId,
    p_actor_id:       ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CERTIFICATION_FAILED');
  return json({ certification_hash: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateVatCorrection(declarationId: string, req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:vat:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { correction_type, description } = body as { correction_type?: string; description?: string };
  if (!correction_type || !description) {
    return err(ctx, 'correction_type and description are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('create_vat_correction', {
    p_org_id:                  orgId,
    p_original_declaration_id: declarationId,
    p_correction_type:         correction_type,
    p_description:             description,
    p_actor_id:                ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CORRECTION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateSaft(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { period_start, period_end, scope } = body as { period_start?: string; period_end?: string; scope?: string };
  if (!period_start || !period_end) {
    return err(ctx, 'period_start and period_end are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('generate_saf_t_export', {
    p_org_id:       orgId,
    p_period_start: period_start,
    p_period_end:   period_end,
    p_scope:        scope ?? 'full',
    p_actor_id:     ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'GENERATION_FAILED');
  return json({ export_id: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSaftExports(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? null;

  let q = client
    .from('saf_t_exports')
    .select('*')
    .eq('organization_id', orgId)
    .order('period_start', { ascending: false });
  if (status !== null) q = q.eq('export_status', status);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateFiling(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { filing_type, filing_id } = body as { filing_type?: string; filing_id?: string };
  if (!filing_type || !filing_id || !UUID_RE.test(filing_id)) {
    return err(ctx, 'filing_type and filing_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('validate_filing_replay', {
    p_org_id:      orgId,
    p_filing_type: filing_type,
    p_filing_id:   filing_id,
  });
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetRetentionPolicies(client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('retention_policies')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('policy_type', { ascending: true });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEnforceRetention(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { policy_type, reference_date } = body as { policy_type?: string; reference_date?: string };
  if (!policy_type) {
    return err(ctx, 'policy_type is required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('enforce_retention_policy', {
    p_org_id:         orgId,
    p_policy_type:    policy_type,
    p_reference_date: reference_date ?? null,
    p_actor_id:       ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'ENFORCEMENT_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetHashes(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const exportType = url.searchParams.get('export_type') ?? null;

  let q = client
    .from('regulatory_export_hashes')
    .select('*')
    .eq('organization_id', orgId)
    .order('generated_at', { ascending: false });
  if (exportType !== null) q = q.eq('export_type', exportType);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// ── Phase 5A.1 handlers ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetProfiles(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('canonicalization_profiles')
    .select('*')
    .eq('is_active', true)
    .order('profile_name', { ascending: true });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetAssertions(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url    = new URL(req.url);
  const status = url.searchParams.get('status') ?? null;

  let q = client
    .from('replay_assertions')
    .select('*')
    .eq('organization_id', orgId)
    .order('asserted_at', { ascending: false })
    .limit(100);
  if (status !== null) q = q.eq('assertion_status', status);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAssertDeterminism(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('assert_replay_determinism', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
  });
  if (error) return err(ctx, error.message, 422, 'ASSERTION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetRegistry(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const exportType = url.searchParams.get('export_type') ?? null;

  let q = client
    .from('deterministic_export_registry')
    .select('*')
    .eq('organization_id', orgId)
    .order('registered_at', { ascending: false })
    .limit(100);
  if (exportType !== null) q = q.eq('export_type', exportType);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSnapshots(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const entityType = url.searchParams.get('entity_type') ?? null;
  const entityId   = url.searchParams.get('entity_id') ?? null;

  let q = client
    .from('certification_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (entityType !== null) q = q.eq('entity_type', entityType);
  if (entityId !== null && UUID_RE.test(entityId)) q = q.eq('entity_id', entityId);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateSnapshot(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('create_certification_snapshot', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'SNAPSHOT_FAILED');
  return json({ snapshot_id: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateSnapshot(req: Request, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { snapshot_id } = body as { snapshot_id?: string };
  if (!snapshot_id || !UUID_RE.test(snapshot_id)) {
    return err(ctx, 'snapshot_id (UUID) is required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('validate_certification_replay', {
    p_snapshot_id: snapshot_id,
  });
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json(data);
}

// Phase 5A.2: Canonical payload builder
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBuildPayload(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('build_canonical_payload', {
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_org_id:      orgId,
  });
  if (error) return err(ctx, error.message, 422, 'BUILD_FAILED');
  return json({ entity_type, entity_id, canonical_payload: data });
}

// Phase 5A.3: Canonical serialization validation suite
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateSerialization(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_canonical_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 5B: Filing Certification & Regulatory Sealing ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCertifyRegulatoryFiling(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, certification_type, reason } =
    body as { entity_type?: string; entity_id?: string; certification_type?: string; reason?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('certify_regulatory_filing', {
    p_org_id:             orgId,
    p_entity_type:        entity_type,
    p_entity_id:          entity_id,
    p_certification_type: certification_type ?? 'regulatory_seal',
    p_reason:             reason ?? '',
    p_actor_id:           ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CERTIFICATION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateFilingCertificate(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('generate_filing_certificate', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CERTIFICATE_FAILED');
  return json({ certificate: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyFilingCertificate(req: Request, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { certification_id } = body as { certification_id?: string };
  if (!certification_id || !UUID_RE.test(certification_id)) {
    return err(ctx, 'certification_id (UUID) is required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('verify_filing_certificate', {
    p_certification_id: certification_id,
  });
  if (error) return err(ctx, error.message, 422, 'VERIFICATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetRegulatoryCertifications(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const entityType = url.searchParams.get('entity_type') ?? null;
  const entityId   = url.searchParams.get('entity_id') ?? null;

  let q = client
    .from('regulatory_certifications')
    .select('*')
    .eq('organization_id', orgId)
    .order('certified_at', { ascending: false })
    .limit(100);
  if (entityType !== null) q = q.eq('entity_type', entityType);
  if (entityId !== null && UUID_RE.test(entityId)) q = q.eq('entity_id', entityId);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBuildEvidencePackage(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('build_regulatory_evidence_package', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'EVIDENCE_BUILD_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetEvidencePackages(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const entityType = url.searchParams.get('entity_type') ?? null;
  const entityId   = url.searchParams.get('entity_id') ?? null;

  let q = client
    .from('regulatory_evidence_packages')
    .select('*')
    .eq('organization_id', orgId)
    .order('assembled_at', { ascending: false })
    .limit(50);
  if (entityType !== null) q = q.eq('entity_type', entityType);
  if (entityId !== null && UUID_RE.test(entityId)) q = q.eq('entity_id', entityId);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyLineage(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('verify_export_lineage', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
  });
  if (error) return err(ctx, error.message, 422, 'LINEAGE_VERIFICATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetLineageRecords(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url        = new URL(req.url);
  const entityType = url.searchParams.get('entity_type') ?? null;
  const entityId   = url.searchParams.get('entity_id') ?? null;

  let q = client
    .from('export_lineage_records')
    .select('*')
    .eq('organization_id', orgId)
    .order('recorded_at', { ascending: false })
    .limit(100);
  if (entityType !== null) q = q.eq('entity_type', entityType);
  if (entityId !== null && UUID_RE.test(entityId)) q = q.eq('entity_id', entityId);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateReplayCertificate(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) {
    return err(ctx, 'entity_type and entity_id (UUID) are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('generate_replay_certificate', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPLAY_CERTIFICATE_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase5b(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase5b_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 5C: Cryptographic Trust & Authority Submission ──────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSignCertificate(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { cert_id, signing_key_id } = body;
  if (!cert_id || !signing_key_id) return err(ctx, 'cert_id and signing_key_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('sign_regulatory_certificate', {
    p_org_id:         orgId,
    p_cert_id:        cert_id,
    p_signing_key_id: signing_key_id,
    p_actor_id:       ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'SIGN_CERTIFICATE_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifySignature(req: Request, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { signature_id } = body;
  if (!signature_id) return err(ctx, 'signature_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('verify_certificate_signature', { p_signature_id: signature_id });
  if (error) return err(ctx, error.message, 422, 'VERIFY_SIGNATURE_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSignatures(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url = new URL(req.url);
  const certId = url.searchParams.get('certification_id');
  let q = client.from('certificate_signatures').select('*').eq('organization_id', orgId).order('signed_at', { ascending: false });
  if (certId) q = q.eq('certification_id', certId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ signatures: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSigningKeys(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('signing_key_registry')
    .select('id, key_id, algorithm, version, is_active, eidas_compatible, activated_at, revoked_at, metadata, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ keys: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterReceipt(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id, envelope_id, authority_name, authority_reference, submission_hash, receipt_payload, acknowledgment_ref } = body;
  if (!entity_type || !entity_id || !envelope_id || !authority_name || !submission_hash)
    return err(ctx, 'entity_type, entity_id, envelope_id, authority_name, submission_hash required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('register_authority_receipt', {
    p_org_id:              orgId,
    p_entity_type:         entity_type,
    p_entity_id:           entity_id,
    p_envelope_id:         envelope_id,
    p_authority_name:      authority_name,
    p_authority_reference: authority_reference ?? null,
    p_submission_hash:     submission_hash,
    p_receipt_payload:     receipt_payload ?? {},
    p_acknowledgment_ref:  acknowledgment_ref ?? null,
    p_actor_id:            ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REGISTER_RECEIPT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyReceipt(req: Request, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { receipt_id } = body;
  if (!receipt_id) return err(ctx, 'receipt_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('verify_authority_receipt', { p_receipt_id: receipt_id });
  if (error) return err(ctx, error.message, 422, 'VERIFY_RECEIPT_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetReceipts(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entity_type');
  const entityId   = url.searchParams.get('entity_id');
  let q = client.from('authority_receipts').select('*').eq('organization_id', orgId).order('recorded_at', { ascending: false });
  if (entityType) q = q.eq('entity_type', entityType);
  if (entityId)   q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ receipts: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBuildEnvelope(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id } = body;
  if (!entity_type || !entity_id) return err(ctx, 'entity_type and entity_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('build_submission_envelope', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'BUILD_ENVELOPE_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyIntegrity(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id } = body;
  if (!entity_type || !entity_id) return err(ctx, 'entity_type and entity_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('verify_submission_integrity', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
  });
  if (error) return err(ctx, error.message, 422, 'INTEGRITY_CHECK_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetEnvelopes(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entity_type');
  const entityId   = url.searchParams.get('entity_id');
  let q = client.from('submission_envelopes').select('*').eq('organization_id', orgId).order('sealed_at', { ascending: false });
  if (entityType) q = q.eq('entity_type', entityType);
  if (entityId)   q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ envelopes: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase5c(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase5c_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 5D handlers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterEndpoint(req: Request, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { endpoint_key, authority_name, protocol } = body;
  if (!endpoint_key || !authority_name || !protocol)
    return err(ctx, 'endpoint_key, authority_name, protocol required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('register_regulatory_endpoint', {
    p_endpoint_key:        endpoint_key,
    p_authority_name:      authority_name,
    p_protocol:            protocol,
    p_endpoint_version:    body['endpoint_version'] ?? 'v1',
    p_eidas_compatible:    body['eidas_compatible'] ?? false,
    p_trust_material:      body['trust_material'] ?? null,
    p_authority_metadata:  body['authority_metadata'] ?? {},
    p_transport_metadata:  body['transport_metadata'] ?? {},
    p_actor_id:            ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REGISTER_ENDPOINT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyEndpointTrust(req: Request, client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { endpoint_id } = body;
  if (!endpoint_id) return err(ctx, 'endpoint_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('verify_endpoint_trust', { p_endpoint_id: endpoint_id });
  if (error) return err(ctx, error.message, 422, 'VERIFY_ENDPOINT_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetEndpoints(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('regulatory_endpoints')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ endpoints: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBuildManifest(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id, endpoint_id } = body;
  if (!entity_type || !entity_id || !endpoint_id)
    return err(ctx, 'entity_type, entity_id, endpoint_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('build_transport_manifest', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_endpoint_id: endpoint_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'BUILD_MANIFEST_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetManifests(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entity_type');
  const entityId   = url.searchParams.get('entity_id');
  let q = client.from('transport_manifests').select('*').eq('organization_id', orgId).order('sealed_at', { ascending: false });
  if (entityType) q = q.eq('entity_type', entityType);
  if (entityId)   q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ manifests: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateDelivery(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id, transport_manifest_id } = body;
  if (!entity_type || !entity_id || !transport_manifest_id)
    return err(ctx, 'entity_type, entity_id, transport_manifest_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('create_submission_delivery', {
    p_org_id:                orgId,
    p_entity_type:           entity_type,
    p_entity_id:             entity_id,
    p_transport_manifest_id: transport_manifest_id,
    p_prior_delivery_id:     body['prior_delivery_id'] ?? null,
    p_actor_id:              ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CREATE_DELIVERY_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterAttempt(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { delivery_id, outcome } = body;
  if (!delivery_id || !outcome) return err(ctx, 'delivery_id and outcome required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('register_delivery_attempt', {
    p_org_id:                   orgId,
    p_delivery_id:              delivery_id,
    p_outcome:                  outcome,
    p_transport_response:       body['transport_response'] ?? {},
    p_authority_acknowledgment: body['authority_acknowledgment'] ?? null,
    p_acknowledged_at:          body['acknowledged_at'] ?? null,
    p_actor_id:                 ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REGISTER_ATTEMPT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleFinalizeDelivery(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:write')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { delivery_id } = body;
  if (!delivery_id) return err(ctx, 'delivery_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('finalize_regulatory_delivery', {
    p_org_id:      orgId,
    p_delivery_id: delivery_id,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'FINALIZE_DELIVERY_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyDeliveryIntegrity(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { entity_type, entity_id } = body;
  if (!entity_type || !entity_id) return err(ctx, 'entity_type and entity_id required', 400, 'MISSING_FIELDS');
  const { data, error } = await client.rpc('verify_delivery_integrity', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
  });
  if (error) return err(ctx, error.message, 422, 'INTEGRITY_CHECK_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDeliveries(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url = new URL(req.url);
  const entityType = url.searchParams.get('entity_type');
  const entityId   = url.searchParams.get('entity_id');
  let q = client.from('submission_deliveries').select('*').eq('organization_id', orgId).order('initiated_at', { ascending: false });
  if (entityType) q = q.eq('entity_type', entityType);
  if (entityId)   q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ deliveries: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase5d(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase5d_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 5E: PKI Trust Infrastructure & Authority Authenticity ───────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterTrustAnchor(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  const { data, error } = await client.rpc('register_trust_anchor', {
    p_anchor_id:           body.anchor_id,
    p_common_name:         body.common_name,
    p_organization:        body.organization,
    p_jurisdiction:        body.jurisdiction ?? 'SE',
    p_public_key_material: body.public_key_material,
    p_validity_not_before: body.validity_not_before,
    p_validity_not_after:  body.validity_not_after,
    p_eidas_compatible:    body.eidas_compatible ?? false,
    p_trust_material:      body.trust_material ?? null,
    p_parent_lineage_hash: body.parent_lineage_hash ?? null,
    p_actor_id:            body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'PKI_ANCHOR_FAILED');
  return json({ anchor: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetTrustAnchors(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.from('trust_anchors').select('*').order('created_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ trust_anchors: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterCertificateChain(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  const { data, error } = await client.rpc('register_certificate_chain', {
    p_chain_id:            body.chain_id,
    p_trust_anchor_id:     body.trust_anchor_id,
    p_endpoint_id:         body.endpoint_id ?? null,
    p_subject_cn:          body.subject_cn,
    p_subject_org:         body.subject_org,
    p_issuer_cn:           body.issuer_cn,
    p_issuer_org:          body.issuer_org,
    p_cert_material:       body.cert_material,
    p_issuer_material:     body.issuer_material,
    p_issuer_lineage:      body.issuer_lineage ?? [],
    p_validity_not_before: body.validity_not_before,
    p_validity_not_after:  body.validity_not_after,
    p_algorithm:           body.algorithm ?? 'sha256WithRSAEncryption',
    p_actor_id:            body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'PKI_CHAIN_FAILED');
  return json({ chain: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetCertificateChains(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.from('certificate_chains').select('*').order('registered_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ certificate_chains: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateCertificateChain(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.chain_id) return err(ctx, 'chain_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('validate_certificate_chain', { p_chain_id: body.chain_id });
  if (error) return err(ctx, error.message, 422, 'CHAIN_VALIDATION_FAILED');
  return json({ validation: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyRevocationStatus(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.chain_id) return err(ctx, 'chain_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('verify_revocation_status', { p_chain_id: body.chain_id });
  if (error) return err(ctx, error.message, 422, 'REVOCATION_CHECK_FAILED');
  return json({ revocation: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterSignedReceipt(client: any, req: Request, orgId: string): Promise<Response> {
  const body = await req.json();
  if (!body.authority_receipt_id || !body.detached_signature) return err(ctx, 'authority_receipt_id and detached_signature required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('register_signed_authority_receipt', {
    p_org_id:                    orgId,
    p_authority_receipt_id:      body.authority_receipt_id,
    p_detached_signature:        body.detached_signature,
    p_certificate_chain_id:      body.certificate_chain_id ?? null,
    p_signature_algorithm:       body.signature_algorithm ?? 'sha256-keyed',
    p_authority_certificate_ref: body.authority_certificate_ref ?? null,
    p_actor_id:                  body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'SIGNED_RECEIPT_FAILED');
  return json({ signed_receipt: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSignedReceipts(client: any, ctx: EdgeRequestContext, orgId: string): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.from('signed_authority_receipts')
    .select('*')
    .eq('organization_id', orgId)
    .order('recorded_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ signed_receipts: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyAuthoritySignature(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.signed_receipt_id) return err(ctx, 'signed_receipt_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('verify_authority_signature', { p_signed_receipt_id: body.signed_receipt_id });
  if (error) return err(ctx, error.message, 422, 'SIGNATURE_VERIFY_FAILED');
  return json({ verification: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyTransportAuthenticity(client: any, req: Request, orgId: string): Promise<Response> {
  const body = await req.json();
  if (!body.entity_type || !body.entity_id) return err(ctx, 'entity_type and entity_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('verify_transport_authenticity', {
    p_org_id:      orgId,
    p_entity_type: body.entity_type,
    p_entity_id:   body.entity_id,
  });
  if (error) return err(ctx, error.message, 422, 'AUTHENTICITY_VERIFY_FAILED');
  return json({ authenticity: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase5e(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase5e_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 5F: Temporal Evidence & Cryptographic Replay Integrity ──────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterTimestampAuthority(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  const { data, error } = await client.rpc('register_timestamp_authority', {
    p_authority_id:        body.authority_id,
    p_common_name:         body.common_name,
    p_organization:        body.organization,
    p_jurisdiction:        body.jurisdiction ?? 'SE',
    p_public_key_material: body.public_key_material,
    p_validity_not_before: body.validity_not_before,
    p_validity_not_after:  body.validity_not_after,
    p_trust_anchor_id:     body.trust_anchor_id ?? null,
    p_parent_lineage_hash: body.parent_lineage_hash ?? null,
    p_eidas_compatible:    body.eidas_compatible ?? false,
    p_actor_id:            body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'TSA_REGISTER_FAILED');
  return json({ authority: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetTimestampAuthorities(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.from('timestamp_authorities').select('*').order('created_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ timestamp_authorities: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleIssueTimestampEvidence(client: any, req: Request, orgId: string): Promise<Response> {
  const body = await req.json();
  if (!body.entity_type || !body.entity_id || !body.authority_id || !body.timestamp_value || !body.timestamp_signature) {
    return err(ctx, 'entity_type, entity_id, authority_id, timestamp_value, timestamp_signature required', 400, 'MISSING_PARAM');
  }
  const { data, error } = await client.rpc('issue_timestamp_evidence', {
    p_org_id:              orgId,
    p_entity_type:         body.entity_type,
    p_entity_id:           body.entity_id,
    p_authority_id:        body.authority_id,
    p_timestamp_value:     body.timestamp_value,
    p_payload_hash:        body.payload_hash ?? '',
    p_timestamp_signature: body.timestamp_signature,
    p_actor_id:            body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'EVIDENCE_ISSUE_FAILED');
  return json({ evidence: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetTemporalEvidence(client: any, ctx: EdgeRequestContext, orgId: string, req: Request): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const entityId = new URL(req.url).searchParams.get('entity_id');
  let q = client.from('temporal_evidence_records').select('*').eq('organization_id', orgId).order('timestamp_value', { ascending: false });
  if (entityId) q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ temporal_evidence_records: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyTimestampSignature(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.evidence_id) return err(ctx, 'evidence_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('verify_timestamp_signature', { p_evidence_id: body.evidence_id });
  if (error) return err(ctx, error.message, 422, 'SIGNATURE_VERIFY_FAILED');
  return json({ verification: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyTemporalNonrepudiation(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.evidence_id) return err(ctx, 'evidence_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('verify_temporal_nonrepudiation', { p_evidence_id: body.evidence_id });
  if (error) return err(ctx, error.message, 422, 'NONREP_VERIFY_FAILED');
  return json({ verification: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetChronologyLineage(client: any, ctx: EdgeRequestContext, orgId: string, req: Request): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const entityId = new URL(req.url).searchParams.get('entity_id');
  let q = client.from('chronology_lineage').select('*').eq('organization_id', orgId).order('sequence_number', { ascending: true });
  if (entityId) q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ chronology_lineage: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifyChainIntegrity(client: any, req: Request, orgId: string): Promise<Response> {
  const body = await req.json();
  if (!body.entity_type || !body.entity_id) return err(ctx, 'entity_type and entity_id required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('verify_temporal_chain_integrity', {
    p_org_id:      orgId,
    p_entity_type: body.entity_type,
    p_entity_id:   body.entity_id,
  });
  if (error) return err(ctx, error.message, 422, 'CHAIN_INTEGRITY_FAILED');
  return json({ integrity: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateTemporalSnapshot(client: any, req: Request, orgId: string): Promise<Response> {
  const body = await req.json();
  if (!body.entity_type || !body.entity_id || !body.at_timestamp) return err(ctx, 'entity_type, entity_id, at_timestamp required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('create_temporal_snapshot', {
    p_org_id:       orgId,
    p_entity_type:  body.entity_type,
    p_entity_id:    body.entity_id,
    p_at_timestamp: body.at_timestamp,
    p_actor_id:     body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'SNAPSHOT_CREATE_FAILED');
  return json({ snapshot: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetTemporalSnapshots(client: any, ctx: EdgeRequestContext, orgId: string, req: Request): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const entityId = new URL(req.url).searchParams.get('entity_id');
  let q = client.from('temporal_trust_snapshots').select('*').eq('organization_id', orgId).order('snapshot_timestamp', { ascending: false });
  if (entityId) q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ temporal_trust_snapshots: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateTemporalReplayCertificate(client: any, req: Request, orgId: string): Promise<Response> {
  const body = await req.json();
  if (!body.entity_type || !body.entity_id || !body.at_timestamp) return err(ctx, 'entity_type, entity_id, at_timestamp required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('generate_temporal_replay_certificate', {
    p_org_id:       orgId,
    p_entity_type:  body.entity_type,
    p_entity_id:    body.entity_id,
    p_at_timestamp: body.at_timestamp,
    p_actor_id:     body.actor_id ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'REPLAY_CERT_FAILED');
  return json({ replay_certificate: data }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetReplayValidationSnapshots(client: any, ctx: EdgeRequestContext, orgId: string, req: Request): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const entityId = new URL(req.url).searchParams.get('entity_id');
  let q = client.from('replay_validation_snapshots').select('*').eq('organization_id', orgId).order('validation_timestamp', { ascending: false });
  if (entityId) q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ replay_validation_snapshots: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateCertAtTimestamp(client: any, req: Request): Promise<Response> {
  const body = await req.json();
  if (!body.chain_id || !body.at_timestamp) return err(ctx, 'chain_id and at_timestamp required', 400, 'MISSING_PARAM');
  const { data, error } = await client.rpc('validate_certificate_at_timestamp', {
    p_chain_id:     body.chain_id,
    p_at_timestamp: body.at_timestamp,
  });
  if (error) return err(ctx, error.message, 422, 'CERT_VALIDATE_FAILED');
  return json({ validation: data });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase5f(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase5f_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 5F-Audit handlers ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegisterSerializerProfile(client: any, req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const {
    serializer_key, serializer_version, canonicalization_strategy, introduced_phase,
    replay_compatible, deterministic, chronology_compatible, evidence_compatible,
    trust_reconstruction_compatible, replay_notes,
  } = body as Record<string, unknown>;
  if (!serializer_key || !serializer_version || !canonicalization_strategy || !introduced_phase) {
    return err(ctx, 'serializer_key, serializer_version, canonicalization_strategy, introduced_phase are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('register_serializer_profile', {
    p_serializer_key:                  serializer_key,
    p_serializer_version:              serializer_version,
    p_canonicalization_strategy:       canonicalization_strategy,
    p_introduced_phase:                introduced_phase,
    p_replay_compatible:               replay_compatible ?? true,
    p_deterministic:                   deterministic ?? true,
    p_chronology_compatible:           chronology_compatible ?? true,
    p_evidence_compatible:             evidence_compatible ?? true,
    p_trust_reconstruction_compatible: trust_reconstruction_compatible ?? true,
    p_replay_notes:                    replay_notes ?? null,
  });
  if (error) return err(ctx, error.message, 422, 'REGISTER_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSerializerRegistry(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client
    .from('canonical_serializer_registry')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateSerializerCompatibility(client: any, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { serializer_key, check_chronology, check_evidence, check_trust } = body as Record<string, unknown>;
  if (!serializer_key) return err(ctx, 'serializer_key is required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_serializer_compatibility', {
    p_serializer_key:    serializer_key,
    p_check_chronology:  check_chronology ?? true,
    p_check_evidence:    check_evidence ?? true,
    p_check_trust:       check_trust ?? true,
  });
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleVerifySerializerReplay(client: any, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { serializer_key } = body as { serializer_key?: string };
  if (!serializer_key) return err(ctx, 'serializer_key is required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('verify_serializer_replay_compatibility', { p_serializer_key: serializer_key });
  if (error) return err(ctx, error.message, 422, 'VERIFICATION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReconstructSerializerVersion(client: any, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { serializer_key, serializer_version, canonicalization_strategy } = body as Record<string, string>;
  if (!serializer_key || !serializer_version || !canonicalization_strategy) {
    return err(ctx, 'serializer_key, serializer_version, canonicalization_strategy are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('reconstruct_serializer_version', {
    p_serializer_key:            serializer_key,
    p_serializer_version:        serializer_version,
    p_canonicalization_strategy: canonicalization_strategy,
  });
  if (error) return err(ctx, error.message, 422, 'RECONSTRUCTION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAssertTemporalSecurityContext(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('assert_temporal_security_context', {
    p_org_id:   orgId,
    p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 403, 'SECURITY_CONTEXT_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreateReplayRangeWindow(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, window_start, window_end } = body as Record<string, string>;
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id) || !window_start || !window_end) {
    return err(ctx, 'entity_type, entity_id (UUID), window_start, window_end are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('create_replay_range_window', {
    p_org_id:       orgId,
    p_entity_type:  entity_type,
    p_entity_id:    entity_id,
    p_window_start: window_start,
    p_window_end:   window_end,
    p_actor_id:     ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'RANGE_WINDOW_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetReplayRangeWindows(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url      = new URL(req.url);
  const entityId = url.searchParams.get('entity_id') ?? null;

  let q = client
    .from('replay_range_windows')
    .select('*')
    .eq('organization_id', orgId)
    .order('window_start', { ascending: false })
    .limit(100);
  if (entityId !== null && UUID_RE.test(entityId)) q = q.eq('entity_id', entityId);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePrepareChronologyArchive(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, start_seq, end_seq } = body as Record<string, unknown>;
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id as string) || start_seq === undefined || end_seq === undefined) {
    return err(ctx, 'entity_type, entity_id (UUID), start_seq, end_seq are required', 400, 'INVALID_INPUT');
  }
  const { data, error } = await client.rpc('prepare_chronology_archive_batch', {
    p_org_id:      orgId,
    p_entity_type: entity_type,
    p_entity_id:   entity_id,
    p_start_seq:   start_seq,
    p_end_seq:     end_seq,
    p_actor_id:    ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'ARCHIVE_PREP_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetChronologyArchives(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url      = new URL(req.url);
  const entityId = url.searchParams.get('entity_id') ?? null;

  let q = client
    .from('chronology_archive_batches')
    .select('*')
    .eq('organization_id', orgId)
    .order('archived_at', { ascending: false })
    .limit(100);
  if (entityId !== null && UUID_RE.test(entityId)) q = q.eq('entity_id', entityId);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase5fAudit(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase5f_audit_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

// ── Phase 6A: Replay Test Harness handlers ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRunReplayTest(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, test_type } = body as { entity_type?: string; entity_id?: string; test_type?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('run_replay_test', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id,
    p_test_type: test_type ?? 'full_chronology', p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPLAY_TEST_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRunFullReplayReconstruction(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, at_timestamp } = body as { entity_type?: string; entity_id?: string; at_timestamp?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id) || !at_timestamp) return err(ctx, 'entity_type, entity_id, at_timestamp required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('run_full_replay_reconstruction', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id,
    p_at_timestamp: at_timestamp, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'RECONSTRUCTION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateReplayDeterminism(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, at_timestamp, iterations } = body as { entity_type?: string; entity_id?: string; at_timestamp?: string; iterations?: number };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id) || !at_timestamp) return err(ctx, 'entity_type, entity_id, at_timestamp required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_replay_determinism', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id,
    p_at_timestamp: at_timestamp, p_iterations: iterations ?? 2, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'DETERMINISM_CHECK_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCompareReplayRuns(client: any, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { run_id_1, run_id_2 } = body as { run_id_1?: string; run_id_2?: string };
  if (!run_id_1 || !UUID_RE.test(run_id_1) || !run_id_2 || !UUID_RE.test(run_id_2)) return err(ctx, 'run_id_1 and run_id_2 required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('compare_replay_runs', { p_run_id_1: run_id_1, p_run_id_2: run_id_2 });
  if (error) return err(ctx, error.message, 422, 'COMPARE_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateReplayReproducibilityReport(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { run_id_1, run_id_2 } = body as { run_id_1?: string; run_id_2?: string };
  if (!run_id_1 || !UUID_RE.test(run_id_1) || !run_id_2 || !UUID_RE.test(run_id_2)) return err(ctx, 'run_id_1 and run_id_2 required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('generate_replay_reproducibility_report', {
    p_org_id: orgId, p_run_id_1: run_id_1, p_run_id_2: run_id_2, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPORT_FAILED');
  return json(data, 201);
}

// ── Phase 6A: Serializer Drift handlers ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDetectSerializerDrift(client: any, req: Request, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const url = new URL(req.url);
  const serializerKey = url.searchParams.get('serializer_key') ?? '';
  if (!serializerKey) return err(ctx, 'serializer_key required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('detect_serializer_drift', { p_serializer_key: serializerKey });
  if (error) return err(ctx, error.message, 422, 'DRIFT_DETECTION_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateSerializerDriftReport(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { serializer_key } = body as { serializer_key?: string };
  if (!serializer_key) return err(ctx, 'serializer_key required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('generate_serializer_drift_report', {
    p_org_id: orgId, p_serializer_key: serializer_key, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPORT_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetSchemaHashIntegrity(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('verify_schema_hash_integrity');
  if (error) return err(ctx, error.message, 422, 'INTEGRITY_CHECK_FAILED');
  return json(data);
}

// ── Phase 6A: Benchmark handlers ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleBenchmarkReplayEngine(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { scale_factor } = body as { scale_factor?: number };
  const { data, error } = await client.rpc('benchmark_replay_engine', {
    p_org_id: orgId, p_scale_factor: scale_factor ?? 1, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'BENCHMARK_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateReplayPerformanceReport(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { benchmark_type } = body as { benchmark_type?: string };
  const { data, error } = await client.rpc('generate_replay_performance_report', {
    p_org_id: orgId, p_benchmark_type: benchmark_type ?? null, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPORT_FAILED');
  return json(data, 201);
}

// ── Phase 6A: Backup/Restore handlers ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateReplayAfterRestore(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, pre_restore_hash } = body as { entity_type?: string; entity_id?: string; pre_restore_hash?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id) || !pre_restore_hash) return err(ctx, 'entity_type, entity_id, pre_restore_hash required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_replay_after_restore', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id,
    p_pre_restore_hash: pre_restore_hash, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'RESTORE_VALIDATION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateTemporalChainAfterRestore(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_temporal_chain_after_restore', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CHAIN_VALIDATION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateRestoreReproducibility(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { pre_backup_hash, post_restore_hash } = body as { pre_backup_hash?: string; post_restore_hash?: string };
  if (!pre_backup_hash || !post_restore_hash) return err(ctx, 'pre_backup_hash and post_restore_hash required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_restore_reproducibility', {
    p_org_id: orgId, p_pre_backup_hash: pre_backup_hash, p_post_restore_hash: post_restore_hash, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPRODUCIBILITY_CHECK_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateRestoreIntegrityReport(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('generate_restore_integrity_report', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPORT_FAILED');
  return json(data, 201);
}

// ── Phase 6A: Tenant Isolation handlers ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateTenantReplayIsolation(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_tenant_replay_isolation', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'ISOLATION_CHECK_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateTenantIsolationReport(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('generate_tenant_isolation_report', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'REPORT_FAILED');
  return json(data, 201);
}

// ── Phase 6A: Operational Health handlers ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRunReplayHealthCheck(client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_replay_health_check', { p_org_id: orgId, p_actor_id: ctx.actorId });
  if (error) return err(ctx, error.message, 422, 'HEALTH_CHECK_FAILED');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidateChronologyIntegrity(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('validate_chronology_integrity', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'INTEGRITY_CHECK_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDetectReplayChainCorruption(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id } = body as { entity_type?: string; entity_id?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id)) return err(ctx, 'entity_type and entity_id required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('detect_replay_chain_corruption', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CORRUPTION_DETECTION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDetectReplayHashDivergence(client: any, req: Request, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const body = await req.json().catch(() => ({}));
  const { entity_type, entity_id, baseline_hash } = body as { entity_type?: string; entity_id?: string; baseline_hash?: string };
  if (!entity_type || !entity_id || !UUID_RE.test(entity_id) || !baseline_hash) return err(ctx, 'entity_type, entity_id, baseline_hash required', 400, 'INVALID_INPUT');
  const { data, error } = await client.rpc('detect_replay_hash_divergence', {
    p_org_id: orgId, p_entity_type: entity_type, p_entity_id: entity_id,
    p_baseline_hash: baseline_hash, p_actor_id: ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'DIVERGENCE_DETECTION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleValidatePhase6a(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:compliance:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');
  const { data, error } = await client.rpc('run_phase6a_validation_suite');
  if (error) return err(ctx, error.message, 422, 'VALIDATION_FAILED');
  return json({ validation: data });
}

Deno.serve((req: Request) => serveCors(req, async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader  = req.headers.get('Authorization') ?? '';

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const ctxResult = await buildEdgeContext(req);
  if (!ctxResult.ok) return ctxResult.response;
  const ctx = ctxResult.ctx;

  const ipGuard = enforceIpRateLimit(req, 'ip_auth', ctx.correlationId);
  if (ipGuard) return ipGuard;
  if (req.method !== 'GET') {
    const writeGuard = enforceUserRateLimit(ctx.actorId ?? 'unknown', 'user_write', ctx.correlationId);
    if (writeGuard) return writeGuard;
  }

  const orgId = ctx.organizationId;
  if (orgId === null) return err(ctx, 'No organization context', 400, 'NO_ORG_CONTEXT');

  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'compliance');
  const seg1     = segments[fnIdx + 1] ?? '';
  const seg2     = segments[fnIdx + 2] ?? '';
  const seg3     = segments[fnIdx + 3] ?? '';
  const method   = req.method;

  const id3 = UUID_RE.test(seg3) ? seg3 : null;

  // GET  /compliance/events
  if (seg1 === 'events' && method === 'GET') {
    return handleGetEvents(req, client, orgId, ctx);
  }

  // AGI routes
  if (seg1 === 'agi') {
    if (seg2 === 'submissions' && method === 'GET') {
      return handleGetAgiSubmissions(req, client, orgId, ctx);
    }
    if (seg2 === 'generate' && method === 'POST') {
      return handleGenerateAgi(req, client, orgId, ctx);
    }
    if (seg2 === 'certify' && id3 !== null && method === 'POST') {
      return handleCertifyAgi(id3, client, ctx);
    }
    if (seg2 === 'correct' && id3 !== null && method === 'POST') {
      return handleCreateAgiCorrection(id3, req, client, orgId, ctx);
    }
  }

  // VAT routes
  if (seg1 === 'vat') {
    if (seg2 === 'declarations' && method === 'GET') {
      return handleGetVatDeclarations(req, client, orgId, ctx);
    }
    if (seg2 === 'generate' && method === 'POST') {
      return handleGenerateVat(req, client, orgId, ctx);
    }
    if (seg2 === 'certify' && id3 !== null && method === 'POST') {
      return handleCertifyVat(id3, client, ctx);
    }
    if (seg2 === 'correct' && id3 !== null && method === 'POST') {
      return handleCreateVatCorrection(id3, req, client, orgId, ctx);
    }
  }

  // SAF-T routes
  if (seg1 === 'saft') {
    if (seg2 === 'generate' && method === 'POST') {
      return handleGenerateSaft(req, client, orgId, ctx);
    }
    if (seg2 === 'exports' && method === 'GET') {
      return handleGetSaftExports(req, client, orgId, ctx);
    }
  }

  // Filing validation
  if (seg1 === 'filings' && seg2 === 'validate' && method === 'POST') {
    return handleValidateFiling(req, client, orgId, ctx);
  }

  // Retention
  if (seg1 === 'retention') {
    if (seg2 === 'policies' && method === 'GET') {
      return handleGetRetentionPolicies(client, orgId, ctx);
    }
    if (seg2 === 'enforce' && method === 'POST') {
      return handleEnforceRetention(req, client, orgId, ctx);
    }
  }

  // Regulatory export hashes
  if (seg1 === 'hashes' && method === 'GET') {
    return handleGetHashes(req, client, orgId, ctx);
  }

  // Phase 5A.1: Canonicalization profiles
  if (seg1 === 'profiles' && method === 'GET') {
    return handleGetProfiles(client, ctx);
  }

  // Phase 5A.1: Replay assertions
  if (seg1 === 'assertions') {
    if (seg2 === '' && method === 'GET') return handleGetAssertions(req, client, orgId, ctx);
    if (seg2 === 'determinism' && method === 'POST') return handleAssertDeterminism(req, client, orgId, ctx);
  }

  // Phase 5A.1: Deterministic export registry
  if (seg1 === 'registry' && method === 'GET') {
    return handleGetRegistry(req, client, orgId, ctx);
  }

  // Phase 5A.1: Certification snapshots
  if (seg1 === 'snapshots') {
    if (seg2 === '' && method === 'GET')      return handleGetSnapshots(req, client, orgId, ctx);
    if (seg2 === '' && method === 'POST')     return handleCreateSnapshot(req, client, orgId, ctx);
    if (seg2 === 'validate' && method === 'POST') return handleValidateSnapshot(req, client, ctx);
  }

  // Phase 5A.2: Canonical payload builder
  if (seg1 === 'payload' && seg2 === 'build' && method === 'POST') {
    return handleBuildPayload(req, client, orgId, ctx);
  }

  // Phase 5A.3: Canonical serialization validation suite
  if (seg1 === 'validate' && seg2 === 'serialization' && method === 'GET') {
    return handleValidateSerialization(client, ctx);
  }

  // Phase 5B: Filing Certification & Regulatory Sealing
  if (seg1 === 'certifications') {
    if (seg2 === 'certify'      && method === 'POST') return handleCertifyRegulatoryFiling(req, client, orgId, ctx);
    if (seg2 === 'certificate'  && method === 'POST') return handleGenerateFilingCertificate(req, client, orgId, ctx);
    if (seg2 === 'verify'       && method === 'POST') return handleVerifyFilingCertificate(req, client, ctx);
    if (seg2 === ''             && method === 'GET')  return handleGetRegulatoryCertifications(req, client, orgId, ctx);
  }

  if (seg1 === 'evidence') {
    if (seg2 === 'build'  && method === 'POST') return handleBuildEvidencePackage(req, client, orgId, ctx);
    if (seg2 === ''       && method === 'GET')  return handleGetEvidencePackages(req, client, orgId, ctx);
  }

  if (seg1 === 'lineage') {
    if (seg2 === 'verify' && method === 'POST') return handleVerifyLineage(req, client, orgId, ctx);
    if (seg2 === ''       && method === 'GET')  return handleGetLineageRecords(req, client, orgId, ctx);
  }

  if (seg1 === 'replay' && seg2 === 'certify' && method === 'POST') {
    return handleGenerateReplayCertificate(req, client, orgId, ctx);
  }

  if (seg1 === 'validate' && seg2 === 'phase5b' && method === 'GET') {
    return handleValidatePhase5b(client, ctx);
  }

  // Phase 5C routing
  if (seg1 === 'signatures') {
    if (seg2 === 'sign'   && method === 'POST') return handleSignCertificate(req, client, orgId, ctx);
    if (seg2 === 'verify' && method === 'POST') return handleVerifySignature(req, client, ctx);
    if (seg2 === ''       && method === 'GET')  return handleGetSignatures(req, client, orgId, ctx);
  }

  if (seg1 === 'keys' && seg2 === '' && method === 'GET') {
    return handleGetSigningKeys(client, ctx);
  }

  if (seg1 === 'receipts') {
    if (seg2 === 'register' && method === 'POST') return handleRegisterReceipt(req, client, orgId, ctx);
    if (seg2 === 'verify'   && method === 'POST') return handleVerifyReceipt(req, client, ctx);
    if (seg2 === ''         && method === 'GET')  return handleGetReceipts(req, client, orgId, ctx);
  }

  if (seg1 === 'envelopes') {
    if (seg2 === 'build'     && method === 'POST') return handleBuildEnvelope(req, client, orgId, ctx);
    if (seg2 === 'integrity' && method === 'POST') return handleVerifyIntegrity(req, client, orgId, ctx);
    if (seg2 === ''          && method === 'GET')  return handleGetEnvelopes(req, client, orgId, ctx);
  }

  if (seg1 === 'validate' && seg2 === 'phase5c' && method === 'GET') {
    return handleValidatePhase5c(client, ctx);
  }

  // Phase 5D routing
  if (seg1 === 'endpoints') {
    if (seg2 === 'register' && method === 'POST') return handleRegisterEndpoint(req, client, ctx);
    if (seg2 === 'verify'   && method === 'POST') return handleVerifyEndpointTrust(req, client, ctx);
    if (seg2 === ''         && method === 'GET')  return handleGetEndpoints(client, ctx);
  }

  if (seg1 === 'manifests') {
    if (seg2 === 'build' && method === 'POST') return handleBuildManifest(req, client, orgId, ctx);
    if (seg2 === ''      && method === 'GET')  return handleGetManifests(req, client, orgId, ctx);
  }

  if (seg1 === 'deliveries') {
    if (seg2 === 'create'    && method === 'POST') return handleCreateDelivery(req, client, orgId, ctx);
    if (seg2 === 'attempt'   && method === 'POST') return handleRegisterAttempt(req, client, orgId, ctx);
    if (seg2 === 'finalize'  && method === 'POST') return handleFinalizeDelivery(req, client, orgId, ctx);
    if (seg2 === 'integrity' && method === 'POST') return handleVerifyDeliveryIntegrity(req, client, orgId, ctx);
    if (seg2 === ''          && method === 'GET')  return handleGetDeliveries(req, client, orgId, ctx);
  }

  if (seg1 === 'validate' && seg2 === 'phase5d' && method === 'GET') {
    return handleValidatePhase5d(client, ctx);
  }

  // Phase 5E: PKI trust infrastructure routes  (seg1 = 'pki')
  if (seg1 === 'pki') {
    // Trust anchors
    if (seg2 === 'anchors' && seg3 === 'register' && method === 'POST') {
      return handleRegisterTrustAnchor(client, req);
    }
    if (seg2 === 'anchors' && seg3 === '' && method === 'GET') {
      return handleGetTrustAnchors(client, ctx);
    }
    // Certificate chains
    if (seg2 === 'chains' && seg3 === 'register' && method === 'POST') {
      return handleRegisterCertificateChain(client, req);
    }
    if (seg2 === 'chains' && seg3 === '' && method === 'GET') {
      return handleGetCertificateChains(client, ctx);
    }
    if (seg2 === 'chains' && seg3 === 'validate' && method === 'POST') {
      return handleValidateCertificateChain(client, req);
    }
    if (seg2 === 'chains' && seg3 === 'revocation' && method === 'POST') {
      return handleVerifyRevocationStatus(client, req);
    }
    // Signed authority receipts
    if (seg2 === 'signed-receipts' && seg3 === 'register' && method === 'POST') {
      return handleRegisterSignedReceipt(client, req, orgId);
    }
    if (seg2 === 'signed-receipts' && seg3 === '' && method === 'GET') {
      return handleGetSignedReceipts(client, ctx, orgId);
    }
    if (seg2 === 'signed-receipts' && seg3 === 'verify' && method === 'POST') {
      return handleVerifyAuthoritySignature(client, req);
    }
    // Transport authenticity
    if (seg2 === 'authenticity' && method === 'POST') {
      return handleVerifyTransportAuthenticity(client, req, orgId);
    }
  }

  if (seg1 === 'validate' && seg2 === 'phase5e' && method === 'GET') {
    return handleValidatePhase5e(client, ctx);
  }

  // Phase 5F: Temporal evidence routes (seg1 = 'temporal')
  if (seg1 === 'temporal') {
    // Timestamp authorities
    if (seg2 === 'authorities' && seg3 === 'register' && method === 'POST') {
      return handleRegisterTimestampAuthority(client, req);
    }
    if (seg2 === 'authorities' && seg3 === '' && method === 'GET') {
      return handleGetTimestampAuthorities(client, ctx);
    }
    // Temporal evidence
    if (seg2 === 'evidence' && seg3 === 'issue' && method === 'POST') {
      return handleIssueTimestampEvidence(client, req, orgId);
    }
    if (seg2 === 'evidence' && seg3 === '' && method === 'GET') {
      return handleGetTemporalEvidence(client, ctx, orgId, req);
    }
    if (seg2 === 'evidence' && seg3 === 'verify-signature' && method === 'POST') {
      return handleVerifyTimestampSignature(client, req);
    }
    if (seg2 === 'evidence' && seg3 === 'verify-nonrepudiation' && method === 'POST') {
      return handleVerifyTemporalNonrepudiation(client, req);
    }
    // Chronology lineage
    if (seg2 === 'chronology' && seg3 === '' && method === 'GET') {
      return handleGetChronologyLineage(client, ctx, orgId, req);
    }
    if (seg2 === 'chronology' && seg3 === 'integrity' && method === 'POST') {
      return handleVerifyChainIntegrity(client, req, orgId);
    }
    // Temporal snapshots
    if (seg2 === 'snapshots' && seg3 === 'create' && method === 'POST') {
      return handleCreateTemporalSnapshot(client, req, orgId);
    }
    if (seg2 === 'snapshots' && seg3 === '' && method === 'GET') {
      return handleGetTemporalSnapshots(client, ctx, orgId, req);
    }
    // Replay certificates
    if (seg2 === 'replay' && seg3 === 'certificate' && method === 'POST') {
      return handleGenerateTemporalReplayCertificate(client, req, orgId);
    }
    if (seg2 === 'replay' && seg3 === '' && method === 'GET') {
      return handleGetReplayValidationSnapshots(client, ctx, orgId, req);
    }
    // Certificate validation at timestamp
    if (seg2 === 'validate-at-timestamp' && method === 'POST') {
      return handleValidateCertAtTimestamp(client, req);
    }
    // Phase 5F-Audit: Serializer registry
    if (seg2 === 'serializers' && seg3 === 'register' && method === 'POST') {
      return handleRegisterSerializerProfile(client, req);
    }
    if (seg2 === 'serializers' && seg3 === '' && method === 'GET') {
      return handleGetSerializerRegistry(client, ctx);
    }
    if (seg2 === 'serializers' && seg3 === 'validate-compatibility' && method === 'POST') {
      return handleValidateSerializerCompatibility(client, req, ctx);
    }
    if (seg2 === 'serializers' && seg3 === 'verify-replay' && method === 'POST') {
      return handleVerifySerializerReplay(client, req, ctx);
    }
    if (seg2 === 'serializers' && seg3 === 'reconstruct' && method === 'POST') {
      return handleReconstructSerializerVersion(client, req, ctx);
    }
    // Phase 5F-Audit: Security context
    if (seg2 === 'security' && seg3 === 'assert' && method === 'POST') {
      return handleAssertTemporalSecurityContext(client, req, orgId, ctx);
    }
    // Phase 5F-Audit: Replay range windows (extended replay sub-path)
    if (seg2 === 'replay' && seg3 === 'range-window' && method === 'POST') {
      return handleCreateReplayRangeWindow(client, req, orgId, ctx);
    }
    if (seg2 === 'replay' && seg3 === 'range-windows' && method === 'GET') {
      return handleGetReplayRangeWindows(client, req, orgId, ctx);
    }
    // Phase 5F-Audit: Chronology archives (extended chronology sub-path)
    if (seg2 === 'chronology' && seg3 === 'archive' && method === 'POST') {
      return handlePrepareChronologyArchive(client, req, orgId, ctx);
    }
    if (seg2 === 'chronology' && seg3 === 'archives' && method === 'GET') {
      return handleGetChronologyArchives(client, req, orgId, ctx);
    }
  }

  if (seg1 === 'validate' && seg2 === 'phase5f' && method === 'GET') {
    return handleValidatePhase5f(client, ctx);
  }

  if (seg1 === 'validate' && seg2 === 'phase5f-audit' && method === 'GET') {
    return handleValidatePhase5fAudit(client, ctx);
  }

  // Phase 6A: Replay Test Harness routes (seg1 = 'harness')
  if (seg1 === 'harness') {
    if (seg2 === 'run-test' && method === 'POST') {
      return handleRunReplayTest(client, req, orgId, ctx);
    }
    if (seg2 === 'reconstruct' && method === 'POST') {
      return handleRunFullReplayReconstruction(client, req, orgId, ctx);
    }
    if (seg2 === 'validate-determinism' && method === 'POST') {
      return handleValidateReplayDeterminism(client, req, orgId, ctx);
    }
    if (seg2 === 'compare-runs' && method === 'POST') {
      return handleCompareReplayRuns(client, req, ctx);
    }
    if (seg2 === 'reproducibility-report' && method === 'POST') {
      return handleGenerateReplayReproducibilityReport(client, req, orgId, ctx);
    }
  }

  // Phase 6A: Serializer Drift routes (seg1 = 'drift')
  if (seg1 === 'drift') {
    if (seg2 === 'detect' && method === 'GET') {
      return handleDetectSerializerDrift(client, req, ctx);
    }
    if (seg2 === 'report' && method === 'POST') {
      return handleGenerateSerializerDriftReport(client, req, orgId, ctx);
    }
    if (seg2 === 'schema-integrity' && method === 'GET') {
      return handleGetSchemaHashIntegrity(client, ctx);
    }
  }

  // Phase 6A: Benchmark routes (seg1 = 'benchmark')
  if (seg1 === 'benchmark') {
    if (seg2 === 'replay-engine' && method === 'POST') {
      return handleBenchmarkReplayEngine(client, req, orgId, ctx);
    }
    if (seg2 === 'performance-report' && method === 'POST') {
      return handleGenerateReplayPerformanceReport(client, req, orgId, ctx);
    }
  }

  // Phase 6A: Backup/Restore routes (seg1 = 'restore')
  if (seg1 === 'restore') {
    if (seg2 === 'validate' && method === 'POST') {
      return handleValidateReplayAfterRestore(client, req, orgId, ctx);
    }
    if (seg2 === 'chain-validate' && method === 'POST') {
      return handleValidateTemporalChainAfterRestore(client, req, orgId, ctx);
    }
    if (seg2 === 'reproducibility' && method === 'POST') {
      return handleValidateRestoreReproducibility(client, req, orgId, ctx);
    }
    if (seg2 === 'integrity-report' && method === 'POST') {
      return handleGenerateRestoreIntegrityReport(client, req, orgId, ctx);
    }
  }

  // Phase 6A: Tenant Isolation routes (seg1 = 'isolation')
  if (seg1 === 'isolation') {
    if (seg2 === 'validate' && method === 'POST') {
      return handleValidateTenantReplayIsolation(client, req, orgId, ctx);
    }
    if (seg2 === 'report' && method === 'POST') {
      return handleGenerateTenantIsolationReport(client, req, orgId, ctx);
    }
  }

  // Phase 6A: Operational Health routes (seg1 = 'health')
  if (seg1 === 'health') {
    if (seg2 === 'check' && method === 'GET') {
      return handleRunReplayHealthCheck(client, orgId, ctx);
    }
    if (seg2 === 'chronology-integrity' && method === 'POST') {
      return handleValidateChronologyIntegrity(client, req, orgId, ctx);
    }
    if (seg2 === 'detect-corruption' && method === 'POST') {
      return handleDetectReplayChainCorruption(client, req, orgId, ctx);
    }
    if (seg2 === 'detect-drift' && method === 'POST') {
      return handleDetectReplayHashDivergence(client, req, orgId, ctx);
    }
  }

  // Phase 6A: Validation Suite route
  if (seg1 === 'validate' && seg2 === 'phase6a' && method === 'GET') {
    return handleValidatePhase6a(client, ctx);
  }

  // ── Phase 6B: Replay CI/CD routes (seg1 = 'ci') ───────────────────────────
  if (seg1 === 'ci') {
    if (seg2 === 'run-pipeline' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('run_replay_ci_pipeline', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'CI_PIPELINE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'validate-migration' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('validate_migration_reproducibility', {
        p_org_id: orgId, p_migration_ver: body.migration_ver,
        p_pre_hash: body.pre_hash, p_post_hash: body.post_hash, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'MIGRATION_REPRO_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'post-deploy-integrity' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('verify_post_deploy_replay_integrity', {
        p_org_id: orgId, p_deploy_ver: body.deploy_ver, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'DEPLOY_INTEGRITY_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'smoke-tests' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('execute_replay_smoke_tests', {
        p_org_id: orgId, p_run_id: body.run_id, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'SMOKE_TESTS_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'deployment-report' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('generate_deployment_integrity_report', {
        p_org_id: orgId, p_deploy_ver: body.deploy_ver, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'DEPLOYMENT_REPORT_ERROR');
      return ok(ctx, data);
    }
  }

  // ── Phase 6B: Shadow Rebuild routes (seg1 = 'rebuild') ───────────────────
  if (seg1 === 'rebuild') {
    if (seg2 === 'run' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('run_shadow_rebuild_validation', {
        p_org_id: orgId, p_rebuild_ver: body.rebuild_ver, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'SHADOW_REBUILD_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'compare' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('compare_primary_vs_shadow_replay', {
        p_primary_hash: body.primary_hash, p_shadow_hash: body.shadow_hash,
      });
      if (error) return err(ctx, error.message, 500, 'SHADOW_COMPARE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'validate-equivalence' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('validate_shadow_replay_equivalence', {
        p_org_id: orgId, p_primary_hash: body.primary_hash,
        p_shadow_hash: body.shadow_hash, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'SHADOW_EQUIV_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'detect-divergence' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('detect_rebuild_divergence', {
        p_org_id: orgId, p_run_id: body.run_id,
        p_primary_hash: body.primary_hash, p_shadow_hash: body.shadow_hash,
        p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'REBUILD_DIVERGENCE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'report' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('generate_shadow_rebuild_report', {
        p_org_id: orgId, p_rebuild_ver: body.rebuild_ver, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'SHADOW_REPORT_ERROR');
      return ok(ctx, data);
    }
  }

  // ── Phase 6B: Restore Simulation routes (seg1 = 'simulation') ────────────
  if (seg1 === 'simulation') {
    if (seg2 === 'cold-restore' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('simulate_cold_restore_validation', {
        p_org_id: orgId, p_sim_ver: body.sim_ver, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'COLD_RESTORE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'equivalence' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('validate_restore_replay_equivalence', {
        p_org_id: orgId, p_pre_hash: body.pre_hash,
        p_post_hash: body.post_hash, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'RESTORE_EQUIV_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'compare-hashes' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('compare_restore_hashes', {
        p_pre_hash: body.pre_hash, p_post_hash: body.post_hash,
      });
      if (error) return err(ctx, error.message, 500, 'RESTORE_COMPARE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'benchmark' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('benchmark_restore_reconstruction', {
        p_org_id: orgId, p_run_id: body.run_id,
        p_elements: body.elements, p_elapsed_ms: body.elapsed_ms,
        p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'RESTORE_BENCHMARK_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'report' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('generate_restore_simulation_report', {
        p_org_id: orgId, p_sim_ver: body.sim_ver, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'RESTORE_REPORT_ERROR');
      return ok(ctx, data);
    }
  }

  // ── Phase 6B: Archive Lifecycle routes (seg1 = 'archive') ────────────────
  if (seg1 === 'archive') {
    if (seg2 === 'create-batch' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('create_replay_archive_batch', {
        p_org_id: orgId, p_entity_type: body.entity_type,
        p_elements_count: body.elements_count, p_chain_before: body.chain_before,
        p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'ARCHIVE_BATCH_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'validate-integrity' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('validate_archive_replay_integrity', {
        p_org_id: orgId, p_batch_id: body.batch_id, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'ARCHIVE_INTEGRITY_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'hash-continuity' && method === 'GET') {
      const url   = new URL(req.url);
      const chainBefore  = url.searchParams.get('chain_before') ?? '';
      const chainAfter   = url.searchParams.get('chain_after') ?? '';
      const entityType   = url.searchParams.get('entity_type') ?? '';
      const elementsCount = parseInt(url.searchParams.get('elements_count') ?? '0', 10);
      const { data, error } = await client.rpc('verify_archive_hash_continuity', {
        p_chain_before: chainBefore, p_chain_after: chainAfter,
        p_entity_type: entityType, p_elements_count: elementsCount,
      });
      if (error) return err(ctx, error.message, 500, 'ARCHIVE_CONTINUITY_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'reconstruct' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('reconstruct_replay_from_archive', {
        p_org_id: orgId, p_batch_id: body.batch_id, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'ARCHIVE_RECONSTRUCT_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'report' && method === 'GET') {
      const { data, error } = await client.rpc('generate_archive_integrity_report', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'ARCHIVE_REPORT_ERROR');
      return ok(ctx, data);
    }
  }

  // ── Phase 6B: Operational Observability routes (seg1 = 'observe') ─────────
  if (seg1 === 'observe') {
    if (seg2 === 'collect-metrics' && method === 'POST') {
      const { data, error } = await client.rpc('collect_replay_operational_metrics', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'METRICS_COLLECT_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'growth-rate' && method === 'GET') {
      const { data, error } = await client.rpc('calculate_chronology_growth_rate', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'GROWTH_RATE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'detect-anomalies' && method === 'POST') {
      const { data, error } = await client.rpc('detect_replay_integrity_anomalies', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'INTEGRITY_ANOMALY_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'health' && method === 'GET') {
      const { data, error } = await client.rpc('validate_operational_replay_health', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'OPERATIONAL_HEALTH_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'report' && method === 'GET') {
      const { data, error } = await client.rpc('generate_operability_report', {
        p_org_id: orgId, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'OPERABILITY_REPORT_ERROR');
      return ok(ctx, data);
    }
  }

  // ── Phase 6B: Anomaly Detection routes (seg1 = 'anomaly') ────────────────
  if (seg1 === 'anomaly') {
    if (seg2 === 'detect' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('detect_replay_anomalies', {
        p_org_id: orgId, p_entity_type: body.entity_type,
        p_entity_id: body.entity_id ?? null, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'ANOMALY_DETECT_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'discontinuities' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('detect_chronology_discontinuities', {
        p_org_id: orgId, p_entity_type: body.entity_type,
        p_entity_id: body.entity_id ?? null, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'DISCONTINUITY_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'chain-integrity' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('validate_replay_chain_integrity', {
        p_org_id: orgId, p_entity_type: body.entity_type,
        p_entity_id: body.entity_id ?? null, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'CHAIN_INTEGRITY_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'serializer-divergence' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('detect_serializer_divergence', {
        p_org_id: orgId, p_serializer_key: body.serializer_key,
        p_expected_hash: body.expected_hash, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'SERIALIZER_DIVERGENCE_ERROR');
      return ok(ctx, data);
    }
    if (seg2 === 'report' && method === 'POST') {
      const body = await req.json();
      const { data, error } = await client.rpc('generate_replay_anomaly_report', {
        p_org_id: orgId, p_entity_type: body.entity_type,
        p_entity_id: body.entity_id ?? null, p_actor_id: ctx.actorId,
      });
      if (error) return err(ctx, error.message, 500, 'ANOMALY_REPORT_ERROR');
      return ok(ctx, data);
    }
  }

  // Phase 6B: Validation Suite route
  if (seg1 === 'validate' && seg2 === 'phase6b' && method === 'GET') {
    const { data, error } = await client.rpc('run_phase6b_validation_suite', {});
    if (error) return err(ctx, error.message, 500, 'PHASE6B_VALIDATION_ERROR');
    return ok(ctx, data);
  }

  return err(ctx, 'Not found', 404, 'NOT_FOUND');
}));
