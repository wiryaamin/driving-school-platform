import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@core/api/supabase.js';
import { useSession } from './useSession.js';

// ─── Org branding asset upload ─────────────────────────────────────────────
//
// Backs every logo/image slot under Settings → Webbplats → Varumärke and the
// invoice logo under Settings → Ekonomi → Kassa. Files go to the public
// org-branding Storage bucket (supabase/migrations/20260724000007_org_branding_storage.sql)
// at {organization_id}/{asset_key}.{ext}; the resulting public URL is saved
// to organizations.settings.branding_assets[asset_key].

export type BrandingAssetKey =
  | 'logo_light' | 'logo_dark' | 'background' | 'welcome_image'
  | 'og_image' | 'favicon' | 'ecommerce_logo' | 'invoice_logo';

export function useOrgBrandingAssets() {
  const { organization } = useSession();
  const orgId = organization?.id;

  return useQuery<Record<string, string>>({
    queryKey: ['org-branding-assets', orgId],
    queryFn: async () => {
      if (!orgId) return {};
      const { data } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      const settings = (data as unknown as { settings: Record<string, unknown> } | null)?.settings ?? {};
      return (settings['branding_assets'] as Record<string, string> | undefined) ?? {};
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useUploadOrgBrandingAsset() {
  const { organization } = useSession();
  const orgId = organization?.id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetKey, file }: { assetKey: BrandingAssetKey; file: File }) => {
      if (!orgId) throw new Error('Ingen organisation');

      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
      const path = `${orgId}/${assetKey}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('org-branding')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: pub } = supabase.storage.from('org-branding').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`; // cache-bust on replace

      const { data: cur } = await supabase.from('organizations').select('settings').eq('id', orgId).single();
      const currentSettings = (cur as unknown as { settings: Record<string, unknown> } | null)?.settings ?? {};
      const currentAssets = (currentSettings['branding_assets'] as Record<string, string> | undefined) ?? {};

      const { error: dbError } = await supabase.from('organizations').update({
        settings: { ...currentSettings, branding_assets: { ...currentAssets, [assetKey]: publicUrl } },
      } as never).eq('id', orgId);
      if (dbError) throw new Error(dbError.message);

      return publicUrl;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-branding-assets', orgId] });
    },
  });
}
