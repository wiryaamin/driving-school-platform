import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';

// ─── Audit finding ─────────────────────────────────────────────────────────────
//
// Every control this page used to expose (auto_password, pass_sms, pass_email,
// include_app_link, auto_control, archive_weeks, bankid_staff, blankett_text)
// saved to organizations.settings.customers, a JSONB blob with zero consumers
// anywhere in the codebase. Checked for a real underlying system for each:
//   - Credential delivery (auto_password/pass_sms/pass_email/include_app_link):
//     no admin.createUser/generateLink/invite flow exists for students or
//     guardians — portal access is BankID-based, not password-based.
//   - Auto-control (remove from "new customers" on order completion): no
//     automatic status transition exists; students.status only changes via
//     explicit staff action in the students Edge Function.
//   - Auto-archival by inactivity (archive_weeks): no scheduled job archives
//     students; archiving is a manual, explicit staff action.
//   - BankID registration staff notify (bankid_staff): no bankid-related
//     trigger_event exists in notification_rules, no notify call in
//     useBankidLogin — the staff picker had a real instructors query behind
//     it, but selecting a name never triggered anything.
//   - Enrollment form text (blankett_text): no enrollment/checkout surface
//     renders org-supplied text anywhere.
//
// None of these have an existing backend to wire into — building one would be
// new functionality, not commissioning existing configuration. Following the
// same disclosure convention this page already used for "Efterregistrera"
// (below), each is now an honest "not implemented" notice instead of a
// control that silently saved to nothing.

function NotBuilt({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export function KundinställningarPage() {
  return (
    <div className="max-w-xl space-y-8">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kundinställningar</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Kundinställningar</h1>
        <p className="text-sm text-muted-foreground">Hantera autoinställningar för användaren och registrering.</p>
      </div>

      <NotBuilt
        title="Automatiskt lösenord vid registrering"
        description="Denna funktion är inte implementerad ännu. Elev- och vårdnadshavarinloggning sker via Mobilt BankID i denna plattform — det finns inget lösenordsbaserat kontoflöde att koppla på/av eller leverera via SMS/e-post."
      />

      <NotBuilt
        title="Kontrollera kunder"
        description="Automatisk borttagning från listan 'nya kunder' vid ordersslutförande är inte implementerad ännu. Kundstatus ändras endast genom en uttrycklig åtgärd av personal."
      />

      <NotBuilt
        title="Konfigurera automatisk arkivering"
        description="Automatisk arkivering av inaktiva kunder efter ett antal veckor är inte implementerad ännu. Arkivering sker endast genom en uttrycklig åtgärd av personal, oavsett saldo, behörighet eller bokningsstatus."
      />

      <NotBuilt
        title="Notifikationer vid registrering med Mobilt BankID"
        description="Att meddela utvald personal när en kund registrerar sig med Mobilt BankID är inte implementerat ännu — det finns ingen händelse eller notisregel kopplad till BankID-registrering idag."
      />

      <NotBuilt
        title="Innehåll i anmälningsblankett"
        description="Anpassat textinnehåll till elevens anmälningsblankett är inte implementerat ännu — inget anmälnings- eller kassaflöde visar organisationsspecifik text idag."
      />

      <NotBuilt
        title="Efterregistrera examinerade moment automatiskt"
        description="Denna funktion — en engångs- och permanent efterregistrering av examinationsmoment baserat på historisk närvaro — är inte implementerad ännu. Ingen bakåtgående ändring görs förrän den byggts och godkänts separat, givet att åtgärden är oåterkallelig och rör elevers utbildningsdata."
      />
    </div>
  );
}
