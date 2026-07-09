/**
 * replay-architecture — Accounting architecture governance: canonical hashing,
 *                        replay certifications, execution jobs, and export hashes.
 *
 * Routes:
 *   GET  /replay-architecture/layers                    — accounting layer registry
 *   POST /replay-architecture/certify/:period_id        — certify period replay
 *   GET  /replay-architecture/certifications/:period_id — certifications for period
 *   POST /replay-architecture/certificate/:fy_id        — generate integrity certificate
 *   GET  /replay-architecture/certificates/:fy_id       — integrity certificates for fiscal year
 *   POST /replay-architecture/jobs/enqueue              — enqueue replay job
 *   GET  /replay-architecture/jobs/:id                  — get job by ID
 *   GET  /replay-architecture/jobs                      — queued jobs
 *   GET  /replay-architecture/deltas/:period_id         — validation deltas for period
 *   GET  /replay-architecture/export-hashes/:period_id  — canonical export hashes for period
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveCors } from '../_shared/cors.ts';
import { buildEdgeContext, type EdgeRequestContext } from '../_shared/context.ts';
import { enforceIpRateLimit, enforceUserRateLimit } from '../_shared/rate-limit.ts';
import { buildErrorResponse } from '../_shared/errors.ts';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(ctx: EdgeRequestContext, message: string, status: number, code: string): Response {
  return buildErrorResponse(ctx, status, code, message);
}
function hasPermission(ctx: EdgeRequestContext, perm: string): boolean {
  return ctx.permissions.includes(perm);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetLayers(client: any, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('accounting_layer_registry')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCertifyPeriod(periodId: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:governance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('certify_period_replay', {
    p_org_id:    orgId,
    p_period_id: periodId,
    p_actor_id:  ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CERTIFICATION_FAILED');
  return json(data, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetCertifications(periodId: string, req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const status = new URL(req.url).searchParams.get('status');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('replay_certifications')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('certified_at', { ascending: false });

  if (status !== null) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGenerateCertificate(fiscalYearId: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:governance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client.rpc('generate_integrity_certificate', {
    p_org_id:        orgId,
    p_fiscal_year_id: fiscalYearId,
    p_actor_id:      ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'CERTIFICATE_FAILED');
  return json({ certificate_id: data as string }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetCertificates(fiscalYearId: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_integrity_certificates')
    .select('*')
    .eq('organization_id', orgId)
    .eq('fiscal_year_id', fiscalYearId)
    .order('generated_at', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetCertificateById(certId: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_integrity_certificates')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', certId)
    .maybeSingle();
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  if (data === null) return err(ctx, 'Certificate not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEnqueueJob(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:governance:manage')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(ctx, 'Invalid JSON body', 400, 'VALIDATION_ERROR'); }

  const { job_type, period_id, fiscal_year_id, priority } = body;
  if (!job_type) return err(ctx, 'job_type is required', 400, 'VALIDATION_ERROR');

  const { data, error } = await client.rpc('enqueue_replay_job', {
    p_org_id:        orgId,
    p_job_type:      job_type as string,
    p_period_id:     (period_id as string | undefined) ?? null,
    p_fiscal_year_id: (fiscal_year_id as string | undefined) ?? null,
    p_priority:      (priority as number | undefined) ?? 50,
    p_requested_by:  ctx.actorId,
  });
  if (error) return err(ctx, error.message, 422, 'ENQUEUE_FAILED');
  return json({ job_id: data as string }, 201);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetJob(jobId: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_execution_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  if (data === null) return err(ctx, 'Job not found', 404, 'NOT_FOUND');
  return json(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleListJobs(req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const status = new URL(req.url).searchParams.get('status') ?? 'queued';

  const { data, error } = await client
    .from('replay_execution_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', status)
    .order('priority', { ascending: false })
    .order('queued_at', { ascending: true });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetDeltas(periodId: string, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const { data, error } = await client
    .from('replay_validation_deltas')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('delta_amount', { ascending: false });
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGetExportHashes(periodId: string, req: Request, client: any, orgId: string, ctx: EdgeRequestContext): Promise<Response> {
  if (!hasPermission(ctx, 'finance:replay:read')) return err(ctx, 'Forbidden', 403, 'FORBIDDEN');

  const exportType = new URL(req.url).searchParams.get('export_type');

  // eslint-disable-next-line prefer-const
  let q = client
    .from('canonical_export_hashes')
    .select('*')
    .eq('organization_id', orgId)
    .eq('period_id', periodId)
    .order('generated_at', { ascending: false });

  if (exportType !== null) q = q.eq('export_type', exportType);

  const { data, error } = await q;
  if (error) return err(ctx, error.message, 500, 'QUERY_FAILED');
  return json({ data: data ?? [] });
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
  const fnIdx    = segments.findLastIndex((s) => s === 'replay-architecture');
  const seg1     = segments[fnIdx + 1] ?? '';
  const seg2     = segments[fnIdx + 2] ?? '';
  const method   = req.method;

  const id2 = UUID_RE.test(seg2) ? seg2 : null;

  // GET /replay-architecture/layers
  if (seg1 === 'layers' && method === 'GET') {
    return handleGetLayers(client, ctx);
  }
  // POST /replay-architecture/certify/:period_id
  if (seg1 === 'certify' && id2 !== null && method === 'POST') {
    return handleCertifyPeriod(id2, client, orgId, ctx);
  }
  // GET /replay-architecture/certifications/:period_id
  if (seg1 === 'certifications' && id2 !== null && method === 'GET') {
    return handleGetCertifications(id2, req, client, orgId, ctx);
  }
  // POST /replay-architecture/certificate/:fy_id — generate integrity certificate
  if (seg1 === 'certificate' && id2 !== null && method === 'POST') {
    return handleGenerateCertificate(id2, client, orgId, ctx);
  }
  // GET /replay-architecture/certificates/:id — by fiscal year OR single certificate
  if (seg1 === 'certificates' && id2 !== null && method === 'GET') {
    // Could be a fiscal year ID or a certificate ID; try fiscal year first via dedicated query
    // then fall back to single certificate lookup — both return sensible results
    const url = new URL(req.url);
    if (url.searchParams.get('by') === 'certificate') {
      return handleGetCertificateById(id2, client, orgId, ctx);
    }
    return handleGetCertificates(id2, client, orgId, ctx);
  }
  // POST /replay-architecture/jobs/enqueue
  if (seg1 === 'jobs' && seg2 === 'enqueue' && method === 'POST') {
    return handleEnqueueJob(req, client, orgId, ctx);
  }
  // GET /replay-architecture/jobs/:id  or  GET /replay-architecture/jobs
  if (seg1 === 'jobs' && method === 'GET') {
    if (id2 !== null) return handleGetJob(id2, client, orgId, ctx);
    return handleListJobs(req, client, orgId, ctx);
  }
  // GET /replay-architecture/deltas/:period_id
  if (seg1 === 'deltas' && id2 !== null && method === 'GET') {
    return handleGetDeltas(id2, client, orgId, ctx);
  }
  // GET /replay-architecture/export-hashes/:period_id
  if (seg1 === 'export-hashes' && id2 !== null && method === 'GET') {
    return handleGetExportHashes(id2, req, client, orgId, ctx);
  }

  return err(ctx, 'Not found', 404, 'NOT_FOUND');
}));
