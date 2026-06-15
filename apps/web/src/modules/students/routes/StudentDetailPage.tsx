import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Home, ChevronRight, Copy, Check, Bell, AlertTriangle,
  Plus, Mail, MessageSquare, Car, Bus, Truck,
  Calendar, BookOpen, ClipboardList,
  ExternalLink, Settings, ChevronDown, Pencil,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { StudentFinancePanel } from '@modules/finance/index.js';
import { useInstructor } from '@modules/instructors/index.js';
import { useStudentUpcomingBookings, useBookingList, BookingStatusBadge, StudentBookingDialog } from '@modules/scheduling/index.js';
import { Button, Badge, Skeleton } from '@platform/ui';
import { PermissionGate } from '@core/rbac/PermissionGate.js';
import { Permissions } from '@core/rbac/permissions.js';
import { formatTime } from '@platform/utils';
import type { LessonBooking } from '@platform/types';
import { useStudent, useUpdateStudent, useArchiveStudent } from '../hooks/useStudents.js';
import { StudentStatusBadge, PermitStageBadge } from '../components/StudentStatusBadge.js';
import { StudentForm } from '../components/StudentForm.js';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type DetailTab = 'meddelande' | 'sms' | 'epost' | 'elevkort' | 'utbildning' | 'historik' | 'konto' | 'ovrigt';
type LogSubTab = 'bokningsloggar' | 'kommunikationsloggar' | 'aktivitetsloggar';
type UtbildningSubTab = 'behorigheteter' | 'korprovsprotokoll';
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
    <div className={cn('flex border-b border-border', size === 'sm' && 'gap-0')}>
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
    { key: 'epost',      label: 'E-post' },
    { key: 'elevkort',   label: 'Elevkort' },
    { key: 'utbildning', label: 'Utbildning' },
    { key: 'historik',   label: 'Historik' },
    { key: 'konto',      label: 'Konto' },
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
          <button className="text-xs text-blue-500 border border-blue-200 rounded px-2.5 py-1 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors flex items-center gap-1.5">
            <Pencil className="w-3 h-3" />
            Ge feedback
          </button>
        </div>

        <TabBar tabs={TABS} active={activeTab} onSelect={setActiveTab} />
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className="px-4 md:px-6 py-5">

        {activeTab === 'meddelande' && <MeddelandeTab />}

        {activeTab === 'sms' && (
          <SmsTab
            studentName={fullName}
            studentPhone={student.phone ?? null}
          />
        )}

        {activeTab === 'epost' && (
          <EpostTab studentEmail={student.email ?? null} />
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

// ─── Kundkort tab ─────────────────────────────────────────────────────────────

type FormState = {
  first_name: string; last_name: string;
  email: string; phone: string;
  address_line1: string; postal_code: string; city: string;
};

function KundkortTab({
  student, form, setField, pnr, age, fullName,
  onSave, saving, onActivate, activating, onArchive, archiving, instructorName,
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
}) {
  const [internalNotes, setInternalNotes] = useState(false);
  const [korkortsGrupp, setKorkortsGrupp] = useState('');

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
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium">{pnr}</span>
                  {pnr !== '—' && <CopyBtn text={pnr} />}
                  <button className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors">
                    Sök
                  </button>
                </div>
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
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Välj företag att koppla</label>
                <select className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Välj företag</option>
                </select>
              </div>
              <GreenBtn disabled>Spara</GreenBtn>
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
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Lärare</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  {student.risk1_completed_at && (
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 text-xs">Risk 1</td>
                      <td className="py-2 pr-4 text-xs">{formatDate(student.risk1_completed_at)}</td>
                      <td className="py-2 pr-4 text-xs">—</td>
                      <td className="py-2 text-xs"><button className="text-blue-500 hover:underline">Redigera</button></td>
                    </tr>
                  )}
                  {student.risk2_completed_at && (
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 text-xs">Risk 2</td>
                      <td className="py-2 pr-4 text-xs">{formatDate(student.risk2_completed_at)}</td>
                      <td className="py-2 pr-4 text-xs">—</td>
                      <td className="py-2 text-xs"><button className="text-blue-500 hover:underline">Redigera</button></td>
                    </tr>
                  )}
                  {student.theory_passed_at && (
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 text-xs">Teoriprov</td>
                      <td className="py-2 pr-4 text-xs">{formatDate(student.theory_passed_at)}</td>
                      <td className="py-2 pr-4 text-xs">—</td>
                      <td className="py-2 text-xs"><button className="text-blue-500 hover:underline">Redigera</button></td>
                    </tr>
                  )}
                  {student.practical_passed_at && (
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 text-xs">Uppkörning</td>
                      <td className="py-2 pr-4 text-xs">{formatDate(student.practical_passed_at)}</td>
                      <td className="py-2 pr-4 text-xs">—</td>
                      <td className="py-2 text-xs"><button className="text-blue-500 hover:underline">Redigera</button></td>
                    </tr>
                  )}
                  {!student.risk1_completed_at && !student.risk2_completed_at && !student.theory_passed_at && !student.practical_passed_at && (
                    <tr>
                      <td colSpan={4} className="py-4 text-xs text-muted-foreground text-center">
                        Inga examinationsmoment registrerade
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <SectionDivider />

          {/* Anhöriga */}
          <div>
            <SectionHeading title="Anhöriga personer" />
            <p className="text-xs text-muted-foreground mb-3">
              Skicka meddelande till anhöriga under utbildning. De första funktionerna är denna inställning är bokningsbekräftelser.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Personnummer</label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="YYYYMMDDXXXX"
                    className="flex-1 h-8 px-2.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button className="h-8 px-3 text-xs rounded border border-input bg-background hover:bg-accent text-muted-foreground transition-colors">
                    Sök
                  </button>
                </div>
              </div>
              <FieldInput label="Namn" value="" placeholder="—" />
              <FieldInput label="E-postadress" value="" placeholder="—" />
              <FieldInput label="Telefonnummer" value="" placeholder="—" />
              <FieldInput label="Adress" value="" placeholder="—" />
              <FieldInput label="Postnummer" value="" placeholder="—" />
              <FieldInput label="Stad" value="" placeholder="—" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="anhoriganotis" className="rounded" />
              <label htmlFor="anhoriganotis" className="text-xs text-muted-foreground">Skicka notiser</label>
            </div>
            <GreenBtn disabled>Lägg till</GreenBtn>
          </div>

          <SectionDivider />

          {/* Föräldraskollen */}
          <div>
            <SectionHeading title="Föräldraskollen – insyn i elevens utveckling" />
            <p className="text-xs text-muted-foreground mb-3">
              Detta är en experimentell funktion som just nu är kostnadsfri under en begränsad period. Ge en förälder eller annan nära person möjligheten att följa elevens framsteg, bokningar och resultat i realtid.
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Sök efter kund...</label>
                <select className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Välj person</option>
                </select>
              </div>
              <GreenBtn disabled>Lägg till</GreenBtn>
            </div>
          </div>

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
                <select className="w-full h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Ingen favoritlärare</option>
                  {instructorName && (
                    <option value={student.assigned_instructor_id ?? ''}>
                      {instructorName} (tilldelad)
                    </option>
                  )}
                </select>
              </div>
              <GreenBtn disabled>Spara</GreenBtn>
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
            placeholder="Skriv en anteckning..."
            className="w-full px-2.5 py-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <div className="mt-2 flex justify-end">
            <GreenBtn disabled>Spara</GreenBtn>
          </div>
        </div>

        {/* Taggar */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Taggar" />
          <div className="flex items-center gap-2">
            <select className="flex-1 h-8 px-2 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary">
              <option value="">Välj taggar</option>
            </select>
            <GreenBtn disabled>Spara</GreenBtn>
          </div>
        </div>

        {/* Generera nytt lösenord */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Generera nytt lösenord" />
          <p className="text-xs text-muted-foreground mb-3">
            Systemet genererar ett nytt lösenord och skickas till användaren via e-post eller SMS.
          </p>
          <div className="flex gap-2">
            <button
              disabled
              title="Lösenordsgenerering via SMS under implementation"
              className="flex-1 py-2 text-xs font-medium rounded bg-green-600/40 text-white cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-3 h-3" />
              Skicka SMS
            </button>
            <button
              disabled
              title="Lösenordsgenerering via e-post under implementation"
              className="flex-1 py-2 text-xs font-medium rounded bg-green-600/40 text-white cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <Mail className="w-3 h-3" />
              Skicka e-post
            </button>
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Lösenordsgenerering under implementation</p>
        </div>

        {/* Aktivera kund — shown for students not yet active */}
        {(student.status === 'lead' || student.status === 'onboarding' || student.status === 'paused') && (
          <div className="bg-card border border-border rounded-lg p-4">
            <SectionHeading title="Aktivera kund" />
            <p className="text-xs text-muted-foreground mb-3">
              Sätt kundens status till Aktiv för att kunna boka lektioner och skapa fakturor.
            </p>
            <button
              onClick={onActivate}
              disabled={activating}
              className="w-full py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {activating ? 'Aktiverar...' : 'Aktivera kund'}
            </button>
          </div>
        )}

        {/* Arkivera kund */}
        <div className="bg-card border border-border rounded-lg p-4">
          <SectionHeading title="Arkivera kund" />
          {student.status === 'active' ? (
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

      </div>
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
    { key: 'behorigheteter',  label: 'Behörigheter' },
    { key: 'korprovsprotokoll', label: 'Körprovsprotokoll' },
  ];

  return (
    <div className="space-y-0">
      {/* Top action */}
      <div className="flex justify-end mb-4">
        <BlueBtn>Exportera körprocent</BlueBtn>
      </div>

      <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />

      <div className="pt-4 space-y-6">

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

      </div>
    </div>
  );
}

// ─── Teorimaterial tab ────────────────────────────────────────────────────────

function TeorimaterialTab({ licenceCat }: { licenceCat: string }) {
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

        {subTab !== 'teorimaterial' && (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Ingen data tillgänglig
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bokningar tab ────────────────────────────────────────────────────────────

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

  const bookings: LessonBooking[] = upcomingBookings.data?.data ?? [];

  // Past bookings — all completed/cancelled/no-show before today
  const pastBookingsQuery = useBookingList({
    student_id: student.id,
    to:         new Date().toISOString(),
    sort_by:    'starts_at',
    sort_dir:   'desc',
    per_page:   20,
  });
  const pastBookings: LessonBooking[] = pastBookingsQuery.data?.data ?? [];

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
              <table className="w-full text-sm">
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
                    <BokningRow key={b.id} booking={b} />
                  ))}
                </tbody>
              </table>
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
              <table className="w-full text-sm">
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
              disabled
              title="Sändning av SMS under implementation"
              className="flex-1 py-2 text-xs font-medium rounded bg-green-600/40 text-white cursor-not-allowed"
            >
              Skicka SMS
            </button>
            <button
              disabled
              title="Sändning av e-post under implementation"
              className="flex-1 py-2 text-xs font-medium rounded bg-green-600/40 text-white cursor-not-allowed"
            >
              Skicka e-post
            </button>
          </div>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Utskick under implementation</p>
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
    </div>
  );
}

function BokningRow({ booking }: { booking: LessonBooking }) {
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
        <div className="flex items-center gap-2">
          <BookingStatusBadge status={booking.status} />
          {!terminal && (
            <button className="text-[10px] text-red-500 hover:underline">Avboka</button>
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
    <div>
      <h2 className="text-sm font-semibold text-blue-600 mb-4">Ekonomi</h2>
      <StudentFinancePanel studentId={studentId} />
    </div>
  );
}

// ─── Loggar tab ───────────────────────────────────────────────────────────────

const LOG_COMING_SOON: Record<LogSubTab, { title: string; desc: string }> = {
  bokningsloggar:       { title: 'Bokningsloggar',       desc: 'Alla boknings- och statusändringar för denna elev loggas här. Under implementation.' },
  kommunikationsloggar: { title: 'Kommunikationsloggar', desc: 'SMS, e-post och systemmeddelandehistorik för denna elev visas här. Under implementation.' },
  aktivitetsloggar:     { title: 'Aktivitetsloggar',     desc: 'Administratörsåtgärder, profiländringar och systemhändelser visas här. Under implementation.' },
};

function LoggarTab() {
  const [subTab, setSubTab] = useState<LogSubTab>('bokningsloggar');

  const SUB_TABS: { key: LogSubTab; label: string }[] = [
    { key: 'bokningsloggar',        label: 'Bokningsloggar' },
    { key: 'kommunikationsloggar',  label: 'Kommunikationsloggar' },
    { key: 'aktivitetsloggar',      label: 'Aktivitetsloggar' },
  ];

  const info = LOG_COMING_SOON[subTab];

  return (
    <div>
      <TabBar tabs={SUB_TABS} active={subTab} onSelect={setSubTab} size="sm" />
      <div className="pt-4">
        <div className="bg-card border border-border rounded-lg p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{info.title}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">{info.desc}</p>
          </div>
          <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            Kommer snart
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Meddelande tab ───────────────────────────────────────────────────────────

function MeddelandeTab() {
  return (
    <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 text-sm text-muted-foreground">
      Meddelande är inte aktiverade på den här skolan.
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

function SmsTab({ studentName, studentPhone }: { studentName: string; studentPhone: string | null }) {
  const [selected,  setSelected]  = useState(true);
  const [template,  setTemplate]  = useState('');
  const [message,   setMessage]   = useState('');
  const [, setSending] = useState(false);

  const sender    = 'E-Trafikskol';
  const signature = 'Detta SMS kan inte besvaras.';
  const remaining = SMS_MAX - message.length;
  const smsCount  = Math.ceil(Math.max(1, message.length) / 160);

  function handleSend() {
    if (!selected || !message.trim()) return;
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setMessage('');
      setTemplate('');
    }, 1000);
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
            disabled
            className="px-3 py-1.5 text-xs font-medium rounded border border-border bg-background text-muted-foreground opacity-50 cursor-not-allowed"
          >
            Förhandsvisning
          </button>
          <button
            onClick={handleSend}
            disabled={!selected || !message.trim() || !studentPhone}
            className="px-4 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Skicka SMS
          </button>
        </div>
        {!studentPhone && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Ingen mobilnummer registrerat för denna elev.</p>
        )}
      </div>

      {/* Message history */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Meddelandehistorik</p>
        </div>
        <div className="p-4 text-center py-12">
          <p className="text-xs text-muted-foreground">Inga SMS-meddelanden hittades för denna elev.</p>
          <span className="inline-block mt-2 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            SMS-historik aktiveras med integrerat SMS-system
          </span>
        </div>
      </div>

    </div>
  );
}

// ─── E-post tab ───────────────────────────────────────────────────────────────

function EpostTab({ studentEmail }: { studentEmail: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          E-post: <span className="font-medium text-foreground">{studentEmail ?? '—'}</span>
        </p>
      </div>
      <div className="bg-card border border-border rounded-lg p-8 text-center space-y-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto">
          <Mail className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">E-posthistorik</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Skickade e-postmeddelanden till denna elev visas här när e-postintegrationen är aktiv.
        </p>
        <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
          Aktiveras med e-postintegrering
        </span>
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
        .select('id, invoice_number, status, issued_at, due_date, total_amount_sek, created_at')
        .eq('student_id', studentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      return (invoices ?? []) as Array<{
        id: string;
        invoice_number: number | null;
        status: string;
        issued_at: string | null;
        due_date: string | null;
        total_amount_sek: number;
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
                      {SEK.format(inv.total_amount_sek)}
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

// ─── Övrigt tab (Bokningar + Teorimaterial + Loggar) ─────────────────────────

type OvrigtSubTab = 'bokningar' | 'teorimaterial' | 'loggar';

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
    { key: 'bokningar',    label: 'Bokningar' },
    { key: 'teorimaterial', label: 'Teorimaterial' },
    { key: 'loggar',       label: 'Loggar' },
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
        {subTab === 'teorimaterial' && (
          <TeorimaterialTab licenceCat={licenceCat} />
        )}
        {subTab === 'loggar' && <LoggarTab />}
      </div>
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
