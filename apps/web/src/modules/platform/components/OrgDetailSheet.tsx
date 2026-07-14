import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  Badge, Skeleton,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { History, User, Clock } from 'lucide-react';
import type { PlatformOrganization, AuditLogEntry } from '../hooks/usePlatformOrganizations.js';
import { useOrgAuditHistory } from '../hooks/usePlatformOrganizations.js';
import { TIER_LABEL } from '../lib/tierDisplay.js';

// ─── Shared display maps ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  terminated:'bg-gray-100 text-gray-500 dark:bg-gray-800/40 dark:text-gray-400',
};

const SUB_STATUS_LABEL: Record<string, string> = {
  trialing:  'Testperiod',
  active:    'Aktiv',
  past_due:  'Förfallen',
  cancelled: 'Avslutad',
  suspended: 'Suspenderad',
};

// ─── Audit event label ────────────────────────────────────────────────────────

function auditEventLabel(entry: AuditLogEntry): string {
  if (entry.operation === 'INSERT') return 'Organisation skapad';
  if (entry.operation === 'DELETE') return 'Organisation raderad';

  const fields = entry.changed_fields ?? [];
  const newVals = entry.new_values ?? {};

  if (fields.includes('status')) {
    const s = newVals['status'] as string | undefined;
    if (s === 'suspended')  return 'Organisation suspenderad';
    if (s === 'active')     return 'Organisation återaktiverad';
    if (s === 'terminated') return 'Organisation avslutad';
  }
  if (fields.includes('subscription_status')) {
    const ss = newVals['subscription_status'] as string | undefined;
    if (ss === 'trialing') {
      return fields.includes('trial_ends_at') && !fields.includes('status')
        ? 'Testperiod startad'
        : 'Testperiod startad';
    }
    if (ss === 'active')   return 'Testperiod avslutad';
  }
  if (fields.includes('trial_ends_at') && !fields.includes('subscription_status')) {
    return 'Testperiod förlängd';
  }

  return 'Organisation uppdaterad';
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
      <p className="text-xs text-muted-foreground shrink-0 w-32">{label}</p>
      <p className="text-xs font-medium text-foreground text-right break-all">{value}</p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrgDetailSheetProps {
  open:    boolean;
  org:     PlatformOrganization | null;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
//
// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint). See PlatformOrganizationsPage.tsx's ConfirmDialog for
// the reference implementation of this pattern.

export function OrgDetailSheet({ open, org, onClose }: OrgDetailSheetProps) {
  const { data: auditLog, isLoading: auditLoading } = useOrgAuditHistory(org?.id ?? null);

  const contactEmail = org ? ((org.settings['contact_email'] as string | undefined) ?? null) : null;
  const statusClass = org ? (STATUS_BADGE[org.status] ?? 'bg-muted text-muted-foreground') : '';

  return (
    <Sheet open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {org && (
          <>
            <SheetHeader className="pb-4">
              <SheetTitle className="text-lg">{org.name}</SheetTitle>
              <SheetDescription className="text-xs font-mono text-muted-foreground">{org.slug}</SheetDescription>
            </SheetHeader>

            {/* Status chip row */}
            <div className="flex items-center gap-2 flex-wrap mb-5">
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold', statusClass)}>
                {org.status === 'active' ? 'Aktiv' : org.status === 'suspended' ? 'Suspenderad' : 'Avslutad'}
              </span>
              <Badge variant="outline" className="text-[11px]">
                {TIER_LABEL[org.subscription_tier] ?? org.subscription_tier}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                {SUB_STATUS_LABEL[org.subscription_status] ?? org.subscription_status}
              </Badge>
            </div>

            {/* Organization details */}
            <div className="rounded-xl border border-border bg-card px-4 mb-4">
              <InfoRow label="Juridiskt namn"   value={org.legal_name} />
              <InfoRow label="Org.nummer"       value={org.org_number} />
              <InfoRow label="Kontakt-e-post"   value={contactEmail} />
              <InfoRow label="Skapad"           value={new Date(org.created_at).toLocaleDateString('sv-SE')} />
              {org.trial_ends_at && (
                <InfoRow
                  label="Testperiod slutar"
                  value={new Date(org.trial_ends_at).toLocaleDateString('sv-SE')}
                />
              )}
              <InfoRow label="ID" value={org.id} />
            </div>

            {/* Audit history */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <History className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Händelselogg</p>
              </div>

              {auditLoading && (
                <div className="px-4 py-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3.5 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))}
                </div>
              )}

              {!auditLoading && (!auditLog || auditLog.length === 0) && (
                <div className="px-4 py-8 text-center">
                  <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Ingen händelsehistorik</p>
                </div>
              )}

              {!auditLoading && auditLog && auditLog.length > 0 && (
                <div className="divide-y divide-border">
                  {auditLog.map(entry => (
                    <div key={entry.id} className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground">{auditEventLabel(entry)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <User className="w-3 h-3 text-muted-foreground shrink-0" />
                        <p className="text-[11px] text-muted-foreground truncate">
                          {entry.actor_display
                            ?? (entry.actor_id
                              ? `Admin (${entry.actor_id.substring(0, 8)}…)`
                              : 'System')}
                        </p>
                        <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
                          {new Date(entry.occurred_at).toLocaleString('sv-SE', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      {entry.changed_fields && entry.changed_fields.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Fält: {entry.changed_fields.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
