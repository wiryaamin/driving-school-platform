import { Mail, Phone, MapPin, Instagram, Facebook } from 'lucide-react';

export interface TenantBrandingContact {
  contact: {
    email:   string | null;
    phone:   string | null;
    address: string | null;
  };
  social: {
    instagram?: string;
    facebook?:  string;
    tiktok?:    string;
    youtube?:   string;
  };
}

interface TenantContactFooterProps {
  branding?: TenantBrandingContact | null | undefined;
}

export function TenantContactFooter({ branding }: TenantContactFooterProps) {
  if (!branding) return null;
  const { contact, social } = branding;
  const hasContact = Boolean(contact.email || contact.phone || contact.address);
  const hasSocial  = Object.values(social).some(Boolean);
  if (!hasContact && !hasSocial) return null;

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-500">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors">
            <Mail className="w-3.5 h-3.5" /> {contact.email}
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors">
            <Phone className="w-3.5 h-3.5" /> {contact.phone}
          </a>
        )}
        {contact.address && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {contact.address}
          </span>
        )}
        {social.instagram && (
          <a href={social.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors">
            <Instagram className="w-3.5 h-3.5" /> Instagram
          </a>
        )}
        {social.facebook && (
          <a href={social.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-blue-700 transition-colors">
            <Facebook className="w-3.5 h-3.5" /> Facebook
          </a>
        )}
        {social.tiktok && (
          <a href={social.tiktok} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 transition-colors">TikTok</a>
        )}
        {social.youtube && (
          <a href={social.youtube} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700 transition-colors">YouTube</a>
        )}
      </div>
    </div>
  );
}
