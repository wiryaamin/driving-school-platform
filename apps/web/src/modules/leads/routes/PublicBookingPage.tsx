import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const API = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/public-booking`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LicenseCategory { value: string; label: string }

interface OrgInfo {
  org_id:                 string;
  org_name:               string;
  public_booking_enabled: boolean;
  license_categories:     LicenseCategory[];
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({
  label, required = false, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors';

// ─── PublicBookingPage ────────────────────────────────────────────────────────

export function PublicBookingPage() {
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('org') ?? '';

  const [org,      setOrg]      = useState<OrgInfo | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [disabled, setDisabled] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [phone,     setPhone]     = useState('');
  const [category,  setCategory]  = useState('B');
  const [notes,     setNotes]     = useState('');

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
          if (!body.data.public_booking_enabled) setDisabled(true);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org || submitting) return;

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Fyll i för- och efternamn.');
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setFormError('Ange minst e-post eller telefonnummer.');
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const res  = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({
          org_id:           org.org_id,
          first_name:       firstName.trim(),
          last_name:        lastName.trim(),
          email:            email.trim() || null,
          phone:            phone.trim() || null,
          license_category: category,
          notes:            notes.trim() || null,
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
          {org.org_name} återkommer till dig så snart som möjligt för att boka in ditt första tillfälle.
        </p>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">
              {org.org_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{org.org_name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Anmäl dig till körkortsutbildning
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">

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

            <Field label="Telefon">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="070-123 45 67"
                autoComplete="tel"
                className={inputCls}
              />
            </Field>

            <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-2">
              Ange minst e-post eller telefonnummer.
            </p>

            <Field label="Körkortskategori" required>
              <div className="relative">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className={cn(inputCls, 'appearance-none pr-9 cursor-pointer')}
                >
                  {org.license_categories.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </Field>

            <Field label="Meddelande">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Berätta gärna om du har speciella önskemål eller frågor..."
                rows={3}
                className={cn(inputCls, 'resize-none')}
              />
            </Field>

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
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Skickar…' : 'Skicka anmälan'}
            </button>

          </form>
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 mt-5">
          Din information behandlas säkert och används bara för att kontakta dig om utbildningen.
        </p>
      </div>
    </div>
  );
}
