import { Link } from 'react-router-dom';
import { ChevronRight, FilePenLine, FileText, CreditCard, Activity, Smartphone } from 'lucide-react';
import { Button } from '@platform/ui';

const FEATURES = [
  { icon: FileText,     title: 'Avtalsmallar',                    desc: 'Skapa och hantera avtalsmallar för olika typer av avtal',           bg: 'bg-blue-100   text-blue-500'   },
  { icon: CreditCard,   title: 'Betala bara för signerade avtal', desc: 'Du betalar endast när ett avtal faktiskt signeras av eleven',       bg: 'bg-green-100  text-green-500'  },
  { icon: Activity,     title: 'Statusuppföljning',               desc: 'Följ upp signeringsstatusen i realtid direkt i elevprofilen',        bg: 'bg-purple-100 text-purple-500' },
  { icon: Smartphone,   title: 'Mobilt BankID',                   desc: 'Elever signerar säkert och enkelt med Mobilt BankID',               bg: 'bg-orange-100 text-orange-500' },
];

export function DigitalaAvtalPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/addons/marketing" className="hover:text-foreground">Tillägg</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Digitala avtal</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
          <FilePenLine className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">Digitala avtal</h1>
          <p className="text-sm text-muted-foreground">Låt elever signera avtal digitalt med Mobilt BankID</p>
        </div>
        <Button className="bg-green-500 hover:bg-green-600 text-white shrink-0">Installera</Button>
      </div>

      {/* Status */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-foreground">Inte installerad</span>
      </div>

      {/* Översikt */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Översikt</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Digitala avtal gör det möjligt för era elever att signera avtal och dokument digitalt med Mobilt BankID,
          direkt från sin mobil. Ni slipper pappershantering och får en smidig, säker och spårbar signeringsprocess
          som integreras sömlöst med elevprofilen i systemet.
        </p>
      </div>

      {/* Funktioner */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Funktioner</h2>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, title, desc, bg }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-4 flex gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pris */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Pris</h2>
        <p className="text-2xl font-bold text-foreground">4,99 kr <span className="text-sm font-normal text-muted-foreground">per signerat avtal</span></p>
        <p className="text-xs text-muted-foreground">Ni betalar bara när ett avtal faktiskt signeras — inga fasta månadsavgifter.</p>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-border bg-card px-5 py-10 text-center space-y-3">
        <h2 className="text-base font-semibold text-foreground">Kom igång med digitala avtal</h2>
        <p className="text-sm text-muted-foreground">
          Aktivera integrationen och börja skicka avtal för elektronisk signering med Mobilt BankID.
          Ni betalar 4,99 kr per signerat avtal — inga startavgifter.
        </p>
        <Button className="bg-green-500 hover:bg-green-600 text-white">Installera digitala avtal</Button>
      </div>
    </div>
  );
}
