import { describe, expect, it, vi } from 'vitest';

import {
  buildResourceFileMetadataWorkbook,
  buildResourceUrlWorkbook,
  inspectResourceUrl,
  normalizeResourceLocationForDuplicate,
  resourceFormatSuggestionForFile,
} from './resourceImportSourceAdapters';

describe('resourceImportSourceAdapters', () => {
  it('builds a local URL workbook without fetching remote content', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const workbook = buildResourceUrlWorkbook({
      title: 'Fictional reference',
      url: 'HTTPS://Example.invalid:443/resource#section',
      resourceFormat: 'URL',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(workbook.kind).toBe('paste-url');
    expect(workbook.worksheets[0]?.rows[1]).toEqual([
      'Fictional reference',
      'https://example.invalid/resource',
      'URL',
      '',
      '',
      '',
      '',
    ]);
    fetchSpy.mockRestore();
  });

  it('blocks unsafe URL schemes and embedded credentials', () => {
    expect(inspectResourceUrl('javascript:alert(1)').error).toContain('http:// and https://');
    expect(inspectResourceUrl('https://user:password@example.invalid/resource').error).toContain(
      'username or password',
    );
  });

  it('surfaces likely credential query parameters for reviewed preview', () => {
    const inspected = inspectResourceUrl(
      'https://example.invalid/resource?access_token=temporary&view=teacher#page',
    );
    expect(inspected.error).toBeUndefined();
    expect(inspected.credentialParameters).toEqual(['access_token']);
    expect(inspected.normalizedUrl).toBe(
      'https://example.invalid/resource?access_token=temporary&view=teacher',
    );
  });

  it('creates file metadata rows without reading file contents or retaining a local path', () => {
    const arrayBufferSpy = vi.fn(() => Promise.resolve(new ArrayBuffer(0)));
    const textSpy = vi.fn(() => Promise.resolve('private bytes must never be inspected'));
    const file = {
      name: 'Weather Deck.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size: 48,
      lastModified: Date.parse('2026-07-20T12:00:00.000Z'),
      webkitRelativePath: 'Private Folder / Weather Deck.pptx',
      arrayBuffer: arrayBufferSpy,
      text: textSpy,
    } as unknown as File;

    const workbook = buildResourceFileMetadataWorkbook({
      files: [file],
      locationLabel: 'Shared Drive / Grade 3',
    });

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();
    expect(workbook.kind).toBe('file-metadata');
    expect(workbook.worksheets[0]?.rows[1]).toEqual([
      'Weather Deck',
      'Slides',
      'Shared Drive / Grade 3 / Weather Deck.pptx',
      expect.stringContaining('File contents stored by Classroom: No'),
      '',
    ]);

    const serialized = JSON.stringify(workbook);
    expect(serialized).not.toContain('private bytes');
    expect(serialized).not.toContain('Private Folder');
  });

  it('normalizes safe URL duplicates and suggests reviewed formats from extension or MIME', () => {
    expect(normalizeResourceLocationForDuplicate('HTTPS://Example.INVALID:443/a#x')).toBe(
      'https://example.invalid/a',
    );
    expect(resourceFormatSuggestionForFile({ name: 'lesson.pdf', type: '' })).toBe('Document');
    expect(resourceFormatSuggestionForFile({ name: 'recording.bin', type: 'audio/mpeg' })).toBe(
      'Audio',
    );
  });
});
