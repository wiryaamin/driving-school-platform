import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils.js';

// ─── Audit finding ─────────────────────────────────────────────────────────────
//
// This page saved enabled/web_aliases/web_cats/cat_colors/arkivera_teori/message
// to organizations.settings.licenses, a JSONB blob with zero consumers. Checked
// for a real underlying system for each:
//
//   - Licenskatalog (enabled/web_aliases/web_cats/cat_colors): the real,
//     currently-used behörighet list lives in StudentForm.tsx as an
//     independent hardcoded BEHÖRIGHET_OPTIONS constant — 19 entries, feeding
//     students.target_licence_category directly. It is NOT the same catalog
//     as this page's ~50-entry LICENSE_GROUPS, and critically the codes don't
//     match for the same license (e.g. 'B_manual'/'risk1_b' here vs.
//     'B_MAN'/'RISK1B' there). This page's enable/disable toggle has never
//     affected which behörighet a student can be assigned. Unifying the two
//     catalogs would mean migrating the codes already stored on real student
//     records (student_permit_milestones.licence_category is free-text, not
//     FK-constrained) — a data-affecting change, not a config-wiring one, so
//     it needs a separate, explicit decision rather than being folded into
//     this commissioning pass. The table below is kept as a read-only Swedish
//     driving-license reference; the checkboxes/inputs that implied it
//     controlled something are removed.
//   - Teorimaterial (arkivera_teori — archive theory material on license
//     completion): no archival trigger exists on permit-milestone completion
//     anywhere in event-worker.
//   - Meddelande när behörighet slutförs (send_sms/send_email/subject/body):
//     no "licence_issued" notification trigger exists in notification_rules
//     or event-worker — this is a different event than the already-defined
//     but also-unfired 'permit_expiring' trigger.

const LICENSE_GROUPS: { group: string; licenses: { label: string; abbr: string }[] }[] = [
  { group: 'Personbil', licenses: [
    { label: 'Behörighet BMan', abbr: 'BMan' },
    { label: 'Behörighet BAut', abbr: 'BAut' },
    { label: 'Utökad B',        abbr: 'Utökad' },
    { label: 'Behörighet BE',   abbr: 'BE' },
  ]},
  { group: 'Motorcykel/moped', licenses: [
    { label: 'Behörighet A',       abbr: 'A' },
    { label: 'Behörighet A1',      abbr: 'A1' },
    { label: 'Behörighet A2',      abbr: 'A2' },
    { label: 'Behörighet AM',      abbr: 'AM' },
    { label: 'Förarbevis - Moped', abbr: 'MopedKI' },
  ]},
  { group: 'Lastbil', licenses: [
    { label: 'Behörighet C',   abbr: 'C' },
    { label: 'Behörighet C1E', abbr: 'C1E' },
    { label: 'Behörighet C1',  abbr: 'C1' },
    { label: 'Behörighet CE',  abbr: 'CE' },
  ]},
  { group: 'Buss', licenses: [
    { label: 'Behörighet D',   abbr: 'D' },
    { label: 'Behörighet DE',  abbr: 'DE' },
    { label: 'Behörighet D1E', abbr: 'D1E' },
    { label: 'Behörighet D1',  abbr: 'D1' },
  ]},
  { group: 'Traktor',    licenses: [{ label: 'Behörighet T', abbr: 'Tr' }]},
  { group: 'Snöskoter',  licenses: [{ label: 'Behörighet S', abbr: 'S' }]},
  { group: 'Yrkesförare', licenses: [
    { label: 'YKB Persontransport',              abbr: 'G YKB P' },
    { label: 'YKB Godstransport',                abbr: 'G YKB G' },
    { label: 'YKB Fortbildning persontransport', abbr: 'F YKB P' },
    { label: 'YKB Fortbildning godstransport',   abbr: 'F YKB G' },
  ]},
  { group: 'Övrigt', licenses: [
    { label: 'Riskettan A',       abbr: 'Risk1 A' },
    { label: 'Riskettan B',       abbr: 'Risk1 B' },
    { label: 'Risktvåan A',       abbr: 'Risk2 A' },
    { label: 'Risktvåan B',       abbr: 'Risk2 B' },
    { label: 'Introduktionskurs', abbr: 'Intro' },
    { label: 'Terränghjuling',    abbr: 'Terrän' },
    { label: 'Taxi',              abbr: 'Taxi' },
    { label: 'ADR Grund',         abbr: 'ADR Gr' },
    { label: 'ADR Repetition',    abbr: 'ADR rep' },
  ]},
];

function NotBuilt({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function UtbildningsbehörigheterPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Utbildningsbehörigheter</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-red-100 text-red-500 flex items-center justify-center"><GraduationCap className="w-6 h-6" /></div>
        <h1 className="text-lg font-semibold text-foreground">Utbildningsbehörigheter</h1>
        <p className="text-sm text-muted-foreground">Referens över svenska körkortsbehörigheter.</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-amber-800 dark:text-amber-300">
          <p className="font-medium">Listan nedan styr inte vilken behörighet som kan väljas för en elev</p>
          <p className="text-xs leading-relaxed">
            Elevens behörighet väljs från en egen, fast lista i elevformuläret med andra koder än de som visas här.
            Att slå ihop de två listorna kräver att befintliga elevers sparade behörighetskoder migreras — det är en
            databeslutsfråga, inte en inställning, och görs inte i denna omgång.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground">Körkortsbehörigheter</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Behörighet</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Förkortning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {LICENSE_GROUPS.map(({ group, licenses }) => (
              <>
                <tr key={`group-${group}`} className="bg-muted/10">
                  <td colSpan={2} className="px-4 py-2 text-xs font-bold text-foreground uppercase tracking-wide border-y border-border/60">{group}</td>
                </tr>
                {licenses.map(lt => (
                  <tr key={lt.label} className={cn('transition-colors hover:bg-accent/10')}>
                    <td className="px-4 py-2 font-medium text-foreground">{lt.label}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{lt.abbr}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <NotBuilt
        title="Teorimaterial"
        description="Automatisk arkivering av teorimaterial när en behörighet slutförs är inte implementerad ännu — ingen sådan händelse finns i systemet idag."
      />

      <NotBuilt
        title="Meddelande när behörighet slutförs"
        description="Ett meddelande (SMS/e-post) som skickas när en elevs behörighet slutförts är inte implementerat ännu — det finns ingen händelse eller notisregel kopplad till slutförd behörighet idag."
      />
    </div>
  );
}
