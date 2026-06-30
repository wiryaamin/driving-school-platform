import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Mail, Phone, Clock, CheckCircle, XCircle, MessageSquare, ExternalLink, Copy, Check } from 'lucide-react';
import { Button, Skeleton, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = 'new' | 'contacted' | 'enrolled' | 'declined';

interface Lead {
  id:               string;
  first_name:       string;
  last_name:        string;
  email:            string | null;
  phone:            string | null;
  license_category: string;
  notes:            string | null;
  status:           LeadStatus;
  source:           string;
  created_at:       string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<LeadStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  new:       { label: 'Ny',          cls: 'bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-300',  Icon: Clock        },
  contacted: { label: 'Kontaktad',   cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', Icon: MessageSquare },
  enrolled:  { label: 'Inskriven',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', Icon: CheckCircle   },
  declined:  { label: 'Avböjd',      cls: 'bg-gray-100  text-gray-500  dark:bg-gray-800     dark:text-gray-400',  Icon: XCircle       },
};

const FILTER_TABS: { key: LeadStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'Alla'      },
  { key: 'new',       label: 'Nya'       },
  { key: 'contacted', label: 'Kontaktad' },
  { key: 'enrolled',  label: 'Inskriven' },
  { key: 'declined',  label: 'Avböjd'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Lead row ─────────────────────────────────────────────────────────────────

function LeadRow({ lead, onStatusChange }: { lead: Lead; onStatusChange: (id: string, status: LeadStatus) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[lead.status];
  const { Icon } = meta;

  const nextActions: { status: LeadStatus; label: string }[] = lead.status === 'new'
    ? [{ status: 'contacted', label: 'Markera som kontaktad' }, { status: 'enrolled', label: 'Skriv in som elev' }, { status: 'declined', label: 'Avböj' }]
    : lead.status === 'contacted'
    ? [{ status: 'enrolled', label: 'Skriv in som elev' }, { status: 'declined', label: 'Avböj' }]
    : [];

  return (
    <div className="border-b border-gray-50 dark:border-gray-800 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0 text-sm font-bold text-purple-700 dark:text-purple-300">
          {lead.first_name.charAt(0)}{lead.last_name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {lead.first_name} {lead.last_name}
            </span>
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full', meta.cls)}>
              <Icon className="w-2.5 h-2.5" />
              {meta.label}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {lead.license_category}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatDate(lead.created_at)}</span>
            {lead.email && <span className="truncate">{lead.email}</span>}
            {lead.phone && <span>{lead.phone}</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 ml-12 space-y-3">
          {/* Contact links */}
          <div className="flex flex-wrap gap-2">
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Mail className="w-3.5 h-3.5" />
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Phone className="w-3.5 h-3.5" />
                {lead.phone}
              </a>
            )}
          </div>

          {/* Notes */}
          {lead.notes && (
            <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              {lead.notes}
            </p>
          )}

          {/* Status actions */}
          {nextActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {nextActions.map(a => (
                <button
                  key={a.status}
                  type="button"
                  onClick={() => onStatusChange(lead.id, a.status)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── LeadsSettingsPage ────────────────────────────────────────────────────────

export function LeadsSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [filter, setFilter] = useState<LeadStatus | 'all'>('new');
  const [copied, setCopied] = useState(false);

  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ['settings', 'leads', orgId, filter],
    queryFn: async () => {
      if (!orgId) return [];
      let q = supabase
        .from('student_leads')
        .select('id, first_name, last_name, email, phone, license_category, notes, status, source, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const { data: orgSlug } = useQuery<string | null>({
    queryKey: ['settings', 'org-slug', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('slug').eq('id', orgId).maybeSingle();
      return (data as unknown as { slug?: string } | null)?.slug ?? null;
    },
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from('student_leads')
        .update({ status } as never)
        .eq('id', id)
        .eq('organization_id', orgId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'leads'] });
      toast({ title: 'Status uppdaterad' });
    },
    onError: (e) => {
      toast({ title: 'Kunde inte uppdatera', description: e.message, variant: 'destructive' });
    },
  });

  const bookingUrl = orgSlug
    ? `${window.location.origin}/book?org=${orgSlug}`
    : null;

  function handleCopyUrl() {
    if (!bookingUrl) return;
    void navigator.clipboard.writeText(bookingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const newCount = leads?.filter(l => l.status === 'new').length ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Anmälningar & leads
          {newCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">{newCount}</span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Hantera inkommande anmälningar från din publika bokningssida.
        </p>
      </div>

      {/* Public booking URL */}
      {bookingUrl && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Din bokningslänk</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-foreground truncate bg-background rounded-lg px-3 py-2 border border-border">
              {bookingUrl}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopyUrl} className="shrink-0 gap-1.5">
              {copied ? <><Check className="w-3.5 h-3.5" /> Kopierad</> : <><Copy className="w-3.5 h-3.5" /> Kopiera</>}
            </Button>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Dela länken med potentiella elever. De fyller i ett formulär och du ser anmälningarna nedan.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5 w-fit">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded transition-colors',
              filter === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Leads list */}
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(n => <Skeleton key={n} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : !leads || leads.length === 0 ? (
          <div className="px-5 py-12 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Users className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {filter === 'all' ? 'Inga anmälningar ännu' : `Inga ${STATUS_META[filter as LeadStatus]?.label.toLowerCase() ?? ''} anmälningar`}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
              {filter === 'all' || filter === 'new'
                ? 'Dela din bokningslänk med potentiella elever så visas deras anmälningar här.'
                : 'Inga anmälningar med den valda statusen.'}
            </p>
          </div>
        ) : (
          leads.map(lead => (
            <LeadRow
              key={lead.id}
              lead={lead}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
            />
          ))
        )}
      </div>
    </div>
  );
}
