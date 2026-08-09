import { Link } from 'react-router-dom';
import { ChevronRight, Smartphone } from 'lucide-react';

// ─── Corrective pass (2026-07-25) ──────────────────────────────────────────────
//
// Full re-audit of every field this page saves to organizations.settings.teoricentralen.
// An earlier pass this session claimed the product↔license mapping ("product_links")
// was wired to real packages because the page queries package_offerings — but that
// query only populates this page's own <select> dropdown. Fresh grep across
// supabase/functions and apps/web/src confirms zero external consumers for every
// field, including product_links:
//   - modules (booking/education/directLink/bankId): StudentPortalLayout's nav is a
//     static, unconditional array — no module toggle gates any tab or the booking
//     flow. Registration has no BankID-required check tied to this setting either.
//   - theory_validity_months: no material-expiry computation anywhere reads it.
//   - exam_threshold_pct / ova_thresholds: no exam or Öva-mode pass/fail logic
//     reads either value — there is no exam-grading or Öva-scoring code that
//     consumes a configurable threshold at all.
//   - product_links: no purchase/enrollment flow grants theory-material access
//     based on this mapping; it is only used to render this page's own dropdown.
// Converted to full honest disclosure — no field on this page has a runtime
// consumer, so no interactive control is kept.

const OVA_LICENSES = [
  'B - Svenska', 'A - Svenska', 'BE - Svenska', 'B - العربية',
  'B - English', 'C1 - Svenska', 'C1E - Svenska', 'C - Svenska',
  'CE - Svenska', 'D - Svenska', 'YKB-Godstransporter - Svenska',
  'YKB-Persontransporter - Svenska', 'B - Pусский', 'Snöskoter - Svenska',
];

function NotBuilt({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-5 py-4">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function TeoricentralenPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Teoricentralen</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-teal-100 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Teoricentralen</h1>
          <p className="text-sm text-muted-foreground mt-1">Moduler, tillstånd och teorimaterial</p>
        </div>
      </div>

      <NotBuilt
        title="Moduler"
        description="Att aktivera/inaktivera bokningsmodul, utbildningsmodul, direkt bokningslänk eller krav på BankID-registrering är inte implementerat ännu — elevportalens flikar och registreringsflöde styrs inte av dessa val idag."
      />

      <NotBuilt
        title="Digital teorimaterial — giltighetstid"
        description="En konfigurerbar giltighetstid för teorimaterial efter aktivering är inte implementerad ännu — det finns ingen sådan förfallologik idag."
      />

      <NotBuilt
        title="Procentuellt tröskel på prov"
        description="En konfigurerbar godkäntgräns för prov är inte implementerad ännu — det finns ingen provrättning eller godkänt/underkänt-logik i plattformen idag."
      />

      <NotBuilt
        title="Procentuellt tröskel på Öva-delen"
        description={`Konfigurerbara godkäntgränser per körkortstyp och språk (${OVA_LICENSES.length} kombinationer) för Öva-läget är inte implementerade ännu — det finns ingen poängsättning i Öva-läget som läser ett sådant värde idag.`}
      />

      <NotBuilt
        title="Koppla teorimaterial till produkt"
        description="En koppling mellan körkortstyp och produkt som automatiskt ger eleven tillgång till teorimaterial vid köp är inte implementerad ännu — inget köp- eller anmälningsflöde beviljar åtkomst baserat på en sådan koppling idag."
      />
    </div>
  );
}
