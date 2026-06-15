import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegalContent {
  terms_of_service?:    string;
  privacy_policy?:      string;
  ecommerce_terms?:     string;
  referral_terms?:      string;
}

// ─── LegalSettingsPage ────────────────────────────────────────────────────────

export function LegalSettingsPage() {
  const { organization } = useSession();
  const orgId = organization?.id;

  const [content, setContent] = useState<LegalContent>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    void supabase
      .from('organizations')
      .select('settings')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const s = (data as { settings?: Record<string, unknown> }).settings ?? {};
        const legal = (s['legal'] ?? {}) as LegalContent;
        setContent(legal);
      });
  }, [orgId]);

  async function save(field: keyof LegalContent) {
    if (!orgId) return;
    setSaving(field);
    try {
      const { data: existing } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single();
      const currentSettings = (existing as { settings?: Record<string, unknown> } | null)?.settings ?? {};
      const currentLegal = (currentSettings['legal'] ?? {}) as LegalContent;
      await supabase.from('organizations').update({
        settings: {
          ...currentSettings,
          legal: { ...currentLegal, [field]: content[field] ?? '' },
        },
      }).eq('id', orgId);
    } finally {
      setSaving(null);
    }
  }

  const sections: { key: keyof LegalContent; title: string; description: string; linkLabel: string }[] = [
    {
      key:       'terms_of_service',
      title:     'Användarvillkor',
      description: 'Här fyller du i dina användarvillkor som du vill att eleven godkänner vid inloggning i utbildningsportalen. Du kan se dina användarvillkor här:',
      linkLabel: 'användarvillkor',
    },
    {
      key:       'privacy_policy',
      title:     'Integritetspolicy',
      description: 'Här fyller du i din integritetspolicy som du vill att eleven ska godkänna vid inloggning i utbildningsportalen. Du kan se din integritetspolicy här:',
      linkLabel: 'integritetspolicy',
    },
    {
      key:       'ecommerce_terms',
      title:     'Köpvillkor för e-handel',
      description: 'Här fyller du i dina köpvillkor som du vill att användaren godkänner vid köp i din e-handel. Du kan se dina köpvillkor här:',
      linkLabel: 'köpvillkor',
    },
    {
      key:       'referral_terms',
      title:     'Villkor för värva en vän',
      description: 'Här fyller du i dina villkor för kampanjen värva en vän. Se dina aktuella',
      linkLabel: 'villkor för värva en vän',
    },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/company" className="hover:text-foreground">Företag</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Juridik</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      {sections.map(section => (
        <div key={section.key} className="space-y-2">
          <h2 className="text-sm font-semibold text-primary">{section.title}</h2>
          <p className="text-xs text-muted-foreground">
            {section.description}{' '}
            <button type="button" className="text-primary hover:underline text-xs">
              {section.linkLabel}
            </button>.
          </p>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border border-border border-b-0 rounded-t-md bg-muted/30 text-muted-foreground text-xs">
            <button type="button" className="hover:text-foreground px-1">↩</button>
            <button type="button" className="hover:text-foreground px-1">↪</button>
            <span className="px-1 border-l border-border ml-1">Paragraph</span>
            <span className="flex-1" />
            <button type="button" className="font-bold hover:text-foreground px-1">B</button>
            <button type="button" className="italic hover:text-foreground px-1">I</button>
            <button type="button" className="hover:text-foreground px-1">&quot;</button>
            <button type="button" className="hover:text-foreground px-1">≡</button>
            <button type="button" className="hover:text-foreground px-1">≡</button>
            <button type="button" className="hover:text-foreground px-1">🔗</button>
            <button type="button" className="hover:text-foreground px-1">🖼</button>
          </div>
          <textarea
            value={content[section.key] ?? ''}
            onChange={e => setContent(prev => ({ ...prev, [section.key]: e.target.value }))}
            rows={6}
            className="w-full px-3 py-2 text-sm border border-border rounded-b-md bg-background text-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
          />

          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-green-500 hover:bg-green-600 text-white"
              onClick={() => void save(section.key)}
              disabled={saving === section.key}
            >
              {saving === section.key ? 'Sparar…' : 'Spara'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
