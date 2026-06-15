import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, MessageSquare, Mail, Pencil, Copy } from 'lucide-react';
import { Button } from '@platform/ui';
import { cn } from '@/lib/utils.js';

type TemplateType = 'sms' | 'email';

interface Template {
  id:    number;
  type:  TemplateType;
  name:  string;
  body:  string;
}

const EXAMPLE_TEMPLATES: Template[] = [
  { id: 1, type: 'sms',   name: 'Bokningsbekräftelse',   body: 'Hej {förnamn}! Din bokning {datum} kl {tid} är bekräftad. Hälsningar {trafikskola}' },
  { id: 2, type: 'sms',   name: 'Påminnelse körlektion', body: 'Påminnelse: Du har körlektion imorgon {datum} kl {tid} med {lärare}.' },
  { id: 3, type: 'email', name: 'Välkomstbrev',           body: 'Välkommen {förnamn}! Vi ser fram emot att hjälpa dig ta körkort.' },
];

// ─── MeddelandemallarPage ─────────────────────────────────────────────────────

export function MeddelandemallarPage() {
  const [templates, setTemplates]   = useState<Template[]>(EXAMPLE_TEMPLATES);
  const [activeTab, setActiveTab]   = useState<TemplateType | 'all'>('all');
  const [showForm,  setShowForm]    = useState(false);
  const [draftName, setDraftName]   = useState('');
  const [draftType, setDraftType]   = useState<TemplateType>('sms');
  const [draftBody, setDraftBody]   = useState('');

  const visible = activeTab === 'all' ? templates : templates.filter(t => t.type === activeTab);

  function openCreate() {
    setDraftName('');
    setDraftType('sms');
    setDraftBody('');
    setShowForm(true);
  }

  function save() {
    if (!draftName.trim() || !draftBody.trim()) return;
    setTemplates(prev => [
      ...prev,
      { id: Date.now(), type: draftType, name: draftName.trim(), body: draftBody.trim() },
    ]);
    setShowForm(false);
  }

  function duplicate(t: Template) {
    setTemplates(prev => [
      ...prev,
      { ...t, id: Date.now(), name: `${t.name} (kopia)` },
    ]);
  }

  const tabs: { key: TemplateType | 'all'; label: string }[] = [
    { key: 'all',   label: 'Alla' },
    { key: 'sms',   label: 'SMS' },
    { key: 'email', label: 'E-post' },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      {/* Breadcrumb + action */}
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

      {/* Header card */}
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

      {/* Create form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Ny meddelandemall</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Mallnamn</label>
              <input
                autoFocus
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                placeholder="t.ex. Bokningsbekräftelse"
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Typ</label>
              <select
                value={draftType}
                onChange={e => setDraftType(e.target.value as TemplateType)}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="sms">SMS</option>
                <option value="email">E-post</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Malltext</label>
            <textarea
              value={draftBody}
              onChange={e => setDraftBody(e.target.value)}
              rows={4}
              placeholder="Skriv ditt meddelande här..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Avbryt</Button>
            <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={save}>Spara</Button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'bg-background text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Template list */}
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
                {t.type === 'sms'
                  ? <MessageSquare className="w-4 h-4 text-blue-500" />
                  : <Mail className="w-4 h-4 text-violet-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn(
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  t.type === 'sms'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
                )}>
                  {t.type === 'sms' ? 'SMS' : 'E-post'}
                </span>
                <button
                  type="button"
                  onClick={() => duplicate(t)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Duplicera"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Redigera"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
