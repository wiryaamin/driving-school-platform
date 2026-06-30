import { supabase } from '@core/api/supabase.js';

export function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 50);
}

export async function generateUniqueSlug(name: string): Promise<string> {
  const raw = generateSlug(name);
  let base = raw.length >= 3 ? raw : `${raw}org`;
  if (base.length < 3) base = 'org';

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;

    const { data } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (data === null) return candidate;
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
