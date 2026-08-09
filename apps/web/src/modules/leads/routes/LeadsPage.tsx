import { useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Mail, Phone, Clock, CheckCircle, XCircle, MessageSquare,
  TrendingUp, Plus, ChevronRight, ArrowRight, ClipboardList,
} from 'lucide-react';
import { Button, Skeleton, toast, ScrollArea } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';
import { LeadDetailSheet } from '../components/LeadDetailSheet.js';
import { CreateLeadDialog } from '../components/CreateLeadDialog.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'enrolled' | 'declined';

export interface Lead {
  id:                         string;
  first_name:                 string;
  last_name:                  string;
  email:                      string | null;
  phone:                      string | null;
  license_category:           string;
  notes:                      string | null;
  status:                     LeadStatus;
  source:                     string;
  created_at:                 string;
  updated_at:                 string;
  preferred_start_date:       string | null;
  driving_experience:         string | null;
  learner_permit_status:      string | null;
  preferred_transmission:     string;
  preferred_lesson_times:     string[];
  preferred_language:         string;
  existing_license_category:  string | null;
  needs_theory:                boolean;
  needs_risk1:                 boolean;
  needs_risk2:                 boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: { key: LeadStatus; label: string; color: string; bgEmpty: string }[] = [
  { key: 'new',       label: 'Ny',         color: 'border-t-blue-400',   bgEmpty: 'bg-blue-50/50 dark:bg-blue-950/10' },
  { key: 'contacted', label: 'Kontaktad',  color: 'border-t-amber-400',  bgEmpty: 'bg-amber-50/50 dark:bg-amber-950/10' },
  { key: 'enrolled',  label: 'Inskriven',  color: 'border-t-green-400',  bgEmpty: 'bg-green-50/50 dark:bg-green-950/10' },
  { key: 'declined',  label: 'Avböjd',     color: 'border-t-gray-300',   bgEmpty: 'bg-gray-50/50 dark:bg-gray-800/20' },
];

const STATUS_META: Record<LeadStatus, { icon: React.ElementType; cls: string }> = {
  new:       { icon: Clock,          cls: 'text-blue-600 dark:text-blue-400'  },
  contacted: { icon: MessageSquare,  cls: 'text-amber-600 dark:text-amber-400' },
  enrolled:  { icon: CheckCircle,    cls: 'text-green-600 dark:text-green-400' },
  declined:  { icon: XCircle,        cls: 'text-gray-400'                      },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function formatDaysAgo(days: number): string {
  if (days === 0) return 'Idag';
  if (days === 1) return 'Igår';
  return `${days} dagar sedan`;
}

function leadScore(lead: Lead): number {
  let score = 0;
  if (lead.email)            score += 30;
  if (lead.phone)            score += 25;
  if (lead.license_category) score += 15;
  if (lead.notes)            score += 10;
  const age = daysAgo(lead.created_at);
  if (age <= 1)  score += 20;
  else if (age <= 3)  score += 10;
  else if (age <= 7)  score += 5;
  return Math.min(score, 100);
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 70
    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    : score >= 40
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cls)}>
      {score}%
    </span>
  );
}

// ─── FunnelChart ──────────────────────────────────────────────────────────────

function FunnelChart({ counts }: { counts: Record<string, number> }) {
  const stages = COLUMNS.slice(0, 3); // new, contacted, enrolled
  const maxVal = Math.max(...stages.map(s => counts[s.key] ?? 0), 1);

  return (
    <div className="flex items-end gap-1 h-16">
      {stages.map((col, i) => {
        const count = counts[col.key] ?? 0;
        const pct   = count / maxVal;
        const prev  = i > 0 ? (counts[stages[i - 1]!.key] ?? 0) : null;
        const convPct = prev != null && prev > 0 ? Math.round(count / prev * 100) : null;

        return (
          <div key={col.key} className="flex items-end gap-1 flex-1">
            {i > 0 && (
              <div className="self-center text-muted-foreground/50">
                <ArrowRight className="w-3 h-3" />
              </div>
            )}
            <div className="flex-1 flex flex-col items-center gap-1">
              {convPct !== null && (
                <span className="text-[9px] text-muted-foreground">{convPct}%</span>
              )}
              <div
                className={cn(
                  'w-full rounded-t transition-all',
                  col.key === 'new'       ? 'bg-blue-400'  :
                  col.key === 'contacted' ? 'bg-amber-400' : 'bg-green-400',
                )}
                style={{ height: `${Math.max(pct * 40, 4)}px` }}
              />
              <span className="text-[10px] font-semibold text-foreground">{count}</span>
              <span className="text-[9px] text-muted-foreground leading-tight text-center">{col.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  onDragStart,
  onClick,
}: {
  lead:        Lead;
  onDragStart: (id: string) => void;
  onClick:     (lead: Lead) => void;
}) {
  const age   = daysAgo(lead.created_at);
  const score = leadScore(lead);
  const { icon: StatusIcon, cls } = STATUS_META[lead.status];

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onClick={() => onClick(lead)}
      className="bg-card border border-border rounded-xl p-3 cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all group select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-700 dark:text-purple-300 shrink-0">
            {lead.first_name.charAt(0)}{lead.last_name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">
              {lead.first_name} {lead.last_name}
            </p>
            <p className="text-[10px] text-muted-foreground">{lead.license_category}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ScoreBadge score={score} />
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
        {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
        {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className={cn('text-[10px] flex items-center gap-1', cls)}>
          <StatusIcon className="w-3 h-3" />
          {formatDaysAgo(age)}
        </span>
        {lead.source !== 'public_form' && (
          <span className="text-[10px] text-muted-foreground">{lead.source}</span>
        )}
      </div>
    </div>
  );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({
  column, leads, draggingId: _draggingId, onDrop, onDragStart, onCardClick,
}: {
  column:      typeof COLUMNS[number];
  leads:       Lead[];
  draggingId:  string | null;
  onDrop:      (status: LeadStatus) => void;
  onDragStart: (id: string) => void;
  onCardClick: (lead: Lead) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={cn(
        'flex flex-col min-w-[220px] flex-1 rounded-xl border border-border border-t-4 bg-muted/20',
        column.color,
        over && 'ring-2 ring-primary/30',
      )}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(column.key); }}
    >
      {/* Column header */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{column.label}</span>
          <span className="text-xs font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {leads.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 pb-3 space-y-2">
          {leads.length === 0 ? (
            <div className={cn(
              'rounded-lg border-2 border-dashed border-border/50 py-8 flex items-center justify-center',
              column.bgEmpty,
            )}>
              <p className="text-xs text-muted-foreground">Dra hit</p>
            </div>
          ) : (
            leads.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onDragStart={onDragStart}
                onClick={onCardClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── LeadsPage ────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const dragIdRef = useRef<string | null>(null);

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['leads', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('student_leads')
        .select(`
          id, first_name, last_name, email, phone, license_category, notes, status, source, created_at, updated_at,
          preferred_start_date, driving_experience, learner_permit_status, preferred_transmission,
          preferred_lesson_times, preferred_language, existing_license_category, needs_theory, needs_risk1, needs_risk2
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as Lead[];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase
        .from('student_leads')
        .update({ status, updated_at: new Date().toISOString() } as never)
        .eq('id', id)
        .eq('organization_id', orgId!);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads', orgId] });
    },
    onError: (e) => {
      toast({ title: 'Kunde inte uppdatera', description: e.message, variant: 'destructive' });
    },
  });

  // Group leads by status
  const byStatus = useMemo(() => {
    const m: Record<LeadStatus, Lead[]> = { new: [], contacted: [], enrolled: [], declined: [] };
    for (const lead of leads) m[lead.status].push(lead);
    return m;
  }, [leads]);

  const counts: { new: number; contacted: number; enrolled: number; declined: number } = {
    new:       byStatus.new.length,
    contacted: byStatus.contacted.length,
    enrolled:  byStatus.enrolled.length,
    declined:  byStatus.declined.length,
  };

  function handleDragStart(id: string) {
    dragIdRef.current = id;
    setDraggingId(id);
  }

  function handleDrop(targetStatus: LeadStatus) {
    const id = dragIdRef.current;
    if (!id) return;
    const lead = leads.find(l => l.id === id);
    if (!lead || lead.status === targetStatus) {
      setDraggingId(null);
      return;
    }
    updateStatus.mutate({ id, status: targetStatus });
    setDraggingId(null);
    dragIdRef.current = null;
  }

  const totalActive = counts.new + counts.contacted;
  const newCount = counts.new;

  return (
    <div className="flex flex-col h-full gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Leads
            {newCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">{newCount} ny{newCount !== 1 ? 'a' : ''}</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalActive} aktiva leads · {counts.enrolled} inskrivna
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Ny lead
        </Button>
      </div>

      {/* Cross-link: package enrollment interest goes through a separate,
          commercial flow (pricing/campaign/coupon data attached) and is
          managed on its own page — not silently merged into this list, but
          made discoverable from here since both start as "someone showed
          interest." */}
      <Link
        to="/enrollments"
        className="shrink-0 flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
      >
        <ClipboardList className="w-4 h-4 shrink-0" />
        <span>Intresseanmälningar för paket från kurskatalogen visas under <strong className="text-foreground font-medium">Anmälningar</strong>, inte här.</span>
        <ArrowRight className="w-3.5 h-3.5 shrink-0 ml-auto" />
      </Link>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {COLUMNS.map(col => (
          <div key={col.key} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{col.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{counts[col.key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Funnel + summary */}
      {leads.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Konverteringstratt</span>
          </div>
          <FunnelChart counts={counts} />
        </div>
      )}

      {/* Kanban board */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          {[1, 2, 3, 4].map(n => <Skeleton key={n} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <div className="flex gap-3 flex-1 min-h-0 overflow-x-auto pb-2">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              column={col}
              leads={byStatus[col.key]}
              draggingId={draggingId}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onCardClick={setSelectedLead}
            />
          ))}
        </div>
      )}

      {/* Detail sheet */}
      {selectedLead && (
        <LeadDetailSheet
          lead={selectedLead}
          open={!!selectedLead}
          onOpenChange={open => { if (!open) setSelectedLead(null); }}
          onStatusChange={(status) => {
            updateStatus.mutate({ id: selectedLead.id, status });
            setSelectedLead(prev => prev ? { ...prev, status } : null);
          }}
          onConverted={() => {
            setSelectedLead(null);
            void qc.invalidateQueries({ queryKey: ['leads', orgId] });
          }}
        />
      )}

      {/* Create dialog */}
      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ['leads', orgId] });
        }}
      />
    </div>
  );
}
