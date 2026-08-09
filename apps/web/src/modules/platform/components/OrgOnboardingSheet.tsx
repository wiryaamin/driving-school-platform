import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@platform/ui';
import { OnboardingJourneyPanel } from './OnboardingJourneyPanel.js';

interface OrgOnboardingSheetProps {
  open:              boolean;
  orgId:             string | null;
  orgName:           string | null;
  onClose:           () => void;
  onGoLiveApproved?: () => void;
}

/**
 * Thin overlay around the existing OnboardingJourneyPanel — lets the
 * Onboarding Command Center open a customer's full onboarding journey
 * (steps, blocking reason, recovery actions) without leaving the list, the
 * same way DemoRequestDetailSheet already does for pre-conversion leads.
 * No onboarding logic lives here; it's entirely OnboardingJourneyPanel's.
 */
export function OrgOnboardingSheet({ open, orgId, orgName, onClose, onGoLiveApproved }: OrgOnboardingSheetProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col p-0 gap-0">
        {orgId && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
              <DialogTitle className="text-lg">{orgName ?? 'Onboarding-resa'}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">Onboarding-resa</DialogDescription>
            </DialogHeader>
            <div className="px-6 pb-6 overflow-y-auto flex-1">
              {onGoLiveApproved
                ? <OnboardingJourneyPanel orgId={orgId} onGoLiveApproved={onGoLiveApproved} />
                : <OnboardingJourneyPanel orgId={orgId} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
