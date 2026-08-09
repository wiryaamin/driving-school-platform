import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Mail, Phone, Clock, CheckCircle, XCircle, MessageSquare, ExternalLink, Copy, Check, Settings2, FileText } from 'lucide-react';
import { Button, Skeleton, toast, Switch } from '@platform/ui';
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

// ─── Form field configuration ──────────────────────────────────────────────────
// Mirrors supabase/functions/_shared/public-booking-form-config.ts's
// CONFIGURABLE_FIELDS exactly — kept in sync by hand (Edge Functions cannot
// import workspace packages, so this list can't be shared at the type level).

const CONFIGURABLE_FIELDS: { key: string; label: string }[] = [
  { key: 'preferred_start_date',      label: 'Önskat startdatum' },
  { key: 'driving_experience',        label: 'Körerfarenhet' },
  { key: 'learner_permit_status',     label: 'Körkortstillstånd' },
  { key: 'preferred_transmission',    label: 'Önskad växellåda' },
  { key: 'preferred_lesson_times',    label: 'Önskade lektionstider' },
  { key: 'preferred_language',        label: 'Önskat språk' },
  { key: 'existing_license_category', label: 'Befintligt körkort' },
  { key: 'training_needs',            label: 'Teori / Risk 1 / Risk 2-behov' },
  { key: 'notes',                     label: 'Meddelande' },
];

const ALL_LICENSE_CATEGORIES = [
  { value: 'AM',  label: 'AM — Moped klass II'     },
  { value: 'A1',  label: 'A1 — Lätt MC'            },
  { value: 'A2',  label: 'A2 — Mellantung MC'      },
  { value: 'A',   label: 'A — Tung MC'             },
  { value: 'B',   label: 'B — Personbil'           },
  { value: 'BE',  label: 'BE — Personbil med släp' },
  { value: 'C1',  label: 'C1 — Lätt lastbil'       },
  { value: 'C',   label: 'C — Lastbil'             },
  { value: 'CE',  label: 'CE — Lastbil med släp'   },
  { value: 'D1',  label: 'D1 — Minibuss'           },
  { value: 'D',   label: 'D — Buss'                },
];

const LANGUAGE_OPTIONS = [
  { value: 'sv', label: 'Svenska' }, { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' }, { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' }, { value: 'so', label: 'Soomaali' },
  { value: 'ku', label: 'Kurdî' }, { value: 'fa', label: 'فارسی' },
];

interface FieldConfig { visible: boolean; required: boolean }
interface PublicBookingFormSettings {
  fields:                     Record<string, FieldConfig>;
  license_categories:         string[];
  default_preferred_language: string;
}

function defaultFormSettings(): PublicBookingFormSettings {
  const fields: Record<string, FieldConfig> = {};
  for (const f of CONFIGURABLE_FIELDS) fields[f.key] = { visible: true, required: false };
  return {
    fields,
    license_categories:         ALL_LICENSE_CATEGORIES.map(c => c.value),
    default_preferred_language: 'sv',
  };
}

// ─── Form field settings panel ─────────────────────────────────────────────────

function FormSettingsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery<PublicBookingFormSettings>({
    queryKey: ['settings', 'public-booking-form', orgId],
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      const s = ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? {};
      const raw = (s['public_booking_form'] as Partial<PublicBookingFormSettings> | undefined) ?? {};
      const defaults = defaultFormSettings();
      return {
        fields: { ...defaults.fields, ...(raw.fields ?? {}) },
        license_categories:         raw.license_categories?.length ? raw.license_categories : defaults.license_categories,
        default_preferred_language: raw.default_preferred_language ?? defaults.default_preferred_language,
      };
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<PublicBookingFormSettings>(defaultFormSettings());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  function updateField(key: string, patch: Partial<FieldConfig>) {
    setDraft(prev => ({ ...prev, fields: { ...prev.fields, [key]: { ...prev.fields[key]!, ...patch } } }));
    setDirty(true);
  }
  function toggleCategory(value: string) {
    setDraft(prev => ({
      ...prev,
      license_categories: prev.license_categories.includes(value)
        ? prev.license_categories.filter(c => c !== value)
        : [...prev.license_categories, value],
    }));
    setDirty(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const { data: cur } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      const currentSettings = ((cur as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? {};
      const { error } = await supabase.from('organizations').update({
        settings: { ...currentSettings, public_booking_form: draft },
      } as never).eq('id', orgId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings', 'public-booking-form', orgId] });
      setDirty(false);
      toast({ title: 'Formulärinställningar sparade' });
    },
    onError: (e) => toast({ title: 'Kunde inte spara', description: e.message, variant: 'destructive' }),
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Formulärinställningar
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Styr vilka fält som visas och krävs på ert publika anmälningsformulär.
          </p>
        </div>
        {dirty && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        )}
      </div>

      {/* Per-field visible/required toggles */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fält</p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {CONFIGURABLE_FIELDS.map(f => {
            const cfg = draft.fields[f.key] ?? { visible: true, required: false };
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-sm text-foreground">{f.label}</span>
                <div className="flex items-center gap-4 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Switch checked={cfg.visible} onCheckedChange={(v) => updateField(f.key, { visible: v, ...(!v ? { required: false } : {}) })} />
                    Synlig
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Switch checked={cfg.required} disabled={!cfg.visible} onCheckedChange={(v) => updateField(f.key, { required: v })} />
                    Obligatorisk
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* License categories offered */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Körkortskategorier som erbjuds</p>
        <div className="flex flex-wrap gap-2">
          {ALL_LICENSE_CATEGORIES.map(c => {
            const checked = draft.license_categories.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCategory(c.value)}
                className={cn(
                  'px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  checked
                    ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700'
                    : 'border-border text-muted-foreground hover:border-foreground/30',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Default preferred language */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standardspråk</p>
        <select
          value={draft.default_preferred_language}
          onChange={(e) => { setDraft(prev => ({ ...prev, default_preferred_language: e.target.value })); setDirty(true); }}
          className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        >
          {LANGUAGE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
    </div>
  );
}

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
          Leads
          {newCount > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">{newCount}</span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Hantera inkommande leads från ditt publika bokningsformulär.
        </p>
      </div>

      {/* Cross-link — see LeadsPage.tsx for the same note; package enrollment
          interest from the catalog is a separate, commercial flow (pricing/
          campaign/coupon data) managed under Anmälningar, not here. */}
      <Link
        to="/enrollments"
        className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
      >
        <FileText className="w-4 h-4 shrink-0" />
        <span>Intresseanmälningar för paket från kurskatalogen visas under <strong className="text-foreground font-medium">Anmälningar</strong>, inte här.</span>
      </Link>

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

      {/* Public form field configuration */}
      {orgId && <FormSettingsPanel orgId={orgId} />}

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
