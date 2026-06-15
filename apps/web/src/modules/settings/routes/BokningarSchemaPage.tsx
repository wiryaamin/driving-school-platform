import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── BokningarSchemaPage ──────────────────────────────────────────────────────

export function BokningarSchemaPage() {
  // Bokningsbekräftelser
  const [confirmSms,   setConfirmSms]   = useState(true);
  const [confirmEmail, setConfirmEmail] = useState(false);

  // Bokningspåminnelser
  const [reminderMode,  setReminderMode]  = useState<'specific_time' | 'hours_before'>('specific_time');
  const [reminderTime,  setReminderTime]  = useState('14:00');
  const [reminderSms,   setReminderSms]   = useState(true);
  const [reminderEmail, setReminderEmail] = useState(false);

  // Nänvarolista sortering
  const [attendanceSort, setAttendanceSort] = useState<'booking_order' | 'first_name' | 'last_name'>('booking_order');

  // Bokningsschema
  const [showFullName,   setShowFullName]   = useState(false);
  const [showDebtBadge,  setShowDebtBadge]  = useState(false);

  // Bokningslista
  const [groupDisplay,   setGroupDisplay]   = useState<'only_group' | 'both'>('only_group');
  const [daysBack,       setDaysBack]       = useState(0);

  // Resurser
  const [resourceConflict, setResourceConflict] = useState<'allow' | 'prevent'>('allow');

  function noop() { /* would call Supabase to save org.settings */ }

  return (
    <div className="max-w-xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/schema/time-templates" className="hover:text-foreground">Schema</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Bokningar</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Bokningar</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurera bokningsbokförlösus, påminnelser och visning i schema och listor.
        </p>
      </div>

      {/* ── Bokningsbekräftelser ─────────────────────────────────────────────── */}
      <Section title="Bokningsbekräftelser">
        <p className="text-xs text-muted-foreground">
          Teoricentralen skickar ut en bokningsbekräftelse till dig, eller kunden skapar en bokning.
          Välj hur du vill skicka ut bokningsbekräftelse till dine kunder.
        </p>
        <CheckRow checked={confirmSms}   onChange={setConfirmSms}   label="SMS" />
        <CheckRow checked={confirmEmail} onChange={setConfirmEmail} label="E-post" />
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Bokningspåminnelser ──────────────────────────────────────────────── */}
      <Section title="Bokningspåminnelser">
        <p className="text-xs text-muted-foreground">
          Vid ändring av påminnelsedon, exempelvis från "dagen innan kl. 13:00" till "24 timmar förre", kan det
          uppstå en övergångsperiod där vissa påminnelser inte hinner skickas ut. Det system skickar ändast
          bokningspåminnelser inom det tidsintervall du valt. Om påminnelseton ändras till 24 timmar förre, men
          bokningen startar om 16 timmar, kommer den elev som har ändrat denna tid av påminnelsedon.
          Var därför extra uppmärksam på detta vid ändring av påminnelsedon.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Hur vill du att bokningspåminnelserna ska fungera?</p>
          <RadioRow
            checked={reminderMode === 'specific_time'}
            onChange={() => setReminderMode('specific_time')}
            label="Specifik tid dagen innan"
          />
          <RadioRow
            checked={reminderMode === 'hours_before'}
            onChange={() => setReminderMode('hours_before')}
            label="Fast antal timmar innan bokning startar"
          />
        </div>

        {reminderMode === 'specific_time' && (
          <div className="space-y-2 pl-1">
            <p className="text-xs text-muted-foreground">Ange vilken tid på dagen du vill skicka ut bokningspåminnelsen.</p>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={reminderTime}
                onChange={e => setReminderTime(e.target.value)}
                className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed
                           border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Välj hur du vill skicka ut bokningspåminnelser till dine kunder:</p>
          <CheckRow checked={reminderSms}   onChange={setReminderSms}   label="SMS" />
          <CheckRow checked={reminderEmail} onChange={setReminderEmail} label="E-post" />
        </div>

        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Sortering av nänvarolistan ───────────────────────────────────────── */}
      <Section title="Sortering av nänvarolistan">
        <p className="text-xs text-muted-foreground">Här kan du konfigurera sorteringskolumnen i nänvarolistan.</p>
        <RadioRow
          checked={attendanceSort === 'booking_order'}
          onChange={() => setAttendanceSort('booking_order')}
          label="Standard (bokningsordning)"
        />
        <RadioRow
          checked={attendanceSort === 'first_name'}
          onChange={() => setAttendanceSort('first_name')}
          label="Förnamn"
        />
        <RadioRow
          checked={attendanceSort === 'last_name'}
          onChange={() => setAttendanceSort('last_name')}
          label="Efternamn"
        />
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Anpassa text på export ───────────────────────────────────────────── */}
      <Section title="Anpassa text på export av elevens bokningar">
        <p className="text-xs text-muted-foreground">
          Här har du möjlighet att skriva en text som visas när du exporterar elevens bokningar
        </p>
        <div className="rounded-md border border-border bg-background overflow-hidden">
          {/* Simple toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30">
            {['Paragraf', 'B', 'I', '❝', '≡', '○', '⊞', '⊞', '🔗', '⊕'].map((t, i) => (
              <button
                key={i}
                type="button"
                className={cn(
                  'px-2 py-1 text-xs rounded hover:bg-accent transition-colors text-muted-foreground',
                  i === 0 && 'text-foreground border border-border'
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            rows={5}
            className="w-full px-3 py-2 text-sm bg-background text-foreground resize-y
                       focus:outline-none placeholder:text-muted-foreground/50"
            placeholder="Skriv din text här..."
          />
        </div>
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Bokningsschema ───────────────────────────────────────────────────── */}
      <Section title="Bokningsschema">
        <RadioRow
          checked={showFullName}
          onChange={() => setShowFullName(true)}
          label="Visa kundernas fullständiga namn i bokningsschemat."
        />
        <RadioRow
          checked={showDebtBadge}
          onChange={() => setShowDebtBadge(true)}
          label="Visa en varningssikon i bokningsschemat när en elev/id/bokad kund har en skuld."
        />
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Bokningslista ────────────────────────────────────────────────────── */}
      <Section title="Bokningslista">
        <p className="text-xs text-muted-foreground">
          Hur vill du att tidsluckor i grupper ska visas i bokningslistan?
        </p>
        <RadioRow
          checked={groupDisplay === 'only_group'}
          onChange={() => setGroupDisplay('only_group')}
          label="Visa tidsluckorna endast i tidgruppen"
        />
        <RadioRow
          checked={groupDisplay === 'both'}
          onChange={() => setGroupDisplay('both')}
          label="Visa tidluckorna utanför och i tidgruppen"
        />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Ange hur många dagar bakåt i tiden som bokningslistan ska visa i standardläge.
            Det betyder att den börjar från dagens datum.
          </p>
          <input
            type="number"
            value={daysBack}
            min={0}
            max={365}
            onChange={e => setDaysBack(Number(e.target.value))}
            className="w-24 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <SaveBtn onClick={noop} />
      </Section>

      {/* ── Resurser ─────────────────────────────────────────────────────────── */}
      <Section title="Resurser">
        <p className="text-xs text-muted-foreground">
          Hantering av kolliderande resurser vid bokning av elever efter flytt av bokade tider:
        </p>
        <RadioRow
          checked={resourceConflict === 'prevent'}
          onChange={() => setResourceConflict('prevent')}
          label='Förhindra manuell överbookning via "schemalägg ändå"'
        />
        <RadioRow
          checked={resourceConflict === 'allow'}
          onChange={() => setResourceConflict('allow')}
          label='Tillåt manuell överbookning via "schemalägg ändå"'
        />
        <SaveBtn onClick={noop} />
      </Section>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      {children}
    </div>
  );
}

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-border accent-primary w-4 h-4"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function RadioRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-primary w-4 h-4 shrink-0"
      />
      <span className="text-sm text-foreground leading-snug">{label}</span>
    </label>
  );
}

function SaveBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={onClick}>
        Spara
      </Button>
    </div>
  );
}
