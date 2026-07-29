export interface ImportTableRow {
  sourceRow: number;
  values: string[];
}

export interface ImportTable {
  headerRow: number;
  headers: string[];
  rows: ImportTableRow[];
}

export type ImportColumnMapping<TField extends string> = Record<TField, number | null>;
export type ImportHeaderAliases<TField extends string> = Record<TField, readonly string[]>;

export function normalizeImportText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeImportHeader(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '');
}

export function buildImportTable(rows: readonly (readonly string[])[]): ImportTable {
  const headerIndex = rows.findIndex((row) => row.some((value) => value.trim()));
  if (headerIndex < 0) throw new Error('The selected worksheet contains no rows.');
  const width = Math.max(...rows.slice(headerIndex).map((row) => row.length), 1);
  const rawHeaders = Array.from({ length: width }, (_, index) =>
    normalizeImportText(rows[headerIndex]?.[index] ?? ''),
  );
  const used = new Map<string, number>();
  const headers = rawHeaders.map((header, index) => {
    const base = header || `Column ${index + 1}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const dataRows = rows
    .slice(headerIndex + 1)
    .map((row, index) => ({
      sourceRow: headerIndex + index + 2,
      values: Array.from({ length: width }, (_, column) => row[column] ?? ''),
    }))
    .filter((row) => row.values.some((value) => value.trim()));
  return { headerRow: headerIndex + 1, headers, rows: dataRows };
}

export function createEmptyImportColumnMapping<TField extends string>(
  fieldKeys: readonly TField[],
): ImportColumnMapping<TField> {
  return Object.fromEntries(fieldKeys.map((key) => [key, null])) as ImportColumnMapping<TField>;
}

export function suggestImportColumnMapping<TField extends string>(
  headers: readonly string[],
  fieldKeys: readonly TField[],
  aliases: ImportHeaderAliases<TField>,
): ImportColumnMapping<TField> {
  const mapping = createEmptyImportColumnMapping(fieldKeys);
  const normalizedHeaders = headers.map(normalizeImportHeader);
  for (const key of fieldKeys) {
    const index = normalizedHeaders.findIndex((header) => aliases[key].includes(header));
    if (index >= 0) mapping[key] = index;
  }
  return mapping;
}

export function mappedImportValue<TField extends string>(
  row: ImportTableRow,
  mapping: ImportColumnMapping<TField>,
  key: TField,
): string {
  const column = mapping[key];
  return column === null ? '' : normalizeImportText(row.values[column] ?? '');
}
