import {
  libraryApplicationLinkListSchema,
  libraryApplicationLinkSchema,
  libraryApplicationSnapshotSchema,
  libraryCatalogItemSchema,
  type LibraryApplicationLink,
  type LibraryApplicationSnapshot,
  type LibraryApplicationType,
  type LibraryCatalogItem,
} from '@/domain/models/entities';

export interface LibraryApplicationView {
  libraryItemId: string;
  catalogType: LibraryApplicationType;
  title: string;
  description?: string;
  typedFields: LibraryCatalogItem['typedFields'];
  sourceStatus: LibraryCatalogItem['status'] | 'missing';
  sourceUpdatedAt?: string;
  snapshotCapturedAt?: string;
  usesSnapshot: boolean;
}

export function createLibraryApplicationSnapshot(
  item: LibraryCatalogItem,
  capturedAt = new Date().toISOString(),
): LibraryApplicationSnapshot {
  const parsed = libraryCatalogItemSchema.parse(item);
  if (parsed.catalogType === 'standard') {
    throw new Error('Standards cannot be attached before Phase 3F.');
  }
  return libraryApplicationSnapshotSchema.parse({
    catalogType: parsed.catalogType,
    title: parsed.title,
    description: parsed.description,
    typedFields: parsed.typedFields,
    sourceUpdatedAt: parsed.updatedAt,
    capturedAt,
  });
}

export function createLibraryApplicationLink(
  item: LibraryCatalogItem,
  options: { captureSnapshot?: boolean; capturedAt?: string } = {},
): LibraryApplicationLink {
  const parsed = libraryCatalogItemSchema.parse(item);
  if (parsed.catalogType === 'standard') {
    throw new Error('Standards cannot be attached before Phase 3F.');
  }
  return libraryApplicationLinkSchema.parse({
    libraryItemId: parsed.id,
    catalogType: parsed.catalogType,
    snapshot: options.captureSnapshot
      ? createLibraryApplicationSnapshot(parsed, options.capturedAt)
      : undefined,
  });
}

export function replaceLibraryApplicationLink(
  links: readonly LibraryApplicationLink[],
  replacement: LibraryApplicationLink,
): LibraryApplicationLink[] {
  return libraryApplicationLinkListSchema.parse(
    links.map((link) => (link.libraryItemId === replacement.libraryItemId ? replacement : link)),
  );
}

export function removeLibraryApplicationLink(
  links: readonly LibraryApplicationLink[],
  libraryItemId: string,
): LibraryApplicationLink[] {
  return libraryApplicationLinkListSchema.parse(
    links.filter((link) => link.libraryItemId !== libraryItemId),
  );
}

export function resolveLibraryApplicationView(
  link: LibraryApplicationLink,
  items: readonly LibraryCatalogItem[],
): LibraryApplicationView {
  const parsed = libraryApplicationLinkSchema.parse(link);
  const sourceValue = items.find((item) => item.id === parsed.libraryItemId);
  const source = sourceValue ? libraryCatalogItemSchema.parse(sourceValue) : undefined;
  if (parsed.snapshot) {
    return {
      libraryItemId: parsed.libraryItemId,
      catalogType: parsed.snapshot.catalogType,
      title: parsed.snapshot.title,
      description: parsed.snapshot.description,
      typedFields: parsed.snapshot.typedFields,
      sourceStatus: source?.status ?? 'missing',
      sourceUpdatedAt: source?.updatedAt,
      snapshotCapturedAt: parsed.snapshot.capturedAt,
      usesSnapshot: true,
    };
  }
  return {
    libraryItemId: parsed.libraryItemId,
    catalogType: parsed.catalogType,
    title: source?.title ?? 'Unavailable Library item',
    description: source?.description,
    typedFields: source?.typedFields,
    sourceStatus: source?.status ?? 'missing',
    sourceUpdatedAt: source?.updatedAt,
    usesSnapshot: false,
  };
}

export function listLibraryApplicationLinks(content: {
  libraryLinks?: readonly LibraryApplicationLink[];
  lessonFlow?: readonly { libraryLinks?: readonly LibraryApplicationLink[] }[];
}): LibraryApplicationLink[] {
  return [
    ...(content.libraryLinks ?? []),
    ...(content.lessonFlow ?? []).flatMap((step) => step.libraryLinks ?? []),
  ].map((link) => libraryApplicationLinkSchema.parse(link));
}
