import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Mail, RotateCw, Ban, KeyRound, History, AlertTriangle,
} from 'lucide-react';
import { humanizeIdentifier } from '@platform/utils';
import {
  Button, Label, Switch,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  toast,
} from '@platform/ui';
import { cn } from '@/lib/utils.js';
import {
  useUpdateOrgUserProfile, useResendOrgUserInvitation, useCancelOrgUserInvitation,
  useSendOrgUserPasswordReset, useChangeOrgUserEmail, useOrgUserHistory,
} from '../hooks/useOrgUsers.js';
import type { OrgUserRow } from '../hooks/useOrgUsers.js';
import {
  INVITATION_STATUS_LABEL, INVITATION_STATUS_CLASS, IDENTITY_EVENT_LABEL,
  computeInvitationStatus, formatDateTime, validateEmail,
} from '../lib/orgUserUtils.js';

// ─── UserEditDialog ─────────────────────────────────────────────────────────────
//
// Extracted from UsersSettingsPage's inline edit dialog so it can be reused
// as-is by the Personal workspace's Administratörer tab (in-workspace, no
// navigation to /settings/users) while Settings → Användare keeps using it
// exactly as before. Same fields, same mutations, same behavior — only the
// state ownership moved from page-local to this self-contained component.

interface EditForm {
  first_name: string;
  last_name:  string;
  phone:      string;
  is_active:  boolean;
}

const EMPTY_EDIT: EditForm = { first_name: '', last_name: '', phone: '', is_active: true };

function validateEdit(f: EditForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.first_name.trim()) e['first_name'] = 'Förnamn krävs.';
  if (!f.last_name.trim())  e['last_name']  = 'Efternamn krävs.';
  return e;
}

interface UserEditDialogProps {
  member:       OrgUserRow | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserEditDialog({ member, open, onOpenChange }: UserEditDialogProps) {
  const [editForm,     setEditForm]     = useState<EditForm>(EMPTY_EDIT);
  const [editErrors,   setEditErrors]   = useState<Record<string, string>>({});
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailDraft,   setEmailDraft]   = useState('');
  const [emailError,   setEmailError]   = useState<string | undefined>(undefined);
  const [historyOpen,  setHistoryOpen]  = useState(false);

  useEffect(() => {
    if (open && member) {
      setEditForm({ first_name: member.first_name, last_name: member.last_name, phone: '', is_active: member.is_active });
      setEditErrors({});
      setEmailEditing(false);
      setEmailDraft(member.email);
      setEmailError(undefined);
      setHistoryOpen(false);
    }
  }, [open, member]);

  const { data: historyEvents = [], isLoading: historyLoading } = useOrgUserHistory(member?.user_id, historyOpen);

  const updateProfile      = useUpdateOrgUserProfile();
  const resendInvitation   = useResendOrgUserInvitation();
  const cancelInvitation   = useCancelOrgUserInvitation();
  const sendPasswordReset  = useSendOrgUserPasswordReset();
  const changeEmail        = useChangeOrgUserEmail();

  function handleSave() {
    if (!member) return;
    const errors = validateEdit(editForm);
    if (Object.keys(errors).length > 0) { setEditErrors(errors); return; }
    updateProfile.mutate(
      { userId: member.user_id, first_name: editForm.first_name, last_name: editForm.last_name, phone: editForm.phone, is_active: editForm.is_active },
      {
        onSuccess: () => { onOpenChange(false); toast({ title: 'Användaren uppdaterades' }); },
        onError: () => toast({ title: 'Fel vid uppdatering', variant: 'destructive' }),
      },
    );
  }

  function handleSaveEmail() {
    if (!member) return;
    const err = validateEmail(emailDraft);
    if (err) { setEmailError(err); return; }
    changeEmail.mutate({ userId: member.user_id, email: emailDraft.trim() }, {
      onSuccess: () => {
        setEmailEditing(false);
        toast({ title: 'E-postadress ändrad', description: 'En ny inbjudan har skickats till den nya adressen.' });
      },
      onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
    });
  }

  if (!member) return null;

  const editStatus = computeInvitationStatus(member);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 pr-12">
          <DialogTitle>Redigera användare</DialogTitle>
          <DialogDescription>
            {member.first_name} {member.last_name} · {member.role_display}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Invitation & Access */}
          <section aria-label="Inbjudan och åtkomst" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Inbjudan &amp; åtkomst
              </p>
              <span className={cn(
                'inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded leading-none',
                INVITATION_STATUS_CLASS[editStatus],
              )}>
                {INVITATION_STATUS_LABEL[editStatus]}
              </span>
            </div>

            <div className="space-y-2 text-sm rounded-lg border border-border p-3 bg-muted/20">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Inbjudan skickad</span>
                <span className="text-foreground">{formatDateTime(member.invited_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {editStatus === 'accepted' ? 'Aktiverad / senast inloggad' : 'Aktiverad'}
                </span>
                <span className="text-foreground">{formatDateTime(member.last_sign_in_at)}</span>
              </div>
            </div>

            {/* Pending-only actions */}
            {editStatus !== 'accepted' && (
              <div className="space-y-2">
                {emailEditing ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="edit_pending_email" className="text-xs">Ny e-postadress</Label>
                    <div className="flex gap-2">
                      <input
                        id="edit_pending_email"
                        type="email"
                        value={emailDraft}
                        onChange={e => { setEmailDraft(e.target.value); setEmailError(undefined); }}
                        className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button size="sm" onClick={handleSaveEmail} disabled={changeEmail.isPending}>
                        {changeEmail.isPending ? 'Sparar…' : 'Spara'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEmailEditing(false); setEmailDraft(member.email); setEmailError(undefined); }}>
                        Avbryt
                      </Button>
                    </div>
                    {emailError && <p className="text-xs text-destructive" role="alert">{emailError}</p>}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => resendInvitation.mutate(member.user_id, {
                        onSuccess: () => toast({ title: 'Inbjudan skickad igen' }),
                        onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
                      })}
                      disabled={resendInvitation.isPending}
                    >
                      <RotateCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                      Skicka igen
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setEmailEditing(true)}
                    >
                      <Mail className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                      Byt e-post
                    </Button>
                  </div>
                )}
                <Button
                  size="sm" variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => cancelInvitation.mutate(member.user_id, {
                    onSuccess: () => { onOpenChange(false); toast({ title: 'Inbjudan avbruten' }); },
                    onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
                  })}
                  disabled={cancelInvitation.isPending}
                >
                  <Ban className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  {cancelInvitation.isPending ? 'Avbryter…' : 'Avbryt inbjudan'}
                </Button>
              </div>
            )}

            {/* Accepted-only action */}
            {editStatus === 'accepted' && (
              <Button
                size="sm" variant="outline" className="w-full"
                onClick={() => sendPasswordReset.mutate(member.user_id, {
                  onSuccess: () => toast({ title: 'Lösenordsåterställning skickad' }),
                  onError: (e: Error) => toast({ title: 'Fel', description: e.message, variant: 'destructive' }),
                })}
                disabled={sendPasswordReset.isPending}
              >
                <KeyRound className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {sendPasswordReset.isPending ? 'Skickar…' : 'Skicka lösenordsåterställning'}
              </Button>
            )}

            {/* Invitation history */}
            <div>
              <button
                type="button"
                onClick={() => setHistoryOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <History className="w-3.5 h-3.5" aria-hidden="true" />
                {historyOpen ? 'Dölj inbjudningshistorik' : 'Visa inbjudningshistorik'}
              </button>
              {historyOpen && (
                <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto rounded-lg border border-border p-2.5 bg-muted/10">
                  {historyLoading ? (
                    <p className="text-xs text-muted-foreground">Laddar…</p>
                  ) : historyEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ingen historik ännu.</p>
                  ) : (
                    historyEvents.map(ev => (
                      <div key={ev.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-foreground">{IDENTITY_EVENT_LABEL[ev.event_type] ?? humanizeIdentifier(ev.event_type)}</span>
                        <span className="text-muted-foreground shrink-0">{formatDateTime(ev.occurred_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Personuppgifter */}
          <section aria-label="Personuppgifter" className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Personuppgifter
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field id="edit_first_name" label="Förnamn" required error={editErrors['first_name']}>
                <input
                  id="edit_first_name"
                  type="text"
                  value={editForm.first_name}
                  onChange={e => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Förnamn"
                  aria-required="true"
                />
              </Field>
              <Field id="edit_last_name" label="Efternamn" required error={editErrors['last_name']}>
                <input
                  id="edit_last_name"
                  type="text"
                  value={editForm.last_name}
                  onChange={e => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Efternamn"
                  aria-required="true"
                />
              </Field>
            </div>
            <Field id="edit_phone" label="Telefon">
              <input
                id="edit_phone"
                type="tel"
                value={editForm.phone}
                onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="t.ex. 070-123 45 67"
              />
            </Field>
          </section>

          {/* Kontostatus */}
          <section aria-label="Kontostatus" className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Kontostatus
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="edit_is_active" className="text-sm font-medium">Aktiv</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Inaktiva användare kan inte logga in.
                </p>
              </div>
              <Switch
                id="edit_is_active"
                checked={editForm.is_active}
                onCheckedChange={v => setEditForm(prev => ({ ...prev, is_active: v }))}
                aria-label="Aktiv status"
              />
            </div>
            {editStatus !== 'accepted' && editForm.is_active === false && (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                Denna användare har inte aktiverat sitt konto än — inaktivering blockerar inloggning
                men avbryter inte själva inbjudan. Använd &quot;Avbryt inbjudan&quot; ovan för att helt ta bort den.
              </p>
            )}
          </section>

          {/* Info (read-only) */}
          <section aria-label="Information" className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Information
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">E-post</span>
                <span className="text-foreground font-medium truncate">{member.email}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Senast aktiv</span>
                <span className="text-foreground">{formatDateTime(member.last_sign_in_at)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Medlem sedan</span>
                <span className="text-foreground">
                  {new Date(member.joined_at).toLocaleDateString('sv-SE')}
                </span>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button size="sm" onClick={handleSave} disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Sparar...' : 'Spara ändringar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  id, label, required, error, children,
}: {
  id:        string;
  label:     string;
  required?: boolean | undefined;
  error?:    string | undefined;
  children:  ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required === true && (
          <span className="text-destructive ml-0.5" aria-hidden="true">*</span>
        )}
      </Label>
      {children}
      {error !== undefined && error !== '' && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  );
}
