import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@platform/ui';
import {
  LICENCE_CATEGORY_OPTIONS, TEACHING_LANGUAGE_OPTIONS, PAYMENT_METHOD_OPTIONS,
  resizeArray, newVehicleEntry, newInstructorEntry, newStaffEntry, newBranchEntry,
  Field, Pill, VehicleEntryCard, InstructorEntryCard, StaffEntryCard, BranchEntryCard,
  type Answers,
} from '@modules/trial-onboarding/index.js';

// ─── Platform Admin business setup — condensed, single-scroll form ─────────
//
// Collects the exact same canonical business/setup fields the self-service
// TrialOnboardingWizardPage collects (Tenant Registration Unification,
// 2026-08-28), reusing its shared field kit and Answers model verbatim —
// just laid out as collapsible sections instead of a multi-step wizard,
// since a Platform Admin filling this in themselves doesn't need the
// paginated, one-question-at-a-time pacing a public applicant does.
//
// Deliberately does NOT render contact name / legal name / org number
// fields — CreateOrgDialog already collects those (organisationsnamn,
// juridiskt namn, org.nummer, tenant-administratör), and re-asking here
// would be exactly the duplicate data entry this unification exists to
// remove. CreateOrgDialog merges those four fields into the Answers object
// this section manages before submitting.

function Section({
  title, description, defaultOpen, children,
}: {
  title: string; description?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">{children}</div>}
    </div>
  );
}

export interface BusinessSetupSectionProps {
  value:    Answers;
  onChange: (next: Answers) => void;
}

export function BusinessSetupSection({ value: answers, onChange }: BusinessSetupSectionProps) {
  function set<K extends keyof Answers>(key: K, v: Answers[K]) {
    onChange({ ...answers, [key]: v });
  }
  function toggleInArray(key: 'licence_categories' | 'teaching_languages' | 'payment_methods', v: string) {
    const arr = answers[key];
    const next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    if (key !== 'licence_categories') { set(key, next); return; }
    const durations = arr.includes(v) || v in answers.lesson_type_durations
      ? answers.lesson_type_durations
      : { ...answers.lesson_type_durations, [v]: answers.standard_lesson_duration_minutes };
    onChange({ ...answers, licence_categories: next, lesson_type_durations: durations });
  }

  function setBranchCount(n: number) {
    const count = Math.max(1, n);
    onChange({ ...answers, branches: count, branch_entries: resizeArray(answers.branch_entries, Math.max(0, count - 1), newBranchEntry) });
  }
  function setVehicleCount(n: number) {
    const count = Math.max(0, n);
    onChange({ ...answers, vehicle_count: count, vehicles: resizeArray(answers.vehicles, count, () => newVehicleEntry(answers.vehicle_transmission)) });
  }
  function setInstructorCount(n: number) {
    const count = Math.max(0, n);
    onChange({ ...answers, instructors: count, instructor_entries: resizeArray(answers.instructor_entries, count, newInstructorEntry) });
  }
  function setAdministratorCount(n: number) {
    const count = Math.max(0, n);
    onChange({ ...answers, administrators: count, admin_entries: resizeArray(answers.admin_entries, count, newStaffEntry) });
  }
  function setReceptionistCount(n: number) {
    const count = Math.max(0, n);
    onChange({ ...answers, receptionists: count, receptionist_entries: resizeArray(answers.receptionist_entries, count, newStaffEntry) });
  }

  return (
    <div className="space-y-2">
      <Section title="Adress & kontakt" description="Huvudanläggningens adress och kontakttelefon">
        <Field label="Gatuadress *"><Input value={answers.address_line1} onChange={(e) => set('address_line1', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Postnummer *"><Input value={answers.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="111 22" /></Field>
          <Field label="Ort *"><Input value={answers.city} onChange={(e) => set('city', e.target.value)} /></Field>
        </div>
        <Field label="Kontakt-/supporttelefon"><Input value={answers.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} placeholder="Valfritt" /></Field>
        <Field label="Momsregistreringsnummer"><Input value={answers.vat_number} onChange={(e) => set('vat_number', e.target.value)} placeholder="T.ex. SE556677889901" /></Field>
      </Section>

      <Section title="Filialer" description="Hur många filialer driver organisationen?">
        <div className="flex gap-2">
          <Pill active={answers.branches === 1} onClick={() => setBranchCount(1)}>En filial</Pill>
          <Pill active={answers.branches > 1} onClick={() => setBranchCount(Math.max(2, answers.branches))}>Flera filialer</Pill>
        </div>
        {answers.branches > 1 && (
          <>
            <Field label="Antal filialer"><Input type="number" min={2} value={answers.branches} onChange={(e) => setBranchCount(Math.max(2, Number(e.target.value) || 2))} className="max-w-[120px]" /></Field>
            {answers.branch_entries.map((entry, idx) => (
              <BranchEntryCard key={idx} index={idx} entry={entry} onChange={(patch) => onChange({ ...answers, branch_entries: answers.branch_entries.map((b, i) => i === idx ? { ...b, ...patch } : b) })} />
            ))}
          </>
        )}
      </Section>

      <Section title="Behörigheter & priser" description="Vilka behörigheter, och pris per lektion">
        <div className="flex flex-wrap gap-2">
          {LICENCE_CATEGORY_OPTIONS.map((cat) => (
            <Pill key={cat} active={answers.licence_categories.includes(cat)} onClick={() => toggleInArray('licence_categories', cat)}>{cat}</Pill>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Standardlängd (minuter)"><Input type="number" min={40} max={240} step={5} value={answers.standard_lesson_duration_minutes} onChange={(e) => set('standard_lesson_duration_minutes', Math.max(40, Number(e.target.value) || 40))} /></Field>
          <Field label="Pris per lektion (kr)"><Input type="number" min={0} step={50} value={answers.standard_lesson_price_sek || ''} onChange={(e) => set('standard_lesson_price_sek', Math.max(0, Number(e.target.value) || 0))} placeholder="T.ex. 595" /></Field>
        </div>
        {answers.standard_lesson_price_sek <= 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">Inget pris angivet — lektionstyperna skapas men blir inte bokningsbara förrän ett pris satts.</p>
        )}
      </Section>

      <Section title="Undervisningsspråk">
        <div className="flex flex-wrap gap-2">
          {TEACHING_LANGUAGE_OPTIONS.map((opt) => (
            <Pill key={opt.value} active={answers.teaching_languages.includes(opt.value)} onClick={() => toggleInArray('teaching_languages', opt.value)}>{opt.label}</Pill>
          ))}
        </div>
      </Section>

      <Section title="Fordon" description={`${answers.vehicle_count} fordon`}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Antal fordon"><Input type="number" min={0} value={answers.vehicle_count} onChange={(e) => setVehicleCount(Number(e.target.value) || 0)} /></Field>
          <Field label="Standardväxellåda">
            <div className="flex gap-2">
              <Pill active={answers.vehicle_transmission === 'manual'} onClick={() => set('vehicle_transmission', 'manual')}>Manuell</Pill>
              <Pill active={answers.vehicle_transmission === 'automatic'} onClick={() => set('vehicle_transmission', 'automatic')}>Automat</Pill>
            </div>
          </Field>
        </div>
        {answers.vehicle_count === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">0 fordon — bokning är inte möjlig förrän minst ett fordon finns.</p>
        )}
        {answers.vehicles.map((entry, idx) => (
          <VehicleEntryCard key={idx} index={idx} entry={entry} onChange={(patch) => onChange({ ...answers, vehicles: answers.vehicles.map((v, i) => i === idx ? { ...v, ...patch } : v) })} />
        ))}
      </Section>

      <Section title="Personal" description={`${answers.instructors} instruktörer, ${answers.administrators} administratörer, ${answers.receptionists} receptionister`}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Instruktörer"><Input type="number" min={0} value={answers.instructors} onChange={(e) => setInstructorCount(Number(e.target.value) || 0)} /></Field>
          <Field label="Adm. utöver ägare"><Input type="number" min={0} value={answers.administrators} onChange={(e) => setAdministratorCount(Number(e.target.value) || 0)} /></Field>
          <Field label="Receptionister"><Input type="number" min={0} value={answers.receptionists} onChange={(e) => setReceptionistCount(Number(e.target.value) || 0)} /></Field>
        </div>
        {answers.instructors === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">0 instruktörer — schemaläggning och bokningsbara pass kan inte genereras.</p>
        )}
        {answers.instructor_entries.map((entry, idx) => (
          <InstructorEntryCard key={idx} index={idx} entry={entry} onChange={(patch) => onChange({ ...answers, instructor_entries: answers.instructor_entries.map((v, i) => i === idx ? { ...v, ...patch } : v) })} />
        ))}
        {answers.admin_entries.map((entry, idx) => (
          <StaffEntryCard key={idx} label="Administratör" index={idx} entry={entry} onChange={(patch) => onChange({ ...answers, admin_entries: answers.admin_entries.map((v, i) => i === idx ? { ...v, ...patch } : v) })} />
        ))}
        {answers.receptionist_entries.map((entry, idx) => (
          <StaffEntryCard key={idx} label="Receptionist" index={idx} entry={entry} onChange={(patch) => onChange({ ...answers, receptionist_entries: answers.receptionist_entries.map((v, i) => i === idx ? { ...v, ...patch } : v) })} />
        ))}
      </Section>

      <Section title="Verksamhetsregler" description="Öppettider och helger">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Från"><Input type="time" value={answers.working_hours_start} onChange={(e) => set('working_hours_start', e.target.value)} /></Field>
          <Field label="Till"><Input type="time" value={answers.working_hours_end} onChange={(e) => set('working_hours_end', e.target.value)} /></Field>
        </div>
        <Field label="Helger">
          <div className="flex gap-2">
            <Pill active={answers.weekend_schedule === 'closed'} onClick={() => set('weekend_schedule', 'closed')}>Stängt</Pill>
            <Pill active={answers.weekend_schedule === 'open'} onClick={() => set('weekend_schedule', 'open')}>Öppet</Pill>
          </div>
        </Field>
      </Section>

      <Section title="Kommunikation" description="Kanaler för att nå elever">
        <div className="flex flex-wrap gap-2">
          <Pill active={answers.channels.email} onClick={() => set('channels', { ...answers.channels, email: !answers.channels.email })}>E-post</Pill>
          <Pill active={answers.channels.sms} onClick={() => set('channels', { ...answers.channels, sms: !answers.channels.sms })}>SMS</Pill>
          <Pill active={answers.channels.whatsapp} onClick={() => set('channels', { ...answers.channels, whatsapp: !answers.channels.whatsapp })}>WhatsApp</Pill>
          <Pill active={answers.channels.invoice_notifications} onClick={() => set('channels', { ...answers.channels, invoice_notifications: !answers.channels.invoice_notifications })}>Fakturaaviseringar</Pill>
        </div>
        {!answers.channels.email && !answers.channels.sms && !answers.channels.whatsapp && (
          <p className="text-xs text-amber-700 dark:text-amber-400">Ingen kanal vald — elever kan inte nås automatiskt.</p>
        )}
      </Section>

      <Section title="Ekonomi" description="Momsperiod och betalsätt">
        <p className="text-xs text-muted-foreground">Moms sätts till 25% (standard för körlektioner) — kan ändras senare under Inställningar → Företagsuppgifter.</p>
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
      </Section>
    </div>
  );
}
