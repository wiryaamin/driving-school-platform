import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ChevronRight } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── CheckRow ─────────────────────────────────────────────────────────────────

function CheckRow({
  checked, onChange, label, sub,
}: {
  checked:  boolean;
  onChange: (v: boolean) => void;
  label:    string;
  sub?:     string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-border accent-primary w-4 h-4 mt-0.5 shrink-0"
      />
      <span className="space-y-0.5">
        <span className="block text-sm text-foreground leading-snug">{label}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </label>
  );
}

function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
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

function NumberInput({ value, onChange, min, max, suffix }: {
  value:    number;
  onChange: (v: number) => void;
  min:      number;
  max:      number;
  suffix?:  string;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                   focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </span>
  );
}

// ─── ElevbokningConfigPage ────────────────────────────────────────────────────

export function ElevbokningConfigPage() {
  // ── Ekonomiöversikt ─────────────────────────────────────────────────────────
  const [showPrevPerm,    setShowPrevPerm]    = useState(false);
  const [balanceDisplay,  setBalanceDisplay]  = useState('debt_today');

  // ── Betalning ───────────────────────────────────────────────────────────────
  const [allowCardPay,    setAllowCardPay]    = useState(false);

  // ── Bokningar ───────────────────────────────────────────────────────────────
  const [emailBookReq,    setEmailBookReq]    = useState(false);
  const [useDiscountCodes,setUseDiscountCodes]= useState(false);
  const [limitBooking,    setLimitBooking]    = useState(true);
  const [bookRestriction, setBookRestriction] = useState<'balance' | 'negative' | 'credit'>('credit');
  const [minHoursLesson,  setMinHoursLesson]  = useState(0);
  const [minHoursCourse,  setMinHoursCourse]  = useState(0);

  // ── Aktiviteter ──────────────────────────────────────────────────────────────
  const [allowCancel,     setAllowCancel]     = useState(true);
  const [cancelHours,     setCancelHours]     = useState(24);
  const [cancelLesson,    setCancelLesson]    = useState(true);
  const [cancelCourse,    setCancelCourse]    = useState(false);
  const [respectHolidays, setRespectHolidays] = useState(true);

  // ── Utbildningskort ──────────────────────────────────────────────────────────
  const [educationCard,   setEducationCard]   = useState<'standard' | 'detailed'>('detailed');

  // ── Elevbokning (original) ───────────────────────────────────────────────────
  const [maxUpcoming,     setMaxUpcoming]     = useState(20);
  const [minHoursBefore,  setMinHoursBefore]  = useState(1);
  const [weeksAhead,      setWeeksAhead]      = useState(12);
  const [showPrices,      setShowPrices]      = useState(true);
  const [requireBalance,  setRequireBalance]  = useState(false);

  // ── Avbokning ────────────────────────────────────────────────────────────────
  const [cancelMode,  setCancelMode]  = useState<'specific_time' | 'hours_before'>('specific_time');
  const [dayMode,     setDayMode]     = useState<'same_day' | 'weekday_before'>('same_day');
  const [cancelTime,  setCancelTime]  = useState('13:00');

  // ── Avbokningsmeddelanden ────────────────────────────────────────────────────
  const [notifyInstructor, setNotifyInstructor] = useState(false);
  const [staffSearch,      setStaffSearch]      = useState('');

  function stub() { /* wire to org settings mutation */ }

  return (
    <div className="max-w-xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/student-booking/services" className="hover:text-foreground">Elevbokning</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Inställningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="flex flex-col items-center text-center gap-2 py-4">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Settings className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Inställningar</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurera regler för elevbokning, elevavbokning och avbokningsmeddelanden.
        </p>
      </div>

      {/* ── Ekonomiöversikt på Elevsidan ─────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Ekonomiöversikt på Elevsidan</h2>

        <CheckRow
          checked={showPrevPerm}
          onChange={setShowPrevPerm}
          label="Se transaktioner på tidigare genomförda behörigheter"
        />

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Belopp som ska betalas på Elevsidan</label>
          <select
            value={balanceDisplay}
            onChange={e => setBalanceDisplay(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
          >
            <option value="debt_today">Visa skuld per idag</option>
            <option value="total_balance">Visa totalt saldo</option>
            <option value="upcoming_cost">Visa kostnad för kommande bokningar</option>
          </select>
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Betalning ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Betalning</h2>

        <CheckRow
          checked={allowCardPay}
          onChange={setAllowCardPay}
          label="Tillåt betalning med kort på elevsidan"
        />

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Bokningar ────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Bokningar</h2>

        <CheckRow
          checked={emailBookReq}
          onChange={setEmailBookReq}
          label="Skicka e-post för bokningsförfrågningar via Elevsidan på tctabs.se"
        />
        <CheckRow
          checked={useDiscountCodes}
          onChange={setUseDiscountCodes}
          label="Skolan använder rabattkoder"
        />
        <CheckRow
          checked={limitBooking}
          onChange={setLimitBooking}
          label="Begränsa bokningen på Elevsidan på tctabs.se"
        />

        {limitBooking && (
          <div className="pl-6 space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Begränsningen påverkar inte möjligheten att beställa paket.
            </p>
            <div className="space-y-3">
              <Radio
                checked={bookRestriction === 'balance'}
                onChange={() => setBookRestriction('balance')}
                label="Eleven kan endast beställa varor om det finns täckning (oanvänt lektionssaldo) på elevens konto"
              />
              <Radio
                checked={bookRestriction === 'negative'}
                onChange={() => setBookRestriction('negative')}
                label="Tillåt inte bokningar via Elevsidan om eleven har ett negativt saldo"
              />
              <Radio
                checked={bookRestriction === 'credit'}
                onChange={() => setBookRestriction('credit')}
                label="Tillåt inte bokning om eleven har överskridit kreditgränsen (gäller elever anslutna till ett företag)"
              />
            </div>

            <div className="space-y-3 pt-1 border-t border-border/40">
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground flex-1">Tillåt körtidsbokning till</span>
                <NumberInput value={minHoursLesson} onChange={setMinHoursLesson} min={0} max={168} suffix="timmar innan aktiviteten startar." />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-foreground flex-1">Tillåt kursbokning till</span>
                <NumberInput value={minHoursCourse} onChange={setMinHoursCourse} min={0} max={168} suffix="timmar innan aktiviteten startar." />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Aktiviteter ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Aktiviteter</h2>

        <CheckRow
          checked={allowCancel}
          onChange={setAllowCancel}
          label="Elever kan avboka aktiviteter på Elevsidan på tctabs.se"
        />

        {allowCancel && (
          <div className="pl-6 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground">Tillåt avbokningar till</span>
              <NumberInput value={cancelHours} onChange={setCancelHours} min={0} max={168} suffix="timmar innan aktiviteten startar." />
            </div>

            <CheckRow
              checked={cancelLesson}
              onChange={setCancelLesson}
              label="Tillåt avbokningar på körlektioner (*)"
            />
            <CheckRow
              checked={cancelCourse}
              onChange={setCancelCourse}
              label="Tillåt avbokningar på kursartiklar (*)"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              *Gäller vardagar. (T.ex. avbokningsfrist 24 timmar. Har eleven en lektion kl. 8 måste den avbokas senast fredag kl. 8)
            </p>
            <p className="text-xs text-muted-foreground">
              Avbokning är inte tillåten för körprovsaktiviteter
            </p>
            <CheckRow
              checked={respectHolidays}
              onChange={setRespectHolidays}
              label="Avbokningsfrist ska ta hänsyn till helger och röda dagar"
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Utbildningskort på Elevsidan ─────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Utbildningskort på Elevsidan tctabs.se</h2>

        <div className="space-y-3">
          <Radio
            checked={educationCard === 'standard'}
            onChange={() => setEducationCard('standard')}
            label="Standard: Visa status för genomförd obligatorisk utbildning."
          />
          <Radio
            checked={educationCard === 'detailed'}
            onChange={() => setEducationCard('detailed')}
            label="Detaljerad: Se alla aktiviteter med tillhörande utbildningsdelar med kommentar."
          />
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Elevbokning (original) ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Elevbokning</h2>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Ange hur många uppkommande bokningar en kund kan ha samtidigt.
          </p>
          <input
            type="number" value={maxUpcoming} min={1} max={99}
            onChange={e => setMaxUpcoming(Number(e.target.value))}
            className="w-24 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Ange minsta tid (i timmar) innan bokning kan göras.
          </p>
          <input
            type="number" value={minHoursBefore} min={0} max={168}
            onChange={e => setMinHoursBefore(Number(e.target.value))}
            className="w-24 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Ange hur många veckor i framtiden bokningsbara tider ska visas.
          </p>
          <input
            type="number" value={weeksAhead} min={1} max={52}
            onChange={e => setWeeksAhead(Number(e.target.value))}
            className="w-24 h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
          />
        </div>

        <CheckRow checked={showPrices} onChange={setShowPrices} label="Visa priser i elevbokning" />
        <CheckRow
          checked={requireBalance}
          onChange={setRequireBalance}
          label="Tillåt endast bokningar som kan täckas av innestående lektionssaldo"
        />

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Avbokning och Ombokning ──────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Avbokning och Ombokning</h2>
        <p className="text-xs text-muted-foreground">Hur vill du att avbokningar ska fungera?</p>

        <div className="space-y-2">
          <Radio checked={cancelMode === 'specific_time'} onChange={() => setCancelMode('specific_time')} label="Tillåt avbokningar upp till specifik tid på vardagar eller varje dag" />
          <Radio checked={cancelMode === 'hours_before'}  onChange={() => setCancelMode('hours_before')}  label="Tillåt avbokningar upp till fast antal timmar innan bokning" />
        </div>

        {cancelMode === 'specific_time' && (
          <div className="space-y-3 pl-1">
            <div className="space-y-2">
              <Radio checked={dayMode === 'same_day'}       onChange={() => setDayMode('same_day')}       label="Dagen innan" />
              <Radio checked={dayMode === 'weekday_before'} onChange={() => setDayMode('weekday_before')} label="Vardagen innan" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Ange vilken tid som dina kunder senast kan avboka.</p>
              <input
                type="time"
                value={cancelTime}
                onChange={e => setCancelTime(e.target.value)}
                className="h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        )}

        <label className={cn('flex items-center gap-2', 'cursor-not-allowed opacity-50')}>
          <input type="checkbox" disabled className="rounded border-border accent-primary w-4 h-4" />
          <span className="text-sm text-foreground">
            Tillåt elever att boka om till en annan tid på samma lektionstyp{' '}
            <span className="text-muted-foreground text-xs">(Kommer snart)</span>
          </span>
        </label>

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>

      {/* ── Avbokningsmeddelanden ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-primary">Avbokningsmeddelanden</h2>
        <p className="text-xs text-muted-foreground">Systemet kan skicka ut en notifikation när en elevavbokning sker.</p>

        <CheckRow checked={notifyInstructor} onChange={setNotifyInstructor} label="Skicka alltid till huvudläraren på bokningen" />

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Om du önskar att notifikationen även ska skickas till andra personer.</p>
          <input
            type="text"
            value={staffSearch}
            onChange={e => setStaffSearch(e.target.value)}
            placeholder="Sök efter personal..."
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={stub}>
            Spara
          </Button>
        </div>
      </div>
    </div>
  );
}
