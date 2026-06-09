/**
 * fortnox — Fortnox sync queue and state management.
 *
 * Routes:
 *   POST /fortnox/queue                  — queue an entity for Fortnox sync
 *   GET  /fortnox/customers              — list pending customer sync records
 *   GET  /fortnox/customers/:studentId   — get customer sync state
 *   GET  /fortnox/invoices               — list pending invoice sync records
 *   GET  /fortnox/invoices/:invoiceId    — get invoice sync state
 *   GET  /fortnox/payments/:paymentId    — get payment sync state
 *   GET  /fortnox/lineage                — list export lineage records
 *   GET  /fortnox/lineage/:runId         — get export lineage for a run
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JSON_CT = { 'Content-Type': 'application/json' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_CT });
}
function err(message: string, status: number, code?: string): Response {
  return json({ error: message, ...(code !== undefined && { code }) }, status);
}
function getOrgId(user: { app_metadata?: Record<string, unknown> }): string | null {
  return (user.app_metadata?.['organization_id'] as string | undefined) ?? null;
}
function hasPermission(user: { app_metadata?: Record<string, unknown> }, perm: string): boolean {
  const perms = (user.app_metadata?.['permissions'] as string[] | undefined) ?? [];
  return perms.includes(perm);
}

function parsePath(req: Request): { resource: string | null; entityId: string | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIdx    = segments.findLastIndex((s) => s === 'fortnox');
  const seg1     = segments[fnIdx + 1] ?? null;
  const seg2     = segments[fnIdx + 2] ?? null;
  return {
    resource: seg1,
    entityId: seg2 && UUID_RE.test(seg2) ? seg2 : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return err('Missing Authorization header', 401, 'UNAUTHORIZED');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return err('Unauthorized', 401, 'UNAUTHORIZED');

  const orgId = getOrgId(user);
  if (!orgId) return err('No organization context', 403, 'NO_ORG');

  if (!hasPermission(user, 'finance:fortnox:manage')) return err('Forbidden', 403, 'FORBIDDEN');

  const { resource, entityId } = parsePath(req);

  try {
    // POST /fortnox/queue
    if (req.method === 'POST' && resource === 'queue') {
      const body = await req.json();
      const { entity, entity_id } = body;
      if (!entity || !entity_id) return err('entity and entity_id are required', 400, 'VALIDATION_ERROR');
      if (!['customer', 'invoice', 'payment'].includes(entity)) return err('entity must be customer, invoice, or payment', 400, 'VALIDATION_ERROR');
      if (!UUID_RE.test(entity_id)) return err('entity_id must be a valid UUID', 400, 'VALIDATION_ERROR');

      const { error } = await supabase.rpc('queue_fortnox_sync' as never, {
        p_org_id:    orgId,
        p_entity:    entity,
        p_entity_id: entity_id,
      });
      if (error) {
        if (error.message?.includes('FORTNOX_QUEUE_UNKNOWN_ENTITY')) return err('Unknown entity type', 422, 'VALIDATION_ERROR');
        throw error;
      }
      return json({ queued: true });
    }

    // GET /fortnox/customers/:studentId
    if (req.method === 'GET' && resource === 'customers' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_customer_sync' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('student_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('Customer sync record not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /fortnox/customers
    if (req.method === 'GET' && resource === 'customers' && !entityId) {
      const url    = new URL(req.url);
      const status = url.searchParams.get('status') ?? 'pending';
      const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
      const { data, error } = await supabase
        .from('fortnox_customer_sync' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('sync_status', status)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // GET /fortnox/invoices/:invoiceId
    if (req.method === 'GET' && resource === 'invoices' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_invoice_sync' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('invoice_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('Invoice sync record not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /fortnox/invoices
    if (req.method === 'GET' && resource === 'invoices' && !entityId) {
      const url    = new URL(req.url);
      const status = url.searchParams.get('status') ?? 'pending';
      const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
      const { data, error } = await supabase
        .from('fortnox_invoice_sync' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('sync_status', status)
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    // GET /fortnox/payments/:paymentId
    if (req.method === 'GET' && resource === 'payments' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_payment_sync' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('payment_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('Payment sync record not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /fortnox/lineage/:runId
    if (req.method === 'GET' && resource === 'lineage' && entityId) {
      const { data, error } = await supabase
        .from('fortnox_export_lineage' as never)
        .select('*')
        .eq('organization_id', orgId)
        .eq('export_run_id', entityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err('Export lineage not found', 404, 'NOT_FOUND');
      return json(data);
    }

    // GET /fortnox/lineage
    if (req.method === 'GET' && resource === 'lineage' && !entityId) {
      const url   = new URL(req.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50);
      const { data, error } = await supabase
        .from('fortnox_export_lineage' as never)
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({ data: data ?? [] });
    }

    return err('Not Found', 404, 'NOT_FOUND');

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[fortnox]', msg);
    return err('Internal server error', 500, 'INTERNAL_ERROR');
  }
});
