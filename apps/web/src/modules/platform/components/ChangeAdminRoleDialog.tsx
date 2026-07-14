import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Button, toast,
} from '@platform/ui';
import { useChangeAdminRole, type AdminRole } from '../hooks/usePlatformOrgMutations.js';
import type { PlatformOrgAdmin } from '../hooks/usePlatformOrgDetail.js';

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: 'org_owner',   label: 'Ägare' },
  { value: 'org_admin',   label: 'Admin' },
  { value: 'org_manager', label: 'Chef' },
];

interface ChangeAdminRoleDialogProps {
  open:    boolean;
  orgId:   string;
  admin:   PlatformOrgAdmin | null;
  onClose: () => void;
}

// Always mounted by the caller; only `open` toggles (Platform UI Stability
// Hardening Sprint). See PlatformOrganizationsPage.tsx's ConfirmDialog for
// the reference implementation of this pattern.
export function ChangeAdminRoleDialog({ open, orgId, admin, onClose }: ChangeAdminRoleDialogProps) {
  const changeRole = useChangeAdminRole(orgId);
  const [role, setRole] = useState<AdminRole>((admin?.role as AdminRole) ?? 'org_admin');

  // Reused across different admins without unmounting — sync the selected
  // role to whichever admin is active each time the dialog (re-)opens.
  useEffect(() => {
    if (open && admin) setRole(admin.role as AdminRole);
  }, [open, admin]);

  const displayName = admin
    ? [admin.first_name, admin.last_name].filter(Boolean).join(' ') || admin.email || admin.user_id
    : '';

  function handleConfirm() {
    if (!admin) return;
    changeRole.mutate(
      { userId: admin.user_id, role },
      {
        onSuccess: () => {
          toast({ title: 'Roll ändrad', description: `${displayName} är nu ${ROLE_OPTIONS.find(r => r.value === role)?.label ?? role}` });
          onClose();
        },
        onError: (err) => toast({ title: 'Fel', description: err.message, variant: 'destructive' }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Ändra roll — {displayName}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="change-role-select">Roll</label>
          <Select onValueChange={v => setRole(v as AdminRole)} value={role}>
            <SelectTrigger id="change-role-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={changeRole.isPending}>Avbryt</Button>
          <Button onClick={handleConfirm} disabled={changeRole.isPending || !admin || role === admin.role}>
            {changeRole.isPending ? 'Sparar…' : 'Spara'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
