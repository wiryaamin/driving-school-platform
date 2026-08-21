import { useState, useEffect } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button, Label, Input, Separator,
  toast,
} from '@platform/ui';
import { usePermissions } from '@core/rbac/hooks.js';
import { Permissions } from '@core/rbac/permissions.js';
import { useLocations } from '@modules/scheduling/hooks/useLocations.js';
import { useInviteOrgUser } from '@modules/settings/hooks/useOrgUsers.js';
import type { InviteOrgUserInput } from '@modules/settings/hooks/useOrgUsers.js';
import { JOB_TITLE_LABEL, EMPLOYMENT_TYPE_LABEL } from '@modules/settings/lib/orgUserUtils.js';
import { ADMIN_ROLE_LABELS } from '../hooks/usePersonnel.js';

// ─── Befattning (professional role) options ────────────────────────────────
//
// Reuses the exact PERSONNEL_JOB_TITLES set from @platform/validation's
// InviteUserSchema — no invented roles. "Trafiklärare" is intentionally NOT
// one of these options: it hands off to the existing InstructorForm instead,
// because that professional role already has a complete, established data
// model (public.instructors) that this common form must not duplicate.

const BEFATTNING_OPTIONS = Object.entries(JOB_TITLE_LABEL) as [keyof typeof JOB_TITLE_LABEL, string][];

const ADMIN_ROLE_ENTRIES = Object.entries(ADMIN_ROLE_LABELS) as [keyof typeof ADMIN_ROLE_LABELS, string][];
const EMPLOYMENT_TYPE_ENTRIES = Object.entries(EMPLOYMENT_TYPE_LABEL) as [keyof typeof EMPLOYMENT_TYPE_LABEL, string][];

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'E-postadress krävs.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Ange en giltig e-postadress.';
  return undefined;
}

type IdentityType = 'personnummer' | 'samordningsnummer';

// The existing public.personal_identity_type architecture (identity_type
// column + format-agnostic AES-256-GCM/HMAC crypto in bankid-crypto.ts)
// already supports both — it was just never wired to a UI selector anywhere
// in the product. A personnummer's date-of-birth digits (positions 5-6, the
// day) fall in the real calendar range 01-31; a samordningsnummer encodes
// the same birth date with +60 added to the day (61-91) specifically so it's
// visually distinguishable from a personnummer — so the two are validated
// against different day ranges once the user says which one they're entering.
function validatePersonnummer(value: string, identityType: IdentityType): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined; // optional field
  const match = /^\d{4}(\d{2})(\d{2})-?\d{4}$/.exec(trimmed);
  if (!match) return 'Format: ÅÅÅÅMMDD-XXXX';
  const month = parseInt(match[1] as string, 10);
  const day = parseInt(match[2] as string, 10);
  if (month < 1 || month > 12) return 'Ogiltig månad i datumet.';
  if (identityType === 'samordningsnummer') {
    if (day < 61 || day > 91) return 'Samordningsnummer ska ha dag 61–91 (födelsedag + 60).';
  } else {
    if (day < 1 || day > 31) return 'Ogiltig dag i datumet.';
  }
  return undefined;
}

interface CommonPersonnelForm {
  firstName:            string;
  lastName:             string;
  email:                string;
  mobilePhone:          string;
  personnummer:         string;
  identityType:         IdentityType;
  employmentNumber:     string;
  employmentType:       string;
  employmentStartedAt:  string;
  ongoingEmployment:    boolean; // true = "Tills vidare" (no end date stored)
  employmentEndedAt:    string;
  workLocationId:       string;
  systemRole:           string;
}

const EMPTY_FORM: CommonPersonnelForm = {
  firstName: '', lastName: '', email: '', mobilePhone: '', personnummer: '', identityType: 'personnummer',
  employmentNumber: '', employmentType: '', employmentStartedAt: '',
  ongoingEmployment: true, employmentEndedAt: '', workLocationId: '', systemRole: '',
};

interface AddPersonnelDialogProps {
  open:                boolean;
  onOpenChange:        (open: boolean) => void;
  /** Chosen "Trafiklärare" — parent closes this dialog and opens the existing InstructorForm. */
  onSelectInstructor:  () => void;
}

export function AddPersonnelDialog({ open, onOpenChange, onSelectInstructor }: AddPersonnelDialogProps) {
  const { can } = usePermissions();
  const canCreateInstructor = can(Permissions.INSTRUCTORS_CREATE);
  const canCreateAdmin      = can(Permissions.ADMIN_USER_CREATE);

  const { data: locations = [] } = useLocations();

  const [befattning, setBefattning] = useState<string>('');
  const [form, setForm] = useState<CommonPersonnelForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const inviteOrgUser = useInviteOrgUser();

  useEffect(() => {
    if (open) {
      setBefattning('');
      setForm(EMPTY_FORM);
      setErrors({});
    }
  }, [open]);

  function handleBefattningChange(value: string) {
    if (value === 'trafiklarare') {
      onOpenChange(false);
      onSelectInstructor();
      return;
    }
    setBefattning(value);
  }

  function field<K extends keyof CommonPersonnelForm>(key: K, value: CommonPersonnelForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    if (!befattning) return;

    const nextErrors: Record<string, string> = {};
    if (!form.firstName.trim()) nextErrors['firstName'] = 'Förnamn krävs.';
    if (!form.lastName.trim())  nextErrors['lastName']  = 'Efternamn krävs.';
    const emailError = validateEmail(form.email);
    if (emailError) nextErrors['email'] = emailError;
    if (!form.systemRole) nextErrors['systemRole'] = 'Systemroll krävs för att skapa kontot.';
    const personnummerError = validatePersonnummer(form.personnummer, form.identityType);
    if (personnummerError) nextErrors['personnummer'] = personnummerError;
    if (Object.keys(nextErrors).length > 0) { setErrors(nextErrors); return; }

    const input: InviteOrgUserInput = {
      email:      form.email.trim(),
      first_name: form.firstName.trim(),
      last_name:  form.lastName.trim(),
      role:       form.systemRole as InviteOrgUserInput['role'],
      job_title:  befattning,
    };
    if (form.mobilePhone.trim())         input.mobile_phone          = form.mobilePhone.trim();
    if (form.personnummer.trim()) {
      input.personnummer   = form.personnummer.trim();
      input.identity_type  = form.identityType;
    }
    if (form.employmentNumber.trim())    input.employment_number     = form.employmentNumber.trim();
    if (form.employmentType)             input.employment_type       = form.employmentType;
    if (form.employmentStartedAt)        input.employment_started_at = form.employmentStartedAt;
    if (!form.ongoingEmployment && form.employmentEndedAt) input.employment_ended_at = form.employmentEndedAt;
    if (form.workLocationId)             input.work_location_id      = form.workLocationId;

    inviteOrgUser.mutate(input, {
      onSuccess: (status) => {
        onOpenChange(false);
        toast(
          status === 'added_existing_user'
            ? { title: 'Personal tillagd', description: `${input.email} har redan ett konto och har lagts till i organisationen direkt.` }
            : { title: 'Inbjudan skickad', description: `En inbjudan har skickats till ${input.email}.` },
        );
      },
      onError: (e: Error) => toast({ title: 'Fel vid inbjudan', description: e.message, variant: 'destructive' }),
    });
  }

  const showCommonForm = befattning !== '' && befattning !== 'trafiklarare';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle>Lägg till personal</DialogTitle>
          <DialogDescription>
            Välj befattning för att fortsätta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="personnel_type">
              Personaltyp / Befattning <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Select value={befattning} onValueChange={handleBefattningChange}>
              <SelectTrigger id="personnel_type">
                <SelectValue placeholder="Välj befattning…" />
              </SelectTrigger>
              <SelectContent>
                {canCreateInstructor && (
                  <SelectItem value="trafiklarare">Trafiklärare</SelectItem>
                )}
                {canCreateAdmin && BEFATTNING_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showCommonForm && (
            <>
              {/* ── Personuppgifter ────────────────────────────────────── */}
              <Separator />
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Personuppgifter
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_first_name">Förnamn <span className="text-destructive" aria-hidden="true">*</span></Label>
                    <Input id="pf_first_name" placeholder="Erik" value={form.firstName} onChange={(e) => field('firstName', e.target.value)} />
                    {errors['firstName'] && <p className="text-xs text-destructive" role="alert">{errors['firstName']}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_last_name">Efternamn <span className="text-destructive" aria-hidden="true">*</span></Label>
                    <Input id="pf_last_name" placeholder="Lindqvist" value={form.lastName} onChange={(e) => field('lastName', e.target.value)} />
                    {errors['lastName'] && <p className="text-xs text-destructive" role="alert">{errors['lastName']}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf_personnummer">Personnummer / samordningsnummer</Label>
                  <div className="flex gap-2">
                    <div className="inline-flex rounded-md border border-input overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => field('identityType', 'personnummer')}
                        className={`px-3 py-1.5 text-sm ${form.identityType === 'personnummer' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'}`}
                      >
                        Personnummer
                      </button>
                      <button
                        type="button"
                        onClick={() => field('identityType', 'samordningsnummer')}
                        className={`px-3 py-1.5 text-sm border-l border-input ${form.identityType === 'samordningsnummer' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'}`}
                      >
                        Samordningsnummer
                      </button>
                    </div>
                    <Input id="pf_personnummer" className="flex-1" placeholder="ÅÅÅÅMMDD-XXXX" value={form.personnummer} onChange={(e) => field('personnummer', e.target.value)} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Frivilligt. Lagras krypterat och används aldrig som inloggning.
                    {form.identityType === 'samordningsnummer' ? ' Samordningsnummer har dag 61–91 (födelsedag + 60).' : ''}
                  </p>
                  {errors['personnummer'] && <p className="text-xs text-destructive" role="alert">{errors['personnummer']}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_email">E-postadress <span className="text-destructive" aria-hidden="true">*</span></Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                      <Input id="pf_email" type="email" className="pl-9" placeholder="namn@foretag.se" value={form.email} onChange={(e) => field('email', e.target.value)} />
                    </div>
                    {errors['email'] && <p className="text-xs text-destructive" role="alert">{errors['email']}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_mobile">Mobiltelefon</Label>
                    <Input id="pf_mobile" type="tel" placeholder="070-123 45 67" value={form.mobilePhone} onChange={(e) => field('mobilePhone', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* ── Anställning ─────────────────────────────────────────── */}
              <Separator />
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Anställning
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_emp_number">Anställningsnummer</Label>
                    <Input id="pf_emp_number" placeholder="EMP-001" value={form.employmentNumber} onChange={(e) => field('employmentNumber', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_emp_type">Anställningsform</Label>
                    <Select value={form.employmentType} onValueChange={(v) => field('employmentType', v)}>
                      <SelectTrigger id="pf_emp_type"><SelectValue placeholder="Välj…" /></SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPE_ENTRIES.map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_start">Startdatum</Label>
                    <Input id="pf_start" type="date" value={form.employmentStartedAt} onChange={(e) => field('employmentStartedAt', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pf_location">Arbetsplats / filial</Label>
                    <Select value={form.workLocationId} onValueChange={(v) => field('workLocationId', v)}>
                      <SelectTrigger id="pf_location"><SelectValue placeholder="Ej vald…" /></SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Slutdatum</Label>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex rounded-md border border-input overflow-hidden">
                      <button
                        type="button"
                        onClick={() => field('ongoingEmployment', true)}
                        className={`px-3 py-1.5 text-sm ${form.ongoingEmployment ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'}`}
                      >
                        Tills vidare
                      </button>
                      <button
                        type="button"
                        onClick={() => field('ongoingEmployment', false)}
                        className={`px-3 py-1.5 text-sm border-l border-input ${!form.ongoingEmployment ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted'}`}
                      >
                        Ange datum
                      </button>
                    </div>
                    {!form.ongoingEmployment && (
                      <Input type="date" className="max-w-[180px]" value={form.employmentEndedAt} onChange={(e) => field('employmentEndedAt', e.target.value)} />
                    )}
                  </div>
                </div>
              </div>

              {/* ── Systemåtkomst ───────────────────────────────────────── */}
              <Separator />
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Systemåtkomst
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="pf_system_role">Systemroll / behörighetsroll <span className="text-destructive" aria-hidden="true">*</span></Label>
                  <Select value={form.systemRole} onValueChange={(v) => field('systemRole', v)}>
                    <SelectTrigger id="pf_system_role"><SelectValue placeholder="Välj systemroll…" /></SelectTrigger>
                    <SelectContent>
                      {ADMIN_ROLE_ENTRIES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Styr vad personen kan göra i TrafikskolaOS — separat från befattningen ovan.
                  </p>
                  {errors['systemRole'] && <p className="text-xs text-destructive" role="alert">{errors['systemRole']}</p>}
                </div>
                <p className="text-xs text-muted-foreground">
                  En inbjudan med en länk för att skapa konto skickas till den angivna e-postadressen.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          {showCommonForm && (
            <Button size="sm" onClick={handleSubmit} disabled={inviteOrgUser.isPending}>
              {inviteOrgUser.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                  Skickar…
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Lägg till personal
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
