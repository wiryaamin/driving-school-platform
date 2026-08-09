import { Link } from 'react-router-dom';
import { ChevronRight, Settings } from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@platform/ui';

// ─── Audit finding ─────────────────────────────────────────────────────────────
//
// All 9 fields on this page saved to organizations.settings.system, a JSONB
// blob with zero consumers. Checked for a real underlying system for each:
//   - bank_id ("BankID för personal"): BankidLogin already renders
//     unconditionally on the login page (LoginPage.tsx) for every account
//     type — there is no org-level gate to wire this toggle to. Gating it
//     would require looking up an organization before the user is
//     authenticated (a pre-auth org lookup), which is new functionality, not
//     wiring existing configuration.
//   - cross_dept_search: no location-scoped student/company search exists
//     anywhere in the students module.
//   - lock_days: a real period-lock mechanism DOES exist (ledger PERIOD_LOCKED,
//     Ekonomi → Bokslut) but it is fundamentally different — explicit
//     from_date/to_date periods closed by an action, not a rolling
//     "N days old" auto-lock. The two aren't the same capability.
//   - allow_pay_date: there is no manual "register a payment" form anywhere
//     in the frontend — payments are created via the Stripe/Nets webhook
//     flow, not a form with an editable date field.
//   - edit_price_role / credit_role: no role check gates price, discount, or
//     credit editing anywhere in the invoices Edge Function.
//   - afternoon_time: package_catalog only has flat price/default_price
//     columns — no time-of-day pricing variation exists.
//   - credit_limit / block_sales_over: students has no credit_limit column
//     and no sale/booking flow checks one.
// None of these have an existing backend to wire into. Removed the fake
// toggles/inputs entirely rather than leaving controls that silently saved
// to nothing.

function NotBuilt({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader className="pb-0 px-5 pt-5">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-4">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SysteminställningarPage() {
  return (
    <div className="max-w-xl space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Systeminställningar</span>
        </nav>
      </div>

      {/* Page header card */}
      <Card>
        <CardContent className="p-10 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Settings className="w-7 h-7 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Systeminställningar</h1>
            <p className="text-sm text-muted-foreground mt-1">Hantera systeminställningar för inloggning och säkerhet.</p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground -mt-2">
        Logotyp hanteras under <Link to="/settings/website/brand" className="text-primary hover:underline">Webbplats → Varumärke</Link>.
        Låsning av bokföringsperioder hanteras under <Link to="/finance/close" className="text-primary hover:underline">Ekonomi → Bokslut</Link>.
      </p>

      <NotBuilt
        title="Inloggning — Mobilt BankID för personal"
        description="Ett organisationsval för att aktivera/inaktivera BankID-inloggning för personal är inte implementerat ännu — BankID-inloggning visas redan idag för alla kontotyper på inloggningssidan, oavsett organisation."
      />

      <NotBuilt
        title="Sök efter student/företag över avdelningar"
        description="Avdelnings-/platsbaserad sökning är inte implementerad ännu — elev- och företagssökningar är inte begränsade per plats idag."
      />

      <NotBuilt
        title="Inställningar för försäljning och betalningar"
        description="Låsning av redigering på gamla försäljningar/aktiviteter (rullande antal dagar), valfritt betalningsdatum vid registrering, samt rollstyrd behörighet för pris-, rabatt- och krediteringsändringar är inte implementerade ännu. Bokföringsperioder kan däremot redan låsas explicit via Ekonomi → Bokslut."
      />

      <NotBuilt
        title="Eftermiddagspris"
        description="Tidsstyrt pris (annat pris efter en viss klockslag) är inte implementerat ännu — produktkatalogen har endast ett fast pris per artikel/paket idag."
      />

      <NotBuilt
        title="Kreditgräns"
        description="Standardkreditgräns per elev och blockering av försäljning över gränsen är inte implementerade ännu — det finns inget kreditgränsfält på elever och ingen sådan kontroll i köpflödet idag."
      />

    </div>
  );
}
