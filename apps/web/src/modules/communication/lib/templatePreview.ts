export function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([^}]+)\}/g, (match, key: string) => vars[key] ?? match);
}
