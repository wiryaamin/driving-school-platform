import { useState } from 'react';
import { Megaphone, Plus, Loader2, Power, PowerOff } from 'lucide-react';
import {
  Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Input, Textarea, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  toast,
} from '@platform/ui';
import { PageLayout, PageHeader, PageContent } from '@shared/components/layout/PageLayout/PageLayout.js';
import {
  usePlatformAnnouncements, useCreateAnnouncement, useUpdateAnnouncement,
  type Announcement, type AnnouncementSeverity,
} from '../hooks/usePlatformAnnouncements.js';

const SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  info: 'Info', warning: 'Varning', critical: 'Kritisk',
};

const SEVERITY_CLASSES: Record<AnnouncementSeverity, string> = {
  info:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  warning:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Create/edit dialog ────────────────────────────────────────────────────────

function AnnouncementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<AnnouncementSeverity>('info');
  const [expiresAt, setExpiresAt] = useState('');

  function reset() {
    setTitle(''); setBody(''); setSeverity('info'); setExpiresAt('');
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Titel och text krävs', variant: 'destructive' });
      return;
    }
    try {
      await create.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        severity,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast({ title: 'Nyhet publicerad' });
      reset();
      onClose();
    } catch (e) {
      toast({ title: 'Kunde inte publicera', description: String(e), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ny nyhet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input placeholder="T.ex. Planerat underhåll" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Text</Label>
            <Textarea rows={4} placeholder="Nyhetstext…" value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Allvarlighetsgrad</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as AnnouncementSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SEVERITY_LABELS) as AnnouncementSeverity[]).map((s) => (
                    <SelectItem key={s} value={s}>{SEVERITY_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Utgår (valfritt)</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Avbryt</Button>
          <Button disabled={create.isPending} onClick={() => void handleSubmit()}>
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Publicera
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Announcement row ──────────────────────────────────────────────────────────

function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const update = useUpdateAnnouncement();

  async function toggleActive() {
    try {
      await update.mutateAsync({ id: announcement.id, is_active: !announcement.is_active });
      toast({ title: announcement.is_active ? 'Nyhet avpublicerad' : 'Nyhet publicerad igen' });
    } catch (e) {
      toast({ title: 'Kunde inte uppdatera', description: String(e), variant: 'destructive' });
    }
  }

  const expired = announcement.expires_at !== null && new Date(announcement.expires_at) < new Date();

  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b last:border-0">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={SEVERITY_CLASSES[announcement.severity]}>{SEVERITY_LABELS[announcement.severity]}</Badge>
          {!announcement.is_active && <Badge variant="outline" className="text-muted-foreground">Avpublicerad</Badge>}
          {expired && <Badge variant="outline" className="text-muted-foreground">Utgången</Badge>}
          <span className="font-medium text-foreground">{announcement.title}</span>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{announcement.body}</p>
        <p className="text-xs text-muted-foreground">
          Publicerad {formatDateTime(announcement.published_at)}
          {announcement.expires_at && <> · Utgår {formatDateTime(announcement.expires_at)}</>}
        </p>
      </div>
      <Button
        variant="ghost" size="icon" title={announcement.is_active ? 'Avpublicera' : 'Publicera'}
        disabled={update.isPending} onClick={() => void toggleActive()}
      >
        {announcement.is_active ? <PowerOff className="w-4 h-4 text-destructive" /> : <Power className="w-4 h-4 text-green-600" />}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PlatformAnnouncementsPage() {
  const { data: announcements = [], isLoading } = usePlatformAnnouncements();
  const [creating, setCreating] = useState(false);

  return (
    <PageLayout>
      <PageHeader
        title="Nyheter (TABSnytt)"
        description="Publicera meddelanden som visas för alla trafikskolor på plattformen"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Ny nyhet
          </Button>
        }
      />
      <PageContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Hämtar nyheter…
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center space-y-3">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-medium">Inga nyheter publicerade</p>
            <p className="text-sm text-muted-foreground">Klicka på "Ny nyhet" för att publicera ett meddelande till alla skolor.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {announcements.map((a) => <AnnouncementRow key={a.id} announcement={a} />)}
          </div>
        )}
      </PageContent>
      <AnnouncementDialog open={creating} onClose={() => setCreating(false)} />
    </PageLayout>
  );
}
