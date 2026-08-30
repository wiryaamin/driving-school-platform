import { useRef, useState } from 'react';
import { Loader2, CheckCircle2, ChevronLeft } from 'lucide-react';
import { Button, Input, toast } from '@platform/ui';
import { startTrial, TrialSignupError } from '../lib/trialSignupApi.js';
import { Field, Pill } from './BusinessSetupFieldKit.js';
import { EMAIL_RE, POSTAL_RE, LICENCE_CATEGORY_OPTIONS } from '../lib/businessSetupAnswers.js';

// ─── Short registration data shape ──────────────────────────────────────────
//
// Starta provperiod — direct registration + email verification + password
// activation (2026-08-30): only the fields genuinely needed to create a
// trafikskola, per the field-inventory audit's KEEP list — everything else
// (vehicles, staff, working hours, communication channels, VAT period, ...)
// is auto-configured with the platform's existing defaults or filled in
// later under Inställningar, never asked here.
interface ShortAnswers {
  email: string;
  contact_first_name: string;
  contact_last_name: string;
  legal_name: string;
  address_line1: string;
  postal_code: string;
  city: string;
  licence_categories: string[];
  standard_lesson_price_sek: number;
}

const EMPTY: ShortAnswers = {
  email: '', contact_first_name: '', contact_last_name: '', legal_name: '',
  address_line1: '', postal_code: '', city: '',
  licence_categories: [], standard_lesson_price_sek: 595,
};

const STEP_TITLES = ['Om din trafikskola', 'Er utbildning', 'Granska'];
const TOTAL_STEPS = STEP_TITLES.length;

function stepError(step: number, a: ShortAnswers): string | null {
  if (step === 0) {
    if (!EMAIL_RE.test(a.email.trim())) return 'Ange en giltig e-postadress.';
    if (!a.contact_first_name.trim()) return 'Ange ditt förnamn.';
    if (!a.contact_last_name.trim()) return 'Ange ditt efternamn.';
    if (a.legal_name.trim().length < 2) return 'Ange trafikskolans juridiska företagsnamn.';
    if (!a.address_line1.trim()) return 'Ange gatuadress.';
    if (!POSTAL_RE.test(a.postal_code.trim())) return 'Ange postnummer i formatet 111 22.';
    if (!a.city.trim()) return 'Ange ort.';
  }
  if (step === 1) {
    if (a.licence_categories.length === 0) return 'Välj minst en behörighet ni utbildar för.';
    if (!(a.standard_lesson_price_sek > 0)) return 'Ange ett pris per lektion.';
  }
  return null;
}

/**
 * The self-service trial-signup form — the site's one true conversion
 * action. Shared verbatim between the standalone /start-trial page
 * (StartTrialPage) and the landing page's "Kom igång" section
 * (CallToAction.tsx). Clicking "Starta provperiod" opens this form directly;
 * there is no separate "just tell us your email" screen in front of it —
 * everything provisioning needs is collected here, in one continuous flow,
 * before the first (and only) submission fires the verification email.
 */
export function TrialSignupForm() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ShortAnswers>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof ShortAnswers>(key: K, value: ShortAnswers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function goNext() {
    const error = stepError(step, answers);
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }
  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    const error = stepError(0, answers) ?? stepError(1, answers);
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await startTrial({
        email: answers.email.trim(),
        contact_first_name: answers.contact_first_name.trim(),
        contact_last_name: answers.contact_last_name.trim(),
        legal_name: answers.legal_name.trim(),
        address_line1: answers.address_line1.trim(),
        postal_code: answers.postal_code.trim(),
        city: answers.city.trim(),
        licence_categories: answers.licence_categories,
        standard_lesson_price_sek: answers.standard_lesson_price_sek,
        website: honeypotRef.current?.value ?? '',
      });
      setSendFailed(!result.email_verification_sent);
      setSent(true);
    } catch (err) {
      toast({
        title: 'Kunde inte starta provperiod',
        description: err instanceof TrialSignupError ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md text-center space-y-3">
        <CheckCircle2 className={`w-10 h-10 mx-auto ${sendFailed ? 'text-destructive' : 'text-primary'}`} />
        <h2 className="text-lg font-semibold text-foreground">
          {sendFailed ? 'Vi kunde inte skicka mailet' : 'Kontrollera din e-post'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {sendFailed
            ? `Vi kunde inte skicka ett verifieringsmail till ${answers.email}. Kontrollera att adressen stämmer och försök igen, eller hör av er till support@trafikcloud.se.`
            : `Vi har skickat en verifieringslänk till ${answers.email}. Klicka på länken i mailet för att bekräfta din e-postadress och fortsätta — er trafikskola konfigureras automatiskt direkt efteråt.`}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md w-full space-y-5">
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
        <label htmlFor="website">Webbplats</label>
        <input ref={honeypotRef} type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{STEP_TITLES[step]}</p>
        <p className="text-xs text-muted-foreground">Steg {step + 1} av {TOTAL_STEPS}</p>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <Field label="E-postadress *">
            <Input type="email" value={answers.email} onChange={(e) => set('email', e.target.value)} placeholder="erik@korskola.se" autoComplete="email" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Förnamn *">
              <Input value={answers.contact_first_name} onChange={(e) => set('contact_first_name', e.target.value)} autoComplete="given-name" />
            </Field>
            <Field label="Efternamn *">
              <Input value={answers.contact_last_name} onChange={(e) => set('contact_last_name', e.target.value)} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Juridiskt företagsnamn *">
            <Input value={answers.legal_name} onChange={(e) => set('legal_name', e.target.value)} placeholder="Lindqvists Trafikskola AB" />
          </Field>
          <Field label="Gatuadress *">
            <Input value={answers.address_line1} onChange={(e) => set('address_line1', e.target.value)} autoComplete="address-line1" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Postnummer *">
              <Input value={answers.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="111 22" autoComplete="postal-code" />
            </Field>
            <Field label="Ort *">
              <Input value={answers.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" />
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Field label="Vilka behörigheter utbildar ni för? *">
            <div className="flex flex-wrap gap-2">
              {LICENCE_CATEGORY_OPTIONS.map((cat) => (
                <Pill
                  key={cat}
                  active={answers.licence_categories.includes(cat)}
                  onClick={() => set(
                    'licence_categories',
                    answers.licence_categories.includes(cat)
                      ? answers.licence_categories.filter((c) => c !== cat)
                      : [...answers.licence_categories, cat],
                  )}
                >
                  {cat}
                </Pill>
              ))}
            </div>
          </Field>
          <Field label="Pris per lektion (kr) *">
            <Input
              type="number" min={1} className="max-w-[160px]"
              value={answers.standard_lesson_price_sek}
              onChange={(e) => set('standard_lesson_price_sek', Number(e.target.value) || 0)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">Priset sätts på alla era lektionstyper direkt — ni kan alltid ändra det senare i Ekonomi.</p>
        </div>
      )}

      {step === 2 && (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Trafikskola</dt><dd className="col-span-2 text-foreground">{answers.legal_name}</dd>
          <dt className="text-muted-foreground">E-post</dt><dd className="col-span-2 text-foreground">{answers.email}</dd>
          <dt className="text-muted-foreground">Kontaktperson</dt><dd className="col-span-2 text-foreground">{answers.contact_first_name} {answers.contact_last_name}</dd>
          <dt className="text-muted-foreground">Adress</dt><dd className="col-span-2 text-foreground">{answers.address_line1}, {answers.postal_code} {answers.city}</dd>
          <dt className="text-muted-foreground">Behörigheter</dt><dd className="col-span-2 text-foreground">{answers.licence_categories.join(', ')}</dd>
          <dt className="text-muted-foreground">Pris per lektion</dt><dd className="col-span-2 text-foreground">{answers.standard_lesson_price_sek} kr</dd>
        </dl>
      )}

      <div className="flex items-center gap-2 pt-2">
        {step > 0 && (
          <Button type="button" variant="outline" onClick={goBack} disabled={submitting}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Tillbaka
          </Button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <Button type="button" size="lg" className="flex-1" onClick={goNext}>Nästa</Button>
        ) : (
          <Button type="button" size="lg" className="flex-1" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {submitting ? 'Skapar...' : 'Skapa min trafikskola'}
          </Button>
        )}
      </div>
    </div>
  );
}
