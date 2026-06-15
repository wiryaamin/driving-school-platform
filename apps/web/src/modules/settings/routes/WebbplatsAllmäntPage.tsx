import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Globe } from 'lucide-react';
import { Button } from '@platform/ui';

interface Usp {
  text: string;
  icon: string;
}

const DEFAULT_USPS: Usp[] = [
  { text: '', icon: '' },
  { text: '', icon: '' },
  { text: '', icon: '' },
];

export function WebbplatsAllmäntPage() {
  const [usps, setUsps] = useState<Usp[]>(DEFAULT_USPS);
  const [gtm, setGtm] = useState('');
  const [cookies, setCookies] = useState(true);

  function updateUsp(idx: number, field: keyof Usp, value: string) {
    setUsps(prev => prev.map((u, i) => i === idx ? { ...u, [field]: value } : u));
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Webbplats</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Allmänt</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <Globe className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Webbplats</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera inställningar för er webbplats och elevportal.</p>
        </div>
      </div>

      {/* Webbplatsinställningar */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Webbplatsinställningar</h2>
        </div>

        {/* Domain table */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Nedan ser ni er webbplatsadress. För att använda en egen domän, lägg till ett CNAME-pekning till er
            nuvarande adress hos er domänleverantör.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Typ</th>
                <th className="pb-2 font-medium">Namn</th>
                <th className="pb-2 font-medium">Värde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2 font-mono text-xs">CNAME</td>
                <td className="py-2 text-muted-foreground">@</td>
                <td className="py-2 font-mono text-xs text-primary">teoricentralen.se</td>
              </tr>
            </tbody>
          </table>

          {/* CNAME boxes */}
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <p className="text-xs font-medium text-foreground">DNS-inställningar</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Typ</label>
                <div className="rounded-md bg-background border border-border px-3 py-2 text-sm font-mono text-muted-foreground">CNAME</div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Värde</label>
                <div className="rounded-md bg-background border border-border px-3 py-2 text-sm font-mono text-muted-foreground">teoricentralen.se</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unika säljpunkter */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Unika säljpunkter</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Lägg till upp till 3 unika säljpunkter som visas på er webbplats och elevportal.
          </p>
        </div>
        <div className="px-5 py-4 space-y-4">
          {usps.map((usp, i) => (
            <div key={i} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Säljpunkt {i + 1}</p>
              <div className="flex gap-2">
                <select
                  value={usp.icon}
                  onChange={e => updateUsp(i, 'icon', e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground w-28 shrink-0"
                >
                  <option value="">Ikon</option>
                  <option value="star">Stjärna</option>
                  <option value="check">Bock</option>
                  <option value="clock">Klocka</option>
                  <option value="shield">Sköld</option>
                </select>
                <input
                  type="text"
                  value={usp.text}
                  onChange={e => updateUsp(i, 'text', e.target.value)}
                  placeholder="Beskriv er säljpunkt..."
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </div>
          ))}
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Google Tag Manager */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Google Tag Manager</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Lägg till ert GTM-container-ID för att aktivera Google Tag Manager på er webbplats.
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <input
            type="text"
            value={gtm}
            onChange={e => setGtm(e.target.value)}
            placeholder="GTM-XXXXXXX"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground"
          />
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Cookie-samtycke */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">Cookie-samtycke</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Visa en cookie-samtyckesbanderoll på er webbplats i enlighet med GDPR och
            EU:s cookie-direktiv.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={cookies}
          onClick={() => setCookies(v => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors mt-0.5 ${cookies ? 'bg-primary' : 'bg-input'}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${cookies ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  );
}
