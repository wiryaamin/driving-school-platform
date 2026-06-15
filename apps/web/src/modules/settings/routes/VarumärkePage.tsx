import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Palette, Upload } from 'lucide-react';
import { Button } from '@platform/ui';

interface UploadSectionProps {
  title: string;
  description: string;
  dark?: boolean;
}

function UploadSection({ title, description, dark = false }: UploadSectionProps) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex gap-3 items-start">
        <div className={`w-24 h-16 rounded-lg flex items-center justify-center shrink-0 ${dark ? 'bg-slate-800' : 'bg-muted'}`}>
          <Palette className={`w-5 h-5 ${dark ? 'text-slate-600' : 'text-muted-foreground'}`} />
        </div>
        <label className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border h-16 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
          <input type="file" className="sr-only" accept="image/*" />
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Välj fil eller dra hit</span>
        </label>
      </div>
      <Button size="sm">Spara</Button>
    </div>
  );
}

export function VarumärkePage() {
  const [primary, setPrimary]   = useState('#1a56db');
  const [secondary, setSecondary] = useState('#6b7280');

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Webbplats</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Varumärke</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-10 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-pink-100 flex items-center justify-center">
          <Palette className="w-7 h-7 text-pink-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Varumärke</h1>
          <p className="text-sm text-muted-foreground mt-1">Anpassa färger och logotyper för er webbplats och elevportal.</p>
        </div>
      </div>

      {/* Färger */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Färger</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Välj era varumärkesfärger som används på er webbplats och i elevportalen.
          </p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-foreground">Grundfärg</label>
              <p className="text-xs text-muted-foreground">Används för knappar, länkar och primära element</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">{primary}</span>
              <input
                type="color"
                value={primary}
                onChange={e => setPrimary(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-foreground">Sekundär färg</label>
              <p className="text-xs text-muted-foreground">Används för sekundära element och accenter</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground">{secondary}</span>
              <input
                type="color"
                value={secondary}
                onChange={e => setSecondary(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
            </div>
          </div>
          <Button size="sm">Spara</Button>
        </div>
      </div>

      {/* Logo uploads */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Logotyper och bilder</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ladda upp logotyper och bilder för er webbplats. Rekommenderat format: PNG med transparent bakgrund.
          </p>
        </div>
        <div className="px-5 py-5 space-y-6 divide-y divide-border">
          <UploadSection
            title="Ljus logotyp"
            description="Visas på mörk bakgrund. Använd en ljus eller vit version av er logotyp."
            dark
          />
          <div className="pt-6">
            <UploadSection
              title="Mörk logotyp"
              description="Visas på ljus bakgrund. Använd en mörk version av er logotyp."
            />
          </div>
          <div className="pt-6">
            <UploadSection
              title="Anpassa bakgrund"
              description="Bakgrundsbild som används på inloggningssidan och landningssidor."
            />
          </div>
          <div className="pt-6">
            <UploadSection
              title="Anpassa välkomstbild"
              description="Bild som visas i välkomstsektion på er elevportal."
            />
          </div>
          <div className="pt-6">
            <UploadSection
              title="Anpassa Open Graph bild"
              description="Bild som visas när era sidor delas i sociala medier (1200×630 px rekommenderas)."
            />
          </div>
          <div className="pt-6">
            <UploadSection
              title="Anpassa favicon"
              description="Liten ikon som visas i webbläsarens flikar (32×32 eller 64×64 px)."
            />
          </div>
          <div className="pt-6">
            <UploadSection
              title="E-handelslogotyp"
              description="Logotyp som visas i er e-handelsbutik och vid checkout."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
