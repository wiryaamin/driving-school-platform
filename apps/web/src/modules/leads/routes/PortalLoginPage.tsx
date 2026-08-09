import { Link } from 'react-router-dom';
import { GraduationCap, Users, Car, ArrowRight } from 'lucide-react';

interface PortalOption {
  to:          string;
  icon:        typeof GraduationCap;
  title:       string;
  description: string;
}

const PORTAL_OPTIONS: PortalOption[] = [
  {
    to:          '/portal',
    icon:        GraduationCap,
    title:       'Elevportal',
    description: 'Se dina bokningar, din utveckling och dina dokument.',
  },
  {
    to:          '/guardian',
    icon:        Users,
    title:       'Föräldraportal',
    description: 'Följ ditt barns utbildning, bokningar och betalningar.',
  },
  {
    to:          '/instructor-portal',
    icon:        Car,
    title:       'Lärarportal',
    description: 'Hantera ditt schema och dina elever.',
  },
];

export function PortalLoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Logga in</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Välj din portal nedan. Du loggar in med den personliga länk du fått
            från din trafikskola via e-post eller SMS — inte med lösenord.
          </p>
        </div>

        <div className="space-y-3">
          {PORTAL_OPTIONS.map(({ to, icon: Icon, title, description }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition-all group"
            >
              <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                <Icon className="w-5 h-5 text-blue-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600 transition-colors shrink-0" />
            </Link>
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Har du ingen personlig länk? Kontakta din trafikskola för att få en.
        </p>
      </div>
    </div>
  );
}
