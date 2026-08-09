import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, ChevronDown, Calendar, GraduationCap, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { TenantContactFooter, type TenantBrandingContact } from '@shared/components/public/TenantContactFooter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/public-booking`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const DRIVING_EXPERIENCE_OPTIONS = [
  { value: 'none',                 label: 'Ingen erfarenhet' },
  { value: 'some_experience',      label: 'Viss erfarenhet (t.ex. övningskört privat)' },
  { value: 'held_license_before',  label: 'Har haft körkort tidigare' },
];

const LEARNER_PERMIT_OPTIONS = [
  { value: 'none',       label: 'Har inget körkortstillstånd' },
  { value: 'applied',    label: 'Har ansökt, väntar på beslut' },
  { value: 'has_permit', label: 'Har körkortstillstånd' },
];

const TRANSMISSION_OPTIONS = [
  { value: 'no_preference', label: 'Ingen preferens' },
  { value: 'manual',        label: 'Manuell' },
  { value: 'automatic',     label: 'Automat' },
];

const LESSON_TIME_OPTIONS = [
  { value: 'morning',   label: 'Förmiddag' },
  { value: 'afternoon', label: 'Eftermiddag' },
  { value: 'evening',   label: 'Kväll' },
  { value: 'weekend',   label: 'Helg' },
];

const LANGUAGE_LABELS: Record<string, string> = {
  sv: 'Svenska', en: 'English', ar: 'العربية', de: 'Deutsch',
  fr: 'Français', so: 'Soomaali', ku: 'Kurdî', fa: 'فارسی',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface LicenseCategory { value: string; label: string }

interface FieldConfig { visible: boolean; required: boolean }

interface FormConfig {
  fields:                     Record<string, FieldConfig>;
  license_categories:         string[];
  default_preferred_language: string;
}

interface OrgBranding extends TenantBrandingContact {
  logo_url:      string | null;
  primary_color: string | null;
}

interface OrgInfo {
  org_id:                 string;
  org_name:               string;
  public_booking_enabled: boolean;
  license_categories:     LicenseCategory[];
  preferred_languages:    string[];
  form_config:             FormConfig;
  branding:               OrgBranding;
}

function fieldVisible(config: FormConfig | undefined, key: string): boolean {
  return config?.fields[key]?.visible ?? true;
}
function fieldRequired(config: FormConfig | undefined, key: string): boolean {
  return config?.fields[key]?.required ?? false;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({
  label, required = false, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function SectionHeading({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-2 first:pt-0">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {children}
      </h2>
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors';

function SelectField({
  value, onChange, options, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, 'appearance-none pr-9 cursor-pointer')}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
    </div>
  );
}

function RadioGroup({
  name, value, onChange, options,
}: {
  name: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors',
            value === o.value
              ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function CheckboxGroup({
  values, onToggle, options,
}: {
  values: string[]; onToggle: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = values.includes(o.value);
        return (
          <label
            key={o.value}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-colors',
              checked
                ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

// ─── PublicBookingPage ────────────────────────────────────────────────────────

export function PublicBookingPage() {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('org') ?? '';

  const [org,      setOrg]      = useState<OrgInfo | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // Core contact fields
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [category,  setCategory]  = useState('B');
  const [notes,     setNotes]     = useState('');
  const [website,   setWebsite]   = useState(''); // honeypot — real visitors never fill this

  // Qualification fields
  const [preferredStartDate,      setPreferredStartDate]      = useState('');
  const [drivingExperience,       setDrivingExperience]       = useState('');
  const [learnerPermitStatus,     setLearnerPermitStatus]     = useState('');
  const [preferredTransmission,   setPreferredTransmission]   = useState('no_preference');
  const [preferredLessonTimes,    setPreferredLessonTimes]    = useState<string[]>([]);
  const [preferredLanguage,       setPreferredLanguage]       = useState('sv');
  const [existingLicenseCategory, setExistingLicenseCategory] = useState('');
  const [needsTheory,  setNeedsTheory]  = useState(false);
  const [needsRisk1,   setNeedsRisk1]   = useState(false);
  const [needsRisk2,   setNeedsRisk2]   = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setLoading(false); setNotFound(true); return; }

    fetch(`${API}?slug=${encodeURIComponent(slug)}`, {
      headers: { apikey: ANON_KEY },
    })
      .then(r => r.json())
      .then((body: { data?: OrgInfo; error?: string }) => {
        if (body.data) {
          setOrg(body.data);
          setCategory(body.data.license_categories[0]?.value ?? 'B');
          setPreferredLanguage(body.data.form_config?.default_preferred_language ?? 'sv');
          if (!body.data.public_booking_enabled) setDisabled(true);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  function toggleLessonTime(v: string) {
    setPreferredLessonTimes((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org || submitting) return;

    const cfg = org.form_config;

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Fyll i för- och efternamn.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setFormError('Ange minst e-post eller telefonnummer.');
      return;
    }
    if (fieldRequired(cfg, 'preferred_start_date') && !preferredStartDate) {
      setFormError('Ange önskat startdatum.');
      return;
    }
    if (fieldRequired(cfg, 'driving_experience') && !drivingExperience) {
      setFormError('Ange din körerfarenhet.');
      return;
    }
    if (fieldRequired(cfg, 'learner_permit_status') && !learnerPermitStatus) {
      setFormError('Ange status för körkortstillstånd.');
      return;
    }
    if (fieldRequired(cfg, 'preferred_lesson_times') && preferredLessonTimes.length === 0) {
      setFormError('Välj minst en önskad lektionstid.');
      return;
    }
    if (fieldRequired(cfg, 'existing_license_category') && !existingLicenseCategory.trim()) {
      setFormError('Ange befintligt körkort, eller "Inget" om du inte har något.');
      return;
    }
    if (fieldRequired(cfg, 'notes') && !notes.trim()) {
      setFormError('Fyll i meddelandefältet.');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const res  = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          org_id:                     org.org_id,
          first_name:                 firstName.trim(),
          last_name:                  lastName.trim(),
          email:                      email.trim() || null,
          phone:                      phone.trim() || null,
          license_category:           category,
          notes:                      notes.trim() || null,
          preferred_start_date:       preferredStartDate || null,
          driving_experience:         drivingExperience || null,
          learner_permit_status:      learnerPermitStatus || null,
          preferred_transmission:     preferredTransmission,
          preferred_lesson_times:     preferredLessonTimes,
          preferred_language:         preferredLanguage,
          existing_license_category:  existingLicenseCategory.trim() || null,
          needs_theory:               needsTheory,
          needs_risk1:                needsRisk1,
          needs_risk2:                needsRisk2,
          website,
        }),
      });
      const body = await res.json() as { data?: unknown; error?: string };
      if (!res.ok) throw new Error(body.error ?? 'Fel vid skickning');
      setSuccess(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Något gick fel. Försök igen.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────

  if (notFound || !org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-gray-950 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Trafikskolan hittades inte</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Länken verkar vara felaktig. Kontakta trafikskolan direkt för att anmäla dig.
        </p>
      </div>
    );
  }

  // ── Disabled ──────────────────────────────────────────────────────────────

  if (disabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-gray-950 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Online-anmälan är tillfälligt stängd
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Kontakta {org.org_name} direkt för att anmäla dig till körkortsutbildningen.
        </p>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-gray-950 text-center">
        <div className="w-20 h-20 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-5">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Tack för din anmälan!
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
          {org.org_name} går igenom din anmälan och kontaktar dig inom kort för att diskutera din utbildning.
        </p>
        {email && (
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs mt-3">
            En bekräftelse har skickats till {email}.
          </p>
        )}
        <div className="mt-6 max-w-xs w-full">
          <TenantContactFooter branding={org.branding} />
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  const cfg = org.form_config;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          {org.branding.logo_url ? (
            <img
              src={org.branding.logo_url}
              alt={org.org_name}
              className="w-14 h-14 rounded-2xl object-contain bg-white border border-gray-100 mx-auto mb-4"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4"
              style={org.branding.primary_color ? { backgroundColor: org.branding.primary_color } : undefined}
            >
              <span className="text-2xl font-bold text-white">
                {org.org_name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <h1
            className="text-2xl font-bold text-gray-900 dark:text-gray-100"
            style={org.branding.primary_color ? { color: org.branding.primary_color } : undefined}
          >
            {org.org_name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Anmäl dig till körkortsutbildning
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

            {/* Honeypot — hidden from real visitors, left for bots to fill in */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] w-px h-px opacity-0"
            />

            {/* ── Om dig ────────────────────────────────────────────────────── */}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Förnamn" required>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Anna"
                  autoComplete="given-name"
                  className={inputCls}
                  required
                />
              </Field>
              <Field label="Efternamn" required>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Larsson"
                  autoComplete="family-name"
                  className={inputCls}
                  required
                />
              </Field>
            </div>

            <Field label="E-post">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="anna@example.com"
                autoComplete="email"
                className={inputCls}
              />
            </Field>

            <Field label="Telefon" hint="Ange minst e-post eller telefonnummer.">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="070-123 45 67"
                autoComplete="tel"
                className={inputCls}
              />
            </Field>

            {/* ── Körkort ───────────────────────────────────────────────────── */}

            <SectionHeading icon={GraduationCap}>Körkort</SectionHeading>

            <Field label="Körkortskategori" required>
              <SelectField value={category} onChange={setCategory} options={org.license_categories} />
            </Field>

            {fieldVisible(cfg, 'existing_license_category') && (
              <Field
                label="Befintligt körkort (om något)"
                required={fieldRequired(cfg, 'existing_license_category')}
                hint="T.ex. AM eller B — lämna tomt om du inte har något körkort sedan tidigare."
              >
                <input
                  type="text"
                  value={existingLicenseCategory}
                  onChange={e => setExistingLicenseCategory(e.target.value)}
                  placeholder="T.ex. AM"
                  className={inputCls}
                />
              </Field>
            )}

            {fieldVisible(cfg, 'driving_experience') && (
              <Field label="Körerfarenhet" required={fieldRequired(cfg, 'driving_experience')}>
                <RadioGroup
                  name="driving_experience"
                  value={drivingExperience}
                  onChange={setDrivingExperience}
                  options={DRIVING_EXPERIENCE_OPTIONS}
                />
              </Field>
            )}

            {fieldVisible(cfg, 'learner_permit_status') && (
              <Field label="Körkortstillstånd" required={fieldRequired(cfg, 'learner_permit_status')}>
                <RadioGroup
                  name="learner_permit_status"
                  value={learnerPermitStatus}
                  onChange={setLearnerPermitStatus}
                  options={LEARNER_PERMIT_OPTIONS}
                />
              </Field>
            )}

            {fieldVisible(cfg, 'training_needs') && (
              <Field label="Behöver du även">
                <div className="flex flex-wrap gap-3 text-xs text-gray-700 dark:text-gray-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={needsTheory} onChange={e => setNeedsTheory(e.target.checked)} className="rounded" />
                    Teoriutbildning
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={needsRisk1} onChange={e => setNeedsRisk1(e.target.checked)} className="rounded" />
                    Risk 1
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={needsRisk2} onChange={e => setNeedsRisk2(e.target.checked)} className="rounded" />
                    Risk 2
                  </label>
                </div>
              </Field>
            )}

            {/* ── Startdatum & preferenser ─────────────────────────────────────── */}

            {(fieldVisible(cfg, 'preferred_start_date') || fieldVisible(cfg, 'preferred_transmission')
              || fieldVisible(cfg, 'preferred_lesson_times') || fieldVisible(cfg, 'preferred_language')) && (
              <SectionHeading icon={Calendar}>Startdatum &amp; preferenser</SectionHeading>
            )}

            {fieldVisible(cfg, 'preferred_start_date') && (
              <Field label="Önskat startdatum" required={fieldRequired(cfg, 'preferred_start_date')}>
                <input
                  type="date"
                  value={preferredStartDate}
                  onChange={e => setPreferredStartDate(e.target.value)}
                  className={inputCls}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </Field>
            )}

            {fieldVisible(cfg, 'preferred_transmission') && (
              <Field label="Önskad växellåda" required={fieldRequired(cfg, 'preferred_transmission')}>
                <RadioGroup
                  name="preferred_transmission"
                  value={preferredTransmission}
                  onChange={setPreferredTransmission}
                  options={TRANSMISSION_OPTIONS}
                />
              </Field>
            )}

            {fieldVisible(cfg, 'preferred_lesson_times') && (
              <Field label="Önskade lektionstider" required={fieldRequired(cfg, 'preferred_lesson_times')}>
                <CheckboxGroup
                  values={preferredLessonTimes}
                  onToggle={toggleLessonTime}
                  options={LESSON_TIME_OPTIONS}
                />
              </Field>
            )}

            {fieldVisible(cfg, 'preferred_language') && (
              <Field label="Önskat språk" required={fieldRequired(cfg, 'preferred_language')}>
                <SelectField
                  value={preferredLanguage}
                  onChange={setPreferredLanguage}
                  options={org.preferred_languages.map(l => ({ value: l, label: LANGUAGE_LABELS[l] ?? l }))}
                />
              </Field>
            )}

            {/* ── Övrigt ────────────────────────────────────────────────────── */}

            {fieldVisible(cfg, 'notes') && (
              <>
                <SectionHeading icon={ClipboardList}>Övrigt</SectionHeading>
                <Field label="Meddelande" required={fieldRequired(cfg, 'notes')}>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Berätta gärna om du har speciella önskemål eller frågor..."
                    rows={3}
                    className={cn(inputCls, 'resize-none')}
                  />
                </Field>
              </>
            )}

            {formError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/40">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              style={!submitting && org.branding.primary_color ? { backgroundColor: org.branding.primary_color } : undefined}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Skickar…' : 'Skicka anmälan'}
            </button>

          </form>
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 mt-5">
          Din information behandlas säkert och används bara för att kontakta dig om utbildningen.
        </p>
        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 mt-2">
          Redan kund? <Link to="/logga-in" className="text-blue-600 hover:underline">Logga in i din portal</Link>
        </p>

        <TenantContactFooter branding={org.branding} />
      </div>
    </div>
  );
}
