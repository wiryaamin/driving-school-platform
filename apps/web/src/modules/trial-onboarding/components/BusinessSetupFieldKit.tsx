import { Input } from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  CURRENT_YEAR, FUEL_TYPE_OPTIONS,
  type VehicleEntry, type InstructorEntry, type StaffEntry, type BranchEntry,
} from '../lib/businessSetupAnswers.js';

// ─── Shared presentational field kit ───────────────────────────────────────
//
// Extracted verbatim from TrialOnboardingWizardPage.tsx (2026-08-28, Tenant
// Registration Unification) so Platform Admin's BusinessSetupSection can
// collect the exact same canonical fields with the exact same markup,
// instead of a second, drifting reimplementation. The wizard itself now
// imports from here too — no behavior change to the self-service flow.

export const selectCls = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground';

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

export function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

// Every entry card's internal field grid below is grid-cols-1 sm:grid-cols-2
// (Starta provperiod pre-deployment verification, 2026-08-30, "mobile") —
// was a fixed grid-cols-2 with no responsive breakpoint, unlike the
// wizard's own top-level field grids, so two columns squeezed onto a
// 390px-wide screen and labels overlapped (e.g. "Registreringsnummer" and
// "Årsmodell" ran together). Purely a layout fix — no field, validation, or
// data-shape change.
export function VehicleEntryCard({ index, entry, onChange }: { index: number; entry: VehicleEntry; onChange: (patch: Partial<VehicleEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Fordon {index + 1}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Registreringsnummer *">
          <Input value={entry.registration_number} onChange={(e) => onChange({ registration_number: e.target.value.toUpperCase() })} placeholder="ABC123" maxLength={10} className="uppercase" />
        </Field>
        <Field label="Årsmodell *">
          <Input type="number" min={1990} max={CURRENT_YEAR + 1} value={entry.model_year} onChange={(e) => onChange({ model_year: Number(e.target.value) || CURRENT_YEAR })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Märke *"><Input value={entry.make} onChange={(e) => onChange({ make: e.target.value })} placeholder="Volvo" /></Field>
        <Field label="Modell *"><Input value={entry.model} onChange={(e) => onChange({ model: e.target.value })} placeholder="V60" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Registrering giltig t.o.m. *"><Input type="date" value={entry.registration_expires_at} onChange={(e) => onChange({ registration_expires_at: e.target.value })} /></Field>
        <Field label="Försäkring giltig t.o.m. *"><Input type="date" value={entry.insurance_expires_at} onChange={(e) => onChange({ insurance_expires_at: e.target.value })} /></Field>
      </div>
    </div>
  );
}

export function InstructorEntryCard({ index, entry, onChange }: { index: number; entry: InstructorEntry; onChange: (patch: Partial<InstructorEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Instruktör {index + 1}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Förnamn *"><Input value={entry.first_name} onChange={(e) => onChange({ first_name: e.target.value })} /></Field>
        <Field label="Efternamn *"><Input value={entry.last_name} onChange={(e) => onChange({ last_name: e.target.value })} /></Field>
      </div>
      <Field label="E-post *"><Input type="email" value={entry.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="namn@trafikskola.se" /></Field>
      <Field label="Telefon"><Input value={entry.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Valfritt" /></Field>
    </div>
  );
}

export function StaffEntryCard({ label, index, entry, onChange }: { label: string; index: number; entry: StaffEntry; onChange: (patch: Partial<StaffEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">{label} {index + 1}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Förnamn *"><Input value={entry.first_name} onChange={(e) => onChange({ first_name: e.target.value })} /></Field>
        <Field label="Efternamn *"><Input value={entry.last_name} onChange={(e) => onChange({ last_name: e.target.value })} /></Field>
      </div>
      <Field label="E-post *"><Input type="email" value={entry.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="namn@trafikskola.se" /></Field>
    </div>
  );
}

export function BranchEntryCard({ index, entry, onChange }: { index: number; entry: BranchEntry; onChange: (patch: Partial<BranchEntry>) => void }) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Filial {index + 2}</p>
      <Field label="Namn *"><Input value={entry.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="T.ex. Filial Solna" /></Field>
      <Field label="Gatuadress *"><Input value={entry.address_line1} onChange={(e) => onChange({ address_line1: e.target.value })} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Postnummer *"><Input value={entry.postal_code} onChange={(e) => onChange({ postal_code: e.target.value })} placeholder="111 22" /></Field>
        <Field label="Ort *"><Input value={entry.city} onChange={(e) => onChange({ city: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Telefon"><Input value={entry.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="Valfritt" /></Field>
        <Field label="E-post"><Input type="email" value={entry.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="Valfritt" /></Field>
      </div>
    </div>
  );
}
