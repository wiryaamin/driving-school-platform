import { useMemo } from 'react';
import { FileText, Send, Printer, Loader2, Mail, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, toast,
} from '@platform/ui';
import { useSendMessage } from '@modules/communication/hooks/useCommunication.js';
import { useSession } from '@shared/hooks/useSession.js';
import type { Student } from '@platform/types';

// ─── HTML helpers ──────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (s == null || s === '') return '—';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtPnr(dob: string | null, last4: string | null): string {
  if (!last4) return '—';
  const ymd = dob ? dob.replace(/-/g, '').slice(2, 8) : 'XXXXXX';
  return `${ymd}-${last4}`;
}

// ─── Contract template ────────────────────────────────────────────────────────

export function generateContractHtml(student: Student, orgName: string): string {
  const today      = fmtDateLong(new Date().toISOString());
  const name       = esc([student.first_name, student.last_name].filter(Boolean).join(' ') || 'Okänd elev');
  const pnr        = esc(fmtPnr(student.date_of_birth, student.personnummer_last4));
  const addr       = esc([
    student.address_line1,
    [student.postal_code, student.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', '));
  const licenceCat = esc((student.target_licence_category ?? '').toUpperCase() || '—');
  const orgEsc     = esc(orgName);

  return `<!DOCTYPE html>
<html lang="sv"><head>
<meta charset="UTF-8">
<title>Utbildningsavtal – ${name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:36px 40px;line-height:1.5}
  h1{font-size:20px;text-align:center;letter-spacing:3px;margin-bottom:4px}
  .sub{text-align:center;color:#666;font-size:11px;margin-bottom:28px}
  .section{margin-bottom:22px}
  .sec-title{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#555;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:10px}
  table{width:100%}
  td{padding:3px 0;vertical-align:top}
  td.l{width:160px;color:#666}
  td.r{font-weight:500}
  .clause{margin-bottom:14px}
  .ct{font-weight:bold;font-size:12px;margin-bottom:3px}
  .cb{color:#333;font-size:11.5px}
  .sigs{display:flex;gap:32px;margin-top:40px}
  .sig{flex:1}
  .sl{border-bottom:1px solid #222;height:36px}
  .slabel{font-size:10px;color:#666;margin-top:4px}
  .foot{margin-top:32px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:10px}
  @media print{body{padding:20px}}
</style>
</head><body>

<h1>UTBILDNINGSAVTAL</h1>
<p class="sub">Avtal om körkortsutbildning &middot; ${orgEsc} &middot; ${today}</p>

<div class="section">
  <p class="sec-title">Elev</p>
  <table>
    <tr><td class="l">Namn</td><td class="r">${name}</td></tr>
    <tr><td class="l">Personnummer</td><td class="r">${pnr}</td></tr>
    <tr><td class="l">Adress</td><td class="r">${addr}</td></tr>
    <tr><td class="l">E-post</td><td class="r">${esc(student.email)}</td></tr>
    <tr><td class="l">Telefon</td><td class="r">${esc(student.phone)}</td></tr>
    <tr><td class="l">Behörighet</td><td class="r">${licenceCat}</td></tr>
  </table>
</div>

<div class="section">
  <p class="sec-title">Avtalsvillkor</p>
  <div class="clause">
    <p class="ct">1. Utbildningens innehåll</p>
    <p class="cb">Trafikskolan åtar sig att ge eleven erforderlig utbildning för att uppnå den behörighet som anges ovan. Utbildningen sker i enlighet med Transportstyrelsens gällande krav och föreskrifter.</p>
  </div>
  <div class="clause">
    <p class="ct">2. Avbokningsregler</p>
    <p class="cb">Avbokning av bokad lektion ska ske senast 24 timmar i förväg. Vid sen avbokning eller utebliven närvaro utan giltig anledning förbehåller sig trafikskolan rätten att debitera full lektionsavgift.</p>
  </div>
  <div class="clause">
    <p class="ct">3. Betalningsvillkor</p>
    <p class="cb">Betalning sker i enlighet med trafikskolans aktuella prislista. Faktura utfärdas efter genomförd lektion om inget annat skriftligt avtalats. Förfallodag är 30 dagar från fakturadatum.</p>
  </div>
  <div class="clause">
    <p class="ct">4. Personuppgifter (GDPR)</p>
    <p class="cb">Elevens personuppgifter behandlas i enlighet med EU:s dataskyddsförordning (GDPR, 2016/679). Uppgifterna används för administration av utbildningen och raderas när lagstadgad lagringstid löpt ut. Kontakta trafikskolan för mer information om vår integritetspolicy.</p>
  </div>
  <div class="clause">
    <p class="ct">5. Ångerrätt</p>
    <p class="cb">Eleven har rätt att frånträda avtalet inom 14 dagar utan att ange skäl i enlighet med distans- och hemförsäljningslagen (2005:59). Ångerrätten gäller inte för tjänster som påbörjats med elevens uttryckliga samtycke innan ångerfristen löpt ut.</p>
  </div>
  <div class="clause">
    <p class="ct">6. Tvistlösning</p>
    <p class="cb">Tvist med anledning av detta avtal prövas i första hand av Allmänna reklamationsnämnden (ARN). Parterna äger rätt att vid oenighet hänskjuta tvisten till allmän domstol med tilllämpning av svensk rätt.</p>
  </div>
</div>

<div class="sigs">
  <div class="sig">
    <div class="sl"></div>
    <p class="slabel">Trafikskolans underskrift och stämpel &middot; ${orgEsc}</p>
  </div>
  <div class="sig">
    <div class="sl"></div>
    <p class="slabel">Elevens underskrift &middot; ${name}</p>
  </div>
</div>

<div class="foot">${orgEsc} &middot; Utskrivet ${today} &middot; Behåll detta avtal som referens.</div>

</body></html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ContractSheetProps {
  student:      Student;
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  onSent?:      () => void;
}

export function ContractSheet({ student, open, onOpenChange, onSent }: ContractSheetProps) {
  const { organization } = useSession();
  const sendMessage      = useSendMessage();
  const orgName          = organization?.name ?? 'Trafikskolan';
  const fullName         = [student.first_name, student.last_name].filter(Boolean).join(' ');
  const studentEmail     = student.email ?? '';

  const contractHtml = useMemo(
    () => generateContractHtml(student, orgName),
    // Regenerate on open so date is always today
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student.id, orgName, open],
  );

  function handlePrint() {
    const blob = new Blob([contractHtml], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function handleSend() {
    if (!studentEmail) {
      toast({ title: 'Eleven saknar e-postadress', variant: 'destructive' });
      return;
    }
    sendMessage.mutate(
      {
        channel:           'email',
        recipient_type:    'student',
        recipient_id:      student.id,
        recipient_address: studentEmail,
        subject:           `Utbildningsavtal – ${orgName}`,
        body:              contractHtml,
        metadata:          { type: 'contract', contract_type: 'utbildningsavtal' },
      },
      {
        onSuccess: () => {
          toast({ title: 'Avtal skickat', description: `Skickat till ${studentEmail}` });
          onOpenChange(false);
          onSent?.();
        },
        onError: (err) => toast({ title: 'Kunde inte skicka avtalet', description: err instanceof Error ? err.message : undefined, variant: 'destructive' }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            Nytt utbildningsavtal — {fullName}
          </DialogTitle>
        </DialogHeader>

        {/* Recipient banner */}
        <div className="px-5 py-2.5 bg-muted/30 border-b border-border shrink-0 flex items-center gap-2">
          {studentEmail ? (
            <>
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Skickas till:</span>
              <span className="text-xs font-medium">{studentEmail}</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Eleven saknar e-postadress — avtalet kan inte skickas digitalt
              </span>
            </>
          )}
        </div>

        {/* Contract preview */}
        <div className="flex-1 min-h-0 bg-white dark:bg-neutral-100">
          <iframe
            srcDoc={contractHtml}
            className="w-full h-full border-0"
            title="Förhandsgranskning av utbildningsavtal"
            sandbox="allow-same-origin"
          />
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-4 border-t border-border shrink-0 flex flex-row items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handlePrint}
          >
            <Printer className="w-3.5 h-3.5" />
            Öppna för utskrift
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={sendMessage.isPending}
            >
              Avbryt
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!studentEmail || sendMessage.isPending}
              onClick={handleSend}
            >
              {sendMessage.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
              Skicka till elev
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
