import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Home, ChevronRight, Copy, Check, Bell, AlertTriangle,
  Plus, Mail, MessageSquare, Car, Bus, Truck, X,
  Calendar, BookOpen, ClipboardList, FileText, Tag,
  ExternalLink, Settings, ChevronDown, Pencil, Link2, Loader2,
  Upload, Trash2, Download, ShieldCheck, Eye,
  Pin, PinOff, Lock, Search,
} from 'lucide-react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { StudentFinancePanel } from '@modules/finance/components/StudentFinancePanel.js';
import { StudentPackagePanel } from '@modules/packages/index.js';
import { useInstructor } from '@modules/instructors/index.js';
import { useStudentUpcomingBookings, useBookingList, BookingStatusBadge, StudentBookingDialog, CancelBookingDialog, RescheduleBookingDialog } from '@modules/scheduling/index.js';
import { Button, Input, Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@platform/ui';
import { toast } from '@platform/ui';
import { useSendMessage, useStudentMessages, useChannelConfigs, type CommChannel } from '@modules/communication/hooks/useCommunication.js';
import { StatusBadge, ChannelBadge } from '@modules/communication/index.js';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useFeatureAccess } from '@core/rbac/SubscriptionGate.js';
import { formatTime } from '@platform/utils';
import type { LessonBooking } from '@platform/types';
import {
  useStudent, useUpdateStudent, useArchiveStudent, studentKeys,
  useOrgStudentTags, useStudentTagAssignments, useAssignStudentTag, useRemoveStudentTag,
  useCreateTag, useUpdateTag, useDeleteTag,
  type CreateTagInput, type UpdateTagInput,
  useStudentAssessments,
  useStudentMilestones, useRecordMilestone,
  type StudentAssessment,
  type PermitMilestoneKey,
} from '../hooks/useStudents.js';
import {
  useStudentNotes, useCreateNote, useUpdateNote, useDeleteNote,
  NOTE_CATEGORY_LABELS,
  type NoteCategory,
  type StudentNote,
} from '../hooks/useStudentNotes.js';
import { ContractSheet } from '../components/ContractSheet.js';
import { StudentStatusBadge, PermitStageBadge } from '../components/StudentStatusBadge.js';
import { StudentTrainingPlanPanel } from '@modules/curriculum/index.js';
import { StudentForm } from '../components/StudentForm.js';
import { useGeneratePortalToken } from '@modules/student-portal/index.js';
import { stageIndex, STAGE_ORDER } from '@modules/student-portal/lib/permitStage.js';
import { useInstructorList } from '@modules/instructors/index.js';
import {
  useStudentGuardians, useCreateGuardian, useUpdateGuardian, useDeleteGuardian, useGenerateGuardianToken,
  type Guardian,
} from '@modules/guardian-portal/index.js';
import { cn } from '@/lib/utils.js';
import { useCorporateList } from '@modules/corporate/hooks/useCorporateCustomers.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type DetailTab = 'meddelande' | 'sms' | 'whatsapp' | 'epost' | 'elevkort' | 'utbildning' | 'historik' | 'konto' | 'ovrigt' | 'avtal';
type LogSubTab = 'bokningsloggar' | 'kommunikationsloggar' | 'aktivitetsloggar';
type UtbildningSubTab = 'behorigheteter' | 'korprovsprotokoll' | 'lektionslogg' | 'korjournal' | 'utbildningskort' | 'utbildningsplan' | 'provresultat';
type TeorimaterialSubTab = 'teorimaterial' | 'digital_teoribok' | 'ovriga_bocker' | 'fragestatistik' | 'provstatistik' | 'checklista';
type HistorikSubTab = 'kvitto' | 'rutt';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function calcAge(dob: string | null): string {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();
  let y = now.getFullYear() - birth.getFullYear();
  let m = now.getMonth() - birth.getMonth();
  let d = now.getDate() - birth.getDate();
  if (d < 0) { m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (m < 0) { y--; m += 12; }
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} år`);
  if (m > 0) parts.push(`${m} månader`);
  if (d > 0) parts.push(`${d} dagar`);
  return parts.join(', ');
}

function formatPnr(dob: string | null, last4: string | null): string {
  if (!last4) return '—';
  if (dob) return `${dob.replace(/-/g, '')}-${last4}`;
  return `······-${last4}`;
}

function formatLicenceCat(cat: string): string {
  if (!cat) return '—';
  const l = cat.toLowerCase();
  if (l.includes('automat') || l.includes('_auto')) {
    return cat.replace(/_?automat/i, '').replace(/_?auto/i, '').trim() + ' (automat)';
  }
  if (l.includes('manuell') || l.includes('manual')) {
    return cat.replace(/_?manuell/i, '').replace(/_?manual/i, '').trim() + ' (manuell)';
  }
  return cat.toUpperCase();
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold text-blue-600 mb-3">{title}</h3>;
}

function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
  size = 'md',
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onSelect: (key: T) => void;
  size?: 'md' | 'sm';
}) {
  return (
    <div className={cn('flex overflow-x-auto border-b border-border', size === 'sm' && 'gap-0')}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className={cn(
            'transition-colors whitespace-nowrap',
            size === 'md'
              ? 'px-4 py-2.5 text-sm font-medium'
              : 'px-3 py-2 text-xs font-medium',
            t.key === active
              ? 'text-blue-600 border-b-2 border-blue-500 -mb-px'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/30'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  readOnly,
  fullWidth,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn('space-y-1', fullWidth && 'col-span-2')}>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'w-full h-8 px-2.5 text-sm rounded border border-input bg-background',
          'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
          readOnly && 'bg-muted/30 cursor-default text-muted-foreground'
        )}
      />
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
      title="Kopiera"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  );
}

function GreenBtn({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type={type}
          disabled
          title="Denna funktion är under implementation"
          className="px-4 py-1.5 text-sm font-medium rounded text-white bg-green-600 opacity-40 cursor-not-allowed"
        >
          {children}
        </button>
        <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
          Kommer snart
        </span>
      </span>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      className="px-4 py-1.5 text-sm font-medium rounded text-white bg-green-600 hover:bg-green-700 transition-colors"
    >
      {children}
    </button>
  );
}

function BlueBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-4 py-1.5 text-sm font-medium rounded text-white',
        'bg-blue-600 hover:bg-blue-700 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

function SectionDivider() {
  return <div className="border-t border-border my-4" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab,   setActiveTab]   = useState<DetailTab>('elevkort');
  const [editOpen,    setEditOpen]    = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  const { data: student, isLoading, error } = useStudent(id ?? null);
  const upcomingBookings = useStudentUpcomingBookings(student?.id);
  const updateStudent    = useUpdateStudent();
  const activateStudent  = useUpdateStudent();
  const archiveStudent   = useArchiveStudent();
  const instructor       = useInstructor(student?.assigned_instructor_id ?? null);

  // Form state for Kundkort
  const [form, setForm] = useState({
    first_name:    '',
    last_name:     '',
    email:         '',
    phone:         '',
    address_line1: '',
    postal_code:   '',
    city:          '',
    notes:         '',
  });
  const formLoadedRef = useRef(false);

  useEffect(() => {
    if (student && !formLoadedRef.current) {
      formLoadedRef.current = true;
      setForm({
        first_name:    student.first_name,
        last_name:     student.last_name,
        email:         student.email ?? '',
        phone:         student.phone ?? '',
        address_line1: student.address_line1 ?? '',
        postal_code:   student.postal_code ?? '',
        city:          student.city ?? '',
        notes:         student.notes ?? '',
      });
    }
  }, [student]);

  const setField = useCallback((k: keyof typeof form, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const handleSave = useCallback(() => {
    if (!student) return;
    updateStudent.mutate({ id: student.id, input: form });
  }, [student, form, updateStudent]);

  const handleActivate = useCallback(() => {
    if (!student) return;
    activateStudent.mutate({ id: student.id, input: { status: 'active' } });
  }, [student, activateStudent]);

  const handleArchive = useCallback(() => {
    if (!student) return;
    if (!window.confirm(`Arkivera ${student.first_name} ${student.last_name}?`)) return;
    archiveStudent.mutate(student.id, {
      onSuccess: () => navigate('/students'),
    });
  }, [student, archiveStudent, navigate]);

  if (isLoading) return <PageSkeleton />;

  if (error || !student) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-sm text-muted-foreground">
          {error ? 'Det gick inte att hämta kunduppgifterna.' : 'Kunden hittades inte.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/students')}>
          Tillbaka till kundlistan
        </Button>
      </div>
    );
  }

  const fullName = `${student.first_name} ${student.last_name}`;
  const pnr      = formatPnr(student.date_of_birth, student.personnummer_last4);
  const age      = calcAge(student.date_of_birth);

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'meddelande', label: 'Meddelande' },
    { key: 'sms',        label: 'SMS' },
    { key: 'whatsapp',   label: 'WhatsApp' },
    { key: 'epost',      label: 'E-post' },
    { key: 'elevkort',   label: 'Elevkort' },
    { key: 'utbildning', label: 'Utbildning' },
    { key: 'historik',   label: 'Historik' },
    { key: 'konto',      label: 'Konto' },
    { key: 'avtal',      label: 'Avtal' },
    { key: 'ovrigt',     label: 'Övrigt' },
  ];

  return (
    <div className="-m-4 md:-m-5">

      {/* ── Header band ───────────────────────────────────────── */}
      <div className="bg-background border-b border-border px-4 md:px-6 pt-4 pb-0">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2 flex-wrap">
          <Link to="/dashboard" className="hover:text-foreground transition-colors">
            <Home className="w-3 h-3" />
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/students" className="hover:text-foreground transition-colors">Kunder</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-medium">{fullName}</span>
          <ChevronRight className="w-3 h-3" />
          <span>{TABS.find((t) => t.key === activeTab)?.label}</span>
        </nav>

        {/* Name row */}
        <div className="flex items-center justify-between pb-3">
          <h1 className="text-base font-semibold text-foreground">{fullName}</h1>
          <div className="flex items-center gap-2">
            <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
              <button
                onClick={() => setEditOpen(true)}
                className="text-xs text-foreground border border-border rounded px-2.5 py-1 hover:bg-accent/50 transition-colors flex items-center gap-1.5"
              >
                <Pencil className="w-3 h-3" />
                Redigera
              </button>
            </PermissionGate>
            <button className="text-xs text-blue-500 border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-center gap-1.5">
              <Pencil className="w-3 h-3" />
              Ge feedback
            </button>
          </div>
        </div>

        <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-5">

        {activeTab === 'meddelande' && (
          <MeddelandeTab studentEmail={student.email ?? null} studentPhone={student.phone ?? null} />
        )}

        {activeTab === 'sms' && (
          <SmsTab
            studentId={student.id}
            studentName={fullName}
            studentPhone={student.phone ?? null}
          />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppTab
            studentId={student.id}
            studentName={fullName}
            studentPhone={student.phone ?? null}
          />
        )}

        {activeTab === 'epost' && (
          <EpostTab studentId={student.id} studentEmail={student.email ?? null} />
        )}

        {activeTab === 'elevkort' && (
          <KundkortTab
            student={student}
            form={form}
            setField={setField}
            pnr={pnr}
            age={age}
            fullName={fullName}
            onSave={handleSave}
            saving={updateStudent.isPending}
            onActivate={handleActivate}
            activating={activateStudent.isPending}
            onArchive={handleArchive}
            archiving={archiveStudent.isPending}
            instructorName={
              instructor.data
                ? `${instructor.data.first_name} ${instructor.data.last_name}`
                : null
            }
            upcomingBookings={upcomingBookings}
          />
        )}

        {activeTab === 'utbildning' && (
          <UtbildningTab student={student} />
        )}

        {activeTab === 'historik' && (
          <HistorikTab studentId={student.id} />
        )}

        {activeTab === 'konto' && (
          <EkonomiTab studentId={student.id} />
        )}

        {activeTab === 'avtal' && (
          <AvtalTab student={student} />
        )}

        {activeTab === 'ovrigt' && (
          <OvrigtTab
            student={student}
            fullName={fullName}
            upcomingBookings={upcomingBookings}
            onNewBooking={() => setBookingOpen(true)}
            licenceCat={student.target_licence_category}
          />
        )}

      </div>

      {/* Dialogs */}
      <StudentForm open={editOpen} onOpenChange={setEditOpen} student={student} />
      <StudentBookingDialog
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        studentId={student.id}
        studentName={fullName}
      />
    </div>
  );
}

// ─── Tag manager dialog ────────────────────────────────────────────────────────

function TagManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const orgTags   = useOrgStudentTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [newName,  setNewName]  = useState('');
  const [newColor, setNewColor] = useState('#4F46E5');
  const [newDesc,  setNewDesc]  = useState('');

  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editName,     setEditName]     = useState('');
  const [editColor,    setEditColor]    = useState('');
  const [editDesc,     setEditDesc]     = useState('');
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  function startEdit(tag: { id: string; name: string; color: string | null; description?: string | null }) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? '#4F46E5');
    setEditDesc(tag.description ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createTag.mutate(
      { name: newName.trim(), color: newColor || null, description: newDesc.trim() || null } satisfies CreateTagInput,
      {
        onSuccess: () => { setNewName(''); setNewColor('#4F46E5'); setNewDesc(''); },
        onError: (e) => toast({ title: 'Kunde inte skapa tagg', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      },
    );
  }

  function handleUpdate() {
    if (!editingId || !editName.trim()) return;
    updateTag.mutate(
      { id: editingId, name: editName.trim(), color: editColor || null, description: editDesc.trim() || null } satisfies UpdateTagInput,
      {
        onSuccess: () => setEditingId(null),
        onError: (e) => toast({ title: 'Kunde inte uppdatera tagg', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      },
    );
  }

  function handleDelete(tagId: string) {
    deleteTag.mutate(tagId, {
      onSuccess: () => setConfirmDelId(null),
      onError: (e) => toast({ title: 'Kunde inte ta bort tagg', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hantera taggar</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">

          {/* Existing tags */}
          {orgTags.isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
            </div>
          ) : (orgTags.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Inga taggar skapade ännu.</p>
          ) : (
            <div className="space-y-1.5">
              {(orgTags.data ?? []).map((tag) =>
                editingId === tag.id ? (
                  <div key={tag.id} className="border border-primary/30 rounded-lg p-3 space-y-2 bg-primary/5">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={editColor || '#4F46E5'}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-8 w-9 cursor-pointer rounded border border-input p-0.5"
                        title="Välj färg"
                      />
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Taggnamn"
                        className="flex-1 h-8 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                      />
                    </div>
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Beskrivning (valfritt)"
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={handleUpdate} disabled={updateTag.isPending || !editName.trim()}>
                        Spara
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                        Avbryt
                      </Button>
                    </div>
                  </div>
                ) : confirmDelId === tag.id ? (
                  <div key={tag.id} className="border border-destructive/30 rounded-lg p-3 bg-destructive/5">
                    <p className="text-sm text-foreground mb-2">Ta bort <strong>{tag.name}</strong>? Taggen tas bort från alla elever.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={() => handleDelete(tag.id)}
                        disabled={deleteTag.isPending}
                      >
                        Ta bort
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelId(null)}>
                        Avbryt
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={tag.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted/40 transition-colors">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                    />
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">{tag.name}</span>
                    {tag.description && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px] hidden sm:block">{tag.description}</span>
                    )}
                    <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                      <button
                        onClick={() => startEdit(tag)}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Redigera tagg"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmDelId(tag.id)}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        title="Ta bort tagg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </PermissionGate>
                  </div>
                ),
              )}
            </div>
          )}

          {/* Create new tag */}
          <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skapa ny tagg</p>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="h-8 w-9 cursor-pointer rounded border border-input p-0.5"
                  title="Välj färg"
                />
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Taggnamn (t.ex. Intensivkurs)"
                  className="flex-1 h-8 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Beskrivning (valfritt)"
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                className="h-8"
                onClick={handleCreate}
                disabled={createTag.isPending || !newName.trim()}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Skapa tagg
              </Button>
            </div>
          </PermissionGate>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Stäng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tags card ────────────────────────────────────────────────────────────────

function TagsCard({ studentId }: { studentId: string }) {
  const orgTags   = useOrgStudentTags();
  const assigned  = useStudentTagAssignments(studentId);
  const assignMut = useAssignStudentTag(studentId);
  const removeMut = useRemoveStudentTag(studentId);

  const [managerOpen, setManagerOpen] = useState(false);

  const assignedIds = new Set((assigned.data ?? []).map((t) => t.id));
  const available   = (orgTags.data ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <SectionHeading title="Taggar" />
        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
          <button
            onClick={() => setManagerOpen(true)}
            className="text-[10px] text-primary hover:underline"
          >
            Hantera taggar
          </button>
        </PermissionGate>
      </div>

      {assigned.isLoading ? (
        <div className="h-5 w-24 bg-muted rounded animate-pulse mb-2" />
      ) : (assigned.data ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(assigned.data ?? []).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/50"
            >
              {tag.color && (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
              )}
              {tag.name}
              <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                <button
                  onClick={() => removeMut.mutate(tag.id, {
                    onError: (e) => toast({ title: 'Kunde inte ta bort tagg', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
                  })}
                  disabled={removeMut.isPending}
                  className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
                  title="Ta bort tagg"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </PermissionGate>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-2">Inga taggar tillagda.</p>
      )}

      <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
        {available.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const tagId = e.target.value;
              if (!tagId) return;
              assignMut.mutate(tagId, {
                onError: (e) => toast({ title: 'Kunde inte lägga till tagg', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
              });
            }}
            disabled={assignMut.isPending}
            className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">Lägg till tagg…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {!orgTags.isLoading && orgTags.data?.length === 0 && (
          <button
            onClick={() => setManagerOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            + Skapa första taggen
          </button>
        )}
      </PermissionGate>

      <TagManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}

// ─── Password reset card ──────────────────────────────────────────────────────

function PasswordResetCard({
  studentId, studentName, email, phone,
}: {
  studentId:   string;
  studentName: string;
  email:       string | null;
  phone:       string | null;
}) {
  const generateToken = useGeneratePortalToken();
  const sendMessage   = useSendMessage();
  const [sending, setSending] = useState<'email' | 'sms' | null>(null);
  const firstName = studentName.split(' ')[0];

  async function handleSend(channel: 'email' | 'sms') {
    const address = channel === 'email' ? email : phone;
    if (!address) return;
    setSending(channel);
    try {
      const result = await generateToken.mutateAsync(studentId);
      const body = channel === 'email'
        ? `Hej ${firstName},\n\nHär är din nya inloggningslänk till elevportalen:\n${result.url}\n\nLänken är giltig i 72 timmar.`
        : `Hej ${firstName}! Din nya elevportallänk: ${result.url}`;
      await sendMessage.mutateAsync({
        channel,
        recipient_type:    'student',
        recipient_id:      studentId,
        recipient_address: address,
        body,
        ...(channel === 'email' ? { subject: 'Din inloggningslänk till elevportalen' } : {}),
        metadata: { type: 'portal_reset' },
      });
      toast({ title: channel === 'email' ? 'Inloggningslänk skickad via e-post' : 'Inloggningslänk skickad via SMS' });
    } catch (e) {
      toast({ title: 'Kunde inte skicka', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <SectionHeading title="Generera ny inloggningslänk" />
      <p className="text-xs text-muted-foreground mb-3">
        Systemet genererar en ny elevportallänk och skickar den till eleven via e-post eller SMS.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => void handleSend('sms')}
          disabled={!phone || sending !== null}
          title={!phone ? 'Inget mobilnummer registrerat' : undefined}
          className="flex-1 py-2 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          {sending === 'sms' ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
          {sending === 'sms' ? 'Skickar…' : 'Skicka SMS'}
        </button>
        <button
          onClick={() => void handleSend('email')}
          disabled={!email || sending !== null}
          title={!email ? 'Ingen e-postadress registrerad' : undefined}
          className="flex-1 py-2 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          {sending === 'email' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
          {sending === 'email' ? 'Skickar…' : 'Skicka e-post'}
        </button>
      </div>
      {!phone && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Inget mobilnummer — SMS kan inte levereras.</p>
      )}
      {!email && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Ingen e-postadress — e-post kan inte levereras.</p>
      )}
    </div>
  );
}

// ─── Portal invite card ───────────────────────────────────────────────────────

function PortalInviteCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const generate = useGeneratePortalToken();
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    generate.mutate(studentId, {
      onSuccess: (result) => setPortalUrl(result.url),
    });
  }

  function handleCopy() {
    if (!portalUrl) return;
    void navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-3.5 h-3.5 text-blue-500" />
        <SectionHeading title="Elevportal" />
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Generera en inloggningslänk som {studentName.split(' ')[0]} kan använda för att boka lektioner och se sin framsteg.
      </p>

      {portalUrl ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 bg-muted/40 rounded border border-border">
            <p className="text-[10px] text-muted-foreground font-mono truncate flex-1">{portalUrl}</p>
          </div>
          <button
            onClick={handleCopy}
            className="w-full py-1.5 text-xs font-medium rounded border border-blue-200 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Kopierat!' : 'Kopiera länk'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generate.isPending}
            className="w-full py-1.5 text-xs font-medium rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
          >
            Generera ny länk
          </button>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="w-full py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
        >
          {generate.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
          {generate.isPending ? 'Genererar...' : 'Skicka portal-länk'}
        </button>
      )}
      {generate.isError && (
        <p className="text-[10px] text-red-500 mt-1">Kunde inte generera länk. Försök igen.</p>
      )}
    </div>
  );
}

// ─── Guardian notification dialog ────────────────────────────────────────────

function GuardianNotifyDialog({
  guardian, onClose,
}: {
  guardian: Guardian;
  onClose:  () => void;
}) {
  const [channel, setChannel]   = useState<CommChannel>('email');
  const [body,    setBody]      = useState('');
  const [subject, setSubject]   = useState('');
  const sendMsg = useSendMessage();

  const recipientAddress = channel === 'email' ? guardian.email : (guardian.phone ?? '');
  const canSend = body.trim().length > 0 && recipientAddress.trim().length > 0;

  function handleSend() {
    if (!canSend) return;
    sendMsg.mutate(
      {
        channel,
        recipient_type:    'manual',
        recipient_address: recipientAddress,
        body:              body.trim(),
        ...(channel === 'email' && subject.trim() ? { subject: subject.trim() } : {}),
        metadata: { guardian_id: guardian.id, source: 'admin-guardian-notify' },
      },
      {
        onSuccess: () => {
          toast({ title: `Meddelande skickat till ${guardian.first_name}` });
          onClose();
        },
        onError: (e) => toast({
          title:       'Kunde inte skicka',
          description: e instanceof Error ? e.message : undefined,
          variant:     'destructive',
        }),
      },
    );
  }

  return (
    <div className="mt-2 border border-primary/20 bg-primary/5 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">
          Skicka till {guardian.first_name} {guardian.last_name}
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Channel selector */}
      <div className="flex gap-1.5">
        {(['email', 'sms'] as const).map(ch => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            disabled={ch === 'sms' && !guardian.phone}
            className={cn(
              'px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors',
              channel === ch
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {ch === 'email' ? 'E-post' : 'SMS'}
          </button>
        ))}
      </div>

      {/* Subject (email only) */}
      {channel === 'email' && (
        <input
          placeholder="Ämne (valfritt)"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="w-full h-7 px-2.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
        />
      )}

      {/* Recipient preview */}
      <p className="text-[10px] text-muted-foreground truncate">
        Till: {recipientAddress || <span className="text-red-500">Saknas</span>}
      </p>

      {/* Body */}
      <textarea
        placeholder="Meddelande..."
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
        className="w-full px-2.5 py-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none placeholder:text-muted-foreground"
      />

      <div className="flex gap-2">
        <button
          onClick={handleSend}
          disabled={!canSend || sendMsg.isPending}
          className="flex-1 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {sendMsg.isPending ? 'Skickar...' : 'Skicka'}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-muted-foreground border border-border rounded hover:bg-accent transition-colors"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}

// ─── Vårdnadshavare card ──────────────────────────────────────────────────────

function VardnadshavareCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const guardians   = useStudentGuardians(studentId);
  const createMut   = useCreateGuardian();
  const deleteMut   = useDeleteGuardian();
  const tokenMut    = useGenerateGuardianToken();
  const sendMessage = useSendMessage();
  const queryClient = useQueryClient();

  const updateMut   = useUpdateGuardian();
  const [showForm,        setShowForm]        = useState(false);
  const [notifyId,        setNotifyId]        = useState<string | null>(null);
  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [phone,           setPhone]           = useState('');
  const [relation,        setRelation]        = useState('');
  const [canPay,          setCanPay]          = useState(false);
  const [generatedUrls,   setGeneratedUrls]   = useState<Record<string, string>>({});
  const [copiedId,        setCopiedId]        = useState<string | null>(null);
  const [invitedId,       setInvitedId]       = useState<string | null>(null);
  const [editId,          setEditId]          = useState<string | null>(null);
  const [editFirstName,   setEditFirstName]   = useState('');
  const [editLastName,    setEditLastName]    = useState('');
  const [editEmail,       setEditEmail]       = useState('');
  const [editPhone,       setEditPhone]       = useState('');
  const [editRelation,    setEditRelation]    = useState('');
  const [editCanPay,      setEditCanPay]      = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resetForm() {
    setFirstName(''); setLastName(''); setEmail('');
    setPhone(''); setRelation(''); setCanPay(false);
    setShowForm(false);
  }

  function handleCreate() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    createMut.mutate(
      { student_id: studentId, first_name: firstName.trim(), last_name: lastName.trim(),
        email: email.trim(), phone: phone.trim() || undefined,
        relation: relation.trim() || undefined, can_pay: canPay },
      {
        onSuccess: () => {
          resetForm();
          void queryClient.invalidateQueries({ queryKey: ['guardians', studentId] });
          toast({ title: 'Vårdnadshavare tillagd' });
        },
        onError: (e) => toast({ title: 'Kunde inte lägga till', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      },
    );
  }

  function handleDelete(g: Guardian) {
    setConfirmDeleteId(g.id);
    setNotifyId(null);
    setEditId(null);
  }

  function handleDeleteConfirmed(g: Guardian) {
    deleteMut.mutate(
      { guardianId: g.id, studentId },
      {
        onSuccess: () => { setConfirmDeleteId(null); toast({ title: 'Vårdnadshavare borttagen' }); },
        onError: (e) => toast({ title: 'Kunde inte ta bort', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      },
    );
  }

  function handleEditOpen(g: Guardian) {
    setEditId(g.id);
    setEditFirstName(g.first_name);
    setEditLastName(g.last_name);
    setEditEmail(g.email);
    setEditPhone(g.phone ?? '');
    setEditRelation(g.relation ?? '');
    setEditCanPay(g.can_pay);
    setNotifyId(null);
    setConfirmDeleteId(null);
  }

  function resetEdit() {
    setEditId(null);
    setEditFirstName(''); setEditLastName(''); setEditEmail('');
    setEditPhone(''); setEditRelation(''); setEditCanPay(false);
  }

  function handleUpdate() {
    if (!editId || !editFirstName.trim() || !editLastName.trim() || !editEmail.trim()) return;
    updateMut.mutate(
      {
        guardianId: editId,
        studentId,
        first_name: editFirstName.trim(),
        last_name:  editLastName.trim(),
        email:      editEmail.trim(),
        phone:      editPhone.trim() || null,
        relation:   editRelation.trim() || null,
        can_pay:    editCanPay,
      },
      {
        onSuccess: () => { resetEdit(); toast({ title: 'Vårdnadshavare uppdaterad' }); },
        onError: (e) => toast({ title: 'Kunde inte spara', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
      },
    );
  }

  function handleGenerateToken(g: Guardian) {
    tokenMut.mutate(g.id, {
      onSuccess: (res) => {
        setGeneratedUrls((prev) => ({ ...prev, [g.id]: res.url }));
      },
      onError: (e) => toast({ title: 'Kunde inte generera länk', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }),
    });
  }

  function handleCopy(guardianId: string, url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(guardianId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function handleInviteAndNotify(g: Guardian) {
    tokenMut.mutate(g.id, {
      onSuccess: (res) => {
        setGeneratedUrls((prev) => ({ ...prev, [g.id]: res.url }));
        sendMessage.mutate(
          {
            channel:           'email',
            recipient_type:    'manual',
            recipient_address: g.email,
            subject:           `Föräldraskollen – följ ${studentName}s körkortsutbildning`,
            body:              `Hej ${g.first_name}!\n\nDu har fått tillgång till Föräldraskollen för ${studentName}. Här kan du följa framsteg, se kommande lektioner och hålla koll på utbildningens gång.\n\nKlicka på länken nedan för att logga in:\n${res.url}\n\nLänken är giltig i 30 dagar och är personlig — dela den inte med andra.\n\nMed vänliga hälsningar\nTrafikskolan`,
          },
          {
            onSuccess: () => {
              setInvitedId(g.id);
              setTimeout(() => setInvitedId(null), 4000);
              toast({ title: `Inbjudan skickad till ${g.email}` });
            },
            onError: () => {
              toast({ title: 'Länk genererad – men e-post misslyckades. Kopiera länken manuellt.', variant: 'destructive' });
            },
          },
        );
      },
      onError: (e) => toast({
        title:       'Kunde inte generera inbjudan',
        description: e instanceof Error ? e.message : undefined,
        variant:     'destructive',
      }),
    });
  }

  const list = guardians.data ?? [];

  return (
    <div>
      <SectionHeading title="Föräldraskollen – insyn i elevens utveckling" />
      <p className="text-xs text-muted-foreground mb-3">
        Ge en förälder eller annan nära person möjligheten att följa elevens framsteg, bokningar och resultat i realtid via en säker portal.
      </p>

      {/* Existing guardians */}
      {guardians.isLoading ? (
        <div className="h-8 w-32 bg-muted rounded animate-pulse mb-3" />
      ) : list.length > 0 ? (
        <div className="space-y-2 mb-3">
          {list.map((g) => {
            const url = generatedUrls[g.id];
            return (
              <div key={g.id} className="border border-border rounded-lg p-3 space-y-2">
                {editId === g.id ? (
                  /* ── Edit form ── */
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">Redigera vårdnadshavare</p>
                      <button onClick={resetEdit} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <FieldInput label="Förnamn *" value={editFirstName} onChange={setEditFirstName} placeholder="Förnamn" />
                      <FieldInput label="Efternamn *" value={editLastName} onChange={setEditLastName} placeholder="Efternamn" />
                      <FieldInput label="E-post *" value={editEmail} onChange={setEditEmail} type="email" placeholder="email@example.com" fullWidth />
                      <FieldInput label="Telefon" value={editPhone} onChange={setEditPhone} type="tel" placeholder="+46 70 000 00 00" />
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Relation</label>
                        <select
                          value={editRelation}
                          onChange={(e) => setEditRelation(e.target.value)}
                          className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">Välj relation</option>
                          <option value="Förälder">Förälder</option>
                          <option value="Vårdnadshavare">Vårdnadshavare</option>
                          <option value="Syskon">Syskon</option>
                          <option value="Annan">Annan</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id={`edit-canpay-${g.id}`} checked={editCanPay} onChange={(e) => setEditCanPay(e.target.checked)} className="rounded" />
                      <label htmlFor={`edit-canpay-${g.id}`} className="text-xs text-muted-foreground cursor-pointer">Kan se ekonomiinformation</label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <GreenBtn
                        onClick={handleUpdate}
                        disabled={!editFirstName.trim() || !editLastName.trim() || !editEmail.trim() || updateMut.isPending}
                      >
                        {updateMut.isPending ? 'Sparar...' : 'Spara ändringar'}
                      </GreenBtn>
                      <button
                        onClick={resetEdit}
                        className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{g.first_name} {g.last_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {g.email}{g.phone ? ` · ${g.phone}` : ''}{g.relation ? ` · ${g.relation}` : ''}
                          {g.can_pay && <span className="ml-1 text-green-600 font-semibold">· Betalning</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {invitedId === g.id ? (
                          <span className="px-2.5 py-1 text-[10px] font-medium rounded bg-green-50 text-green-700 border border-green-200 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Skickad!
                          </span>
                        ) : (
                          <button
                            onClick={() => handleInviteAndNotify(g)}
                            disabled={tokenMut.isPending || sendMessage.isPending}
                            className="px-2.5 py-1 text-[10px] font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                            title="Generera länk och skicka e-postinbjudan"
                          >
                            <Mail className="w-3 h-3" />
                            Bjud in
                          </button>
                        )}
                        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                          <button
                            onClick={() => setNotifyId(notifyId === g.id ? null : g.id)}
                            className={cn(
                              'px-2.5 py-1 text-[10px] font-medium rounded transition-colors flex items-center gap-1',
                              notifyId === g.id
                                ? 'bg-primary/10 text-primary border border-primary/30'
                                : 'bg-muted text-muted-foreground hover:bg-accent',
                            )}
                            title="Skicka meddelande"
                          >
                            <Mail className="w-3 h-3" />
                            Notifiera
                          </button>
                        </PermissionGate>
                        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                          <button
                            onClick={() => handleGenerateToken(g)}
                            disabled={tokenMut.isPending}
                            className="px-2.5 py-1 text-[10px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                            title="Generera portallänk (manuell kopiering)"
                          >
                            <Link2 className="w-3 h-3" />
                            Länk
                          </button>
                        </PermissionGate>
                        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                          <button
                            onClick={() => handleEditOpen(g)}
                            className="px-2.5 py-1 text-[10px] font-medium rounded bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1"
                            title="Redigera"
                          >
                            <Pencil className="w-3 h-3" />
                            Redigera
                          </button>
                        </PermissionGate>
                        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                          <button
                            onClick={() => handleDelete(g)}
                            disabled={deleteMut.isPending}
                            className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-40 transition-colors"
                            title="Ta bort"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                      </div>
                    </div>
                    {confirmDeleteId === g.id && (
                      <div className="flex items-center justify-between gap-2 bg-red-50 dark:bg-red-950/20 rounded p-2 border border-red-100 dark:border-red-900/50">
                        <p className="text-xs text-red-700 dark:text-red-400">Ta bort {g.first_name} {g.last_name}?</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleDeleteConfirmed(g)}
                            disabled={deleteMut.isPending}
                            className="px-2.5 py-1 text-[10px] font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {deleteMut.isPending ? 'Tar bort...' : 'Ta bort'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 text-[10px] font-medium rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    )}
                    {notifyId === g.id && (
                      <GuardianNotifyDialog
                        guardian={g}
                        onClose={() => setNotifyId(null)}
                      />
                    )}
                    {url && (
                      <div className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5">
                        <p className="text-[10px] font-mono text-muted-foreground truncate flex-1">{url}</p>
                        <button
                          onClick={() => handleCopy(g.id, url)}
                          className="shrink-0 text-[10px] font-medium text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {copiedId === g.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          {copiedId === g.id ? 'Kopierat' : 'Kopiera'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">Inga vårdnadshavare tillagda.</p>
      )}

      {/* Add form */}
      {showForm ? (
        <div className="border border-border rounded-lg p-3 space-y-2.5">
          <p className="text-xs font-semibold text-foreground">Ny vårdnadshavare</p>
          <div className="grid grid-cols-2 gap-2">
            <FieldInput label="Förnamn *" value={firstName} onChange={setFirstName} placeholder="Förnamn" />
            <FieldInput label="Efternamn *" value={lastName} onChange={setLastName} placeholder="Efternamn" />
            <FieldInput label="E-post *" value={email} onChange={setEmail} type="email" placeholder="email@example.com" fullWidth />
            <FieldInput label="Telefon" value={phone} onChange={setPhone} type="tel" placeholder="+46 70 000 00 00" />
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Relation</label>
              <select
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Välj relation</option>
                <option value="Förälder">Förälder</option>
                <option value="Vårdnadshavare">Vårdnadshavare</option>
                <option value="Syskon">Syskon</option>
                <option value="Annan">Annan</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="guardian-canpay" checked={canPay} onChange={(e) => setCanPay(e.target.checked)} className="rounded" />
            <label htmlFor="guardian-canpay" className="text-xs text-muted-foreground cursor-pointer">Kan se ekonomiinformation</label>
          </div>
          <div className="flex gap-2 pt-1">
            <GreenBtn
              onClick={handleCreate}
              disabled={!firstName.trim() || !lastName.trim() || !email.trim() || createMut.isPending}
            >
              {createMut.isPending ? 'Lägger till...' : 'Lägg till'}
            </GreenBtn>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded transition-colors"
            >
              Avbryt
            </button>
          </div>
        </div>
      ) : (
        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Lägg till vårdnadshavare
          </button>
        </PermissionGate>
      )}
    </div>
  );
}

// ─── Kundkort tab ─────────────────────────────────────────────────────────────

type FormState = {
  first_name: string; last_name: string;
  email: string; phone: string;
  address_line1: string; postal_code: string; city: string;
  notes: string;
};

function KundkortTab({
  student, form, setField, pnr, age, fullName,
  onSave, saving, onActivate, activating, onArchive, archiving, instructorName: _instructorName,
  upcomingBookings,
}: {
  student: ReturnType<typeof useStudent>['data'] & object;
  form: FormState;
  setField: (k: keyof FormState, v: string) => void;
  pnr: string;
  age: string;
  fullName: string;
  onSave: () => void;
  saving: boolean;
  onActivate: () => void;
  activating: boolean;
  onArchive: () => void;
  archiving: boolean;
  instructorName: string | null;
  upcomingBookings: ReturnType<typeof useStudentUpcomingBookings>;
}) {
  const [internalNotes,       setInternalNotes]       = useState(false);
  const [korkortsGrupp,       setKorkortsGrupp]       = useState('');
  const [favInstructorId,     setFavInstructorId]     = useState(student.assigned_instructor_id ?? '');
  const [cancelTarget,        setCancelTarget]        = useState<{ bookingId: string; slotId: string; slotLabel: string; slotStartsAt: string } | null>(null);
  const [rescheduleTarget,    setRescheduleTarget]    = useState<{ bookingId: string; slotId: string } | null>(null);

  type MilestoneKey = 'risk1_completed_at' | 'risk2_completed_at' | 'theory_passed_at' | 'practical_passed_at';
  const [editingMilestone,  setEditingMilestone]  = useState<MilestoneKey | null>(null);
  const [milestoneDate,     setMilestoneDate]     = useState('');
  const [savingMilestone,   setSavingMilestone]   = useState(false);
  const queryClient = useQueryClient();

  async function saveMilestone() {
    if (!editingMilestone) return;
    setSavingMilestone(true);
    const { error } = await supabase
      .from('students')
      .update({ [editingMilestone]: milestoneDate || null } as never)
      .eq('id', student.id);
    setSavingMilestone(false);
    if (error) {
      toast({ title: 'Kunde inte spara', description: error.message, variant: 'destructive' });
    } else {
      void queryClient.invalidateQueries({ queryKey: studentKeys.detail(student.id) });
      toast({ title: 'Datum sparat' });
      setEditingMilestone(null);
    }
  }

  function startEditMilestone(key: MilestoneKey, currentValue: string | null) {
    setEditingMilestone(key);
    setMilestoneDate(currentValue?.slice(0, 10) ?? '');
  }

  const updateOptIn        = useUpdateStudent();
  const updateInstructor   = useUpdateStudent();
  const updateNotes        = useUpdateStudent();
  const updateCompany      = useUpdateStudent();
  const [linkedCompanyId, setLinkedCompanyId] = useState(student.corporate_customer_id ?? '');
  // Elevkort is the default tab on the single most-visited page in the app —
  // unconditionally querying a starter-tier-gated endpoint here meant every
  // trial-tier org (effectively every pilot tenant) hit a 402 on nearly
  // every page load, confirmed live via the recurring corporate-customers
  // 402 showing up in console logs regardless of what the user was actually
  // doing. StudentForm.tsx already gates the same query correctly — this
  // was the one caller that didn't.
  const hasCorporateAccess = useFeatureAccess('corporate:customers:manage');
  const { data: corporateData } = useCorporateList({ per_page: 200, status: 'active' }, { enabled: hasCorporateAccess });
  const allCompanies = corporateData?.data ?? [];
  const { data: instructorsData } = useInstructorList({ per_page: 100 });

  // ── Emergency contacts ──────────────────────────────────────────────────────
  type EmgContact = { id: string; full_name: string; phone: string; email: string | null; is_primary: boolean };
  const [emgName,    setEmgName]    = useState('');
  const [emgPhone,   setEmgPhone]   = useState('');
  const [emgEmail,   setEmgEmail]   = useState('');
  const [emgPrimary, setEmgPrimary] = useState(false);

  const emgQKey = ['student-emergency-contacts', student.id] as const;
  const emgContacts = useQuery<EmgContact[]>({
    queryKey: emgQKey,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_emergency_contacts')
        .select('id, full_name, phone, email, is_primary')
        .eq('student_id', student.id)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as EmgContact[];
    },
  });

  const addEmg = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_emergency_contacts')
        .insert({
          student_id:      student.id,
          organization_id: student.organization_id,
          full_name:       emgName.trim(),
          phone:           emgPhone.trim(),
          email:           emgEmail.trim() || null,
          relationship:    'other',
          is_primary:      emgPrimary,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: emgQKey });
      setEmgName(''); setEmgPhone(''); setEmgEmail(''); setEmgPrimary(false);
      toast({ title: 'Anhörig tillagd' });
    },
    onError: (e: Error) => toast({ title: 'Kunde inte lägga till', description: e.message, variant: 'destructive' }),
  });

  const deleteEmg = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as unknown as any)
        .from('student_emergency_contacts')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: emgQKey }),
    onError: (e: Error) => toast({ title: 'Kunde inte ta bort', description: e.message, variant: 'destructive' }),
  });
  const allInstructors = instructorsData?.data ?? [];
  const nextLesson   = upcomingBookings.data?.data?.[0];
  const nextDateStr  = nextLesson ? new Date(nextLesson.starts_at).toLocaleDateString('sv-SE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const nextTimeStr  = nextLesson ? `${formatTime(nextLesson.starts_at)} – ${formatTime(nextLesson.ends_at)}` : '';
  const nextTerminal = !nextLesson || nextLesson.status === 'completed' || nextLesson.status === 'no_show' || nextLesson.status === 'cancelled';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

      {/* ── Left column ─────────────────────────────────────── */}
      <div className="space-y-0">

        {/* Profile section */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">

          {/* Avatar + personnummer row */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-full bg-muted border-2 border-border flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-muted-foreground/40" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {/* Personnummer */}
              <div className="space-y-0.5">
                {age && (
                  <p className="text-xs text-muted-foreground">{age}</p>
                )}
                <PermissionGate permission={Permissions.STUDENTS_PII_READ}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium">{pnr}</span>
                  {pnr !== '—' && <CopyBtn text={pnr} />}
                  <button className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors">
                    Sök
                  </button>
                </div>
                </PermissionGate>
              </div>
              {/* E-post placeholder */}
              <div>
                <label className="text-xs text-muted-foreground">Teoricentralen e-post</label>
                <input
                  type="text"
                  placeholder="Loggar in med personnummer eller Mobilt BankId"
                  readOnly
                  className="w-full h-7 px-2 text-xs rounded border border-input bg-muted/20 text-muted-foreground mt-0.5"
                />
              </div>
            </div>
          </div>

          <SectionDivider />

          {/* Editable contact fields */}
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="Förnamn"     value={form.first_name}    onChange={(v) => setField('first_name', v)} />
            <FieldInput label="Efternamn"   value={form.last_name}     onChange={(v) => setField('last_name', v)} />
            <FieldInput label="E-post"      value={form.email}         onChange={(v) => setField('email', v)} type="email" />
            <FieldInput label="Telefonnummer" value={form.phone}       onChange={(v) => setField('phone', v)} type="tel" />
            <FieldInput label="Adress"      value={form.address_line1} onChange={(v) => setField('address_line1', v)} fullWidth />
            <FieldInput label="Postnummer"  value={form.postal_code}   onChange={(v) => setField('postal_code', v)} />
            <FieldInput label="Stad"        value={form.city}          onChange={(v) => setField('city', v)} />
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-1">
            <div>
              <span className="font-medium text-foreground">Kund inskiven: </span>
              {formatDate(student.enrolled_at)}
            </div>
            <div>
              <span className="font-medium text-foreground">Senaste aktivitet: </span>
              {formatDateTime(student.updated_at)}
            </div>
            <button className="text-blue-500 hover:underline">Användarvilkar</button>
          </div>

          <SectionDivider />

          {/* Utbildningsbehörighet */}
          <div>
            <SectionHeading title="Utbildningsbehörighet" />
            <div className="flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{formatLicenceCat(student.target_licence_category)}</span>
              <StudentStatusBadge status={student.status} />
            </div>
            <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
              <GreenBtn onClick={onSave} disabled={saving}>
                {saving ? 'Sparar...' : 'Spara'}
              </GreenBtn>
            </PermissionGate>
          </div>

          <SectionDivider />

          {/* Körkortstillstånd */}
          <div>
            <SectionHeading title="Körkortstillstånd" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Välj grupp</label>
                <select
                  value={korkortsGrupp}
                  onChange={(e) => setKorkortsGrupp(e.target.value)}
                  className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Ingen grupp</option>
                  <option value="grupp1">Grupp 1 – AM, A1, A2, A, B, BE</option>
                  <option value="grupp2">Grupp 2 – C, CE, D, DE</option>
                </select>
              </div>
              <FieldInput label="Välj utgångsdatum" value="" placeholder="YYYY-MM-DD" type="date" />
            </div>
            <div className="space-y-1 mb-3">
              <label className="text-xs text-muted-foreground">Anteckning</label>
              <textarea
                rows={2}
                className="w-full px-2.5 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <GreenBtn disabled>Spara</GreenBtn>
              <button className="px-3 py-1.5 text-sm font-medium rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-center gap-1.5">
                Trafikverket
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <SectionDivider />

          {/* Legitimation */}
          <div>
            <SectionHeading title="Legitimation" />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Välj legitimation</label>
                <select className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Välj legitimation</option>
                  <option value="korkort">Körkort</option>
                  <option value="pass">Pass</option>
                  <option value="nationellt_id">Nationellt ID-kort</option>
                  <option value="personnummer">Personnummer</option>
                </select>
              </div>
              <FieldInput label="Välj utgångsdatum" value="" placeholder="YYYY-MM-DD" type="date" />
            </div>
            <div className="space-y-1 mb-3">
              <label className="text-xs text-muted-foreground">Anteckning</label>
              <textarea
                rows={2}
                className="w-full px-2.5 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <GreenBtn disabled>Spara</GreenBtn>
          </div>

          <SectionDivider />

          {/* Företagskopplingar */}
          <div>
            <SectionHeading title="Företagskopplingar" />
            {student.corporate_customer_id && (
              <p className="text-xs text-muted-foreground mb-2">
                Kopplad: <span className="font-medium text-foreground">
                  {allCompanies.find(c => c.id === student.corporate_customer_id)?.company_name ?? '…'}
                </span>
              </p>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Välj företag att koppla</label>
                <select
                  value={linkedCompanyId}
                  onChange={(e) => setLinkedCompanyId(e.target.value)}
                  className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">- Inget företag -</option>
                  {allCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
              </div>
              <GreenBtn
                disabled={updateCompany.isPending}
                onClick={() => {
                  updateCompany.mutate(
                    { id: student.id, input: { corporate_customer_id: linkedCompanyId || null } },
                    {
                      onSuccess: () => toast({ title: linkedCompanyId ? 'Företag kopplat' : 'Företagskoppling borttagen' }),
                      onError: (e) => toast({ title: 'Kunde inte spara', description: e instanceof Error ? e.message : '', variant: 'destructive' }),
                    }
                  );
                }}
              >
                {updateCompany.isPending ? 'Sparar...' : 'Spara'}
              </GreenBtn>
            </div>
          </div>

          <SectionDivider />

          {/* Examinationsmoment */}
          <div>
            <SectionHeading title="Examinationsmoment" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Moment</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Datum</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      { key: 'risk1_completed_at'    as MilestoneKey, label: 'Risk 1',     value: student.risk1_completed_at },
                      { key: 'risk2_completed_at'    as MilestoneKey, label: 'Risk 2',     value: student.risk2_completed_at },
                      { key: 'theory_passed_at'      as MilestoneKey, label: 'Teoriprov',  value: student.theory_passed_at },
                      { key: 'practical_passed_at'   as MilestoneKey, label: 'Uppkörning', value: student.practical_passed_at },
                    ] as { key: MilestoneKey; label: string; value: string | null }[]
                  ).map(({ key, label, value }) => (
                    <tr key={key} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 text-xs font-medium">{label}</td>
                      <td className="py-2.5 pr-4 text-xs">
                        {value ? (
                          <span className="text-foreground font-medium">{formatDate(value)}</span>
                        ) : (
                          <span className="text-muted-foreground/50 italic">Ej genomfört</span>
                        )}
                      </td>
                      <td className="py-2.5 text-xs">
                        {editingMilestone === key ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input
                              type="date"
                              value={milestoneDate}
                              onChange={(e) => setMilestoneDate(e.target.value)}
                              className="h-6 px-1.5 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                              onClick={() => void saveMilestone()}
                              disabled={savingMilestone}
                              className="h-6 px-2 text-[10px] font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 transition-colors"
                            >
                              {savingMilestone ? '...' : 'Spara'}
                            </button>
                            <button
                              onClick={() => setEditingMilestone(null)}
                              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Avbryt
                            </button>
                          </div>
                        ) : (
                          <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                            <button
                              onClick={() => startEditMilestone(key, value)}
                              className="text-blue-500 hover:underline"
                            >
                              {value ? 'Redigera' : 'Registrera'}
                            </button>
                          </PermissionGate>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <SectionDivider />

          {/* Anhöriga */}
          <div>
            <SectionHeading title="Anhöriga personer" />
            <p className="text-xs text-muted-foreground mb-3">
              Registrera anhöriga som ska kontaktas i nödsituationer eller ta emot bokningsbekräftelser.
            </p>

            {/* Existing contacts list */}
            {(emgContacts.data ?? []).length > 0 && (
              <div className="space-y-2 mb-4">
                {(emgContacts.data ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-muted/40 rounded px-3 py-2 text-xs gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{c.full_name}</span>
                      {c.is_primary && <span className="ml-2 text-[10px] text-primary font-semibold">Primär</span>}
                      <div className="text-muted-foreground truncate">{c.phone}{c.email ? ` · ${c.email}` : ''}</div>
                    </div>
                    <button
                      onClick={() => deleteEmg.mutate(c.id)}
                      disabled={deleteEmg.isPending}
                      className="shrink-0 p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/30 text-red-500 disabled:opacity-40 transition-colors"
                      title="Ta bort"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add form */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <FieldInput
                label="Namn *"
                value={emgName}
                onChange={setEmgName}
                placeholder="För- och efternamn"
                fullWidth
              />
              <FieldInput
                label="Telefonnummer *"
                value={emgPhone}
                onChange={setEmgPhone}
                placeholder="+46 70 000 00 00"
                type="tel"
              />
              <FieldInput
                label="E-postadress"
                value={emgEmail}
                onChange={setEmgEmail}
                placeholder="valfritt"
                type="email"
                fullWidth
              />
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="emgprimary"
                checked={emgPrimary}
                onChange={(e) => setEmgPrimary(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="emgprimary" className="text-xs text-muted-foreground cursor-pointer">Primärkontakt</label>
            </div>
            <GreenBtn
              onClick={() => addEmg.mutate()}
              disabled={!emgName.trim() || !emgPhone.trim() || addEmg.isPending}
            >
              {addEmg.isPending ? 'Lägger till...' : 'Lägg till'}
            </GreenBtn>
          </div>

          <SectionDivider />

          {/* Föräldraskollen */}
          <VardnadshavareCard studentId={student.id} studentName={`${student.first_name} ${student.last_name}`} />

          <SectionDivider />

          {/* Favoritlärare */}
          <div>
            <SectionHeading title="Favoritlärare" />
            <p className="text-xs text-muted-foreground mb-3">
              Den valda läraren blir automatiskt förvald när eleven gör en via elevbokning.
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Välj favoritlärare</label>
                <select
                  value={favInstructorId}
                  onChange={(e) => setFavInstructorId(e.target.value)}
                  className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Ingen favoritlärare</option>
                  {allInstructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.first_name} {i.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <GreenBtn
                onClick={() => {
                  updateInstructor.mutate(
                    { id: student.id, input: { assigned_instructor_id: favInstructorId || null } },
                    { onSuccess: () => toast({ title: 'Favoritlärare sparad' }) },
                  );
                }}
                disabled={updateInstructor.isPending}
              >
                {updateInstructor.isPending ? 'Sparar…' : 'Spara'}
              </GreenBtn>
            </div>
          </div>

        </div>
      </div>

      {/* ── Right column ────────────────────────────────────── */}
      <div className="space-y-4 lg:sticky lg:top-4">

        {/* Action icon row */}
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Kopiera kundinfo">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button className="w-8 h-8 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Bevakningar">
            <Bell className="w-3.5 h-3.5" />
          </button>
          <button className="w-8 h-8 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Snabblänkar">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Nästa lektion */}
        {nextLesson && (
          <div className="bg-card border border-primary/20 rounded-lg p-4">
            <SectionHeading title="Nästa lektion" />
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-foreground capitalize">{nextDateStr}</p>
                <p className="text-[11px] text-muted-foreground">{nextTimeStr}</p>
              </div>
              <BookingStatusBadge status={nextLesson.status} />
              {!nextTerminal && (
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setRescheduleTarget({ bookingId: nextLesson.id, slotId: nextLesson.slot_id })}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Boka om
                  </button>
                  <button
                    onClick={() => setCancelTarget({ bookingId: nextLesson.id, slotId: nextLesson.slot_id, slotLabel: `${nextDateStr} ${nextTimeStr}`, slotStartsAt: nextLesson.starts_at })}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Avboka
                  </button>
                </div>
              )}
              <Link
                to={`/scheduling?date=${nextLesson.starts_at.slice(0, 10)}`}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Calendar className="w-3 h-3" />
                Visa i schema
              </Link>
            </div>
          </div>
        )}
        {!nextLesson && !upcomingBookings.isLoading && (
          <div className="bg-card border border-border rounded-lg p-4">
            <SectionHeading title="Nästa lektion" />
            <p className="text-xs text-muted-foreground">Inga kommande bokningar.</p>
          </div>
        )}

        {/* Training status */}
        <TrainingStatusCard student={student} />

        {/* Anteckningar */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <SectionHeading title="Anteckningar" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Dölj interna</span>
              <button
                onClick={() => setInternalNotes(!internalNotes)}
                className={cn(
                  'relative w-8 h-4 rounded-full transition-colors',
                  internalNotes ? 'bg-blue-500' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform',
                  internalNotes ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          </div>
          <textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Skriv en anteckning..."
            className="w-full px-2.5 py-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="mt-2 flex justify-end">
            <GreenBtn
              onClick={() => updateNotes.mutate(
                { id: student.id, input: { notes: form.notes || null } },
                { onSuccess: () => toast({ title: 'Anteckning sparad' }) },
              )}
              disabled={updateNotes.isPending}
            >
              {updateNotes.isPending ? 'Sparar...' : 'Spara'}
            </GreenBtn>
          </div>
        </div>

        {/* Taggar */}
        <TagsCard studentId={student.id} />

        {/* Generera nytt lösenord */}
        <PasswordResetCard
          studentId={student.id}
          studentName={fullName}
          email={student.email ?? null}
          phone={student.phone ?? null}
        />

        {/* Student portal invite */}
        <PortalInviteCard studentId={student.id} studentName={fullName} />

        {/* Notiser & kommunikation */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Notiser & kommunikation" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">SMS-påminnelser</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Lektionspåminnelser och bokningsbekräftelser
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateOptIn.mutate(
                { id: student.id, input: { communication_opt_in_sms: !student.communication_opt_in_sms } },
                { onSuccess: () => toast({ title: student.communication_opt_in_sms ? 'SMS-notiser inaktiverade' : 'SMS-notiser aktiverade' }) },
              )}
              disabled={updateOptIn.isPending}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
                student.communication_opt_in_sms ? 'bg-primary' : 'bg-muted',
              )}
              role="switch"
              aria-checked={student.communication_opt_in_sms}
            >
              <span className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                student.communication_opt_in_sms ? 'translate-x-4' : 'translate-x-0',
              )} />
            </button>
          </div>
          {!student.phone && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
              Inget mobilnummer — SMS kan inte levereras.
            </p>
          )}
        </div>

        {/* Aktivera / Återaktivera kund */}
        {(student.status === 'lead' || student.status === 'onboarding' || student.status === 'paused' || student.status === 'archived') && (
          <div className="bg-card border border-border rounded-lg p-4">
            <SectionHeading title={student.status === 'archived' ? 'Återaktivera kund' : 'Aktivera kund'} />
            <p className="text-xs text-muted-foreground mb-3">
              {student.status === 'archived'
                ? 'Återaktivera kunden för att återuppta undervisning och bokningar.'
                : 'Sätt kundens status till Aktiv för att kunna boka lektioner och skapa fakturor.'}
            </p>
            <button
              onClick={onActivate}
              disabled={activating}
              className="w-full py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {activating
                ? 'Aktiverar...'
                : student.status === 'archived' ? 'Återaktivera kund' : 'Aktivera kund'}
            </button>
          </div>
        )}

        {/* Arkivera kund — hidden when already archived */}
        {student.status !== 'archived' && (
          <div className="bg-card border border-border rounded-lg p-4">
            <SectionHeading title="Arkivera kund" />
            {student.status === 'active' && (upcomingBookings.data?.data?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/20 rounded border border-red-100 dark:border-red-900/50">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-700 dark:text-red-400 space-y-1">
                    <p className="font-medium">{fullName} kan inte arkiveras för tillfället av följande anledningar:</p>
                    <p>• Kunden har kommande bokningar</p>
                  </div>
                </div>
                <button disabled className="w-full py-1.5 text-xs font-medium rounded bg-red-200 text-red-400 cursor-not-allowed">
                  Arkivera kund
                </button>
              </div>
            ) : (
              <button
                onClick={onArchive}
                disabled={archiving}
                className="w-full py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {archiving ? 'Arkiverar...' : 'Arkivera kund'}
              </button>
            )}
          </div>
        )}

      </div>

      <CancelBookingDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
        bookingId={cancelTarget?.bookingId ?? null}
        slotId={cancelTarget?.slotId ?? ''}
        student={student}
        slotLabel={cancelTarget?.slotLabel}
        slotStartsAt={cancelTarget?.slotStartsAt}
        onSuccess={() => setCancelTarget(null)}
      />
      <RescheduleBookingDialog
        open={rescheduleTarget !== null}
        onOpenChange={(o) => { if (!o) setRescheduleTarget(null); }}
        bookingId={rescheduleTarget?.bookingId ?? null}
        currentSlotId={rescheduleTarget?.slotId ?? ''}
        studentName={fullName}
        student={student}
        onSuccess={() => setRescheduleTarget(null)}
      />
    </div>
  );
}

// ─── Lesson progress panel ────────────────────────────────────────────────────

// Lesson history range used for progress stats. `to` must not be pinned to
// "now" — a completed booking's starts_at can fall after the moment this
// module first loaded (a long-lived SPA session, or a lesson logged slightly
// ahead of schedule), and a tight upper bound silently drops it from the
// completed-lesson count. Widen well past "now" instead of trying to track
// the exact instant a lesson resolves. Memoized per-mount (not module-level)
// so it's still fresh on a fresh visit, but stable across re-renders — an
// inline `new Date()` here would change the query key every render and
// loop the query forever.
function useProgressRange() {
  return useMemo(() => ({
    from: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    to:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  }), []);
}

function LessonProgressPanel({ studentId }: { studentId: string }) {
  const progressRange = useProgressRange();
  const { data: historyData, isLoading } = useBookingList({
    student_id: studentId,
    ...progressRange,
    per_page:   200,
    sort_by:    'starts_at',
    sort_dir:   'desc',
  });
  const upcoming = useStudentUpcomingBookings(studentId);

  const bookings      = historyData?.data ?? [];
  const completed     = useMemo(() => bookings.filter((b) => b.status === 'completed'), [bookings]);
  const noShows       = useMemo(() => bookings.filter((b) => b.status === 'no_show'),   [bookings]);
  const upcomingCount = upcoming.data?.data?.length ?? 0;

  const totalMin = useMemo(() =>
    completed.reduce((acc, b) => {
      const ms = new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime();
      return acc + Math.round(ms / 60_000);
    }, 0),
    [completed],
  );
  const hours = Math.floor(totalMin / 60);
  const mins  = totalMin % 60;
  const timeLabel = totalMin === 0 ? '—'
    : hours > 0 ? `${hours} t${mins > 0 ? ` ${mins} min` : ''}` : `${totalMin} min`;

  const monthlyData = useMemo(() => {
    const months: { month: string; count: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('sv-SE', { month: 'short' });
      const count = completed.filter((b) => b.starts_at.startsWith(key)).length;
      months.push({ month: key, count, label });
    }
    return months;
  }, [completed]);
  const maxMonthCount = Math.max(...monthlyData.map((m) => m.count), 1);
  const hasActivity   = monthlyData.some((m) => m.count > 0);

  if (isLoading) {
    return (
      <div className="space-y-3 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  const stats: { label: string; value: string; color: string }[] = [
    { label: 'Genomförda lektioner', value: `${completed.length}`, color: 'text-green-600 dark:text-green-400' },
    { label: 'Total körtid',         value: timeLabel,             color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Uteblivna',            value: `${noShows.length}`,   color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Kommande bokningar',   value: `${upcomingCount}`,    color: 'text-primary' },
  ];

  return (
    <div className="mb-5 space-y-3">
      <SectionHeading title="Lektionsframsteg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center space-y-1">
            <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {hasActivity && (
        <div className="bg-card border border-border rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-2">Lektioner per månad</p>
          <div className="flex items-end gap-1.5" style={{ height: 52 }}>
            {monthlyData.map(({ month, count, label }) => (
              <div key={month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: 40 }}>
                  <div
                    className="w-full rounded-sm bg-blue-500/70 hover:bg-blue-500 transition-colors"
                    style={{ height: count === 0 ? 2 : Math.max(4, Math.round((count / maxMonthCount) * 40)) }}
                    title={`${count} lektion${count !== 1 ? 'er' : ''}`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground capitalize leading-none">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Training status card (right sidebar of Elevkort) ────────────────────────

function TrainingStatusCard({ student }: { student: NonNullable<ReturnType<typeof useStudent>['data']> }) {
  const milestones: { label: string; completedAt: string | null }[] = [
    { label: 'Risk 1',     completedAt: student.risk1_completed_at },
    { label: 'Risk 2',     completedAt: student.risk2_completed_at },
    { label: 'Teoriprov',  completedAt: student.theory_passed_at },
    { label: 'Uppkörning', completedAt: student.practical_passed_at },
  ];
  const completedCount = milestones.filter((m) => m.completedAt).length;

  // P1-4: risk1_completed_at/risk2_completed_at now auto-populate on first
  // completed lesson of that category (Phase 1), but permit_stage — the
  // field this badge actually shows — stays a fully manual staff edit with
  // no automatic mapping (deliberately: see Final Gap Analysis P1-4, "never
  // invent an automatic permit-stage mapping"). This only flags the case
  // where the two have visibly diverged, using stage names that already
  // exist 1:1 with these timestamps — it never changes permit_stage itself.
  const stageIdx = stageIndex(student.permit_stage);
  const stagePossiblyStale =
    (student.risk1_completed_at && stageIdx < STAGE_ORDER.indexOf('risk1_completed')) ||
    (student.risk2_completed_at && stageIdx < STAGE_ORDER.indexOf('risk2_completed'));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <SectionHeading title="Utbildningsstatus" />

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(completedCount / milestones.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {completedCount}/{milestones.length} moment
        </span>
      </div>

      {/* Permit stage */}
      <div className="mb-3">
        <PermitStageBadge stage={student.permit_stage} />
      </div>

      {stagePossiblyStale && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
            Ett genomfört moment är registrerat men permit-stage har inte uppdaterats manuellt — kontrollera om steget behöver ändras.
          </p>
        </div>
      )}

      {/* Milestone rows */}
      <div className="space-y-2">
        {milestones.map(({ label, completedAt }) => (
          <div key={label} className="flex items-center gap-2">
            {completedAt ? (
              <div className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <Check className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
              </div>
            ) : (
              <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[8px] text-muted-foreground font-bold leading-none">—</span>
              </div>
            )}
            <span className={cn('text-xs flex-1', completedAt ? 'text-foreground font-medium' : 'text-muted-foreground')}>
              {label}
            </span>
            {completedAt && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatDate(completedAt)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Lektionslogg tab ─────────────────────────────────────────────────────────

type LessonLogEntry = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  lesson_slots: { notes: string | null } | null;
};

function LektionsloggTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-lesson-log', studentId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('lesson_bookings')
        .select('id, starts_at, ends_at, status, lesson_slots(notes)')
        .eq('student_id', studentId)
        .in('status', ['completed', 'no_show'])
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .limit(100);
      return (rows ?? []) as LessonLogEntry[];
    },
    staleTime: 2 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  const entries = data ?? [];

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Inga genomförda eller uteblivna lektioner.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="divide-y divide-border">
        {entries.map((entry) => {
          const dateStr = new Date(entry.starts_at).toLocaleDateString('sv-SE', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
          });
          const timeStr = `${formatTime(entry.starts_at)} – ${formatTime(entry.ends_at)}`;
          const mins    = Math.round(
            (new Date(entry.ends_at).getTime() - new Date(entry.starts_at).getTime()) / 60_000,
          );
          const note    = (entry.lesson_slots as { notes: string | null } | null)?.notes ?? null;
          const noShow  = entry.status === 'no_show';

          return (
            <div key={entry.id} className="px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-medium capitalize text-foreground">{dateStr}</p>
                  <p className="text-[10px] text-muted-foreground">{timeStr} · {mins} min</p>
                </div>
                <span className={cn(
                  'shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border',
                  noShow
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50'
                    : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50',
                )}>
                  {noShow ? 'Uteblev' : 'Genomförd'}
                </span>
              </div>
              {note ? (
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-2">
                  {note}
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-muted-foreground/40 italic">Ingen anteckning</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Körjournal tab ───────────────────────────────────────────────────────────

type KorjournalEntry = {
  id:              string;
  starts_at:       string;
  ends_at:         string;
  lesson_type_id:  string;
  lesson_types:    { name: string; category: string } | null;
};

type CategoryStat = {
  category:     string;
  label:        string;
  count:        number;
  totalMinutes: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  driving:      'Körlektion',
  theory:       'Teorilektion',
  risk1:        'Risk 1',
  risk2:        'Risk 2',
  simulator:    'Simulator',
  assessment:   'Bedömning',
  intensive:    'Intensivkurs',
  group_theory: 'Gruppteorillektion',
  other:        'Övrigt',
};

function fmtDuration(minutes: number): string {
  if (minutes === 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function KorjournalTab({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-korjournal', studentId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('lesson_bookings')
        .select('id, starts_at, ends_at, lesson_type_id, lesson_types(name, category)')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('starts_at', { ascending: false });
      return (rows ?? []) as KorjournalEntry[];
    },
    staleTime: 2 * 60_000,
  });

  const stats = useMemo((): CategoryStat[] => {
    if (!data) return [];
    const map = new Map<string, CategoryStat>();
    for (const entry of data) {
      const cat  = (entry.lesson_types as { name: string; category: string } | null)?.category ?? 'other';
      const mins = Math.round(
        (new Date(entry.ends_at).getTime() - new Date(entry.starts_at).getTime()) / 60_000,
      );
      const existing = map.get(cat);
      if (existing) {
        existing.count++;
        existing.totalMinutes += mins;
      } else {
        map.set(cat, { category: cat, label: CATEGORY_LABELS[cat] ?? cat, count: 1, totalMinutes: mins });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [data]);

  const totalSessions = stats.reduce((acc, s) => acc + s.count, 0);
  const totalMinutes  = stats.reduce((acc, s) => acc + s.totalMinutes, 0);
  const drivingStats  = stats.find((s) => s.category === 'driving');

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Top stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Genomförda lektioner', value: totalSessions.toString(),       color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Total körtid',         value: fmtDuration(totalMinutes),       color: 'text-green-600 dark:text-green-400' },
          { label: 'Körlektion',           value: fmtDuration(drivingStats?.totalMinutes ?? 0), color: 'text-primary' },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center space-y-1">
            <p className={cn('text-xl font-bold tabular-nums', s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Per-category breakdown ────────────────────────────────────────── */}
      {stats.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Inga genomförda lektioner registrerade.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Uppdelning per lektionstyp</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Typ</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Lektioner</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Total tid</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Andel</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => {
                const pct = totalMinutes > 0 ? Math.round((s.totalMinutes / totalMinutes) * 100) : 0;
                return (
                  <tr key={s.category} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-foreground">{s.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                      {s.count} st
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums font-medium text-foreground">
                      {fmtDuration(s.totalMinutes)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/10">
                <td className="px-4 py-2 text-xs font-semibold text-foreground">Totalt</td>
                <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">{totalSessions} st</td>
                <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">{fmtDuration(totalMinutes)}</td>
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

    </div>
  );
}

// ─── Admin Utbildningskort panel ──────────────────────────────────────────────

const COMP_DEFS = [
  { key: 'stadskorning',  label: 'Stadskörning',      icon: '🏙️' },
  { key: 'landsvag',      label: 'Landsväg',          icon: '🛣️' },
  { key: 'motorvag',      label: 'Motorväg',          icon: '🚀' },
  { key: 'parkering',     label: 'Parkering',         icon: '🅿️' },
  { key: 'backning',      label: 'Backning',          icon: '⬅️' },
  { key: 'cirkulation',   label: 'Cirkulationsplats', icon: '🔄' },
  { key: 'morker',        label: 'Körning i mörker',  icon: '🌙' },
  { key: 'halka',         label: 'Halkkörning',       icon: '❄️' },
] as const;

const READINESS_DEFS = [
  { key: 'risk1',     label: 'Redo för Riskettan'    },
  { key: 'risk2',     label: 'Redo för Risktvåan'    },
  { key: 'theory',    label: 'Redo för Kunskapsprov' },
  { key: 'practical', label: 'Redo för Körprov'      },
] as const;

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  not_started: { label: 'Ej påbörjad',        cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'    },
  in_progress: { label: 'Pågående',            cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  mastered:    { label: 'Behärskas',           cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  needs_more:  { label: 'Kräver mer träning',  cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'     },
};

function CompStatus({ status }: { status: string | undefined }) {
  const cfg = STATUS_CFG[status ?? 'not_started'] ?? STATUS_CFG['not_started']!;
  return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.cls)}>{cfg.label}</span>;
}

function AdminUtbildningskortPanel({ studentId }: { studentId: string }) {
  const { data: assessments = [], isLoading, isError } = useStudentAssessments(studentId);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Aggregate: for each competency, pick the latest (most recent) status across all instructors
  const aggregated = useMemo((): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const a of assessments) {
      for (const [k, v] of Object.entries(a.competencies)) {
        if (!result[k] || v === 'mastered') result[k] = v;
      }
    }
    return result;
  }, [assessments]);

  const aggregatedReadiness = useMemo((): Record<string, boolean> => {
    const result: Record<string, boolean> = {};
    for (const a of assessments) {
      for (const [k, v] of Object.entries(a.readiness)) {
        if (v) result[k] = true;
      }
    }
    return result;
  }, [assessments]);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 mt-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg text-sm text-red-600">
        Kunde inte hämta utbildningskort.
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="mt-2 p-6 text-center border border-dashed border-border rounded-lg">
        <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">Ingen instruktör har bedömt eleven ännu.</p>
        <p className="text-xs text-muted-foreground mt-1">Utbildningskortet fylls i av instruktören via instruktörsportalen.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-5">
      {/* Aggregated summary */}
      <div>
        <SectionHeading title="Kompetensöversikt (sammantagen)" />
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/50">
          {COMP_DEFS.map(comp => (
            <div key={comp.key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-base shrink-0">{comp.icon}</span>
              <span className="flex-1 text-sm text-foreground">{comp.label}</span>
              <CompStatus status={aggregated[comp.key]} />
            </div>
          ))}
        </div>
      </div>

      {/* Readiness checkmarks */}
      <div>
        <SectionHeading title="Bedömning – redo för" />
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/50">
          {READINESS_DEFS.map(item => (
            <div key={item.key} className="flex items-center gap-3 px-3 py-2.5">
              <ShieldCheck className={cn('w-4 h-4 shrink-0', aggregatedReadiness[item.key] ? 'text-green-500' : 'text-muted-foreground/30')} />
              <span className={cn('flex-1 text-sm', aggregatedReadiness[item.key] ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                {item.label}
              </span>
              {aggregatedReadiness[item.key] && (
                <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Redo</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Per-instructor breakdown */}
      <div>
        <SectionHeading title={`Bedömningar per instruktör (${assessments.length})`} />
        <div className="space-y-2">
          {assessments.map((a: StudentAssessment) => {
            const isExpanded = expandedId === a.id;
            return (
              <div key={a.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-accent/40 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{a.instructor_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Uppdaterad {new Date(a.updated_at).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                </button>
                {isExpanded && (
                  <div className="border-t border-border/50 px-3 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {COMP_DEFS.map(comp => (
                        <div key={comp.key} className="flex items-center gap-1.5">
                          <span className="text-sm">{comp.icon}</span>
                          <span className="text-xs text-muted-foreground truncate">{comp.label}</span>
                          <CompStatus status={a.competencies[comp.key]} />
                        </div>
                      ))}
                    </div>
                    {a.notes && (
                      <div className="bg-muted/40 rounded px-2.5 py-2">
                        <p className="text-xs text-muted-foreground italic">"{a.notes}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Exam Results Panel ───────────────────────────────────────────────────────

const EXAM_MILESTONES: { key: PermitMilestoneKey; label: string; isPass: boolean }[] = [
  { key: 'risk1_booked',         label: 'Riskettan bokad',          isPass: false },
  { key: 'risk1_completed',      label: 'Riskettan klar',           isPass: true  },
  { key: 'risk2_booked',         label: 'Risktvåan bokad',          isPass: false },
  { key: 'risk2_completed',      label: 'Risktvåan klar',           isPass: true  },
  { key: 'theory_exam_booked',   label: 'Kunskapsprov bokat',       isPass: false },
  { key: 'theory_passed',        label: 'Kunskapsprov godkänt',     isPass: true  },
  { key: 'practical_exam_booked',label: 'Körprov bokat',            isPass: false },
  { key: 'practical_passed',     label: 'Körprov godkänt',          isPass: true  },
  { key: 'licence_issued',       label: 'Körkort utfärdat',         isPass: true  },
];

function ExamResultsPanel({ student }: { student: NonNullable<ReturnType<typeof useStudent>['data']> }) {
  const [adding, setAdding] = useState<PermitMilestoneKey | null>(null);
  const [dateVal, setDateVal] = useState('');
  const { data: milestones = [], isLoading } = useStudentMilestones(student.id);
  const record = useRecordMilestone();

  const achieved = new Set(milestones.map(m => m.milestone));
  const licCat = student.target_licence_category ?? 'B';

  const TRANSPORTSTYRELSEN_URL = 'https://www.transportstyrelsen.se/';

  return (
    <div className="space-y-4 pt-2">
      {/* Readiness summary */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Körkortsresa — {licCat}</p>
        <div className="space-y-2">
          {EXAM_MILESTONES.map(m => {
            const done = achieved.has(m.key);
            const ms   = milestones.find(x => x.milestone === m.key);
            return (
              <div key={m.key} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center shrink-0',
                    done
                      ? m.isPass ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-muted',
                  )}>
                    {done ? (
                      <Check className={cn('w-2.5 h-2.5', m.isPass ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400')} />
                    ) : (
                      <span className="text-[8px] text-muted-foreground font-bold leading-none">—</span>
                    )}
                  </div>
                  <span className={cn('text-sm', done ? 'text-foreground' : 'text-muted-foreground')}>
                    {m.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {ms && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(ms.achieved_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  {!done && adding !== m.key && (
                    <button
                      type="button"
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      onClick={() => { setAdding(m.key); setDateVal(new Date().toISOString().slice(0, 10)); }}
                    >
                      Registrera
                    </button>
                  )}
                  {adding === m.key && (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        className="h-7 rounded border border-input bg-background px-2 text-xs"
                        value={dateVal}
                        onChange={e => setDateVal(e.target.value)}
                      />
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-green-600 hover:underline disabled:opacity-50"
                        disabled={!dateVal || record.isPending}
                        onClick={() => {
                          record.mutate(
                            { student_id: student.id, licence_category: licCat, milestone: m.key, achieved_at: new Date(dateVal).toISOString() },
                            {
                              onSuccess: () => { setAdding(null); toast({ title: `${m.label} registrerat` }); },
                              onError:   (e) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
                            },
                          );
                        }}
                      >
                        {record.isPending ? '…' : 'Spara'}
                      </button>
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:underline"
                        onClick={() => setAdding(null)}
                      >
                        Avbryt
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transportstyrelsen link */}
      <a
        href={TRANSPORTSTYRELSEN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/50 transition-colors"
      >
        <ExternalLink className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-sm text-blue-600 dark:text-blue-400">
          Boka prov hos Transportstyrelsen
        </span>
      </a>

      {/* Milestone history */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(n => <div key={n} className="h-8 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : milestones.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Historik</p>
          <div className="space-y-1.5">
            {milestones.map(m => {
              const meta = EXAM_MILESTONES.find(x => x.key === m.milestone);
              return (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 text-sm">
                  <span className="text-foreground">{meta?.label ?? m.milestone}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.achieved_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Utbildning tab ───────────────────────────────────────────────────────────

function UtbildningTab({ student }: { student: NonNullable<ReturnType<typeof useStudent>['data']> }) {
  const [subTab, setSubTab] = useState<UtbildningSubTab>('behorigheteter');

  const LICENCE_TYPES = [
    { key: 'C',   label: 'Tung lastbil',                       icon: Truck },
    { key: 'CE',  label: 'Tung lastbil med tungt släp',         icon: Truck },
    { key: 'D',   label: 'Buss',                               icon: Bus },
    { key: 'YKB-C', label: 'Yrkeskompetensbevis för godstransport',    icon: Truck },
    { key: 'YKB-D', label: 'Yrkeskompetensbevis för persontransport',  icon: Bus },
  ];

  const SUB_TABS: { key: UtbildningSubTab; label: string }[] = [
    { key: 'behorigheteter',    label: 'Behörigheter'     },
    { key: 'utbildningskort',   label: 'Utbildningskort'  },
    { key: 'utbildningsplan',   label: 'Utbildningsplan'  },
    { key: 'provresultat',      label: 'Provresultat'     },
    { key: 'korprovsprotokoll', label: 'Körprovsprotokoll' },
    { key: 'lektionslogg',      label: 'Lektionslogg'      },
    { key: 'korjournal',        label: 'Körjournal'        },
  ];

  return (
    <div className="space-y-0">
      {/* Progress stats */}
      <LessonProgressPanel studentId={student.id} />

      {/* Top action */}
      <div className="flex justify-end mb-4">
        <BlueBtn>Exportera körprocent</BlueBtn>
      </div>

      <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />

      <div className="pt-4 space-y-6">

        {subTab === 'utbildningskort' && (
          <AdminUtbildningskortPanel studentId={student.id} />
        )}

        {subTab === 'utbildningsplan' && (
          <StudentTrainingPlanPanel
            studentId={student.id}
            licenceCategory={student.target_licence_category ?? 'B'}
          />
        )}

        {subTab === 'provresultat' && (
          <ExamResultsPanel student={student} />
        )}

        {subTab === 'behorigheteter' && (
          <>
            {/* Aktiva utbildningar */}
            <div>
              <SectionHeading title="Aktiva utbildningar" />
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <Car className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Personbil</p>
                      <p className="text-xs text-muted-foreground">{formatLicenceCat(student.target_licence_category)}</p>
                    </div>
                  </div>
                  <span className="text-xs text-orange-500 font-medium">Ingen utbildningsplan</span>
                </div>
                <div className="p-3">
                  <PermitStageBadge stage={student.permit_stage} />
                </div>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors border-t border-border/50">
                  <Settings className="w-3 h-3" />
                  Inställningar
                </button>
              </div>
            </div>

            {/* Tillgängliga utbildningar */}
            <div>
              <SectionHeading title="Tillgängliga utbildningar" />
              <div className="space-y-2">
                {LICENCE_TYPES.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="bg-card border border-border rounded-lg flex items-center justify-between p-3 border-l-4 border-l-blue-500">
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{key}</p>
                      </div>
                    </div>
                    <GreenBtn disabled>Lägg till</GreenBtn>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {subTab === 'korprovsprotokoll' && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Inga körprovsprotokoll registrerade
          </div>
        )}

        {subTab === 'lektionslogg' && (
          <LektionsloggTab studentId={student.id} />
        )}

        {subTab === 'korjournal' && (
          <KorjournalTab studentId={student.id} />
        )}

      </div>
    </div>
  );
}

// ─── Teorimaterial tab ────────────────────────────────────────────────────────

const QUIZ_CATEGORY_LABELS: Record<string, string> = {
  trafikregler:  'Trafikregler',
  vagmarken:     'Vägmärken',
  miljo:         'Miljö & Ekonomi',
  fordon:        'Fordon & Teknik',
  riskhantering: 'Riskhantering',
};

function quizCategoryLabel(cat: string): string {
  return QUIZ_CATEGORY_LABELS[cat] ?? cat;
}

interface QuizCategoryStat {
  category:       string;
  question_count: number;
  last_score:     number | null;
  last_total:     number | null;
  last_attempt:   string | null;
}

interface QuizSessionRow {
  id:             string;
  category:       string | null;
  question_count: number;
  score:          number | null;
  completed_at:   string;
  time_spent_sec: number | null;
}

// Staff-facing read of the same quiz_questions/quiz_sessions tables the student
// portal writes to (quiz_sessions_tenant_read / quiz_questions_tenant_read RLS
// policies already grant authenticated staff org-scoped SELECT — no new
// endpoint or table needed).
function useStudentQuizData(studentId: string) {
  return useQuery({
    queryKey: ['student-quiz-data', studentId],
    queryFn: async () => {
      const [{ data: questions, error: qErr }, { data: sessions, error: sErr }] = await Promise.all([
        supabase.from('quiz_questions').select('category').eq('is_active', true),
        supabase
          .from('quiz_sessions')
          .select('id, category, question_count, score, completed_at, time_spent_sec')
          .eq('student_id', studentId)
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false }),
      ]);
      if (qErr) throw qErr;
      if (sErr) throw sErr;

      const sessionRows = (sessions ?? []) as QuizSessionRow[];

      const questionCounts = new Map<string, number>();
      for (const q of (questions ?? []) as { category: string }[]) {
        questionCounts.set(q.category, (questionCounts.get(q.category) ?? 0) + 1);
      }

      const categoryStats: QuizCategoryStat[] = Array.from(questionCounts.entries())
        .map(([category, question_count]) => {
          const last = sessionRows.find((s) => s.category === category);
          return {
            category,
            question_count,
            last_score:   last?.score ?? null,
            last_total:   last?.question_count ?? null,
            last_attempt: last?.completed_at ?? null,
          };
        })
        .sort((a, b) => a.category.localeCompare(b.category));

      return { categoryStats, sessions: sessionRows };
    },
    enabled: Boolean(studentId),
    staleTime: 60_000,
  });
}

function FragestatistikPanel({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentQuizData(studentId);
  const categoryStats = data?.categoryStats ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (categoryStats.every((c) => c.last_attempt === null)) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Eleven har inte gjort några teorifrågor ännu.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categoryStats.map((c) => {
        const pct = c.last_total ? Math.round(((c.last_score ?? 0) / c.last_total) * 100) : null;
        const passed = pct !== null && pct >= 75;
        return (
          <div key={c.category} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{quizCategoryLabel(c.category)}</p>
              <p className="text-xs text-muted-foreground">{c.question_count} frågor i banken</p>
            </div>
            {pct !== null ? (
              <div className="text-right">
                <p className={cn('text-sm font-semibold', passed ? 'text-green-600' : 'text-amber-600')}>
                  {c.last_score}/{c.last_total} ({pct}%)
                </p>
                <p className="text-xs text-muted-foreground">Senast: {formatDate(c.last_attempt)}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Inte påbörjad</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProvstatistikPanel({ studentId }: { studentId: string }) {
  const { data, isLoading } = useStudentQuizData(studentId);
  const sessions = data?.sessions ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Inga avslutade quiz ännu.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const pct = Math.round(((s.score ?? 0) / s.question_count) * 100);
        const passed = pct >= 75;
        return (
          <div key={s.id} className="bg-card border border-border rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{s.category ? quizCategoryLabel(s.category) : 'Blandat quiz'}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(s.completed_at)}
                {s.time_spent_sec ? ` · ${Math.round(s.time_spent_sec / 60)} min` : ''}
              </p>
            </div>
            <span className={cn(
              'text-xs font-semibold px-2 py-1 rounded-full',
              passed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
            )}>
              {s.score}/{s.question_count} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TeorimaterialTab({ licenceCat: _licenceCat, studentId }: { licenceCat: string; studentId: string }) {
  const [subTab, setSubTab] = useState<TeorimaterialSubTab>('teorimaterial');

  const SUB_TABS: { key: TeorimaterialSubTab; label: string }[] = [
    { key: 'teorimaterial',   label: 'Teorimaterial' },
    { key: 'digital_teoribok', label: 'Digital teoribok' },
    { key: 'ovriga_bocker',   label: 'Övriga digitala böcker' },
    { key: 'fragestatistik',  label: 'Frågestatistik' },
    { key: 'provstatistik',   label: 'Provstatistik' },
    { key: 'checklista',      label: 'Checklista' },
  ];

  const MATERIALS = [
    { key: 'B',     label: 'B-körkort',               icon: Car,   desc: 'Vi erbjuder teorifrågor på svenska, engelska, arabiska samt persiska.' },
    { key: 'C',     label: 'C-körkort',               icon: Truck, desc: 'Erbjuds på svenska.' },
    { key: 'CE',    label: 'CE-körkort',              icon: Truck, desc: 'Erbjuds på svenska.' },
    { key: 'D',     label: 'D-körkort',               icon: Bus,   desc: 'Erbjuds på svenska.' },
    { key: 'YKB-C', label: 'YKB Godstransporter',     icon: Truck, desc: 'Erbjuds på svenska.' },
    { key: 'YKB-D', label: 'YKB Persontransporter',   icon: Bus,   desc: 'Erbjuds på svenska.' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-0">
        <div className="flex-1 overflow-x-auto">
          <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />
        </div>
        <div className="ml-2 shrink-0">
          <select className="h-8 px-2 text-xs rounded border border-input bg-background focus:outline-none">
            <option>Välj teorimaterial</option>
          </select>
        </div>
      </div>

      <div className="pt-4 space-y-4">
        {subTab === 'teorimaterial' && (
          <>
            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">Teorimaterial saknas</p>
                <p className="text-xs text-amber-700 dark:text-amber-500">Denna kund har inte tillgång till något teorimaterial just nu.</p>
              </div>
            </div>

            {/* Lägg till */}
            <div>
              <SectionHeading title="Lägg till teorimaterial" />
              <div className="space-y-2">
                {MATERIALS.map(({ key, label, icon: Icon, desc }) => (
                  <div key={key} className="bg-card border border-border rounded-lg flex items-start justify-between p-3 border-l-4 border-l-blue-500">
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0 ml-4">
                      <GreenBtn disabled>Teorifrågor &amp; digital bok</GreenBtn>
                      <GreenBtn disabled>Teorifrågor</GreenBtn>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Digitala böcker */}
            <div>
              <SectionHeading title="Digitala böcker" />
              <div className="grid grid-cols-3 gap-3">
                {['Handledarboken', 'Riskettan', 'Körhäfte – grunder'].map((book) => (
                  <div key={book} className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="h-24 bg-muted flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium mb-1">{book}</p>
                      <GreenBtn disabled>Lägg till bok</GreenBtn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {subTab === 'fragestatistik' && <FragestatistikPanel studentId={studentId} />}
        {subTab === 'provstatistik' && <ProvstatistikPanel studentId={studentId} />}

        {(subTab === 'digital_teoribok' || subTab === 'ovriga_bocker' || subTab === 'checklista') && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Ingen data tillgänglig
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bokningar tab ────────────────────────────────────────────────────────────

function buildScheduleText(bookings: LessonBooking[], firstName: string): string {
  const tz = 'Europe/Stockholm';
  const lines = bookings.slice(0, 10).map((b) => {
    const s = new Date(b.starts_at);
    const e = new Date(b.ends_at);
    const day = s.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz });
    const st  = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const et  = e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    return `• ${day} ${st}–${et}`;
  });
  const greeting = firstName ? `Hej ${firstName}! ` : 'Hej! ';
  return `${greeting}Dina kommande lektioner:\n${lines.join('\n')}`;
}

function BokningarTab({
  student, fullName, upcomingBookings, onNewBooking,
}: {
  student: NonNullable<ReturnType<typeof useStudent>['data']>;
  fullName: string;
  upcomingBookings: ReturnType<typeof useStudentUpcomingBookings>;
  onNewBooking: () => void;
}) {
  const [smsText,         setSmsText]         = useState('');
  const [includeUpcoming, setIncludeUpcoming] = useState(true);
  const [includePast,     setIncludePast]     = useState(false);
  const [allowBook,       setAllowBook]       = useState(true);
  const [allowCancel,     setAllowCancel]     = useState(true);
  const [sending,         setSending]         = useState<'sms' | 'email' | null>(null);

  const sendMessage = useSendMessage();

  const bookings: LessonBooking[] = upcomingBookings.data?.data ?? [];

  // Auto-populate schedule text when bookings load
  useEffect(() => {
    if (bookings.length > 0 && !smsText) {
      setSmsText(buildScheduleText(bookings, student.first_name));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.length]);

  async function handleSend(channel: 'sms' | 'email') {
    const address = channel === 'sms' ? student.phone : student.email;
    if (!address || !smsText.trim()) return;
    setSending(channel);
    try {
      await sendMessage.mutateAsync({
        channel,
        recipient_type:    'student',
        recipient_id:      student.id,
        recipient_address: address,
        body:              smsText,
        ...(channel === 'email' ? { subject: 'Dina kommande lektioner' } : {}),
        metadata: { type: 'booking_schedule' },
      });
      toast({ title: channel === 'sms' ? 'Schema skickat via SMS' : 'Schema skickat via e-post' });
    } catch (e) {
      toast({ title: 'Kunde inte skicka', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSending(null);
    }
  }

  // Past bookings — all completed/cancelled/no-show before today
  const pastRange = useProgressRange();
  const pastBookingsQuery = useBookingList({
    student_id: student.id,
    ...pastRange,
    sort_by:    'starts_at',
    sort_dir:   'desc',
    per_page:   20,
  });
  const pastBookings: LessonBooking[] = pastBookingsQuery.data?.data ?? [];

  const [cancelTarget,     setCancelTarget]     = useState<{ bookingId: string; slotId: string; slotLabel: string; slotStartsAt: string } | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<{ bookingId: string; slotId: string } | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

      {/* Main */}
      <div className="space-y-6">

        {/* Quick nav */}
        <div className="flex items-center gap-2">
          <Link to="/scheduling" className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            Bokningsschema
          </Link>
          <Link to="/scheduling/list" className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5">
            <ClipboardList className="w-3 h-3" />
            Bokningslista
          </Link>
          <Link to="/scheduling/waitlist" className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            Väntelista
          </Link>
        </div>

        {/* Upcoming */}
        <div>
          <SectionHeading title={`Kommande bokningar (${bookings.length} st)`} />
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {upcomingBookings.isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : bookings.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Denna elev har inga kommande bokningar.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Bokning</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Datum</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Lärare</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Pris</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <BokningRow
                      key={b.id}
                      booking={b}
                      onCancel={(id, slotId, slotLabel) => setCancelTarget({ bookingId: id, slotId, slotLabel, slotStartsAt: b.starts_at })}
                      onReschedule={(id, slotId) => setRescheduleTarget({ bookingId: id, slotId })}
                    />
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
          <PermissionGate permission={Permissions.SCHEDULING_CREATE}>
            <div className="mt-2">
              <button
                onClick={onNewBooking}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Ny bokning
              </button>
            </div>
          </PermissionGate>
        </div>

        {/* Previous */}
        <div>
          <SectionHeading title={`Tidigare bokningar (${pastBookingsQuery.isLoading ? '…' : pastBookings.length} st)`} />
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {pastBookingsQuery.isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : pastBookings.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Denna elev har inga tidigare bokningar.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Bokning</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Datum</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Pris</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pastBookings.map((b) => (
                    <BokningRow key={b.id} booking={b} />
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sidebar */}
      <div className="space-y-4 lg:sticky lg:top-4">

        {/* Summering */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Summering av kommande bokningar" />
          {bookings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga kommande bokningar.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-1 font-medium text-muted-foreground">Typ</th>
                  <th className="text-right pb-1 font-medium text-muted-foreground">Antal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-1">Lektion</td>
                  <td className="py-1 text-right">{bookings.length} st</td>
                </tr>
                {bookings[0] && (
                  <tr>
                    <td className="py-1 text-muted-foreground">Nästa</td>
                    <td className="py-1 text-right">
                      {new Date(bookings[0].starts_at).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Sammanfattning */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Sammanfattning av tidigare bokningar" />
          {pastBookingsQuery.isLoading ? (
            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          ) : pastBookings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Denna elev har inga tidigare bokningar.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-1 font-medium text-muted-foreground">Status</th>
                  <th className="text-right pb-1 font-medium text-muted-foreground">Antal</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'completed', label: 'Genomförda'  },
                  { key: 'no_show',   label: 'Uteblivna'   },
                  { key: 'cancelled', label: 'Avbokade'    },
                ].map(({ key, label }) => {
                  const count = pastBookings.filter((b) => b.status === key).length;
                  if (count === 0) return null;
                  return (
                    <tr key={key}>
                      <td className="py-1">{label}</td>
                      <td className="py-1 text-right">{count} st</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border">
                  <td className="pt-1 font-medium">Totalt</td>
                  <td className="pt-1 text-right font-medium">{pastBookings.length} st</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Skicka */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Skicka kommande bokningar" />
          <textarea
            rows={3}
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            placeholder="Fritt textmeddelande"
            className="w-full px-2.5 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none mb-1"
          />
          <p className="text-[10px] text-muted-foreground mb-2">Antal tecken: {smsText.length}</p>
          <div className="flex gap-2">
            <button
              disabled={!student.phone || !!sending}
              onClick={() => void handleSend('sms')}
              title={!student.phone ? 'Eleven saknar telefonnummer' : undefined}
              className="flex-1 py-2 text-xs font-medium rounded flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              {sending === 'sms' && <Loader2 className="w-3 h-3 animate-spin" />}
              Skicka SMS
            </button>
            <button
              disabled={!student.email || !!sending}
              onClick={() => void handleSend('email')}
              title={!student.email ? 'Eleven saknar e-postadress' : undefined}
              className="flex-1 py-2 text-xs font-medium rounded flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            >
              {sending === 'email' && <Loader2 className="w-3 h-3 animate-spin" />}
              Skicka e-post
            </button>
          </div>
          {(!student.phone || !student.email) && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {!student.phone && !student.email
                ? 'Eleven saknar telefon och e-post'
                : !student.phone
                  ? 'Eleven saknar telefonnummer — SMS ej tillgängligt'
                  : 'Eleven saknar e-postadress — e-post ej tillgängligt'}
            </p>
          )}
        </div>

        {/* Exportera PDF */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Exportera bokningar som PDF" />
          <div className="space-y-1.5 mb-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={includeUpcoming}
                onChange={(e) => setIncludeUpcoming(e.target.checked)}
                className="rounded"
              />
              Inkludera alla kommande bokningar
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(e) => setIncludePast(e.target.checked)}
                className="rounded"
              />
              Inkludera alla tidigare bokningar
            </label>
          </div>
          <div className="space-y-1 mb-3">
            <label className="text-xs text-muted-foreground">Filtrera på utbildningsbehörighet</label>
            <select className="w-full h-7 px-2 text-xs rounded border border-input bg-background">
              <option>Alla</option>
            </select>
          </div>
          <BlueBtn>Exportera PDF</BlueBtn>
        </div>

        {/* Bokningsinställningar */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Kundens bokningsinställningar" />
          <div className="space-y-2 mb-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={allowBook}
                onChange={(e) => setAllowBook(e.target.checked)}
                className="rounded"
              />
              Tillåt eleven att kunna boka lektioner
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={allowCancel}
                onChange={(e) => setAllowCancel(e.target.checked)}
                className="rounded"
              />
              Tillåt eleven att kunna avboka lektioner
            </label>
          </div>
          <GreenBtn disabled>Spara</GreenBtn>
        </div>

      </div>

      <CancelBookingDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
        bookingId={cancelTarget?.bookingId ?? null}
        slotId={cancelTarget?.slotId ?? ''}
        student={student}
        slotLabel={cancelTarget?.slotLabel}
        slotStartsAt={cancelTarget?.slotStartsAt}
        onSuccess={() => setCancelTarget(null)}
      />
      <RescheduleBookingDialog
        open={rescheduleTarget !== null}
        onOpenChange={(o) => { if (!o) setRescheduleTarget(null); }}
        bookingId={rescheduleTarget?.bookingId ?? null}
        currentSlotId={rescheduleTarget?.slotId ?? ''}
        studentName={fullName}
        student={student}
        onSuccess={() => setRescheduleTarget(null)}
      />
    </div>
  );
}

function BokningRow({
  booking,
  onCancel,
  onReschedule,
}: {
  booking:       LessonBooking;
  onCancel?:     (bookingId: string, slotId: string, slotLabel: string) => void;
  onReschedule?: (bookingId: string, slotId: string) => void;
}) {
  const dateStr = new Date(booking.starts_at).toLocaleDateString('sv-SE', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const timeStr  = `${formatTime(booking.starts_at)} – ${formatTime(booking.ends_at)}`;
  const dateOnly = booking.starts_at.slice(0, 10);
  const terminal = booking.status === 'completed' || booking.status === 'no_show' || booking.status === 'cancelled';

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/20">
      <td className="px-3 py-2">
        <div className="text-xs text-blue-600 font-medium">Lektion</div>
      </td>
      <td className="px-3 py-2">
        <div className="text-xs capitalize">{dateStr}</div>
        <div className="text-[10px] text-muted-foreground">{timeStr}</div>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {booking.price_sek != null ? `${booking.price_sek} kr` : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <BookingStatusBadge status={booking.status} />
          {!terminal && onReschedule && (
            <button
              onClick={() => onReschedule(booking.id, booking.slot_id)}
              className="text-[10px] text-blue-600 hover:underline"
            >
              Boka om
            </button>
          )}
          {!terminal && onCancel && (
            <button
              onClick={() => onCancel(booking.id, booking.slot_id, `${dateStr} ${timeStr}`)}
              className="text-[10px] text-red-500 hover:underline"
            >
              Avboka
            </button>
          )}
          <Link
            to={`/scheduling?date=${dateOnly}`}
            className="text-muted-foreground hover:text-foreground"
            title="Öppna i bokningsschema"
          >
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ─── Ekonomi tab ──────────────────────────────────────────────────────────────

function EkonomiTab({ studentId }: { studentId: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold text-blue-600 mb-4">Paket &amp; krediter</h2>
        <StudentPackagePanel studentId={studentId} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-blue-600 mb-4">Ekonomi</h2>
        <StudentFinancePanel studentId={studentId} />
      </div>
    </div>
  );
}

// ─── Loggar tab ───────────────────────────────────────────────────────────────

type BookingLogRow = {
  id:         string;
  starts_at:  string;
  ends_at:    string;
  status:     string;
  created_at: string;
};

const BOOKING_STATUS_SV: Record<string, { label: string; color: string }> = {
  pending:    { label: 'Väntande',   color: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800/50' },
  confirmed:  { label: 'Bekräftad', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50' },
  completed:  { label: 'Genomförd', color: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50' },
  no_show:    { label: 'Uteblev',   color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50' },
  cancelled:  { label: 'Avbokad',   color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50' },
  waitlisted: { label: 'Väntelista', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/50' },
};

function LogEmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="bg-card border border-border rounded-lg py-12 text-center space-y-3">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function BokningsloggarPanel({ studentId }: { studentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-all-bookings', studentId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('lesson_bookings')
        .select('id, starts_at, ends_at, status, created_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .limit(100);
      return (rows ?? []) as BookingLogRow[];
    },
    staleTime: 2 * 60_000,
  });

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>;
  }
  if (!data?.length) {
    return <LogEmptyState icon={Calendar} text="Inga bokningar registrerade för denna elev." />;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground">{data.length} bokningar totalt</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Datum</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Tid</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Längd</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Bokad</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => {
              const dateStr   = new Date(b.starts_at).toLocaleDateString('sv-SE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
              const timeStr   = `${formatTime(b.starts_at)} – ${formatTime(b.ends_at)}`;
              const mins      = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
              const si        = BOOKING_STATUS_SV[b.status] ?? { label: b.status, color: 'bg-muted text-muted-foreground border-border' };
              const bookedStr = new Date(b.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <tr key={b.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-2.5 text-xs capitalize text-foreground">{dateStr}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{timeStr}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{mins} min</td>
                  <td className="px-4 py-2.5">
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', si.color)}>{si.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground">{bookedStr}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KommunikationsloggarPanel({ studentId }: { studentId: string }) {
  const { data: msgData, isLoading } = useStudentMessages(studentId);
  const messages = msgData?.data ?? [];

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>;
  }
  if (!messages.length) {
    return <LogEmptyState icon={MessageSquare} text="Inga meddelanden skickade till denna elev." />;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground">{messages.length} meddelanden totalt</p>
      </div>
      <div className="divide-y divide-border">
        {messages.map((msg) => (
          <div key={msg.id} className="px-4 py-3 flex items-start gap-3 hover:bg-muted/10 transition-colors">
            <ChannelBadge channel={msg.channel} />
            <div className="flex-1 min-w-0">
              {msg.subject && <p className="text-xs font-medium text-foreground truncate">{msg.subject}</p>}
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{msg.body}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(msg.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <StatusBadge status={msg.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline types + constants ───────────────────────────────────────────────

type TimelineEventType = 'booking' | 'note' | 'document' | 'tag' | 'milestone' | 'status';

type TimelineEvent = {
  id:       string;
  at:       string;
  type:     TimelineEventType;
  title:    string;
  subtitle: string;
};

const TIMELINE_FILTERS: { key: TimelineEventType | 'all'; label: string }[] = [
  { key: 'all',       label: 'Alla' },
  { key: 'booking',   label: 'Lektioner' },
  { key: 'note',      label: 'Anteckningar' },
  { key: 'document',  label: 'Dokument' },
  { key: 'tag',       label: 'Taggar' },
  { key: 'milestone', label: 'Milstolpar' },
  { key: 'status',    label: 'Status' },
];

const TIMELINE_TYPE_COLOR: Record<TimelineEventType, string> = {
  booking:   'bg-blue-500',
  note:      'bg-amber-500',
  document:  'bg-emerald-500',
  tag:       'bg-purple-500',
  milestone: 'bg-sky-500',
  status:    'bg-slate-400',
};

const TIMELINE_TYPE_ICON: Record<TimelineEventType, React.ComponentType<{ className?: string }>> = {
  booking:   Calendar,
  note:      MessageSquare,
  document:  FileText,
  tag:       Tag,
  milestone: BookOpen,
  status:    ClipboardList,
};

const DOC_CATEGORY_SV: Record<string, string> = {
  identity_document:   'ID-handling',
  medical_clearance:   'Läkarintyg',
  theory_result:       'Kunskapsprov',
  risk_education:      'Riskutbildning',
  practical_result:    'Körprov',
  licence_copy:        'Körkortskopia',
  enrollment_contract: 'Inskrivningsavtal',
  other:               'Övrigt',
};

const TIMELINE_MILESTONE_SV: Record<string, string> = {
  risk1_booked:          'Risk 1 bokat',
  risk1_completed:       'Risk 1 genomfört',
  risk2_booked:          'Risk 2 bokat',
  risk2_completed:       'Risk 2 genomfört',
  theory_exam_booked:    'Kunskapsprov bokat',
  theory_passed:         'Kunskapsprov godkänt',
  practical_exam_booked: 'Körprov bokat',
  practical_passed:      'Körprov godkänt',
  licence_issued:        'Körkort utfärdat',
};

const STUDENT_STATUS_SV: Record<string, string> = {
  lead:       'Prospekt',
  onboarding: 'Onboarding',
  active:     'Aktiv',
  paused:     'Pausad',
  completed:  'Avklarad',
  withdrawn:  'Avhopp',
  archived:   'Arkiverad',
};

// ─── Student Timeline Panel ───────────────────────────────────────────────────

function StudentTimelinePanel({
  student,
}: {
  student: NonNullable<ReturnType<typeof useStudent>['data']>;
}) {
  const studentId = student.id;
  const [typeFilter, setTypeFilter] = useState<TimelineEventType | 'all'>('all');
  const [search, setSearch] = useState('');

  const { data: bookingData } = useQuery<BookingLogRow[]>({
    queryKey: ['student-all-bookings', studentId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('lesson_bookings')
        .select('id, starts_at, ends_at, status, created_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('starts_at', { ascending: false })
        .limit(100);
      return (rows ?? []) as BookingLogRow[];
    },
    staleTime: 2 * 60_000,
  });

  const { data: notes = [] } = useStudentNotes(studentId);

  const { data: docData } = useQuery<{ id: string; category: string; file_name: string; created_at: string }[]>({
    queryKey: ['student-timeline-docs', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_documents')
        .select('id, category, file_name, created_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; category: string; file_name: string; created_at: string }[];
    },
    staleTime: 30_000,
  });

  const { data: tagAssignments } = useQuery<{ tag_id: string; assigned_at: string; tag_name: string }[]>({
    queryKey: ['student-timeline-tags', studentId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as any)
        .from('student_tag_assignments')
        .select('tag_id, assigned_at, student_tags(name)')
        .eq('student_id', studentId)
        .order('assigned_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{
        tag_id:       string;
        assigned_at:  string;
        student_tags: { name: string } | null;
      }>).map(r => ({
        tag_id:      r.tag_id,
        assigned_at: r.assigned_at,
        tag_name:    r.student_tags?.name ?? '–',
      }));
    },
    staleTime: 2 * 60_000,
  });

  const { data: milestones = [] } = useStudentMilestones(studentId);

  const allEvents = useMemo<TimelineEvent[]>(() => {
    const items: TimelineEvent[] = [];

    items.push({
      id:       `status-created-${studentId}`,
      at:       student.created_at,
      type:     'status',
      title:    'Elev registrerad',
      subtitle: `Status: ${STUDENT_STATUS_SV[student.status] ?? student.status}`,
    });
    if (student.enrolled_at) {
      items.push({
        id:       `status-enrolled-${studentId}`,
        at:       student.enrolled_at,
        type:     'status',
        title:    'Elev inskriven',
        subtitle: 'Inskrivningsdatum registrerat',
      });
    }
    if (student.status_changed_at && student.status_changed_at !== student.created_at) {
      items.push({
        id:       `status-changed-${studentId}`,
        at:       student.status_changed_at,
        type:     'status',
        title:    'Status ändrad',
        subtitle: `Nuvarande: ${STUDENT_STATUS_SV[student.status] ?? student.status}`,
      });
    }

    for (const b of bookingData ?? []) {
      const dateStr  = new Date(b.starts_at).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
      const timeStr  = `${formatTime(b.starts_at)}–${formatTime(b.ends_at)}`;
      const statusSv = BOOKING_STATUS_SV[b.status]?.label ?? b.status;
      items.push({
        id:       `booking-${b.id}`,
        at:       b.starts_at,
        type:     'booking',
        title:    `Körlektion ${dateStr}`,
        subtitle: `${timeStr} · ${statusSv}`,
      });
    }

    for (const n of notes) {
      const cat     = NOTE_CATEGORY_LABELS[n.category] ?? n.category;
      const preview = n.body.length > 80 ? n.body.slice(0, 80) + '…' : n.body;
      items.push({
        id:       `note-${n.id}`,
        at:       n.created_at,
        type:     'note',
        title:    `Anteckning — ${cat}${n.is_pinned ? ' (nålad)' : ''}`,
        subtitle: preview,
      });
    }

    for (const d of docData ?? []) {
      const cat = DOC_CATEGORY_SV[d.category] ?? d.category;
      items.push({
        id:       `doc-${d.id}`,
        at:       d.created_at,
        type:     'document',
        title:    `Dokument uppladdad — ${cat}`,
        subtitle: d.file_name,
      });
    }

    for (const t of tagAssignments ?? []) {
      items.push({
        id:       `tag-${t.tag_id}`,
        at:       t.assigned_at,
        type:     'tag',
        title:    'Tagg tilldelad',
        subtitle: t.tag_name,
      });
    }

    for (const m of milestones) {
      items.push({
        id:       `milestone-${m.id}`,
        at:       m.achieved_at,
        type:     'milestone',
        title:    `Milstolpe — ${TIMELINE_MILESTONE_SV[m.milestone] ?? m.milestone}`,
        subtitle: m.notes ?? `Kategori ${m.licence_category}`,
      });
    }

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [student, studentId, bookingData, notes, docData, tagAssignments, milestones]);

  const filtered = useMemo(() => {
    let items = allEvents;
    if (typeFilter !== 'all') items = items.filter(e => e.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(e =>
        e.title.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q),
      );
    }
    return items;
  }, [allEvents, typeFilter, search]);

  const grouped = useMemo(() => {
    const groups: { month: string; events: TimelineEvent[] }[] = [];
    let currentMonth = '';
    for (const ev of filtered) {
      const month = new Date(ev.at).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' });
      if (month !== currentMonth) {
        currentMonth = month;
        groups.push({ month, events: [] });
      }
      const lastGroup = groups.at(-1);
      if (lastGroup) lastGroup.events.push(ev);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {TIMELINE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
              typeFilter === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:border-foreground/30',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Sök i tidslinje…"
          className="w-full h-8 pl-8 pr-3 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {filtered.length === 0 && (
        <LogEmptyState icon={ClipboardList} text="Inga händelser matchar filtret." />
      )}

      {grouped.map(group => (
        <div key={group.month}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider capitalize">
              {group.month}
            </p>
            <div className="flex-1 h-px bg-border" />
            <p className="text-[10px] text-muted-foreground">{group.events.length}</p>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
            {group.events.map(ev => {
              const Icon = TIMELINE_TYPE_ICON[ev.type];
              const dot  = TIMELINE_TYPE_COLOR[ev.type];
              return (
                <div key={ev.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors">
                  <div className={cn('mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center', dot)}>
                    <Icon className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{ev.subtitle}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap mt-0.5">
                    {new Date(ev.at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoggarTab({
  student,
}: {
  student: NonNullable<ReturnType<typeof useStudent>['data']>;
}) {
  const [subTab, setSubTab] = useState<LogSubTab>('bokningsloggar');

  const SUB_TABS: { key: LogSubTab; label: string }[] = [
    { key: 'bokningsloggar',        label: 'Bokningsloggar' },
    { key: 'kommunikationsloggar',  label: 'Kommunikationsloggar' },
    { key: 'aktivitetsloggar',      label: 'Aktivitetsloggar' },
  ];

  return (
    <div>
      <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />
      <div className="pt-4">
        {subTab === 'bokningsloggar'       && <BokningsloggarPanel studentId={student.id} />}
        {subTab === 'kommunikationsloggar' && <KommunikationsloggarPanel studentId={student.id} />}
        {subTab === 'aktivitetsloggar'     && <StudentTimelinePanel student={student} />}
      </div>
    </div>
  );
}

// ─── Meddelande tab ───────────────────────────────────────────────────────────

function MeddelandeTab({ studentEmail, studentPhone }: {
  studentEmail: string | null;
  studentPhone: string | null;
}) {
  const hasContactInfo = Boolean(studentEmail || studentPhone);
  const message = hasContactInfo
    ? 'Meddelandeöversikt är inte tillgänglig här ännu. Använd flikarna SMS eller E-post för att skicka meddelanden till eleven.'
    : 'Det finns ingen e-postadress eller telefonnummer registrerat för den här eleven. Lägg till kontaktuppgifter under "Redigera" för att kunna skicka meddelanden.';

  return (
    <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ─── SMS tab ──────────────────────────────────────────────────────────────────

const SMS_TEMPLATES = [
  { value: '', label: 'Välj mall' },
  { value: 'upcoming_lesson', label: 'Påminnelse om kommande lektion' },
  { value: 'cancel',          label: 'Avbokningsbekräftelse' },
  { value: 'welcome',         label: 'Välkommen som elev' },
  { value: 'payment',         label: 'Betalningspåminnelse' },
];

const SMS_MAX = 1300;

function SmsTab({ studentId, studentName, studentPhone }: {
  studentId:    string;
  studentName:  string;
  studentPhone: string | null;
}) {
  const [selected,  setSelected]  = useState(true);
  const [template,  setTemplate]  = useState('');
  const [message,   setMessage]   = useState('');

  const sender    = 'Trafikskolan';
  const signature = 'Detta SMS kan inte besvaras.';
  const remaining = SMS_MAX - message.length;
  const smsCount  = Math.ceil(Math.max(1, message.length) / 160);

  const sendMessage  = useSendMessage();
  const { data: messagesData, isLoading: historyLoading } = useStudentMessages(studentId);
  const messages = messagesData?.data ?? [];
  const { data: channels } = useChannelConfigs();
  const smsEnabled = channels?.find((c) => c.channel === 'sms')?.enabled ?? false;

  function handleSend() {
    if (!selected || !message.trim() || !studentPhone || !smsEnabled) return;
    const fullBody = message + '\n' + signature;
    sendMessage.mutate(
      {
        channel:           'sms',
        recipient_type:    'student',
        recipient_id:      studentId,
        recipient_address: studentPhone,
        body:              fullBody,
        metadata:          { manual: true },
      },
      {
        onSuccess: () => {
          toast({ title: 'SMS skickat' });
          setMessage('');
          setTemplate('');
        },
        onError: (e) => toast({
          title:       'Kunde inte skicka SMS',
          description: e instanceof Error ? e.message : undefined,
          variant:     'destructive',
        }),
      }
    );
  }

  function handleTemplate(val: string) {
    setTemplate(val);
    const MAP: Record<string, string> = {
      upcoming_lesson: `Hej ${studentName}. Din körlektion är inbokad. Kontakta oss om du behöver avboka.`,
      cancel:          `Hej ${studentName}. Din körlektion har avbokats. Kontakta oss för att boka om.`,
      welcome:         `Hej ${studentName}, välkommen som ny elev!`,
      payment:         `Hej ${studentName}. Du har en obetald faktura. Vänligen betala snarast.`,
    };
    setMessage(MAP[val] ?? '');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-5 items-start">

      {/* Recipient selector */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Skicka till
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 w-8"></th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Namn</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Mobilnummer</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-accent/20">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => setSelected(e.target.checked)}
                  className="rounded accent-primary"
                />
              </td>
              <td className="px-2 py-2 font-medium">{studentName}</td>
              <td className="px-2 py-2 text-muted-foreground">{studentPhone ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compose form */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Avsändare</label>
          <input
            type="text"
            value={sender}
            readOnly
            className="w-full h-8 px-2.5 text-sm rounded border border-input bg-muted/20 text-muted-foreground"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Meddelandemall</label>
          <div className="relative">
            <select
              value={template}
              onChange={(e) => handleTemplate(e.target.value)}
              className="w-full h-8 pl-2.5 pr-7 text-sm rounded border border-input bg-background appearance-none focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {SMS_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Meddelande</label>
          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ange ditt meddelande"
            className="w-full px-2.5 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Signatur</label>
          <p className="text-xs text-muted-foreground italic">{signature}</p>
        </div>

        <p className="text-xs text-muted-foreground">
          Använda tecken: <span className="font-medium text-foreground">{message.length}</span>
          {' · '}Tecken kvar: <span className="font-medium text-foreground">{remaining}</span>
          {' · '}SMS pr. mottagare: <span className="font-medium text-foreground">{smsCount}</span>
          {' · '}SMS totalt: <span className="font-medium text-foreground">{selected ? smsCount : 0}</span>
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => { setMessage(''); setTemplate(''); }}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border bg-background hover:bg-accent text-foreground transition-colors"
          >
            Återställ
          </button>
          <button
            onClick={handleSend}
            disabled={!selected || !message.trim() || !studentPhone || !smsEnabled || sendMessage.isPending}
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendMessage.isPending ? 'Skickar...' : 'Skicka SMS'}
          </button>
        </div>
        {!studentPhone && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Inget mobilnummer registrerat för denna elev.</p>
        )}
        {!smsEnabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            SMS-kanalen är inte aktiverad för skolan. Aktivera den under Kommunikation → Kanaler för att kunna skicka SMS.
          </p>
        )}
      </div>

      {/* Message history */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meddelandehistorik</p>
          {messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{messages.length} meddelanden</span>
          )}
        </div>
        {historyLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="p-4 text-center py-12">
            <p className="text-xs text-muted-foreground">Inga meddelanden skickade till denna elev.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((msg) => (
              <div key={msg.id} className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-accent/10 transition-colors">
                <ChannelBadge channel={msg.channel} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground line-clamp-2">{msg.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(msg.created_at).toLocaleDateString('sv-SE', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <StatusBadge status={msg.status} />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── WhatsApp tab ─────────────────────────────────────────────────────────────
// Mirrors SmsTab — same phone-number recipient, same template/compose shape,
// same useChannelConfigs() gating — WhatsApp is already a fully implemented
// channel (Twilio/Meta providers in _shared/comm-providers.ts, configurable
// under Kommunikation → Kanaler) that was simply missing from this page's
// per-student tabs.

const WHATSAPP_TEMPLATES = [
  { value: '', label: 'Välj mall' },
  { value: 'upcoming_lesson', label: 'Påminnelse om kommande lektion' },
  { value: 'cancel',          label: 'Avbokningsbekräftelse' },
  { value: 'welcome',         label: 'Välkommen som elev' },
  { value: 'payment',         label: 'Betalningspåminnelse' },
];

function WhatsAppTab({ studentId, studentName, studentPhone }: {
  studentId:    string;
  studentName:  string;
  studentPhone: string | null;
}) {
  const [selected, setSelected] = useState(true);
  const [template, setTemplate] = useState('');
  const [message,  setMessage]  = useState('');

  const sender = 'Trafikskolan';

  const sendMessage = useSendMessage();
  const { data: messagesData, isLoading: historyLoading } = useStudentMessages(studentId);
  const messages = useMemo(() => (messagesData?.data ?? []).filter((m) => m.channel === 'whatsapp'), [messagesData]);
  const { data: channels } = useChannelConfigs();
  const whatsappEnabled = channels?.find((c) => c.channel === 'whatsapp')?.enabled ?? false;

  function handleSend() {
    if (!selected || !message.trim() || !studentPhone || !whatsappEnabled) return;
    sendMessage.mutate(
      {
        channel:           'whatsapp',
        recipient_type:    'student',
        recipient_id:      studentId,
        recipient_address: studentPhone,
        body:              message,
        metadata:          { manual: true },
      },
      {
        onSuccess: () => {
          toast({ title: 'WhatsApp-meddelande skickat' });
          setMessage('');
          setTemplate('');
        },
        onError: (e) => toast({
          title:       'Kunde inte skicka WhatsApp-meddelande',
          description: e instanceof Error ? e.message : undefined,
          variant:     'destructive',
        }),
      }
    );
  }

  function handleTemplate(val: string) {
    setTemplate(val);
    const MAP: Record<string, string> = {
      upcoming_lesson: `Hej ${studentName}. Din körlektion är inbokad. Kontakta oss om du behöver avboka.`,
      cancel:          `Hej ${studentName}. Din körlektion har avbokats. Kontakta oss för att boka om.`,
      welcome:         `Hej ${studentName}, välkommen som ny elev!`,
      payment:         `Hej ${studentName}. Du har en obetald faktura. Vänligen betala snarast.`,
    };
    setMessage(MAP[val] ?? '');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-5 items-start">

      {/* Recipient selector */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Skicka till
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-2 w-8"></th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Namn</th>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">Mobilnummer</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-accent/20">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => setSelected(e.target.checked)}
                  className="rounded accent-primary"
                />
              </td>
              <td className="px-2 py-2 font-medium">{studentName}</td>
              <td className="px-2 py-2 text-muted-foreground">{studentPhone ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compose form */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Avsändare</label>
          <input
            type="text"
            value={sender}
            readOnly
            className="w-full h-8 px-2.5 text-sm rounded border border-input bg-muted/20 text-muted-foreground"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Meddelandemall</label>
          <div className="relative">
            <select
              value={template}
              onChange={(e) => handleTemplate(e.target.value)}
              className="w-full h-8 pl-2.5 pr-7 text-sm rounded border border-input bg-background appearance-none focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {WHATSAPP_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Meddelande</label>
          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ange ditt meddelande"
            className="w-full px-2.5 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Använda tecken: <span className="font-medium text-foreground">{message.length}</span>
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => { setMessage(''); setTemplate(''); }}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border bg-background hover:bg-accent text-foreground transition-colors"
          >
            Återställ
          </button>
          <button
            onClick={handleSend}
            disabled={!selected || !message.trim() || !studentPhone || !whatsappEnabled || sendMessage.isPending}
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sendMessage.isPending ? 'Skickar...' : 'Skicka WhatsApp'}
          </button>
        </div>
        {!studentPhone && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Inget mobilnummer registrerat för denna elev.</p>
        )}
        {!whatsappEnabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            WhatsApp-kanalen är inte aktiverad för skolan. Aktivera den under Kommunikation → Kanaler för att kunna skicka WhatsApp-meddelanden.
          </p>
        )}
      </div>

      {/* Message history */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meddelandehistorik</p>
          {messages.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{messages.length} meddelanden</span>
          )}
        </div>
        {historyLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="p-4 text-center py-12">
            <p className="text-xs text-muted-foreground">Inga WhatsApp-meddelanden skickade till denna elev.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((msg) => (
              <div key={msg.id} className="px-3 py-2.5 flex items-start gap-2.5 hover:bg-accent/10 transition-colors">
                <ChannelBadge channel={msg.channel} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground line-clamp-2">{msg.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(msg.created_at).toLocaleDateString('sv-SE', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <StatusBadge status={msg.status} />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── E-post tab ───────────────────────────────────────────────────────────────

function EpostTab({ studentId, studentEmail }: { studentId: string; studentEmail: string | null }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const sendMessage = useSendMessage();
  const { data: msgData, isLoading } = useStudentMessages(studentId);
  const emails = useMemo(() => (msgData?.data ?? []).filter((m) => m.channel === 'email'), [msgData]);

  function handleSend() {
    if (!studentEmail || !message.trim()) return;
    sendMessage.mutate(
      {
        channel:           'email',
        recipient_type:    'student',
        recipient_id:      studentId,
        recipient_address: studentEmail,
        subject:           subject || undefined,
        body:              message,
        metadata:          { manual: true },
      },
      {
        onSuccess: () => {
          toast({ title: 'E-post skickad' });
          setMessage('');
          setSubject('');
        },
        onError: (e) => toast({
          title:       'Kunde inte skicka e-post',
          description: e instanceof Error ? e.message : undefined,
          variant:     'destructive',
        }),
      }
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

      {/* Compose */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <SectionHeading title="Skicka e-post" />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Till</label>
          <input
            type="text"
            value={studentEmail ?? 'Ingen e-postadress registrerad'}
            readOnly
            className="w-full h-8 px-2.5 text-sm rounded border border-input bg-muted/20 text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Ämne</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ämnesrad (valfritt)"
            className="w-full h-8 px-2.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Meddelande</label>
          <textarea
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Skriv ditt meddelande..."
            className="w-full px-2.5 py-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => { setMessage(''); setSubject(''); }}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border bg-background hover:bg-accent text-foreground transition-colors"
          >
            Återställ
          </button>
          <button
            onClick={handleSend}
            disabled={!studentEmail || !message.trim() || sendMessage.isPending}
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {sendMessage.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            {sendMessage.isPending ? 'Skickar...' : 'Skicka e-post'}
          </button>
        </div>
        {!studentEmail && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Ingen e-postadress registrerad för denna elev.</p>
        )}
      </div>

      {/* History */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">E-posthistorik</p>
          {emails.length > 0 && <span className="text-[10px] text-muted-foreground">{emails.length} meddelanden</span>}
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
        ) : emails.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Mail className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs text-muted-foreground">Inga e-postmeddelanden skickade till denna elev.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {emails.map((msg) => (
              <div key={msg.id} className="px-3 py-3 flex items-start gap-2.5 hover:bg-accent/10 transition-colors">
                <Mail className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {msg.subject && (
                    <p className="text-xs font-medium text-foreground truncate">{msg.subject}</p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{msg.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(msg.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <StatusBadge status={msg.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Historik tab (Kvitto + Rutt) ─────────────────────────────────────────────

type DrivingSession = {
  id:              string;
  started_at:      string;
  route_comment:   string | null;
  distance_km:     number | null;
  duration_min:    number | null;
  route_waypoints: Array<[number, number]> | null;
};

function HistorikTab({ studentId }: { studentId: string }) {
  const [subTab, setSubTab]           = useState<HistorikSubTab>('kvitto');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const SUB_TABS: { key: HistorikSubTab; label: string }[] = [
    { key: 'kvitto', label: 'Kvitto' },
    { key: 'rutt',   label: 'Rutt' },
  ];

  const { data, isLoading } = useQuery({
    queryKey: ['student-invoices', studentId],
    queryFn: async () => {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, issued_at, due_date, total_amount, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(50);
      return (invoices ?? []) as Array<{
        id: string;
        invoice_number: number | null;
        status: string;
        issued_at: string | null;
        due_date: string | null;
        total_amount: number;
        created_at: string;
      }>;
    },
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['student-driving-sessions', studentId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('driving_sessions')
        .select('id, started_at, route_comment, distance_km, duration_min, route_waypoints')
        .eq('student_id', studentId)
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) return [] as DrivingSession[];
      return (rows ?? []) as DrivingSession[];
    },
    enabled: subTab === 'rutt',
  });

  const SEK = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const STATUS_LABEL: Record<string, string> = {
    draft: 'Utkast', issued: 'Utskickad', paid: 'Betald',
    partially_paid: 'Delvis betald', overdue: 'Förfallen', void: 'Makulerad',
  };

  return (
    <div className="space-y-4">
      <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />

      {subTab === 'kvitto' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !data || data.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Inga kvitton hittades för denna elev.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Siffra</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Typ</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Tillhör</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skickat</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Belopp</th>
                </tr>
              </thead>
              <tbody>
                {data.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-2.5">
                      <span className="text-blue-600 font-medium text-xs">
                        {inv.invoice_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm">Kontantfaktura</td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">—</td>
                    <td className="px-4 py-2.5 text-sm">
                      {inv.issued_at
                        ? new Date(inv.issued_at).toLocaleDateString('sv-SE')
                        : new Date(inv.created_at).toLocaleDateString('sv-SE')}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right tabular-nums font-medium">
                      {SEK.format(inv.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subTab === 'rutt' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

          {/* ── Route history list ─────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10">
              <h3 className="text-sm font-semibold text-foreground">Historik</h3>
            </div>
            {sessionsLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !sessions || sessions.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Car className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Inga körruttsessioner registrerade.
                </p>
                <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                  Kräver GPS-integrering
                </span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datum</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kommentar</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distans</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tid</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Val</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className={cn(
                        'border-b border-border last:border-0 hover:bg-muted/10 transition-colors',
                        selectedSessionId === s.id && 'bg-blue-50 dark:bg-blue-950/20',
                      )}
                    >
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                        {new Date(s.started_at).toLocaleString('sv-SE', {
                          year: 'numeric', month: '2-digit', day: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-sm">
                        {s.route_comment ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right tabular-nums">
                        {s.distance_km != null ? `${s.distance_km.toFixed(2)} km` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right tabular-nums text-muted-foreground">
                        {s.duration_min != null
                          ? `${Math.floor(s.duration_min / 60)}:${String(s.duration_min % 60).padStart(2, '0')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => setSelectedSessionId(s.id === selectedSessionId ? null : s.id)}
                          title="Visa rutt"
                          className={cn(
                            'w-7 h-7 rounded-full border-2 flex items-center justify-center mx-auto transition-colors',
                            selectedSessionId === s.id
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : 'border-border text-muted-foreground hover:border-blue-400 hover:text-blue-500',
                          )}
                        >
                          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current ml-0.5">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Map panel ─────────────────────────────────────────────────── */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Rutt</h3>
              {selectedSessionId && (
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Rensa val
                </button>
              )}
            </div>
            <div className="h-[420px] relative bg-muted/20">
              {(() => {
                const sel = selectedSessionId
                  ? sessions?.find((s) => s.id === selectedSessionId)
                  : null;
                const wp  = sel?.route_waypoints;
                const hasWp = Array.isArray(wp) && wp.length >= 2;

                // Build OSM embed bbox from waypoints or use default Sweden view
                let bbox = '11.85,57.65,12.05,57.80'; // default: Gothenburg area
                if (hasWp && wp) {
                  const lats = wp.map((p) => p[0]);
                  const lons = wp.map((p) => p[1]);
                  const minLat = Math.min(...lats) - 0.005;
                  const maxLat = Math.max(...lats) + 0.005;
                  const minLon = Math.min(...lons) - 0.005;
                  const maxLon = Math.max(...lons) + 0.005;
                  bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
                }

                return (
                  <>
                    <iframe
                      key={bbox}
                      title="Körruttskarta"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`}
                      className="w-full h-full border-0"
                      loading="lazy"
                    />
                    {!selectedSessionId && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-background/90 rounded-lg px-4 py-3 shadow-md text-center space-y-1">
                          <p className="text-sm font-medium text-foreground">Välj en session</p>
                          <p className="text-xs text-muted-foreground">Klicka på ▶ för att visa rutten</p>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Avtal tab ────────────────────────────────────────────────────────────────

function AvtalTab({ student }: { student: NonNullable<ReturnType<typeof useStudent>['data']> }) {
  const [contractOpen, setContractOpen] = useState(false);
  const { data: msgData, isLoading, refetch } = useStudentMessages(student.id);

  const { data: termsData } = useQuery({
    queryKey: ['student-terms', student.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('student_terms_acceptances')
        .select('terms_version, accepted_at')
        .eq('student_id', student.id)
        .eq('organization_id', student.organization_id)
        .maybeSingle();
      return data as { terms_version: string; accepted_at: string } | null;
    },
    staleTime: 60_000,
  });

  const contracts = useMemo(
    () => (msgData?.data ?? []).filter(
      (m) => (m.metadata as Record<string, unknown>)?.['type'] === 'contract',
    ),
    [msgData],
  );

  return (
    <div className="space-y-4">
      {/* Portal T&C acceptance status */}
      <div className="border border-border rounded-lg p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Villkorsgodkännande (elevportal)</p>
            {termsData ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Accepterat {new Date(termsData.accepted_at).toLocaleDateString('sv-SE')} · Version {termsData.terms_version}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/60 mt-0.5">Ej godkänt via elevportalen</p>
            )}
          </div>
        </div>
        <span className={cn(
          'text-xs font-semibold px-2 py-0.5 rounded-full shrink-0',
          termsData
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
        )}>
          {termsData ? 'Godkänt' : 'Ej godkänt'}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Avtal</h3>
        <PermissionGate allOf={[Permissions.DOCUMENTS_CREATE, Permissions.STUDENTS_PII_READ]}>
          <Button size="sm" className="gap-1.5" onClick={() => setContractOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Nytt avtal
          </Button>
        </PermissionGate>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : contracts.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-12 text-center space-y-2">
          <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Inga avtal har skickats till denna elev.</p>
          <PermissionGate allOf={[Permissions.DOCUMENTS_CREATE, Permissions.STUDENTS_PII_READ]}>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 mt-2"
              onClick={() => setContractOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Skapa och skicka avtal
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {contracts.length} avtal skickade
            </span>
            <PermissionGate allOf={[Permissions.DOCUMENTS_CREATE, Permissions.STUDENTS_PII_READ]}>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setContractOpen(true)}>
                <Plus className="w-3 h-3" />
                Nytt avtal
              </Button>
            </PermissionGate>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Typ</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Skickat</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Mottagare</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <tr key={contract.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm">Utbildningsavtal</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatDateTime(contract.sent_at ?? contract.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={contract.status} />
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{contract.recipient_address}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ContractSheet
        student={student}
        open={contractOpen}
        onOpenChange={setContractOpen}
        onSent={() => { void refetch(); }}
      />
    </div>
  );
}

// ─── Dokument admin tab ───────────────────────────────────────────────────────

const DOC_CATEGORY_OPTIONS = [
  { value: 'enrollment_contract', label: 'Utbildningsavtal' },
  { value: 'identity_document',   label: 'ID-handling' },
  { value: 'medical_clearance',   label: 'Läkarintyg' },
  { value: 'theory_result',       label: 'Kunskapsprov' },
  { value: 'risk_education',      label: 'Riskutbildning' },
  { value: 'practical_result',    label: 'Körprov' },
  { value: 'licence_copy',        label: 'Körkortskopia' },
  { value: 'other',               label: 'Övrigt' },
];

const DOC_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  DOC_CATEGORY_OPTIONS.map(o => [o.value, o.label])
);

const DOC_ICON: Record<string, React.ElementType> = {
  medical_clearance:   ShieldCheck,
  risk_education:      ShieldCheck,
};

type StudentDoc = {
  id: string;
  category: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  description: string | null;
  status: string;
  expires_at: string | null;
  storage_path: string;
  storage_bucket: string;
  created_at: string;
};

function fmtBytes(b: number | null): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function DokumentAdminTab({ studentId, orgId }: { studentId: string; orgId: string }) {
  const qc = useQueryClient();
  const [category, setCategory]     = useState('enrollment_contract');
  const [description, setDescription] = useState('');
  const [uploading, setUploading]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [renameId,     setRenameId]    = useState<string | null>(null);
  const [renameValue,  setRenameValue]  = useState('');
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string | null>(null);
  const [previewName,  setPreviewName]  = useState('');

  const { data: docs, isLoading } = useQuery({
    queryKey: ['student-documents', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_documents')
        .select('id, category, file_name, mime_type, file_size_bytes, description, status, expires_at, storage_path, storage_bucket, created_at')
        .eq('student_id', studentId)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentDoc[];
    },
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: StudentDoc) => {
      await supabase.storage.from(doc.storage_bucket).remove([doc.storage_path]);
      const { error } = await supabase
        .from('student_documents')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['student-documents', studentId] });
      toast({ title: 'Dokument borttaget' });
    },
    onError: () => toast({ title: 'Kunde inte ta bort dokumentet', variant: 'destructive' }),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('student_documents')
        .update({ file_name: name } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['student-documents', studentId] });
      toast({ title: 'Fil omdöpt' });
      setRenameId(null);
      setRenameValue('');
    },
    onError: () => toast({ title: 'Kunde inte döpa om filen', variant: 'destructive' }),
  });

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext    = file.name.split('.').pop() ?? '';
      const path   = `${orgId}/${studentId}/${crypto.randomUUID()}.${ext}`;
      const bucket = 'student-documents';

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase
        .from('student_documents')
        .insert({
          organization_id:  orgId,
          student_id:       studentId,
          category,
          status:           'approved',
          file_name:        file.name,
          storage_path:     path,
          storage_bucket:   bucket,
          mime_type:        file.type || null,
          file_size_bytes:  file.size,
          description:      description.trim() || null,
          uploaded_by:      (await supabase.auth.getUser()).data.user?.id ?? '',
        } as never);

      if (insertErr) {
        await supabase.storage.from(bucket).remove([path]);
        throw insertErr;
      }

      void qc.invalidateQueries({ queryKey: ['student-documents', studentId] });
      toast({ title: 'Dokument uppladdat' });
      setDescription('');
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      toast({ title: 'Uppladdning misslyckades — kontrollera filformat och försök igen', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc: StudentDoc) {
    const { data } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 300);
    if (data?.signedUrl) {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = doc.file_name;
      a.click();
    }
  }

  async function handlePreview(doc: StudentDoc) {
    const { data } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 300);
    if (!data?.signedUrl) {
      toast({ title: 'Kan inte förhandsgranska', variant: 'destructive' });
      return;
    }
    if (doc.mime_type?.startsWith('image/')) {
      setPreviewName(doc.file_name);
      setPreviewUrl(data.signedUrl);
    } else {
      window.open(data.signedUrl, '_blank');
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <PermissionGate permission={Permissions.DOCUMENTS_CREATE}>
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ladda upp dokument</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Kategori</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {DOC_CATEGORY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Beskrivning (valfri)</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="t.ex. Risk 1 intyg 2024"
                className="w-full h-8 px-2.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-sm rounded border cursor-pointer transition-colors',
              uploading
                ? 'border-input text-muted-foreground opacity-50 cursor-not-allowed'
                : 'border-primary text-primary hover:bg-primary/5'
            )}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Laddar upp…' : 'Välj fil'}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                disabled={uploading}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={handleFileUpload}
              />
            </label>
            <span className="text-xs text-muted-foreground">PDF, JPG, PNG, DOCX — max 10 MB</span>
          </div>
        </div>
      </PermissionGate>

      {/* Document list */}
      {isLoading && (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!docs || docs.length === 0) && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Inga uppladdade dokument
        </div>
      )}

      {!isLoading && docs && docs.length > 0 && (
        <div className="space-y-1">
          {docs.map(doc => {
            const Icon            = DOC_ICON[doc.category] ?? FileText;
            const isRenaming      = renameId === doc.id;
            const isConfirmDelete = confirmDelId === doc.id;
            return (
              <div key={doc.id} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className={cn('flex items-center gap-3 px-3 py-2.5 transition-colors', !isRenaming && !isConfirmDelete && 'hover:bg-accent/20')}>
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && renameValue.trim()) {
                            renameMutation.mutate({ id: doc.id, name: renameValue.trim() });
                          }
                          if (e.key === 'Escape') { setRenameId(null); setRenameValue(''); }
                        }}
                        className="w-full h-7 px-2 text-sm rounded border border-primary bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {DOC_CATEGORY_LABELS[doc.category] ?? doc.category}
                      {doc.description && ` — ${doc.description}`}
                      {doc.file_size_bytes && ` · ${fmtBytes(doc.file_size_bytes)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isRenaming ? (
                      <>
                        <button
                          onClick={() => { if (renameValue.trim()) renameMutation.mutate({ id: doc.id, name: renameValue.trim() }); }}
                          disabled={renameMutation.isPending || !renameValue.trim()}
                          className="p-1.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                          title="Spara"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setRenameId(null); setRenameValue(''); }}
                          className="p-1.5 rounded text-muted-foreground hover:bg-accent transition-colors"
                          title="Avbryt"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => void handlePreview(doc)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title="Förhandsgranska"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <PermissionGate permission={Permissions.DOCUMENTS_UPDATE}>
                          <button
                            onClick={() => { setRenameId(doc.id); setRenameValue(doc.file_name); setConfirmDelId(null); }}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            title="Döp om"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                        <button
                          onClick={() => void handleDownload(doc)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title="Ladda ned"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <PermissionGate permission={Permissions.DOCUMENTS_DELETE}>
                          <button
                            onClick={() => { setConfirmDelId(doc.id); setRenameId(null); setRenameValue(''); }}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Ta bort"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </PermissionGate>
                      </>
                    )}
                  </div>
                </div>
                {isConfirmDelete && (
                  <div className="flex items-center justify-between gap-2 bg-red-50 dark:bg-red-950/20 px-3 py-2 border-t border-red-100 dark:border-red-900/50">
                    <span className="text-xs text-red-700 dark:text-red-400 truncate">Ta bort "{doc.file_name}"?</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { deleteMutation.mutate(doc); setConfirmDelId(null); }}
                        disabled={deleteMutation.isPending}
                        className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                      >
                        {deleteMutation.isPending ? 'Tar bort…' : 'Ta bort'}
                      </button>
                      <button
                        onClick={() => setConfirmDelId(null)}
                        className="text-xs px-2 py-1 rounded text-muted-foreground hover:bg-accent transition-colors"
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image preview modal */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm font-medium">{previewName}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="flex justify-center">
              <img src={previewUrl} alt={previewName} className="max-h-[60vh] w-full rounded object-contain" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewUrl(null)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Övrigt tab (Bokningar + Anteckningar + Teorimaterial + Loggar + Dokument) ─

type OvrigtSubTab = 'bokningar' | 'anteckningar' | 'teorimaterial' | 'loggar' | 'dokument';

function OvrigtTab({
  student, fullName, upcomingBookings, onNewBooking, licenceCat,
}: {
  student: NonNullable<ReturnType<typeof useStudent>['data']>;
  fullName: string;
  upcomingBookings: ReturnType<typeof useStudentUpcomingBookings>;
  onNewBooking: () => void;
  licenceCat: string;
}) {
  const [subTab, setSubTab] = useState<OvrigtSubTab>('bokningar');

  const SUB_TABS: { key: OvrigtSubTab; label: string }[] = [
    { key: 'bokningar',     label: 'Bokningar' },
    { key: 'anteckningar',  label: 'Anteckningar' },
    { key: 'teorimaterial', label: 'Teorimaterial' },
    { key: 'loggar',        label: 'Loggar' },
    { key: 'dokument',      label: 'Dokument' },
  ];

  return (
    <div className="space-y-4">
      <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />
      <div className="pt-1">
        {subTab === 'bokningar' && (
          <BokningarTab
            student={student}
            fullName={fullName}
            upcomingBookings={upcomingBookings}
            onNewBooking={onNewBooking}
          />
        )}
        {subTab === 'anteckningar' && (
          <AnteckningarTab studentId={student.id} />
        )}
        {subTab === 'teorimaterial' && (
          <TeorimaterialTab licenceCat={licenceCat} studentId={student.id} />
        )}
        {subTab === 'loggar' && <LoggarTab student={student} />}
        {subTab === 'dokument' && (
          <DokumentAdminTab studentId={student.id} orgId={student.organization_id} />
        )}
      </div>
    </div>
  );
}

// ─── Anteckningar tab ─────────────────────────────────────────────────────────

const NOTE_CATEGORIES: NoteCategory[] = ['general','instructional','medical','administrative','behavioral','other'];

function AnteckningarTab({ studentId }: { studentId: string }) {
  const { data: notes = [], isLoading, error, refetch } = useStudentNotes(studentId);
  const createNote   = useCreateNote();
  const updateNote   = useUpdateNote();
  const deleteNote   = useDeleteNote();

  const [search,       setSearch]       = useState('');
  const [showInternal, setShowInternal] = useState(true);
  const [composing,    setComposing]    = useState(false);
  const [draft,        setDraft]        = useState('');
  const [draftCat,     setDraftCat]     = useState<NoteCategory>('general');
  const [draftInternal, setDraftInternal] = useState(false);
  const [editId,       setEditId]       = useState<string | null>(null);
  const [editContent,  setEditContent]  = useState('');
  const [editCat,      setEditCat]      = useState<NoteCategory>('general');
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const base = notes.filter((n) => showInternal || !n.is_internal);
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter((n) =>
      n.body.toLowerCase().includes(q) ||
      NOTE_CATEGORY_LABELS[n.category].toLowerCase().includes(q),
    );
  }, [notes, search, showInternal]);

  async function handleCreate() {
    if (!draft.trim()) return;
    try {
      await createNote.mutateAsync({
        student_id:  studentId,
        body:        draft,
        category:    draftCat,
        is_internal: draftInternal,
      });
      toast({ title: 'Anteckning sparad' });
      setDraft('');
      setDraftCat('general');
      setDraftInternal(false);
      setComposing(false);
    } catch {
      toast({ title: 'Kunde inte spara anteckning', variant: 'destructive' });
    }
  }

  async function handleUpdate(note: StudentNote) {
    if (!editContent.trim()) return;
    try {
      await updateNote.mutateAsync({
        id:         note.id,
        student_id: studentId,
        body:       editContent,
        category:   editCat,
      });
      toast({ title: 'Anteckning uppdaterad' });
      setEditId(null);
    } catch {
      toast({ title: 'Kunde inte uppdatera anteckning', variant: 'destructive' });
    }
  }

  async function handleTogglePin(note: StudentNote) {
    try {
      await updateNote.mutateAsync({
        id:         note.id,
        student_id: studentId,
        is_pinned:  !note.is_pinned,
      });
    } catch {
      toast({ title: 'Kunde inte fästa anteckning', variant: 'destructive' });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNote.mutateAsync({ id, student_id: studentId });
      toast({ title: 'Anteckning borttagen' });
      setConfirmDelId(null);
    } catch {
      toast({ title: 'Kunde inte ta bort anteckning', variant: 'destructive' });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-destructive">Kunde inte hämta anteckningar.</p>
        <button
          onClick={() => void refetch()}
          className="text-xs text-primary underline underline-offset-2"
        >
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök anteckningar…"
            className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={() => setShowInternal(!showInternal)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
            showInternal
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400'
              : 'border-input bg-background text-muted-foreground hover:bg-muted/50',
          )}
        >
          <Lock className="h-3 w-3" />
          {showInternal ? 'Visar interna' : 'Döljer interna'}
        </button>
        <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
          <button
            onClick={() => setComposing(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Ny anteckning
          </button>
        </PermissionGate>
      </div>

      {/* Compose form */}
      {composing && (
        <div className="rounded-lg border border-primary/30 bg-card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={draftCat}
              onChange={(e) => setDraftCat(e.target.value as NoteCategory)}
              className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {NOTE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{NOTE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draftInternal}
                onChange={(e) => setDraftInternal(e.target.checked)}
                className="rounded border-input"
              />
              <Lock className="h-3 w-3" />
              Intern
            </label>
          </div>
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Skriv anteckning…"
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setComposing(false); setDraft(''); setDraftCat('general'); setDraftInternal(false); }}
              className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Avbryt
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={!draft.trim() || createNote.isPending}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Spara
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Inga anteckningar matchar sökningen.' : 'Inga anteckningar än.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((note) => {
            const isEditing = editId === note.id;
            return (
              <div
                key={note.id}
                className={cn(
                  'rounded-lg border bg-card overflow-hidden',
                  note.is_pinned && 'border-amber-300 dark:border-amber-700',
                  note.is_internal && 'border-blue-200 dark:border-blue-800',
                )}
              >
                {/* Note header */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                      {NOTE_CATEGORY_LABELS[note.category]}
                    </span>
                    {note.is_internal && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        <Lock className="h-2.5 w-2.5" />
                        Intern
                      </span>
                    )}
                    {note.is_pinned && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Pin className="h-2.5 w-2.5" />
                        Fäst
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                      {new Date(note.created_at).toLocaleDateString('sv-SE')}
                    </span>
                    <PermissionGate permission={Permissions.STUDENTS_UPDATE}>
                      <button
                        onClick={() => void handleTogglePin(note)}
                        title={note.is_pinned ? 'Ta bort fästning' : 'Fäst anteckning'}
                        className="rounded p-1 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                      >
                        {note.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => {
                          setEditId(note.id);
                          setEditContent(note.body);
                          setEditCat(note.category);
                        }}
                        title="Redigera"
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </PermissionGate>
                    <PermissionGate permission={Permissions.STUDENTS_DELETE}>
                      <button
                        onClick={() => setConfirmDelId(confirmDelId === note.id ? null : note.id)}
                        title="Ta bort"
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </PermissionGate>
                  </div>
                </div>

                {/* Inline delete confirm */}
                {confirmDelId === note.id && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-destructive/5 border-b border-destructive/20 text-xs">
                    <span className="text-destructive font-medium">Ta bort anteckning?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelId(null)}
                        className="rounded px-2 py-1 text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Avbryt
                      </button>
                      <button
                        onClick={() => void handleDelete(note.id)}
                        disabled={deleteNote.isPending}
                        className="flex items-center gap-1 rounded bg-destructive px-2 py-1 text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                      >
                        {deleteNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Ta bort
                      </button>
                    </div>
                  </div>
                )}

                {/* Note body */}
                <div className="px-3 py-2.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <select
                          value={editCat}
                          onChange={(e) => setEditCat(e.target.value as NoteCategory)}
                          className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {NOTE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{NOTE_CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        autoFocus
                        rows={3}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditId(null)}
                          className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Avbryt
                        </button>
                        <button
                          onClick={() => void handleUpdate(note)}
                          disabled={!editContent.trim() || updateNote.isPending}
                          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {updateNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Spara
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note.body}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="-m-4 md:-m-5">
      <div className="bg-background border-b border-border px-4 md:px-6 pt-4 pb-0">
        <div className="h-4 w-48 bg-muted rounded animate-pulse mb-3" />
        <div className="h-5 w-36 bg-muted rounded animate-pulse mb-3" />
        <div className="flex gap-2 pb-0">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 w-20 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="px-4 md:px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded animate-pulse" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
