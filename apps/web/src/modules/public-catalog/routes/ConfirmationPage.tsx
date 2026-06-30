import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Mail, ArrowLeft } from 'lucide-react';

export function ConfirmationPage() {
  const { orgId, packageId } = useParams<{ orgId: string; packageId: string }>();
  const [searchParams] = useSearchParams();
  const enrollmentId = searchParams.get('ref');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3.5">
          {orgId && (
            <Link
              to={`/catalog/${orgId}`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Tillbaka till katalogen
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Tack för din anmälan!
          </h1>
          <p className="text-gray-600 mb-6 leading-relaxed">
            Din anmälan har tagits emot. Körskolan granskar den och kontaktar
            dig inom kort för bekräftelse och betalningsinformation.
          </p>

          {enrollmentId && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-gray-500 mb-1">Ärendenummer</p>
              <p className="font-mono text-sm text-gray-700 break-all">{enrollmentId}</p>
            </div>
          )}

          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4 text-left mb-6">
            <Mail className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Vad händer nu?</p>
              <p className="text-sm text-blue-800 mt-1">
                Körskolan granskar din anmälan och återkommer med bekräftelse
                och betalningsalternativ. Kolla din e-post och telefon.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {orgId && packageId && (
              <Link
                to={`/catalog/${orgId}/${packageId}`}
                className="inline-flex items-center justify-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Visa paket igen
              </Link>
            )}
            {orgId && (
              <Link
                to={`/catalog/${orgId}`}
                className="inline-flex items-center justify-center text-sm text-gray-500 hover:text-gray-700"
              >
                Se alla paket
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
