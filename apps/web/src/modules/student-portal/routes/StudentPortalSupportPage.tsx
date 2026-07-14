import { Phone, Mail, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import { usePortalOrg } from '../hooks/useStudentPortal.js';

const BRAND = '#684EFF';

const FAQ = [
  {
    q: 'Hur avbokar jag en lektion?',
    a: 'Gå till Mina lektioner, öppna bokningen och välj Avboka. Avbokning är möjlig fram till 24 timmar innan lektionen.',
  },
  {
    q: 'Hur bokar jag en ny lektion?',
    a: 'Använd Boka-knappen längst ned på skärmen (mobil) eller i sidhuvudet (dator) för att se lediga tider och boka direkt.',
  },
  {
    q: 'Var ser jag mina betalningar och fakturor?',
    a: 'Under Min ekonomi ser du saldo, fakturor och dina lektionspaket.',
  },
  {
    q: 'Hur uppdaterar jag mina uppgifter?',
    a: 'Personuppgifter uppdateras av din trafikskola — kontakta skolan så hjälper de dig.',
  },
];

// ─── StudentPortalSupportPage ─────────────────────────────────────────────────

export function StudentPortalSupportPage() {
  const { data: org, isLoading, error } = usePortalOrg();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Support</h1>
        <p className="text-sm text-gray-400 mt-0.5">Kontakta din trafikskola eller läs vanliga frågor</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="bg-red-50 rounded-2xl border border-red-100 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">Kunde inte ladda kontaktuppgifter. Försök igen senare.</p>
        </div>
      )}

      {/* Contact card */}
      {!isLoading && !error && org && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-800 mb-3">Kontakta {org.name}</p>
          <div className="space-y-2">
            {org.contact_phone && (
              <a
                href={`tel:${org.contact_phone}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${BRAND}14` }}
                >
                  <Phone className="w-4 h-4" style={{ color: BRAND }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{org.contact_phone}</p>
                  <p className="text-xs text-gray-400">Ring oss</p>
                </div>
              </a>
            )}
            {org.contact_email && (
              <a
                href={`mailto:${org.contact_email}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${BRAND}14` }}
                >
                  <Mail className="w-4 h-4" style={{ color: BRAND }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{org.contact_email}</p>
                  <p className="text-xs text-gray-400">Skicka e-post</p>
                </div>
              </a>
            )}
            {!org.contact_phone && !org.contact_email && (
              <p className="text-sm text-gray-400">
                Inga kontaktuppgifter är registrerade för {org.name} ännu.
              </p>
            )}
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="w-4 h-4" style={{ color: BRAND }} />
          <p className="text-sm font-semibold text-gray-800">Vanliga frågor</p>
        </div>
        <div className="divide-y divide-gray-50">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-gray-800">{q}</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
