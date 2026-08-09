import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button, Input, Toaster, toast } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import { LICENCE_CATEGORY_OPTIONS } from '@modules/tenant-onboarding/hooks/useTenantOnboarding.js';
import {
  getTrialSession, saveTrialAnswers, completeTrial, TrialSignupError,
  type CompleteTrialResult,
} from '../lib/trialSignupApi.js';

// ─── Answers shape — mirrors CompleteAnswers in trial-signup/index.ts ─────────
//
// Every array below (vehicles/instructor_entries/admin_entries/
// receptionist_entries/branch_entries) collects the SAME fields the normal
// Tenant Dashboard creation form for that object requires — VehicleFormSheet,
// InstructorForm, invite-user's "Bjud in", LocationsSettingsPage — so
// handleComplete can create the real platform object directly, not a
// simplified aggregate substitute (2026-08-08, onboarding consistency fix).

interface VehicleEntry {
  registration_number: string; make: string; model: string; model_year: number;
  transmission: 'manual' | 'automatic' | 'both'; fuel_type: string; seats: number;
  registration_expires_at: string; insurance_expires_at: string; color: string;
}
interface InstructorEntry { first_name: string; last_name: string; email: string; phone: string }
interface StaffEntry { first_name: string; last_name: string; email: string }
interface BranchEntry { name: string; address_line1: string; postal_code: string; city: string; phone: string; email: string }

interface Answers {
  contact_first_name: string; contact_last_name: string;
  legal_name: string; org_number: string; vat_number: string;
  country: string; default_language: string; timezone: string;
  address_line1: string; postal_code: string; city: string;
  branches: number; branch_entries: BranchEntry[];
  licence_categories: string[]; standard_lesson_duration_minutes: number;
  lesson_type_durations: Record<string, number>;
  standard_lesson_price_sek: number;
  teaching_languages: string[];
  vehicle_count: number; vehicle_transmission: string; vehicles: VehicleEntry[];
  administrators: number; admin_entries: StaffEntry[];
  receptionists: number; receptionist_entries: StaffEntry[];
  instructors: number; instructor_entries: InstructorEntry[];
  working_hours_start: string; working_hours_end: string; weekend_schedule: string;
  channels: { email: boolean; sms: boolean; whatsapp: boolean; invoice_notifications: boolean };
  vat_period: string; payment_methods: string[];
}

const CURRENT_YEAR = new Date().getFullYear();
function nextYearIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
function newVehicleEntry(defaultTransmission: string): VehicleEntry {
  return {
    registration_number: '', make: '', model: '', model_year: CURRENT_YEAR,
    transmission: defaultTransmission === 'automatic' || defaultTransmission === 'both' ? defaultTransmission : 'manual',
    fuel_type: 'gasoline', seats: 5,
    registration_expires_at: nextYearIso(), insurance_expires_at: nextYearIso(),
    color: '',
  };
}
function newInstructorEntry(): InstructorEntry { return { first_name: '', last_name: '', email: '', phone: '' }; }
function newStaffEntry(): StaffEntry { return { first_name: '', last_name: '', email: '' }; }
function newBranchEntry(): BranchEntry { return { name: '', address_line1: '', postal_code: '', city: '', phone: '', email: '' }; }

function resizeArray<T>(arr: T[], count: number, factory: () => T): T[] {
  if (count === arr.length) return arr;
  if (count < arr.length) return arr.slice(0, count);
  return [...arr, ...Array.from({ length: count - arr.length }, factory)];
}

function normalizeAnswers(raw: Partial<Answers>): Answers {
  const merged: Answers = { ...EMPTY_ANSWERS, ...raw };
  merged.vehicles = resizeArray(Array.isArray(raw.vehicles) ? raw.vehicles : [], merged.vehicle_count, () => newVehicleEntry(merged.vehicle_transmission));
  merged.instructor_entries = resizeArray(Array.isArray(raw.instructor_entries) ? raw.instructor_entries : [], merged.instructors, newInstructorEntry);
  merged.admin_entries = resizeArray(Array.isArray(raw.admin_entries) ? raw.admin_entries : [], Math.max(0, merged.administrators - 1), newStaffEntry);
  merged.receptionist_entries = resizeArray(Array.isArray(raw.receptionist_entries) ? raw.receptionist_entries : [], merged.receptionists, newStaffEntry);
  merged.branch_entries = resizeArray(Array.isArray(raw.branch_entries) ? raw.branch_entries : [], Math.max(0, merged.branches - 1), newBranchEntry);
  // Sessions saved before per-type duration existed (or a category picked up
  // since the last save) fall back to the global default here — never a
  // missing/undefined duration for a selected category.
  const durations: Record<string, number> = { ...merged.lesson_type_durations };
  for (const cat of merged.licence_categories) {
    if (!durations[cat]) durations[cat] = merged.standard_lesson_duration_minutes;
  }
  merged.lesson_type_durations = durations;
  return merged;
}

const EMPTY_ANSWERS: Answers = {
  contact_first_name: '', contact_last_name: '',
  legal_name: '', org_number: '', vat_number: '',
  country: 'SE', default_language: 'sv', timezone: 'Europe/Stockholm',
  address_line1: '', postal_code: '', city: '',
  branches: 1, branch_entries: [],
  licence_categories: [], standard_lesson_duration_minutes: 45,
  lesson_type_durations: {},
  standard_lesson_price_sek: 0,
  teaching_languages: ['sv'],
  vehicle_count: 1, vehicle_transmission: 'manual', vehicles: [newVehicleEntry('manual')],
  administrators: 1, admin_entries: [],
  receptionists: 0, receptionist_entries: [],
  instructors: 1, instructor_entries: [newInstructorEntry()],
  working_hours_start: '08:00', working_hours_end: '17:00', weekend_schedule: 'closed',
  channels: { email: true, sms: false, whatsapp: false, invoice_notifications: true },
  vat_period: 'quarterly', payment_methods: ['invoice'],
};

const TEACHING_LANGUAGE_OPTIONS = [
  { value: 'sv', label: 'Svenska' }, { value: 'en', label: 'Engelska' },
  { value: 'ar', label: 'Arabiska' }, { value: 'ku', label: 'Kurdiska' }, { value: 'other', label: 'Annat' },
];
const PAYMENT_METHOD_OPTIONS = [
  { value: 'invoice', label: 'Faktura' }, { value: 'card', label: 'Kort' }, { value: 'swish', label: 'Swish' },
];
const FUEL_TYPE_OPTIONS = [
  { value: 'gasoline', label: 'Bensin' }, { value: 'diesel', label: 'Diesel' }, { value: 'electric', label: 'El' },
  { value: 'hybrid', label: 'Hybrid' }, { value: 'plugin_hybrid', label: 'Plug-in hybrid' },
  { value: 'ethanol', label: 'Etanol' }, { value: 'gas', label: 'Gas' },
];
const TOTAL_STEPS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_RE = /^\d{3}\s?\d{2}$/;
const selectCls = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground';

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40',
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function VehicleEntryCard({ index, entry, onChange }: { index: number; entry: VehicleEntry; onChange: (patch: Partial<VehicleEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Fordon {index + 1}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Registreringsnummer *">
          <Input value={entry.registration_number} onChange={(e) => onChange({ registration_number: e.target.value.toUpperCase() })} placeholder="ABC123" maxLength={10} className="uppercase" />
        </Field>
        <Field label="Årsmodell *">
          <Input type="number" min={1990} max={CURRENT_YEAR + 1} value={entry.model_year} onChange={(e) => onChange({ model_year: Number(e.target.value) || CURRENT_YEAR })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Märke *"><Input value={entry.make} onChange={(e) => onChange({ make: e.target.value })} placeholder="Volvo" /></Field>
        <Field label="Modell *"><Input value={entry.model} onChange={(e) => onChange({ model: e.target.value })} placeholder="V60" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Växellåda">
          <div className="flex gap-2">
            <Pill active={entry.transmission === 'manual'} onClick={() => onChange({ transmission: 'manual' })}>Manuell</Pill>
            <Pill active={entry.transmission === 'automatic'} onClick={() => onChange({ transmission: 'automatic' })}>Automat</Pill>
            <Pill active={entry.transmission === 'both'} onClick={() => onChange({ transmission: 'both' })}>Båda</Pill>
          </div>
        </Field>
        <Field label="Bränsle">
          <select className={selectCls} value={entry.fuel_type} onChange={(e) => onChange({ fuel_type: e.target.value })}>
            {FUEL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Antal säten *">
        <Input type="number" min={2} max={9} value={entry.seats} onChange={(e) => onChange({ seats: Number(e.target.value) || 5 })} className="max-w-[120px]" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Registrering giltig t.o.m. *"><Input type="date" value={entry.registration_expires_at} onChange={(e) => onChange({ registration_expires_at: e.target.value })} /></Field>
        <Field label="Försäkring giltig t.o.m. *"><Input type="date" value={entry.insurance_expires_at} onChange={(e) => onChange({ insurance_expires_at: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function InstructorEntryCard({ index, entry, onChange }: { index: number; entry: InstructorEntry; onChange: (patch: Partial<InstructorEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Instruktör {index + 1}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Förnamn *"><Input value={entry.first_name} onChange={(e) => onChange({ first_name: e.target.value })} /></Field>
        <Field label="Efternamn *"><Input value={entry.last_name} onChange={(e) => onChange({ last_name: e.target.value })} /></Field>
      </div>
      <Field label="E-post *"><Input type="email" value={entry.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="namn@trafikskola.se" /></Field>
      <Field label="Telefon"><Input value={entry.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Valfritt" /></Field>
    </div>
  );
}

function StaffEntryCard({ label, index, entry, onChange }: { label: string; index: number; entry: StaffEntry; onChange: (patch: Partial<StaffEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">{label} {index + 1}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Förnamn *"><Input value={entry.first_name} onChange={(e) => onChange({ first_name: e.target.value })} /></Field>
        <Field label="Efternamn *"><Input value={entry.last_name} onChange={(e) => onChange({ last_name: e.target.value })} /></Field>
      </div>
      <Field label="E-post *"><Input type="email" value={entry.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="namn@trafikskola.se" /></Field>
    </div>
  );
}

function BranchEntryCard({ index, entry, onChange }: { index: number; entry: BranchEntry; onChange: (patch: Partial<BranchEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Filial {index + 2}</p>
      <Field label="Namn *"><Input value={entry.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="T.ex. Filial Solna" /></Field>
      <Field label="Gatuadress *"><Input value={entry.address_line1} onChange={(e) => onChange({ address_line1: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Postnummer *"><Input value={entry.postal_code} onChange={(e) => onChange({ postal_code: e.target.value })} placeholder="111 22" /></Field>
        <Field label="Ort *"><Input value={entry.city} onChange={(e) => onChange({ city: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefon"><Input value={entry.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Valfritt" /></Field>
        <Field label="E-post"><Input type="email" value={entry.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="Valfritt" /></Field>
      </div>
    </div>
  );
}

export function TrialOnboardingWizardPage() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [result, setResult] = useState<CompleteTrialResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Answers, string>>>({});
  // Arrived here straight from GET /:token/verify-email's redirect — the
  // agreed architecture (see this module's own header docblock) is Send
  // Welcome Email → Customer clicks "Start Your Setup" → Guided Business
  // Interview, i.e. one deliberate step, not the interview appearing
  // automatically underneath the tenant. Gate the form behind an explicit
  // confirmation screen instead of rendering it the instant the redirect
  // lands, so the email link and this landing are the same single choice
  // rather than two competing paths to the same place.
  const [showVerifiedIntro, setShowVerifiedIntro] = useState(() => searchParams.get('verified') === '1');

  useEffect(() => {
    if (!token) return;
    getTrialSession(token)
      .then((session) => {
        setSchoolName(session.driving_school_name);
        const raw = session.interview_answers as Partial<Answers>;
        setAnswers(normalizeAnswers({ ...raw, legal_name: (raw.legal_name as string) || session.driving_school_name }));
        setLoading(false);
      })
      .catch((err) => {
        setInvalid(err instanceof TrialSignupError ? err.message : 'Länken kunde inte laddas.');
        setLoading(false);
      });
  }, [token]);

  // Strip the ?verified=1 flag once read into state so a refresh or the
  // back button doesn't re-arm the confirmation screen.
  useEffect(() => {
    if (searchParams.get('verified') !== '1') return;
    setSearchParams((prev) => { prev.delete('verified'); return prev; }, { replace: true });
  }, [searchParams, setSearchParams]);

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }
  function toggleInArray(key: 'licence_categories' | 'teaching_languages' | 'payment_methods', value: string) {
    setAnswers((prev) => {
      const arr = prev[key];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      if (key !== 'licence_categories') return { ...prev, [key]: next };
      // A newly-picked licence category needs a duration to show in the
      // per-type list below; dropping one just leaves its entry unused
      // rather than deleting it, so re-picking the same category later
      // restores whatever value was last set instead of resetting to default.
      const durations = arr.includes(value) || value in prev.lesson_type_durations
        ? prev.lesson_type_durations
        : { ...prev.lesson_type_durations, [value]: prev.standard_lesson_duration_minutes };
      return { ...prev, licence_categories: next, lesson_type_durations: durations };
    });
  }
  function setLessonTypeDuration(category: string, minutes: number) {
    setAnswers((prev) => ({ ...prev, lesson_type_durations: { ...prev.lesson_type_durations, [category]: Math.max(15, minutes || 45) } }));
  }

  function updateVehicleEntry(idx: number, patch: Partial<VehicleEntry>) {
    setAnswers((prev) => ({ ...prev, vehicles: prev.vehicles.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));
  }
  function updateInstructorEntry(idx: number, patch: Partial<InstructorEntry>) {
    setAnswers((prev) => ({ ...prev, instructor_entries: prev.instructor_entries.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));
  }
  function updateAdminEntry(idx: number, patch: Partial<StaffEntry>) {
    setAnswers((prev) => ({ ...prev, admin_entries: prev.admin_entries.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));
  }
  function updateReceptionistEntry(idx: number, patch: Partial<StaffEntry>) {
    setAnswers((prev) => ({ ...prev, receptionist_entries: prev.receptionist_entries.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));
  }
  function updateBranchEntry(idx: number, patch: Partial<BranchEntry>) {
    setAnswers((prev) => ({ ...prev, branch_entries: prev.branch_entries.map((v, i) => (i === idx ? { ...v, ...patch } : v)) }));
  }
  function setVehicleCount(n: number) {
    setAnswers((prev) => {
      const count = Math.max(0, n);
      return { ...prev, vehicle_count: count, vehicles: resizeArray(prev.vehicles, count, () => newVehicleEntry(prev.vehicle_transmission)) };
    });
  }
  function setInstructorCount(n: number) {
    setAnswers((prev) => {
      const count = Math.max(0, n);
      return { ...prev, instructors: count, instructor_entries: resizeArray(prev.instructor_entries, count, newInstructorEntry) };
    });
  }
  function setAdministratorCount(n: number) {
    setAnswers((prev) => {
      const count = Math.max(1, n);
      return { ...prev, administrators: count, admin_entries: resizeArray(prev.admin_entries, Math.max(0, count - 1), newStaffEntry) };
    });
  }
  function setReceptionistCount(n: number) {
    setAnswers((prev) => {
      const count = Math.max(0, n);
      return { ...prev, receptionists: count, receptionist_entries: resizeArray(prev.receptionist_entries, count, newStaffEntry) };
    });
  }
  function setBranchCount(n: number) {
    setAnswers((prev) => {
      const count = Math.max(1, n);
      return { ...prev, branches: count, branch_entries: resizeArray(prev.branch_entries, Math.max(0, count - 1), newBranchEntry) };
    });
  }

  function arrayValidationError(s: number): string | null {
    if (s === 1) {
      for (const b of answers.branch_entries) {
        if (!b.name.trim() || !b.address_line1.trim() || !b.city.trim() || !POSTAL_RE.test(b.postal_code.trim())) {
          return 'Fyll i namn, adress, postnummer och ort för alla filialer.';
        }
      }
    }
    if (s === 4) {
      for (const v of answers.vehicles) {
        if (!v.registration_number.trim() || !v.make.trim() || !v.model.trim() || !v.registration_expires_at || !v.insurance_expires_at) {
          return 'Fyll i registreringsnummer, märke, modell och giltighetsdatum för alla fordon.';
        }
      }
    }
    if (s === 5) {
      for (const p of [...answers.admin_entries, ...answers.receptionist_entries, ...answers.instructor_entries]) {
        if (!p.first_name.trim() || !p.last_name.trim() || !EMAIL_RE.test(p.email.trim())) {
          return 'Fyll i förnamn, efternamn och en giltig e-postadress för all personal.';
        }
      }
    }
    return null;
  }

  async function goNext() {
    const errors: Partial<Record<keyof Answers, string>> = {};
    if (step === 0) {
      if (!answers.contact_first_name.trim()) errors.contact_first_name = 'Ange ditt förnamn.';
      if (!answers.contact_last_name.trim())  errors.contact_last_name  = 'Ange ditt efternamn.';
      if (!answers.legal_name.trim())         errors.legal_name         = 'Ange organisationens juridiska namn.';
      if (!answers.address_line1.trim())      errors.address_line1      = 'Ange gatuadress.';
      if (!answers.postal_code.trim())        errors.postal_code        = 'Ange postnummer.';
      else if (!POSTAL_RE.test(answers.postal_code.trim())) errors.postal_code = 'Ange postnummer i formatet 111 22.';
      if (!answers.city.trim())               errors.city               = 'Ange ort.';
    }
    if (step === 2) {
      if (answers.licence_categories.length === 0) errors.licence_categories = 'Välj minst en behörighet ni utbildar för.';
      if (answers.standard_lesson_price_sek <= 0)   errors.standard_lesson_price_sek = 'Ange ett pris per lektion.';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast({ title: 'Kontrollera fälten markerade i rött', variant: 'destructive' });
      return;
    }
    const arrayError = arrayValidationError(step);
    if (arrayError) {
      toast({ title: 'Kontrollera uppgifterna', description: arrayError, variant: 'destructive' });
      return;
    }
    setFieldErrors({});
    if (!token) return;
    setSaving(true);
    try {
      await saveTrialAnswers(token, answers as unknown as Record<string, unknown>);
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    } catch (err) {
      toast({ title: 'Kunde inte spara', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }
  function goBack() { setStep((s) => Math.max(s - 1, 0)); }

  async function handleComplete() {
    if (!token) return;
    setCompleting(true);
    try {
      await saveTrialAnswers(token, answers as unknown as Record<string, unknown>);
      const res = await completeTrial(token);
      setResult(res);
    } catch (err) {
      toast({ title: 'Kunde inte konfigurera er trafikskola', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /><Toaster /></div>;
  }
  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Länken är inte längre giltig</h1>
          <p className="text-sm text-muted-foreground">{invalid}</p>
          <p className="text-sm text-muted-foreground">Kontakta <a href="mailto:support@trafikcloud.se" className="text-primary hover:underline">support@trafikcloud.se</a> för hjälp.</p>
        </div>
        <Toaster />
      </div>
    );
  }
  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-primary/30 bg-primary/5 p-8 space-y-4 text-center">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">Er ansökan är inskickad</h1>
          <p className="text-sm text-foreground">
            Tack! Er verksamhetsintervju är genomförd och granskas nu av Trafikcloud.
          </p>
          <p className="text-sm text-muted-foreground pt-2">
            Ni får ett mail så snart er trafikskola är godkänd och redo att användas — inget mer krävs från er just nu.
          </p>
        </div>
        <Toaster />
      </div>
    );
  }
  if (showVerifiedIntro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-primary/30 bg-primary/5 p-8 space-y-4 text-center">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">E-postadress bekräftad</h1>
          <p className="text-sm text-foreground">
            Tack! Vi har även skickat ett mail med samma länk — den kan ni spara och använda om ni behöver återuppta ansökan senare.
          </p>
          <Button size="lg" className="w-full" onClick={() => setShowVerifiedIntro(false)}>
            Starta er installation <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-primary">Trafikcloud</p>
          <h1 className="text-xl font-semibold text-foreground">Låt oss sätta upp {schoolName}</h1>
          <p className="text-sm text-muted-foreground">Steg {step + 1} av {TOTAL_STEPS}</p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden max-w-sm mx-auto">
            <div className="h-full bg-primary transition-all" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          {step === 0 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Organisation</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Ditt förnamn *" error={fieldErrors.contact_first_name}>
                  <Input value={answers.contact_first_name} onChange={(e) => set('contact_first_name', e.target.value)} className={cn(fieldErrors.contact_first_name && 'border-destructive focus-visible:ring-destructive')} />
                </Field>
                <Field label="Ditt efternamn *" error={fieldErrors.contact_last_name}>
                  <Input value={answers.contact_last_name} onChange={(e) => set('contact_last_name', e.target.value)} className={cn(fieldErrors.contact_last_name && 'border-destructive focus-visible:ring-destructive')} />
                </Field>
              </div>
              <Field label="Juridiskt företagsnamn *" error={fieldErrors.legal_name}>
                <Input value={answers.legal_name} onChange={(e) => set('legal_name', e.target.value)} className={cn(fieldErrors.legal_name && 'border-destructive focus-visible:ring-destructive')} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Organisationsnummer"><Input value={answers.org_number} onChange={(e) => set('org_number', e.target.value)} placeholder="T.ex. 556677-8899" /></Field>
                <Field label="Momsregistreringsnummer"><Input value={answers.vat_number} onChange={(e) => set('vat_number', e.target.value)} placeholder="T.ex. SE556677889901" /></Field>
              </div>
              <Field label="Gatuadress (huvudanläggning) *" error={fieldErrors.address_line1}>
                <Input value={answers.address_line1} onChange={(e) => set('address_line1', e.target.value)} className={cn(fieldErrors.address_line1 && 'border-destructive focus-visible:ring-destructive')} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Postnummer *" error={fieldErrors.postal_code}>
                  <Input value={answers.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="T.ex. 111 22" className={cn(fieldErrors.postal_code && 'border-destructive focus-visible:ring-destructive')} />
                </Field>
                <Field label="Ort *" error={fieldErrors.city}>
                  <Input value={answers.city} onChange={(e) => set('city', e.target.value)} className={cn(fieldErrors.city && 'border-destructive focus-visible:ring-destructive')} />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Filialer</h2>
              <p className="text-sm text-muted-foreground">Hur många filialer driver ni?</p>
              <div className="flex gap-2">
                <Pill active={answers.branches === 1} onClick={() => setBranchCount(1)}>En filial</Pill>
                <Pill active={answers.branches > 1} onClick={() => setBranchCount(Math.max(2, answers.branches))}>Flera filialer</Pill>
              </div>
              {answers.branches > 1 && (
                <>
                  <Field label="Ungefär hur många?">
                    <Input type="number" min={2} value={answers.branches} onChange={(e) => setBranchCount(Math.max(2, Number(e.target.value) || 2))} className="max-w-[120px]" />
                  </Field>
                  <p className="text-xs text-muted-foreground">Er första filial använder adressen ni angav i steg 1. Fyll i uppgifterna för resten nedan — de skapas automatiskt precis som under Inställningar → Filialer.</p>
                  <div className="space-y-3">
                    {answers.branch_entries.map((entry, idx) => (
                      <BranchEntryCard key={idx} index={idx} entry={entry} onChange={(patch) => updateBranchEntry(idx, patch)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Behörigheter</h2>
              <p className="text-sm text-muted-foreground">Vilka behörigheter utbildar ni för? *</p>
              <div className="flex flex-wrap gap-2">
                {LICENCE_CATEGORY_OPTIONS.map((cat) => (
                  <Pill key={cat} active={answers.licence_categories.includes(cat)} onClick={() => toggleInArray('licence_categories', cat)}>{cat}</Pill>
                ))}
              </div>
              {fieldErrors.licence_categories && <p className="text-xs text-destructive font-medium">{fieldErrors.licence_categories}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Standardlängd för nya behörigheter (minuter)">
                  <Input type="number" min={15} max={240} step={5} value={answers.standard_lesson_duration_minutes} onChange={(e) => set('standard_lesson_duration_minutes', Math.max(15, Number(e.target.value) || 45))} />
                </Field>
                <Field label="Pris per lektion (kr) *" error={fieldErrors.standard_lesson_price_sek}>
                  <Input type="number" min={0} step={50} value={answers.standard_lesson_price_sek || ''} onChange={(e) => set('standard_lesson_price_sek', Math.max(0, Number(e.target.value) || 0))} placeholder="T.ex. 595" className={cn(fieldErrors.standard_lesson_price_sek && 'border-destructive focus-visible:ring-destructive')} />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">Priset sätts på alla era lektionstyper direkt — ni kan justera per typ efteråt under Ekonomi → Lektionstyper.</p>

              {answers.licence_categories.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-foreground pt-2">Lektionslängd per behörighet</h3>
                  <p className="text-xs text-muted-foreground">Vissa behörigheter (t.ex. tunga fordon) tar ofta längre tid per lektion — justera vid behov.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {answers.licence_categories.map((cat) => (
                      <div key={cat} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <span className="text-sm font-medium text-foreground">{cat}</span>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min={15} max={240} step={5}
                            value={answers.lesson_type_durations[cat] ?? answers.standard_lesson_duration_minutes}
                            onChange={(e) => setLessonTypeDuration(cat, Number(e.target.value))}
                            className="w-20 h-8 text-sm"
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Undervisningsspråk</h2>
              <p className="text-sm text-muted-foreground">Vilka språk undervisar era instruktörer på?</p>
              <div className="flex flex-wrap gap-2">
                {TEACHING_LANGUAGE_OPTIONS.map((opt) => (
                  <Pill key={opt.value} active={answers.teaching_languages.includes(opt.value)} onClick={() => toggleInArray('teaching_languages', opt.value)}>{opt.label}</Pill>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Fordon</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Antal fordon"><Input type="number" min={0} value={answers.vehicle_count} onChange={(e) => setVehicleCount(Number(e.target.value) || 0)} /></Field>
                <Field label="Standardväxellåda (för nya fordon)">
                  <div className="flex gap-2">
                    <Pill active={answers.vehicle_transmission === 'manual'} onClick={() => set('vehicle_transmission', 'manual')}>Manuell</Pill>
                    <Pill active={answers.vehicle_transmission === 'automatic'} onClick={() => set('vehicle_transmission', 'automatic')}>Automat</Pill>
                    <Pill active={answers.vehicle_transmission === 'both'} onClick={() => set('vehicle_transmission', 'both')}>Båda</Pill>
                  </div>
                </Field>
              </div>
              {answers.vehicles.length > 0 && (
                <div className="space-y-3">
                  {answers.vehicles.map((entry, idx) => (
                    <VehicleEntryCard key={idx} index={idx} entry={entry} onChange={(patch) => updateVehicleEntry(idx, patch)} />
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Fordonen registreras automatiskt med uppgifterna ovan — precis som om ni lagt till dem manuellt under Resurser → Fordon.</p>
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Personal</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Administratörer"><Input type="number" min={1} value={answers.administrators} onChange={(e) => setAdministratorCount(Number(e.target.value) || 1)} /></Field>
                <Field label="Receptionister"><Input type="number" min={0} value={answers.receptionists} onChange={(e) => setReceptionistCount(Number(e.target.value) || 0)} /></Field>
                <Field label="Instruktörer"><Input type="number" min={0} value={answers.instructors} onChange={(e) => setInstructorCount(Number(e.target.value) || 0)} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">Du själv blir automatiskt administratör och ägare. Fyll i uppgifter för övrig personal nedan — de bjuds in automatiskt med riktiga inloggningsuppgifter, precis som under Inställningar → Användare.</p>

              {answers.admin_entries.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground">Ytterligare administratörer</p>
                  {answers.admin_entries.map((entry, idx) => (
                    <StaffEntryCard key={idx} label="Administratör" index={idx} entry={entry} onChange={(patch) => updateAdminEntry(idx, patch)} />
                  ))}
                </div>
              )}
              {answers.receptionist_entries.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground">Receptionister</p>
                  {answers.receptionist_entries.map((entry, idx) => (
                    <StaffEntryCard key={idx} label="Receptionist" index={idx} entry={entry} onChange={(patch) => updateReceptionistEntry(idx, patch)} />
                  ))}
                </div>
              )}
              {answers.instructor_entries.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground">Instruktörer</p>
                  {answers.instructor_entries.map((entry, idx) => (
                    <InstructorEntryCard key={idx} index={idx} entry={entry} onChange={(patch) => updateInstructorEntry(idx, patch)} />
                  ))}
                </div>
              )}
            </>
          )}

          {step === 6 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Verksamhetsregler</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Öppettider, från"><Input type="time" value={answers.working_hours_start} onChange={(e) => set('working_hours_start', e.target.value)} /></Field>
                <Field label="Öppettider, till"><Input type="time" value={answers.working_hours_end} onChange={(e) => set('working_hours_end', e.target.value)} /></Field>
              </div>
              <Field label="Helger">
                <div className="flex gap-2">
                  <Pill active={answers.weekend_schedule === 'closed'} onClick={() => set('weekend_schedule', 'closed')}>Stängt</Pill>
                  <Pill active={answers.weekend_schedule === 'open'} onClick={() => set('weekend_schedule', 'open')}>Öppet</Pill>
                </div>
              </Field>
              <p className="text-xs text-muted-foreground">Öppettiderna ovan används för er filials schema, era instruktörers arbetstider, och bokningsbara pass för de kommande två veckorna genereras automatiskt.</p>
            </>
          )}

          {step === 7 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Kommunikation</h2>
              <p className="text-sm text-muted-foreground">Vilka kanaler vill ni använda för att nå elever?</p>
              <div className="flex flex-wrap gap-2">
                <Pill active={answers.channels.email} onClick={() => set('channels', { ...answers.channels, email: !answers.channels.email })}>E-post</Pill>
                <Pill active={answers.channels.sms} onClick={() => set('channels', { ...answers.channels, sms: !answers.channels.sms })}>SMS</Pill>
                <Pill active={answers.channels.whatsapp} onClick={() => set('channels', { ...answers.channels, whatsapp: !answers.channels.whatsapp })}>WhatsApp</Pill>
                <Pill active={answers.channels.invoice_notifications} onClick={() => set('channels', { ...answers.channels, invoice_notifications: !answers.channels.invoice_notifications })}>Fakturaaviseringar</Pill>
              </div>
              <p className="text-xs text-muted-foreground">E-post, SMS och WhatsApp fungerar direkt med Trafikclouds pilot-/testkonfiguration. Ni kan koppla er egen avsändare för varje kanal under Kommunikation → Kanalinställningar när ni är redo för skarp drift.</p>
            </>
          )}

          {step === 8 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Ekonomi</h2>
              <Field label="Momsperiod">
                <div className="flex gap-2">
                  <Pill active={answers.vat_period === 'monthly'} onClick={() => set('vat_period', 'monthly')}>Månadsvis</Pill>
                  <Pill active={answers.vat_period === 'quarterly'} onClick={() => set('vat_period', 'quarterly')}>Kvartalsvis</Pill>
                  <Pill active={answers.vat_period === 'yearly'} onClick={() => set('vat_period', 'yearly')}>Årsvis</Pill>
                </div>
              </Field>
              <Field label="Betalsätt">
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <Pill key={opt.value} active={answers.payment_methods.includes(opt.value)} onClick={() => toggleInArray('payment_methods', opt.value)}>{opt.label}</Pill>
                  ))}
                </div>
              </Field>
              <p className="text-xs text-muted-foreground">Er momsperiod skapas automatiskt utifrån vald frekvens. Kontoplanen (BAS 2020) sätts redan upp automatiskt för varje ny organisation. Väljer ni kortbetalning fungerar det direkt med Trafikclouds pilot-/testkonfiguration (Nets och Stripe) — koppla ert eget konto under Inställningar → Företagsuppgifter → Betalningar när ni är redo för skarp drift.</p>
            </>
          )}

          {step === 9 && (
            <>
              <h2 className="text-sm font-semibold text-foreground">Granska</h2>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-muted-foreground">Trafikskola</dt><dd className="font-medium text-foreground">{answers.legal_name}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Adress</dt><dd className="font-medium text-foreground">{answers.address_line1}, {answers.postal_code} {answers.city}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Behörigheter</dt><dd className="font-medium text-foreground">{answers.licence_categories.join(', ') || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Pris per lektion</dt><dd className="font-medium text-foreground">{answers.standard_lesson_price_sek} kr</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Filialer</dt><dd className="font-medium text-foreground">{answers.branches}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Fordon</dt><dd className="font-medium text-foreground">{answers.vehicles.length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Instruktörer</dt><dd className="font-medium text-foreground">{answers.instructor_entries.length}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Övrig personal</dt><dd className="font-medium text-foreground">{answers.admin_entries.length + answers.receptionist_entries.length}</dd></div>
              </dl>
              <p className="text-sm text-muted-foreground pt-2">
                När ni skickar in ansökan granskas den av Trafikcloud. Så snart den är godkänd konfigureras allt automatiskt utifrån era svar — lektionstyper (med pris), schema för öppettider, momsperiod, paketmallar, {answers.branches > 1 ? 'alla era filialer' : 'er första filial'}, {answers.vehicles.length} fordon och {answers.instructor_entries.length} instruktörer (med bokningsbara pass för de kommande två veckorna) — precis som om ni byggt det manuellt i systemet. Ni får ett mail så snart det är klart.
              </p>
              <Button size="lg" className="w-full" disabled={completing} onClick={handleComplete}>
                {completing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {completing ? 'Skickar in ansökan...' : 'Skicka in ansökan'}
              </Button>
            </>
          )}
        </div>

        {step < TOTAL_STEPS - 1 && (
          <div className="flex justify-between">
            <Button variant="outline" onClick={goBack} disabled={step === 0}><ArrowLeft className="w-4 h-4 mr-1.5" /> Tillbaka</Button>
            <Button onClick={goNext} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Nästa <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        )}
        {step === TOTAL_STEPS - 1 && (
          <div className="flex justify-start">
            <Button variant="outline" onClick={goBack}><ArrowLeft className="w-4 h-4 mr-1.5" /> Tillbaka</Button>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}
