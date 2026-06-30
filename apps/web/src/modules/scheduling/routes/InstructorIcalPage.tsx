import { useState } from 'react';
import { Calendar, Copy, Check, ExternalLink, RefreshCw, Info } from 'lucide-react';
import { Button, toast } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useInstructorIcalToken, useRefreshIcalToken } from '../hooks/useInstructorIcal.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function webcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, 'webcal://');
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Kopierat', description: 'Länken kopierades till urklipp.' });
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
      {copied
        ? <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Kopierat</>
        : <><Copy className="w-3.5 h-3.5 mr-1.5" />Kopiera</>
      }
    </Button>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-none w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
        {step}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground mb-1">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

// ─── App instructions ─────────────────────────────────────────────────────────

interface AppGuide {
  name:  string;
  steps: string[];
}

const APP_GUIDES: AppGuide[] = [
  {
    name: 'Google Kalender',
    steps: [
      'Öppna Google Kalender på datorn.',
      'Klicka på "+" bredvid "Andra kalendrar" i vänsterkolumnen.',
      'Välj "Från URL".',
      'Klistra in länken och klicka "Lägg till kalender".',
    ],
  },
  {
    name: 'iPhone / iPad (iOS)',
    steps: [
      'Tryck på "Prenumerera i kalender" ovan — appen öppnas automatiskt.',
      'Välj "Prenumerera" i dialogrutan som visas.',
      'Anpassa synkroniseringsintervall och tryck "Lägg till".',
    ],
  },
  {
    name: 'Outlook (skrivbord)',
    steps: [
      'Öppna Outlook och gå till Kalender-vyn.',
      'Klicka på "Lägg till kalender" → "Prenumerera från webben".',
      'Klistra in länken och klicka "Importera".',
    ],
  },
  {
    name: 'Apple Kalender (Mac)',
    steps: [
      'Öppna Kalender-appen och välj Arkiv → Nytt kalenderprenumeration.',
      'Klistra in länken och klicka "Prenumerera".',
      'Välj uppdateringsfrekvens och klicka "OK".',
    ],
  },
];

// ─── App guide section ────────────────────────────────────────────────────────

function AppGuideSection() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <p className="text-sm font-medium text-foreground">Kom igång — välj din kalenderapp</p>
      </div>
      <div className="divide-y divide-border">
        {APP_GUIDES.map((guide) => (
          <div key={guide.name}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setOpen(open === guide.name ? null : guide.name)}
            >
              <span className="text-sm font-medium">{guide.name}</span>
              <span className="text-xs text-muted-foreground">{open === guide.name ? '▲' : '▼'}</span>
            </button>
            {open === guide.name && (
              <div className="px-4 pb-4 space-y-3">
                {guide.steps.map((step, i) => (
                  <StepCard key={i} step={i + 1} title="">
                    {step}
                  </StepCard>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function InstructorIcalPage() {
  const { data: tokenData, isLoading, error } = useInstructorIcalToken();
  const refresh = useRefreshIcalToken();

  const feedUrl    = tokenData?.feed_url ?? '';
  const subscribeUrl = feedUrl ? webcalUrl(feedUrl) : '';

  function handleRefresh() {
    refresh.mutate(undefined, {
      onSuccess: () => toast({ title: 'Länk uppdaterad', description: 'Din prenumerationslänk är förnyad.' }),
      onError:   (e) => toast({ title: 'Fel', description: String(e), variant: 'destructive' }),
    });
  }

  return (
    <PageLayout>
      <PageHeader
        title="Kalenderabonnemang"
        description="Prenumerera på ditt schema i din egen kalenderapp"
        breadcrumbs={[
          { label: 'Schema', href: '/schedule' },
          { label: 'Kalenderabonnemang' },
        ]}
      />

      <PageContent>
        <div className="max-w-2xl space-y-6">

          {/* Info banner */}
          <div className="flex gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/20">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 dark:text-blue-300">
              Prenumerationslänken uppdateras automatiskt — kalendern i din app synkroniseras med
              nya och ändrade lektioner utan att du behöver göra något.
            </p>
          </div>

          {/* Feed URL card */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Din prenumerationslänk</h2>
            </div>

            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="h-10 bg-muted rounded" />
                <div className="flex gap-2">
                  <div className="h-9 w-32 bg-muted rounded" />
                  <div className="h-9 w-28 bg-muted rounded" />
                </div>
              </div>
            ) : error ? (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3">
                <p className="text-sm text-destructive font-medium">Ingen lärarrpost hittades</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Kalenderabonnemang är tillgängligt för användare med ett lärarekonto.
                  Kontakta din administratör om du anser att detta är ett fel.
                </p>
              </div>
            ) : (
              <>
                {/* URL display */}
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md border border-border">
                  <code className="flex-1 text-xs font-mono text-foreground break-all">{feedUrl}</code>
                  <CopyButton text={feedUrl} />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    asChild
                    className="flex-none"
                  >
                    <a href={subscribeUrl}>
                      <Calendar className="w-4 h-4 mr-1.5" />
                      Prenumerera i kalender
                    </a>
                  </Button>

                  <Button variant="outline" asChild className="flex-none">
                    <a href={feedUrl} download="schema.ics" target="_blank" rel="noreferrer">
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      Ladda ner .ics
                    </a>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={refresh.isPending}
                    className="flex-none text-muted-foreground"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
                    Förnya länk
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  <strong>OBS:</strong> Dela inte denna länk med andra — den ger tillgång till ditt schema
                  utan inloggning. Klicka på "Förnya länk" om du misstänker att länken har läckt.
                </p>
              </>
            )}
          </div>

          {/* What's included */}
          {!error && !isLoading && (
            <div className="rounded-lg border border-border p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Vad ingår i flödet?</h2>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  Alla dina kommande lektionstider (upp till 90 dagar framåt)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  Lektionstyp och elevnamn i händelsebeskrivningen
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  Anteckningar kopplade till tidsluckan (om det finns)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-muted-foreground/50 mt-0.5">✗</span>
                  Avbokade och blockerade tider visas inte
                </li>
              </ul>
            </div>
          )}

          {/* App guides */}
          {!error && !isLoading && <AppGuideSection />}

        </div>
      </PageContent>
    </PageLayout>
  );
}
