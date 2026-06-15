import { useState, type ReactNode } from 'react';
import {
  LayoutList, Plus, RotateCcw, Eye, Send, Upload,
  Bold, Italic, Underline, AlignJustify, List as ListIcon, ListOrdered,
  Info, FileText,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type KommTab = 'sms' | 'epost' | 'meddelande' | 'dokumentsignering' | 'mallar';

interface MsgTemplate {
  id:      string;
  name:    string;
  subject: string;
  body:    string;
}

interface EmailSig {
  id:    string;
  name:  string;
  email: string;
}

interface DocTpl {
  id:              number;
  title:           string;
  active:          boolean;
  hasFullControls: boolean;
}

interface StudentavtalPrefill {
  rubrik:     string;
  filnamn:    string;
  allChecked: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { key: KommTab; label: string; badge?: number }[] = [
  { key: 'sms',               label: 'SMS' },
  { key: 'epost',             label: 'E-post' },
  { key: 'meddelande',        label: 'Meddelande', badge: 2 },
  { key: 'dokumentsignering', label: 'Dokumentsignering' },
  { key: 'mallar',            label: 'Mallar' },
];

const FILTER_PILLS = [
  'Kurs', 'Födelsedag', 'Elever', 'Behörigheter', 'Anställda',
  'Artikelns väntelista', 'Behörighetens väntelista',
  'Saknar försäljning', 'Utestående belopp', 'Elevlista', 'Körprov',
];

const DYNAMIC_FIELDS = ['FORNAMN', 'EFTERNAMN', 'SALDO', 'DATUM', 'TID', 'LÄRARE', 'PLATS'];

const SMS_TOTAL_LIMIT = 1300;

const INITIAL_DOC_TPLS: DocTpl[] = [
  { id: 114, title: 'Skolans villkor',                  active: true,  hasFullControls: true  },
  { id: 115, title: 'Skolereglement (english version)', active: false, hasFullControls: false },
  { id: 116, title: 'Ekonomiskt ansvar',                active: false, hasFullControls: false },
  { id: 117, title: 'Finansiell avräkningsblankett',    active: false, hasFullControls: false },
];

const SKOLANS_VILLKOR_CONTENT = `Acceptera avtalsvillkor

Genom att skriva in dig på trafikskolan blir du kund och användare av våra tjänster och accepterar därmed dessa avtalsvillkor.

Minderårig

Om du är under 18 år måste du enligt lag ha dina föräldrars eller annan förmyndares samtycke för att gå med på våra avtalsvillkor.

Innan inskrivning kan ske måste du kunna uppvisa för trafikskolan ett skriftligt intyg undertecknat från dina vårdnadshavare/förmyndare, om samtycket inte kan skaffas på annat godtagbart sätt.

Personligt konto via Elevcentralen

Ditt konto är personligt. Inloggning och lösenord skall användas av dig, du har själv ansvar för att skydda detta.

E6 Trafikskola är inte ansvariga för eventuell skada som uppstått om någon annan utomstående loggar in och använder ditt konto.

Som kund har du tillgång till Elevcentralen och dess tjänster under hela din utbildning.

E6 Trafikskola förbehåller sig rätten att stänga av kontot vid missbruk av tjänsten.

Dina personuppgifter

Enligt den nya lagen GDPR så krävs det ett samtycke ifrån dig som elev hos oss att vi lagrar dina personuppgifter.

Detta gör vi i 7 år pga. bokföringsskäl. Vi är väldigt måna om dina personuppgifter och du kan när du vill återkalla ditt samtycke.

Priser och betalning

Aktuella priser hittar du på vår webbplats. Priserna kan komma att ändras under utbildningens gång.

För att kunna tillgodoräkna sig rabatterna i våra startpaket krävs förskottsbetalning.

Giltigheten av alla startpaket är ett (1) år från betalningsdatum och berörs ej av eventuella prisändringar.

Vi tar emot betalningar via bankgiro, bankkort och kontant.`;

const DEFAULT_SMS_SIGN_TEXT =
  'Hej [FORNAMN], du har fått ett avtal att signera från [SKOLNAMN]. ' +
  'Klicka på länken för att signera: [LÄNK] — Detta SMS kan inte besvaras.';

const SIGN_SMS_FIELDS = ['FORNAMN', 'LÄNK', 'SKOLNAMN', 'AVTALSNAMN'];

let _idCtr = 0;
function mkId() { return String(++_idCtr); }

// ─── Shared: toolbar button ───────────────────────────────────────────────────

function ToolbarBtn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      className="p-1.5 rounded hover:bg-accent text-muted-foreground focus:outline-none"
    >
      {children}
    </button>
  );
}

// ─── Shared: rich text area ───────────────────────────────────────────────────

function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 6,
}: {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  rows?:        number;
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden bg-background">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/20">
        <ToolbarBtn title="Fetstil (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn title="Kursiv (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn title="Understruken (Ctrl+U)"><Underline className="w-3.5 h-3.5" /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn title="Justering"><AlignJustify className="w-3.5 h-3.5" /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn title="Punktlista"><ListIcon className="w-3.5 h-3.5" /></ToolbarBtn>
        <ToolbarBtn title="Numrerad lista"><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 text-sm resize-y focus:outline-none"
      />
    </div>
  );
}

// ─── Shared: filter pills ─────────────────────────────────────────────────────

function FilterBar({ active, onToggle }: { active: Set<string>; onToggle: (l: string) => void }) {
  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2">Filter</p>
      <div className="flex flex-wrap gap-1.5">
        {FILTER_PILLS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(label)}
            className={cn(
              'px-3 py-1 rounded-md text-xs font-medium border transition-colors',
              active.has(label)
                ? 'bg-[#1a2b4a] text-white border-[#1a2b4a]'
                : 'bg-background border-border text-foreground hover:bg-accent',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── SMS Overview ─────────────────────────────────────────────────────────────

const DEMO_SMS_ROWS = [
  { id: '1', date: '2026-06-09', time: '09:28', name: 'Reza Asadi',         phone: '076-200 08 28', msg: 'Hej Reza Asadi, välkommen till körskolan! Ditt nästa körlektionstillfälle är hos oss på Trafikövningsplatsen 1. Detta SMS kan inte besvaras.' },
  { id: '2', date: '2026-06-09', time: '09:28', name: 'Faisal Payam Hayri', phone: '070-401 34 53', msg: 'Hej Faisal Payam Hayri, du har en lektionsbokning imorgon kl 09:00. Delta SMS kan inte besvaras.' },
  { id: '3', date: '2026-06-09', time: '09:28', name: 'Yaseen Patel',        phone: '076-300 60 44', msg: 'Hej Yaseen Patel, påminnelse om körprov den 16 juni kl 10:00 på Trafikverket. Detta SMS kan inte besvaras.' },
  { id: '4', date: '2026-06-09', time: '09:28', name: 'Fahima Mousavi',      phone: '073-255 88 12', msg: 'Hej Fahima Mousavi, din teorilektion är planerad imorgon kl 13:00. Detta SMS kan inte besvaras.' },
  { id: '5', date: '2026-06-09', time: '09:28', name: 'Lars Bergström',      phone: '070-567 89 01', msg: 'Hej Lars Bergström, din körlektion är planerad på måndag kl 08:30. Detta SMS kan inte besvaras.' },
];

function SmsOversikt({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">SMS-historik</h2>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[#1a2b4a] hover:underline"
        >
          ← Nytt gruppmeddelande
        </button>
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-2.5 border-b border-border bg-muted/10">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Skickat av lärare/administratör senaste 60 dagarna
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/5">
                {['Datum/Tid', 'Namn', 'Mobilnummer', 'Meddelande', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_SMS_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/5">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {row.date}<br />{row.time}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{row.phone}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate" title={row.msg}>{row.msg}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Skickat
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── SMS Tab ──────────────────────────────────────────────────────────────────

function SmsTab() {
  const [view, setView]             = useState<'composer' | 'oversikt'>('composer');
  const [activeFilters, setFilters] = useState<Set<string>>(new Set());
  const [message, setMessage]       = useState('');
  const [signature, setSignature]   = useState('Detta SMS kan inte besvaras.');
  const [customPhone, setPhone]     = useState('');
  const [recipients, setRecipients] = useState<{ id: string; phone: string }[]>([]);

  function toggleFilter(label: string) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  function addPhone() {
    const v = customPhone.trim();
    if (!v) return;
    setRecipients((p) => [...p, { id: mkId(), phone: v }]);
    setPhone('');
  }

  const totalChars = message.length + signature.length;
  const smsPerRec  = totalChars <= 160 ? 1 : Math.ceil(totalChars / 153);
  const smsTotal   = smsPerRec * recipients.length;
  const charsLeft  = SMS_TOTAL_LIMIT - totalChars;

  if (view === 'oversikt') return <SmsOversikt onBack={() => setView('composer')} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Nytt gruppmeddelande</h2>
        <button
          type="button"
          onClick={() => setView('oversikt')}
          className="flex items-center gap-1.5 text-sm text-[#1a2b4a] hover:underline"
        >
          <LayoutList className="w-4 h-4" />
          Till meddelandeöversikt
        </button>
      </div>

      <FilterBar active={activeFilters} onToggle={toggleFilter} />

      {/* Recipients table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {['Skicka till', 'Namn', 'Mobilnummer'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Inga mottagare valda. Välj ett filter ovan eller lägg till anpassade mobilnummer nedan.
                </td>
              </tr>
            ) : (
              recipients.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-muted-foreground">—</td>
                  <td className="px-4 py-2.5">{r.phone}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Custom phone input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customPhone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhone(); } }}
          placeholder="Skicka till anpassade mobilnummer"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="button" onClick={addPhone} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white shrink-0">
          <Plus className="w-4 h-4 mr-1" /> Lägg till
        </Button>
      </div>

      {/* Compose form */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Avsändare</label>
          <input
            type="text"
            defaultValue="ETrafikskol"
            disabled
            className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Meddelandemall</label>
          <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground">
            <option value="">Välj mall</option>
          </select>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ange ditt meddelande"
          rows={5}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Signatur:</label>
          <input
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* Character counter */}
        <div className="bg-muted/30 rounded-md px-3 py-2 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          <span>Använda tecken: <strong className="text-foreground">{totalChars}</strong></span>
          <span aria-hidden>·</span>
          <span>Tecken kvar: <strong className="text-foreground">{charsLeft}</strong></span>
          <span aria-hidden>·</span>
          <span>SMS pr. mottagare: <strong className="text-foreground">{smsPerRec}</strong></span>
          <span aria-hidden>·</span>
          <span>SMS totalt: <strong className="text-foreground">{smsTotal}</strong></span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => { setMessage(''); setRecipients([]); setFilters(new Set()); }}
        >
          <RotateCcw className="w-4 h-4 mr-1.5" /> Återställ
        </Button>
        <Button type="button" variant="outline">
          <Eye className="w-4 h-4 mr-1.5" /> Förhandsvisning
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          disabled={recipients.length === 0}
          className={cn(
            recipients.length > 0
              ? 'bg-[#1a2b4a] hover:bg-[#243a63] text-white'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          <Send className="w-4 h-4 mr-1.5" /> Skicka SMS
        </Button>
      </div>
    </div>
  );
}

// ─── E-post Tab ───────────────────────────────────────────────────────────────

function EpostTab() {
  const [activeFilters, setFilters] = useState<Set<string>>(new Set());
  const [subject, setSubject]       = useState('');
  const [message, setMessage]       = useState('');
  const [isDragOver, setDragOver]   = useState(false);

  function toggleFilter(label: string) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Nytt gruppmeddelande</h2>
        <button type="button" className="flex items-center gap-1.5 text-sm text-[#1a2b4a] hover:underline">
          <LayoutList className="w-4 h-4" /> Till meddelandeöversikt
        </button>
      </div>

      <FilterBar active={activeFilters} onToggle={toggleFilter} />

      {/* Recipients table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/10">
              {['Skicka till', 'Namn', 'E-postadress'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-xs text-muted-foreground">
                Inga mottagare valda. Välj ett filter ovan.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compose form */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Avsändare</label>
          <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option>E6 Trafikskola AB (info@e6trafikskola.se)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Meddelandemall</label>
          <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground">
            <option value="">Välj mall</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground">Ämne:</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ämne"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ange ditt meddelande"
          rows={6}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {/* Attachments */}
        <div className="space-y-2">
          <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground">
            <option value="">- Lägg till bilagor från dokumentarkivet -</option>
          </select>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
            className={cn(
              'border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors',
              isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/10 hover:border-primary/50',
            )}
          >
            <Upload className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dra filer till det här fältet eller klicka här för att lägga till e-postbilagor.
              Video- och ljudfiler kan inte laddas upp och filen måste vara mindre än 5 MB.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button type="button" variant="outline">
          <RotateCcw className="w-4 h-4 mr-1.5" /> Återställ
        </Button>
        <Button type="button" variant="outline">
          <Eye className="w-4 h-4 mr-1.5" /> Förhandsvisning
        </Button>
        <Button type="button" variant="outline">
          Hämta senaste
        </Button>
        <div className="flex-1" />
        <Button type="button" className="bg-muted text-muted-foreground cursor-not-allowed" disabled>
          <Send className="w-4 h-4 mr-1.5" /> Skicka e-post
        </Button>
      </div>
    </div>
  );
}

// ─── Meddelande Tab ───────────────────────────────────────────────────────────

function MeddelandeTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="p-1.5 rounded border border-border hover:bg-accent text-muted-foreground shrink-0"
          title="Filtrera"
        >
          <LayoutList className="w-4 h-4" />
        </button>
        <h2 className="flex-1 text-base font-semibold">Meddelande med skolan</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">Status</span>
          <select className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option>Alla</option>
            <option>Olästa</option>
            <option>Lästa</option>
          </select>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          <strong>Info:</strong> Lärare kan slå på/av möjligheten för meddelanden mellan elev och lärare
          i vänstermenyn → Användare → Personliga inställningar
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-4 py-2.5 border-b border-border bg-muted/10 text-xs text-muted-foreground">
          Totalt: <span className="font-semibold text-foreground">0</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/5">
              {['Meddelande', 'Senaste meddelandet skickat av', 'Skickat', 'Läst', 'Val'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Meddelandehistorik saknas.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Studentavtal Dialog ──────────────────────────────────────────────────────

function StudentavtalDialog({
  open,
  onClose,
  prefill,
}: {
  open:     boolean;
  onClose:  () => void;
  prefill?: StudentavtalPrefill;
}) {
  const [rubrik, setRubrik]           = useState(prefill?.rubrik ?? '');
  const [body, setBody]               = useState('');
  const [filnamn, setFilnamn]         = useState(prefill?.filnamn ?? '');
  const [aktiv, setAktiv]             = useState(true);
  const [synasPaSida, setSynasPaSida] = useState(true);
  const [skickaSms, setSkickaSms]     = useState(true);
  const [minderaring, setMinderaring] = useState(prefill?.allChecked ?? false);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Studentavtal (med elektronisk signatur)</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/40 border border-border px-4 py-3 text-sm text-muted-foreground leading-relaxed">
          Skapa ett standardiserat avtal för användning mellan eleven och trafikskolan, eller om eleven är
          under 18 år, mellan vårdnadshavare och trafikskolan. Avtalet kan tecknas elektroniskt genom att
          generera en unik signeringslänk från elevens kundkort. Länken kommer att finnas på elevsidan,
          men kan även skickas till eleven/vårdnadshavaren direkt via sms.
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Rubrik:</label>
            <input
              type="text"
              value={rubrik}
              onChange={(e) => setRubrik(e.target.value)}
              placeholder="Exempel: Paketerbjudande"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Avtalstext:</label>
            <p className="text-xs text-muted-foreground">
              Enkel radbrytning: shift + enter<br />
              Radbrytning (nytt avsnitt): enter
            </p>
            <RichTextArea
              value={body}
              onChange={setBody}
              placeholder="Ange avtalstext..."
              rows={8}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Informasjon om elevens namn och fødselsdato legges automatisk til på slutten av avtalen.
          </p>

          <div className="space-y-1">
            <label className="text-sm font-semibold">Filnamn:</label>
            <p className="text-xs text-muted-foreground">
              Filnamnet måste vara utan svenska tecken (som: øæå), specialtecken, mellanslag och punkter (som: !?&amp;;:.:#).
            </p>
            <input
              type="text"
              value={filnamn}
              onChange={(e) => setFilnamn(e.target.value)}
              placeholder="Exempel: paketuppgorelse"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            {([
              { label: 'Aktiv',                                                                                         get: aktiv,       set: setAktiv },
              { label: 'Den signerade filen ska synas på studentsidan',                                                  get: synasPaSida, set: setSynasPaSida },
              { label: 'Skicka SMS med bekräftelse vid signering',                                                       get: skickaSms,   set: setSkickaSms },
              { label: 'Avtalet är endast synligt för minderåriga och måste undertecknas av en förälder/vårdnadshavare', get: minderaring, set: setMinderaring },
            ] as const).map(({ label, get: checked, set: setter }) => (
              <label key={label} className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setter(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Avbryt</Button>
          <Button type="button" onClick={onClose} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white">
            Skapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skolans Villkor Dialog ───────────────────────────────────────────────────

function SkolansVillkorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rubrik, setRubrik] = useState('Skolans villkor');
  const [body, setBody]     = useState(SKOLANS_VILLKOR_CONTENT);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skolans villkor (med elektronisk signering)</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/30 border border-border px-4 py-3 text-sm text-muted-foreground">
          <strong>Tips:</strong><br />
          Enkel radbrytning: shift + enter<br />
          Radbrytning (nytt avsnitt): enter
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Rubrik:</label>
            <input
              type="text"
              value={rubrik}
              onChange={(e) => setRubrik(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold">Innehåll:</label>
            <RichTextArea value={body} onChange={setBody} rows={14} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Avbryt</Button>
          <Button type="button" onClick={onClose} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white">
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ändra standard SMS-text Dialog ──────────────────────────────────────────

function SmsTextDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState(DEFAULT_SMS_SIGN_TEXT);

  const charCount = text.length;
  const smsCount  = charCount <= 160 ? 1 : Math.ceil(charCount / 153);
  const charsLeft = 160 - charCount;

  function insert(field: string) {
    setText((prev) => `${prev}[${field}]`);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ändra standard SMS-text</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Detta SMS skickas automatiskt till eleven när en signeringslänk genereras från elevkortet.
            Dynamiska fält ersätts med faktiska värden vid sändning.
          </span>
        </div>

        <div className="space-y-3">
          {/* Dynamic field chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Infoga fält:</span>
            {SIGN_SMS_FIELDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => insert(f)}
                className="px-2 py-0.5 text-xs rounded border border-border bg-background hover:bg-accent text-muted-foreground transition-colors"
              >
                [{f}]
              </button>
            ))}
          </div>

          {/* SMS textarea */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* Character counter */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 bg-muted/30 rounded px-3 py-2 text-xs text-muted-foreground">
            <span>Använda tecken: <strong className="text-foreground">{charCount}</strong></span>
            <span aria-hidden>·</span>
            <span className={charCount > 160 ? 'text-amber-600 font-medium' : ''}>
              {charCount <= 160
                ? `Tecken kvar (1 SMS): ${charsLeft}`
                : `Överskritt med ${-charsLeft} tecken`}
            </span>
            <span aria-hidden>·</span>
            <span>SMS per mottagare: <strong className="text-foreground">{smsCount}</strong></span>
          </div>
          <p className="text-xs text-muted-foreground">
            Notera: [LÄNK] expanderas till en URL (~50 tecken) vid sändning och påverkar SMS-antalet.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Stäng</Button>
          <Button type="button" onClick={onClose} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white">
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ändra text på elevsidan Dialog ──────────────────────────────────────────

function ElevsidanTextDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rubrik, setRubrik]           = useState('Skolans villkor');
  const [description, setDescription] = useState(
    'Läs igenom och godkänn skolans villkor för att slutföra din inskrivning hos oss.',
  );
  const [buttonText, setButtonText]   = useState('Signera nu');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ändra text på elevsidan</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Denna text visas för eleven på elevsidan när avtalet är tillgängligt för signering.
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Rubrik:</label>
            <input
              type="text"
              value={rubrik}
              onChange={(e) => setRubrik(e.target.value)}
              placeholder="t.ex. Skolans villkor"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Visas som rubrik för avtalet på elevsidan.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Beskrivning:</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv avtalet för eleven..."
              rows={4}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Informationstext visas för eleven innan de klickar på signeringsknappen.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Text på signeringsknapp:</label>
            <input
              type="text"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="t.ex. Signera nu"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Live preview */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Förhandsgranskning (elevsidan)
            </p>
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 space-y-2.5">
              <p className="text-sm font-semibold text-foreground">{rubrik || 'Rubrik'}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {description || 'Beskrivning visas här...'}
              </p>
              <div>
                <span className="inline-flex px-4 py-1.5 text-xs font-medium rounded-md bg-[#1a2b4a] text-white">
                  {buttonText || 'Signera'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Stäng</Button>
          <Button type="button" onClick={onClose} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white">
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dokumentsignering Tab ────────────────────────────────────────────────────

function DokumentsigneringTab() {
  const [docTpls, setDocTpls]                     = useState<DocTpl[]>(INITIAL_DOC_TPLS);
  const [showNewAvtal, setShowNewAvtal]             = useState(false);
  const [showEkonomiskt, setShowEkonomiskt]         = useState(false);
  const [showSkolansVillkor, setShowSkolansVillkor] = useState(false);
  const [showSmsText, setShowSmsText]               = useState(false);
  const [showElevsidan, setShowElevsidan]           = useState(false);

  function downloadExample() {
    const lines = [
      'SKOLANS VILLKOR — EXEMPELDOKUMENT',
      '==================================',
      '',
      SKOLANS_VILLKOR_CONTENT,
      '',
      '',
      '==================================',
      'Underskrift',
      '',
      'Namn: ________________________________',
      '',
      'Personnummer: ________________________________',
      '',
      'Datum: ________________________________',
      '',
      'Underskrift: ________________________________',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'skolans_villkor_exempel.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleActive(id: number) {
    setDocTpls((prev) => prev.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h2 className="text-base font-semibold">Studentavtal (med elektronisk signatur)</h2>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            onClick={() => setShowNewAvtal(true)}
            className="bg-[#1a2b4a] hover:bg-[#243a63] text-white text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Nytt självdefinierat studentavtal
          </Button>
          <Button
            type="button"
            onClick={() => setShowEkonomiskt(true)}
            className="bg-[#1a2b4a] hover:bg-[#243a63] text-white text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Ekonomiskt avtal (anpassad)
          </Button>
        </div>
      </div>

      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {docTpls.map((tpl) => (
          <div key={tpl.id} className="border border-border rounded-lg bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold text-foreground">
                {tpl.title}{' '}
                <span className="font-normal text-muted-foreground">#{tpl.id}</span>
              </p>
            </div>

            {tpl.hasFullControls && tpl.active ? (
              <div className="space-y-1.5">
                {[
                  { label: 'Ändra innehåll',         action: () => setShowSkolansVillkor(true) },
                  { label: 'Ladda ner exempel',       action: downloadExample },
                  { label: 'Ändra standard SMS-text', action: () => setShowSmsText(true) },
                  { label: 'Ändra text på elevsidan', action: () => setShowElevsidan(true) },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="w-full text-left px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => toggleActive(tpl.id)}
                className="w-full bg-[#1a2b4a] hover:bg-[#243a63] text-white text-xs"
              >
                {tpl.active ? 'Deaktivera' : 'Aktivera'}
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Dialogs */}
      <StudentavtalDialog open={showNewAvtal}    onClose={() => setShowNewAvtal(false)} />
      <StudentavtalDialog
        open={showEkonomiskt}
        onClose={() => setShowEkonomiskt(false)}
        prefill={{ rubrik: 'Ekonomiskt ansvar', filnamn: 'avtale_om_okonomisk_oppgjor', allChecked: true }}
      />
      <SkolansVillkorDialog open={showSkolansVillkor} onClose={() => setShowSkolansVillkor(false)} />
      <SmsTextDialog        open={showSmsText}        onClose={() => setShowSmsText(false)} />
      <ElevsidanTextDialog  open={showElevsidan}      onClose={() => setShowElevsidan(false)} />
    </div>
  );
}

// ─── E-postsignatur Dialog ────────────────────────────────────────────────────

function EpostsignaturDialog({
  open,
  onClose,
  onSave,
}: {
  open:    boolean;
  onClose: () => void;
  onSave:  (sig: EmailSig) => void;
}) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');

  function handleSave() {
    const n = name.trim();
    if (!n) return;
    onSave({ id: mkId(), name: n, email: email.trim() });
    setName(''); setEmail('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>E-postsignatur</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Namn:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Namn"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">E-postadress:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-postadress"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Stäng</Button>
          <Button type="button" onClick={handleSave} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white">
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Meddelandemall Dialog ────────────────────────────────────────────────────

function MeddelandemallDialog({
  open,
  onClose,
  onSave,
}: {
  open:    boolean;
  onClose: () => void;
  onSave:  (t: MsgTemplate) => void;
}) {
  const [name, setName]       = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');

  function insertField(field: string) {
    setBody((prev) => `${prev}[${field}]`);
  }

  function handleSave() {
    const n = name.trim();
    if (!n) return;
    onSave({ id: mkId(), name: n, subject: subject.trim(), body: body.trim() });
    setName(''); setSubject(''); setBody('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meddelandemall</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Namn"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ämne (används endast för e-post)"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-foreground">Dynamiska fält:</span>
              <button
                type="button"
                className="px-2.5 py-0.5 text-xs rounded-md bg-[#1a2b4a] text-white font-medium"
              >
                Alla
              </button>
              {DYNAMIC_FIELDS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insertField(f)}
                  className="px-2 py-0.5 text-xs rounded border border-border bg-background hover:bg-accent text-muted-foreground transition-colors"
                >
                  [{f}]
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ange ditt meddelande"
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Stäng</Button>
          <Button type="button" onClick={handleSave} className="bg-[#1a2b4a] hover:bg-[#243a63] text-white">
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mallar Tab ───────────────────────────────────────────────────────────────

function MallarTab() {
  const [templates, setTemplates]   = useState<MsgTemplate[]>([]);
  const [signatures, setSignatures] = useState<EmailSig[]>([]);
  const [selectedTpl, setSelectedTpl] = useState('');
  const [selectedSig, setSelectedSig] = useState('');
  const [showTplDialog, setShowTplDialog] = useState(false);
  const [showSigDialog, setShowSigDialog] = useState(false);

  return (
    <div className="space-y-6">
      {/* Message templates */}
      <div className="border border-border rounded-lg bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Meddelandemallar för e-post och sms</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Meddelandemall är ett fördefinierat meddelande som kan användas när du skickar e-post och SMS.
            Mallen kan innehålla dynamiska variabler, såsom: «Hej [FORNAMN]. Ditt saldo är [SALDO]»
            som automatiskt ersätts med elevens namn, och aktuellt saldo.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedTpl}
            onChange={(e) => setSelectedTpl(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground"
          >
            <option value="">- Välj mall -</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <Button
            type="button"
            onClick={() => setShowTplDialog(true)}
            className="bg-[#1a2b4a] hover:bg-[#243a63] text-white shrink-0"
          >
            <Plus className="w-4 h-4 mr-1" /> Lägg till
          </Button>
          <Button type="button" variant="outline" className="shrink-0 text-xs">
            ✓ Aktiva standardmallar
          </Button>
        </div>
      </div>

      {/* Email signatures */}
      <div className="border border-border rounded-lg bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">E-postsignaturer</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            E-postsignatur är den avsändaradress som används vid sändning av e-post, samt den e-postadress
            som används när eleven trycker på svarsknappen i sin e-postklient.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedSig}
            onChange={(e) => setSelectedSig(e.target.value)}
            className="flex-1 min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground"
          >
            <option value="">- Välj signatur -</option>
            {signatures.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
            ))}
          </select>
          <Button
            type="button"
            onClick={() => setShowSigDialog(true)}
            className="bg-[#1a2b4a] hover:bg-[#243a63] text-white shrink-0"
          >
            <Plus className="w-4 h-4 mr-1" /> Lägg till
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      <MeddelandemallDialog
        open={showTplDialog}
        onClose={() => setShowTplDialog(false)}
        onSave={(t) => setTemplates((prev) => [...prev, t])}
      />
      <EpostsignaturDialog
        open={showSigDialog}
        onClose={() => setShowSigDialog(false)}
        onSave={(s) => setSignatures((prev) => [...prev, s])}
      />
    </div>
  );
}

// ─── KommunikationPage ────────────────────────────────────────────────────────

export function KommunikationPage() {
  const [activeTab, setActiveTab] = useState<KommTab>('sms');

  return (
    <div className="space-y-0">
      {/* Page title + tab bar */}
      <div className="border-b border-border mb-5">
        <h1 className="text-lg font-semibold text-foreground">Kommunikation</h1>
        <div className="flex mt-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                t.key === activeTab
                  ? 'text-[#1a2b4a] border-b-2 border-[#1a2b4a] -mb-px'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/30',
              )}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'sms'               && <SmsTab />}
      {activeTab === 'epost'             && <EpostTab />}
      {activeTab === 'meddelande'        && <MeddelandeTab />}
      {activeTab === 'dokumentsignering' && <DokumentsigneringTab />}
      {activeTab === 'mallar'            && <MallarTab />}
    </div>
  );
}
