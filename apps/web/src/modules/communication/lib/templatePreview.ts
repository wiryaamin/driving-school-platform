export function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(
    /\{\{([^}]+)\}\}|\{([^}]+)\}/g,
    (match, dblKey: string | undefined, singleKey: string | undefined) => {
      const key = dblKey ?? singleKey ?? '';
      return vars[key] ?? match;
    },
  );
}
