import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, MessageSquare, Mail, Pencil, Copy, Trash2, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';
import { cn } from '@/lib/utils.js';

type TemplateType = 'sms' | 'email';

interface Template { id: string; type: TemplateType; name: string; body: string; }

export function MeddelandemallarPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTab, setActiveTab] = useState<TemplateType | 'all'>('all');
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<TemplateType>('sms');
  const [draftBody, setDraftBody] = useState('');

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-msg-templates', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const saved = orgSettings['message_templates'];
    if (Array.isArray(saved)) setTemplates(saved as Template[]);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async (next: Template[]) => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: { ...(orgSettings ?? {}), message_templates: next },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat' });
      void qc.invalidateQueries({ queryKey: ['org-settings-msg-templates', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const visible = activeTab === 'all' ? templates : templates.filter(t => t.type === activeTab);

  function openCreate() { setEditId(null); setDraftName(''); setDraftType('sms'); setDraftBody(''); setShowForm(true); }

  function openEdit(t: Template) { setEditId(t.id); setDraftName(t.name); setDraftType(t.type); setDraftBody(t.body); setShowForm(true); }

  function saveForm() {
    if (!draftName.trim() || !draftBody.trim()) return;
    let next: Template[];
    if (editId != null) {
      next = templates.map(t => t.id === editId ? { ...t, name: draftName.trim(), type: draftType, body: draftBody.trim() } : t);
    } else {
      next = [...templates, { id: crypto.randomUUID(), type: draftType, name: draftName.trim(), body: draftBody.trim() }];
    }
    setTemplates(next);
    saveMut.mutate(next);
    setShowForm(false);
  }

  function duplicate(t: Template) {
    const next = [...templates, { ...t, id: crypto.randomUUID(), name: `${t.name} (kopia)` }];
    setTemplates(next);
    saveMut.mutate(next);
  }

  function remove(id: string) {
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    saveMut.mutate(next);
  }

  const tabs: { key: TemplateType | 'all'; label: string }[] = [
    { key: 'all',   label: 'Alla' },
    { key: 'sms',   label: 'SMS' },
    { key: 'email', label: 'E-post' },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/settings/communication/config" className="hover:text-foreground">Kommunikation</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Mallar för meddelanden</span>
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
          <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={openCreate}>
            Skapa ny mall
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-500 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-foreground">Mallar för meddelanden</h1>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            Skapa återanvändbara SMS- och e-postmallar för kommunikation med elever.
            Använd variabler som <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{förnamn}'}</code>,{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{datum}'}</code> och{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">{'{tid}'}</code> i mallarna.
          </p>
        </div>
      </div>

      {/* Notice: this page stores templates in org settings JSONB, not in the notification pipeline */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-amber-800 dark:text-amber-300">
          <p className="font-medium">Mallar här ingår inte i det automatiska notissystemet</p>
          <p className="text-xs leading-relaxed">
            Dessa mallar sparas lokalt i organisationsinställningarna och används inte av notisregler, automationsregler eller schemalagda utskick.
            För mallar som kopplas till händelser (bokningsbekräftelse, påminnelser, fakturor m.m.) — gå till{' '}
            <Link to="/communication/templates" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200">
              Notismallar
            </Link>
            .
          </p>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">{editId != null ? 'Redigera mall' : 'Ny meddelandemall'}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Mallnamn</label>
              <input autoFocus type="text" value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="t.ex. Bokningsbekräftelse" className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Typ</label>
              <select value={draftType} onChange={e => setDraftType(e.target.value as TemplateType)} className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
                <option value="sms">SMS</option>
                <option value="email">E-post</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Malltext</label>
            <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={4} placeholder="Skriv ditt meddelande här..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Avbryt</Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={saveForm} disabled={saveMut.isPending}>
              {saveMut.isPending ? 'Sparar…' : 'Spara'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border w-fit">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-colors', activeTab === t.key ? 'bg-background text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 flex flex-col items-center gap-3 text-center">
          <FileText className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Inga mallar hittades.</p>
          <Button size="sm" variant="outline" onClick={openCreate}>Skapa din första mall</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {visible.map(t => (
            <div key={t.id} className="flex items-start gap-3 px-5 py-4 hover:bg-accent/20 transition-colors">
              <div className="mt-0.5 shrink-0">
                {t.type === 'sms' ? <MessageSquare className="w-4 h-4 text-blue-500" /> : <Mail className="w-4 h-4 text-violet-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', t.type === 'sms' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300')}>
                  {t.type === 'sms' ? 'SMS' : 'E-post'}
                </span>
                <button type="button" onClick={() => duplicate(t)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Duplicera">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => openEdit(t)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Redigera">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => remove(t.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Ta bort">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
