import { Navigate } from 'react-router-dom';

// This route (/settings/communication/templates) used to hold a local-state
// CRUD form that saved to organizations.settings.message_templates — a
// JSONB blob no notification rule, automation rule, or scheduled send ever
// read. A tenant could fill it in, see a "Sparat" success toast, and
// reasonably believe they'd configured their booking-confirmation SMS,
// when nothing downstream was affected.
//
// The real, working message-template system already exists at
// /communication/templates (TemplateManagementPage, backed by
// notification_templates) and is already the link target
// KommunikationConfigPage's own "Meddelandemallar" status card points to —
// this route is unreachable from any current navigation. Redirecting
// rather than deleting keeps any existing bookmark/link working, landing
// on the system that actually does something.
export function MeddelandemallarPage() {
  return <Navigate to="/communication/templates" replace />;
}
