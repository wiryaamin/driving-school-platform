import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, toast } from '@platform/ui';
import { supabase } from '@core/api/supabase.js';
import { useSession } from '@shared/hooks/useSession.js';

function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-border accent-primary w-4 h-4 mt-0.5 shrink-0" />
      <span className="text-sm text-foreground leading-snug">{label}</span>
    </label>
  );
}

export function KommunikationConfigPage() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  const [smsDisabled,       setSmsDisabled]       = useState(false);
  const [smsReminderTime,   setSmsReminderTime]   = useState('14:00');
  const [newStudentDefault, setNewStudentDefault] = useState(true);
  const [customTemplate,    setCustomTemplate]    = useState(false);
  const [smsAvsändare,      setSmsAvsändare]      = useState('ETrafikskol');
  const [smsSignatur,       setSmsSignatur]       = useState('');
  const [emailSmsStatus,    setEmailSmsStatus]    = useState(false);
  const [emailDailyStaff,   setEmailDailyStaff]   = useState(true);
  const [emailReceipt,      setEmailReceipt]      = useState(true);
  const [emailBookReq,      setEmailBookReq]      = useState(false);
  const [emailCopyInstr,    setEmailCopyInstr]    = useState(false);
  const [emailCancelInstr,  setEmailCancelInstr]  = useState(false);
  const [emailSignatur,     setEmailSignatur]     = useState('');
  const [misslyckadStaff,   setMisslyckadStaff]   = useState('');

  const SMS_TIME_OPTIONS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

  const { data: orgSettings } = useQuery<Record<string, unknown> | null>({
    queryKey: ['org-settings-communication', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      return ((data as unknown as { settings: Record<string, unknown> } | null)?.settings) ?? null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!orgSettings) return;
    const s = (orgSettings['communication'] as Record<string, unknown> | undefined) ?? {};
    if (typeof s['sms_disabled']        === 'boolean') setSmsDisabled(s['sms_disabled']);
    if (typeof s['sms_reminder_time']   === 'string')  setSmsReminderTime(s['sms_reminder_time']);
    if (typeof s['new_student_sms']     === 'boolean') setNewStudentDefault(s['new_student_sms']);
    if (typeof s['custom_template']     === 'boolean') setCustomTemplate(s['custom_template']);
    if (typeof s['sms_avsandare']       === 'string')  setSmsAvsändare(s['sms_avsandare']);
    if (typeof s['sms_signatur']        === 'string')  setSmsSignatur(s['sms_signatur']);
    if (typeof s['email_sms_status']    === 'boolean') setEmailSmsStatus(s['email_sms_status']);
    if (typeof s['email_daily_staff']   === 'boolean') setEmailDailyStaff(s['email_daily_staff']);
    if (typeof s['email_receipt']       === 'boolean') setEmailReceipt(s['email_receipt']);
    if (typeof s['email_book_req']      === 'boolean') setEmailBookReq(s['email_book_req']);
    if (typeof s['email_copy_instr']    === 'boolean') setEmailCopyInstr(s['email_copy_instr']);
    if (typeof s['email_cancel_instr']  === 'boolean') setEmailCancelInstr(s['email_cancel_instr']);
    if (typeof s['email_signatur']      === 'string')  setEmailSignatur(s['email_signatur']);
    if (typeof s['misslyckad_staff']    === 'string')  setMisslyckadStaff(s['misslyckad_staff']);
  }, [orgSettings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await supabase.from('organizations').update({
        settings: {
          ...(orgSettings ?? {}),
          communication: {
            sms_disabled: smsDisabled, sms_reminder_time: smsReminderTime,
            new_student_sms: newStudentDefault, custom_template: customTemplate,
            sms_avsandare: smsAvsändare, sms_signatur: smsSignatur,
            email_sms_status: emailSmsStatus, email_daily_staff: emailDailyStaff,
            email_receipt: emailReceipt, email_book_req: emailBookReq,
            email_copy_instr: emailCopyInstr, email_cancel_instr: emailCancelInstr,
            email_signatur: emailSignatur, misslyckad_staff: misslyckadStaff,
          },
        },
      } as never).eq('id', orgId);
    },
    onSuccess: () => {
      toast({ title: 'Sparat', description: 'Kommunikationsinställningarna har sparats.' });
      void qc.invalidateQueries({ queryKey: ['org-settings-communication', orgId] });
    },
    onError: () => toast({ title: 'Fel vid sparning', variant: 'destructive' }),
  });

  const save = () => saveMut.mutate();
  const inputCls = 'w-full h-9 px-3 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40';
  const isPending = saveMut.isPending;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Inställningar</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">Kommunikation</span>
        </nav>
        <button type="button" className="text-xs text-primary hover:underline">Ge feedback</button>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-2">
        <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Kommunikation</h1>
        <p className="text-sm text-muted-foreground">Hantera SMS- och e-postinställningar.</p>
      </div>

      {/* SMS-påminnelseinställningar */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <CheckRow checked={smsDisabled} onChange={setSmsDisabled} label="Inaktivera SMS-påminnelse" />

        {!smsDisabled && (
          <>
            <div className="space-y-3 pl-1">
              <h3 className="text-sm font-semibold text-foreground">SMS-påminnelse med morgondagens bokningar för elev</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Ange tid för att skicka SMS. Observera att ändringen inte träder i kraft förrän dagen efter.</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Tidpunkt för utskick</label>
                <select value={smsReminderTime} onChange={e => setSmsReminderTime(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground">
                  {SMS_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <CheckRow checked={newStudentDefault} onChange={setNewStudentDefault} label="Nya elever ska ha en SMS-påminnelse som standard" />
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground">Meddelandemall</h3>
              <CheckRow checked={customTemplate} onChange={setCustomTemplate} label="Använd egendefinierad meddelandemall" />
              {customTemplate && (
                <textarea rows={4} placeholder="Skriv din meddelandemall här..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
              )}
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* SMS-avsändare och signatur */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">SMS-avsändare och SMS-signatur</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Signatur används för alla automatiska utskick. Om du använder ett namn som avsändare kan mottagaren inte svara på meddelandet. SMS-avsändaren får inte vara ett mobilnummer.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">SMS-avsändare <span className="text-muted-foreground font-normal">(ej ÅÄÖ och max 11 tecken)</span></label>
            <input type="text" value={smsAvsändare} onChange={e => setSmsAvsändare(e.target.value.replace(/[åäöÅÄÖ]/g, ''))} maxLength={11} className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">SMS-signatur</label>
            <input type="text" value={smsSignatur} onChange={e => setSmsSignatur(e.target.value)} maxLength={50} className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* E-postinställningar */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">E-postinställningar</h2>
        <div className="space-y-3">
          <CheckRow checked={emailSmsStatus}   onChange={setEmailSmsStatus}   label="Dagligt e-post till företaget med status på skickade SMS-påminnelser" />
          <CheckRow checked={emailDailyStaff}  onChange={setEmailDailyStaff}  label="E-post till företaget med en översikt över medarbetarnas dagliga schema" />
          <CheckRow checked={emailReceipt}     onChange={setEmailReceipt}     label="Maila kvitto till skolan vid betalning" />
          <CheckRow checked={emailBookReq}     onChange={setEmailBookReq}     label="E-post till företaget för bokningsförfrågningar via TABSwebb" />
          <CheckRow checked={emailCopyInstr}   onChange={setEmailCopyInstr}   label="Kopia av e-postbekräftelse till utbildaren vid godkännande av bokning" />
          <CheckRow checked={emailCancelInstr} onChange={setEmailCancelInstr} label="Skicka e-post till utbildaren vid avbokning av körlektion eller kurs" />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* E-postsignatur */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">E-postsignatur</h2>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Signatur</label>
          <textarea value={emailSignatur} onChange={e => setEmailSignatur(e.target.value)} maxLength={255} rows={4} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          <p className="text-xs text-muted-foreground">Ange en signatur, maximalt 255 tecken.</p>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>

      {/* Misslyckad leverans */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Notifikationer - Misslyckad leverans</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">Systemet skickar ut en notifikation till personalen när ett utgående meddelande inte kunnat levereras. Välj nedan vilken i personalen som ska få dessa notifikationer.</p>
        <select value={misslyckadStaff} onChange={e => setMisslyckadStaff(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-muted-foreground">
          <option value="">Sök efter personal...</option>
        </select>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending} className="bg-green-500 hover:bg-green-600 text-white">
            {isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </div>
      </div>
    </div>
  );
}
