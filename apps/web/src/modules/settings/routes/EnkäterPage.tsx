import { Link } from 'react-router-dom';
import {
  ChevronRight, MessageSquare, GraduationCap, MessageCircle,
  User, ChartBar, PenLine, FileText, AlertCircle, Info,
} from 'lucide-react';
import { Button } from '@platform/ui';

const FEATURES = [
  { icon: GraduationCap, title: 'Kursutvärdering',    desc: 'Utvärdera utbildningskvaliteten efter genomförd kurs eller uppkörning',          bg: 'bg-blue-100   text-blue-500'   },
  { icon: MessageCircle, title: 'Servicefeedback',    desc: 'Få feedback på er kundservice och administrativa processer',                       bg: 'bg-purple-100 text-purple-500' },
  { icon: User,          title: 'Körlärarvärdering',  desc: 'Låt elever utvärdera sina körlärare för att förbättra undervisningen',            bg: 'bg-green-100  text-green-500'  },
  { icon: ChartBar,     title: 'NPS-enkäter',        desc: 'Mät kundnöjdhet med Net Promoter Score för att följa utvecklingen över tid',       bg: 'bg-orange-100 text-orange-500' },
  { icon: PenLine,       title: 'Anpassade enkäter',  desc: 'Skapa egna enkäter för specifika ändamål och frågeställningar',                   bg: 'bg-slate-100  text-slate-500'  },
  { icon: FileText,      title: 'Avslutningsenkäter', desc: 'Samla feedback från elever som avslutat sin utbildning',                          bg: 'bg-teal-100   text-teal-500'   },
];

export function EnkäterPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/addons/marketing" className="hover:text-foreground">Tillägg</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Enkäter</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
          <MessageSquare className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">Enkäter</h1>
          <p className="text-sm text-muted-foreground">Samla in feedback och förbättra er utbildning med enkäter</p>
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
          Skapa enkäter för att samla in värdefull feedback från era elever. Förstå vad som fungerar bra och
          vad som kan förbättras för att kontinuerligt höja kvaliteten på er utbildning och service.
          Automatisera utskick och samla in svar direkt i systemet.
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

      {/* Warning */}
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 flex gap-3">
        <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-orange-700">Viktigt</p>
          <p className="text-sm text-orange-600 mt-0.5">
            För att kunna skicka enkäter via email krävs det att er emailserver är konfigurerad.
            Kontakta support för att sätta upp detta.
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-700">Framtida utveckling</p>
          <p className="text-sm text-blue-600 mt-0.5">
            Enkäter kommer att bli en del av <strong>automationer</strong> som för närvarande är under
            utveckling. När automationsfunktionen lanseras kommer ni kunna skapa automatiska enkätutskick
            baserat på olika triggers som genomförd kurs, avslutad utbildning osv.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-border bg-card px-5 py-10 text-center space-y-3">
        <h2 className="text-base font-semibold text-foreground">Kom igång med tillägget</h2>
        <p className="text-sm text-muted-foreground">
          Aktivera denna kostnadsfria integration och börja samla in värdefull feedback från era
          elever för att kontinuerligt förbättra er verksamhet. Enkäter kommer att integreras med
          automationsfunktionen när den lanseras för att möjliggöra automatiska utskick.
        </p>
        <Button className="bg-green-500 hover:bg-green-600 text-white">Installera enkäter (kostnadsfritt)</Button>
      </div>
    </div>
  );
}
