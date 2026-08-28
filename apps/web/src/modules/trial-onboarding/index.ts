export { StartTrialPage } from './routes/StartTrialPage.js';
export { TrialOnboardingWizardPage } from './routes/TrialOnboardingWizardPage.js';
export { TrialSignupForm } from './components/TrialSignupForm.js';

// Canonical business setup model + field kit — reused by Platform Admin's
// BusinessSetupSection (Tenant Registration Unification, 2026-08-28) so
// both tenant-creation paths collect the exact same fields.
export * from './lib/businessSetupAnswers.js';
export * from './components/BusinessSetupFieldKit.js';
