import { Megaphone, Loader2 } from 'lucide-react';
import { Badge } from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import { useAnnouncements, type AnnouncementSeverity } from '../hooks/useAnnouncements.js';

const SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  info: 'Info', warning: 'Varning', critical: 'Viktigt',
};

const SEVERITY_CLASSES: Record<AnnouncementSeverity, string> = {
  info:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  warning:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function NyheterPage() {
  const { data: announcements = [], isLoading } = useAnnouncements();

  return (
    <PageLayout>
      <PageHeader
        title="Nyheter"
        description="Meddelanden och uppdateringar från Trafikcloud"
      />
      <PageContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Hämtar nyheter…
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Inga nyheter just nu</p>
            <p className="text-sm text-muted-foreground">Kom tillbaka senare för uppdateringar och meddelanden.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-xl border bg-card p-4 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={SEVERITY_CLASSES[a.severity]}>{SEVERITY_LABELS[a.severity]}</Badge>
                  <span className="font-medium text-foreground">{a.title}</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                <p className="text-xs text-muted-foreground">{formatDate(a.published_at)}</p>
              </div>
            ))}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}
