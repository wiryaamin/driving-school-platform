import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Palette, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Skeleton,
  Card, CardContent, CardHeader, CardTitle, CardFooter,
  Label,
  toast,
} from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandSettings {
  brand_primary_color?:   string;
  brand_secondary_color?: string;
}

// ─── VarumärkePage ────────────────────────────────────────────────────────────

export function VarumärkePage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const { data: brandSettings, isLoading } = useQuery<BrandSettings>({
    queryKey: ['org-brand-settings', orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single();
      const s = ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? {};
      return {
        brand_primary_color:   (s['brand_primary_color']   as string | undefined) ?? '#1a56db',
        brand_secondary_color: (s['brand_secondary_color'] as string | undefined) ?? '#6b7280',
      };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const [primary,   setPrimary]   = useState('#1a56db');
  const [secondary, setSecondary] = useState('#6b7280');

  useEffect(() => {
    if (!brandSettings) return;
    if (brandSettings.brand_primary_color)   setPrimary(brandSettings.brand_primary_color);
    if (brandSettings.brand_secondary_color) setSecondary(brandSettings.brand_secondary_color);
  }, [brandSettings]);

  const saveBrand = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { data: cur } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .single();
      const currentSettings = ((cur as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? {};
      await supabase.from('organizations').update({
        settings: {
          ...currentSettings,
          brand_primary_color:   primary,
          brand_secondary_color: secondary,
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['org-brand-settings', orgId] });
      toast({ title: 'Varumärkesfärger sparades' });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <nav aria-label="Brödsmulor" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground transition-colors">Inställningar</Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <Link to="/settings/website/general" className="hover:text-foreground transition-colors">Webbplats</Link>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-foreground font-medium">Varumärke</span>
        </nav>
      </div>

      {/* Page header card */}
      <Card>
        <CardContent className="p-10 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
            <Palette className="w-7 h-7 text-pink-500 dark:text-pink-400" strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Varumärke</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Anpassa färger och logotyper för er webbplats och elevportal.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Brand colors */}
      <Card>
        <CardHeader className="pb-2 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Färger</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Välj era varumärkesfärger som används på er webbplats och i elevportalen.
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="color_primary">Grundfärg</Label>
              <p className="text-xs text-muted-foreground">Används för knappar, länkar och primära element</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground tabular-nums">{primary}</span>
              <input
                id="color_primary"
                type="color"
                value={primary}
                onChange={e => setPrimary(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
                aria-label="Grundfärg"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="color_secondary">Sekundär färg</Label>
              <p className="text-xs text-muted-foreground">Används för sekundära element och accenter</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-muted-foreground tabular-nums">{secondary}</span>
              <input
                id="color_secondary"
                type="color"
                value={secondary}
                onChange={e => setSecondary(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
                aria-label="Sekundär färg"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end px-6 pb-6 pt-0">
          <Button size="sm" onClick={() => saveBrand.mutate()} disabled={saveBrand.isPending}>
            {saveBrand.isPending ? 'Sparar…' : 'Spara färger'}
          </Button>
        </CardFooter>
      </Card>

      {/* Logo uploads */}
      <Card>
        <CardHeader className="pb-2 px-6 pt-6">
          <CardTitle className="text-sm font-semibold">Logotyper och bilder</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Ladda upp logotyper och bilder för er webbplats. Rekommenderat format: PNG med transparent bakgrund.
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-6 space-y-6 divide-y divide-border">
          <UploadSection title="Ljus logotyp" description="Visas på mörk bakgrund. Använd en ljus eller vit version av er logotyp." dark />
          <div className="pt-6"><UploadSection title="Mörk logotyp" description="Visas på ljus bakgrund. Använd en mörk version av er logotyp." /></div>
          <div className="pt-6"><UploadSection title="Anpassa bakgrund" description="Bakgrundsbild som används på inloggningssidan och landningssidor." /></div>
          <div className="pt-6"><UploadSection title="Anpassa välkomstbild" description="Bild som visas i välkomstsektion på er elevportal." /></div>
          <div className="pt-6"><UploadSection title="Open Graph-bild" description="Bild som visas när era sidor delas i sociala medier (1200×630 px rekommenderas)." /></div>
          <div className="pt-6"><UploadSection title="Favicon" description="Liten ikon som visas i webbläsarens flikar (32×32 eller 64×64 px)." /></div>
          <div className="pt-6"><UploadSection title="E-handelslogotyp" description="Logotyp som visas i er e-handelsbutik och vid checkout." /></div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── UploadSection ────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
function UploadSection({ title, description, dark = false }: { title: string; description: string; dark?: boolean }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex gap-3 items-start">
        <div className={`w-24 h-16 rounded-lg flex items-center justify-center shrink-0 ${dark ? 'bg-slate-800' : 'bg-muted'}`}>
          <Palette className={`w-5 h-5 ${dark ? 'text-slate-600' : 'text-muted-foreground'}`} aria-hidden="true" />
        </div>
        <label className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border h-16 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors">
          <input type="file" className="sr-only" accept="image/*" />
          <Upload className="w-4 h-4 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
          <span className="text-xs text-muted-foreground">Välj fil eller dra hit</span>
        </label>
      </div>
      <Button size="sm" variant="outline">Spara</Button>
    </div>
  );
}
