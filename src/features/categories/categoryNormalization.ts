export function normalizeCategoryName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeCategoryAliases(values: readonly string[]): {
  aliases: string[];
  normalizedAliases: string[];
} {
  const unique = new Map<string, string>();
  for (const value of values) {
    const display = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!display) continue;
    const normalized = normalizeCategoryName(display);
    if (!unique.has(normalized)) unique.set(normalized, display);
  }
  return {
    aliases: [...unique.values()],
    normalizedAliases: [...unique.keys()],
  };
}
