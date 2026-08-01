import type { ImportWorkbook } from '@/features/importCenter/importTypes';

export const RESOURCE_URL_CREDENTIAL_PARAMETERS = [
  'token',
  'access_token',
  'auth',
  'authorization',
  'password',
  'secret',
  'signature',
  'sig',
  'key',
  'code',
] as const;

export interface ResourceUrlInspection {
  normalizedUrl?: string;
  credentialParameters: string[];
  error?: string;
}

export interface ResourceUrlSourceInput {
  title: string;
  url: string;
  resourceFormat?: string;
  usageNotes?: string;
  externalSource?: string;
  externalKey?: string;
  sourceReference?: string;
}

export interface ResourceFileMetadataInput {
  files: readonly File[];
  locationLabel?: string;
}

function normalizedCredentialName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function inspectResourceUrl(value: string): ResourceUrlInspection {
  const trimmed = value.trim();
  if (!trimmed) return { credentialParameters: [], error: 'URL is required.' };
  if (trimmed.length > 2000) {
    return { credentialParameters: [], error: 'URL exceeds 2,000 characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { credentialParameters: [], error: 'Enter a valid absolute URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      credentialParameters: [],
      error: 'Only http:// and https:// URLs can be imported.',
    };
  }
  if (!parsed.hostname) {
    return { credentialParameters: [], error: 'The URL must contain a host.' };
  }
  if (parsed.username || parsed.password) {
    return {
      credentialParameters: [],
      error: 'URLs containing an embedded username or password cannot be imported.',
    };
  }

  parsed.protocol = parsed.protocol.toLocaleLowerCase('en-US');
  parsed.hostname = parsed.hostname.toLocaleLowerCase('en-US');
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }
  parsed.hash = '';

  const credentialNames = new Set(RESOURCE_URL_CREDENTIAL_PARAMETERS);
  const credentialParameters = [...parsed.searchParams.keys()]
    .filter((name) =>
      credentialNames.has(
        normalizedCredentialName(name) as (typeof RESOURCE_URL_CREDENTIAL_PARAMETERS)[number],
      ),
    )
    .map((name) => normalizedCredentialName(name));

  return {
    normalizedUrl: parsed.toString(),
    credentialParameters: [...new Set(credentialParameters)].sort(),
  };
}

export function normalizeResourceLocationForDuplicate(value: string): string {
  const inspection = inspectResourceUrl(value);
  if (inspection.normalizedUrl && !inspection.error) return inspection.normalizedUrl;
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function fileExtension(fileName: string): string {
  const name = fileName.trim();
  const index = name.lastIndexOf('.');
  if (index <= 0 || index === name.length - 1) return '';
  return name.slice(index + 1).toLocaleLowerCase('en-US');
}

export function resourceFormatSuggestionForFile(
  file: Pick<File, 'name' | 'type'>,
): string | undefined {
  const extension = fileExtension(file.name);
  const mime = file.type.toLocaleLowerCase('en-US');
  if (['ppt', 'pptx', 'key'].includes(extension)) return 'Slides';
  if (['doc', 'docx', 'pdf', 'rtf', 'txt'].includes(extension)) return 'Document';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension) || mime.startsWith('image/'))
    return 'Image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(extension) || mime.startsWith('audio/'))
    return 'Audio';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(extension) || mime.startsWith('video/'))
    return 'Video';
  if (['xls', 'xlsx', 'csv', 'tsv', 'ods'].includes(extension)) return 'Worksheet';
  if (['html', 'htm', 'url'].includes(extension)) return 'URL';
  return undefined;
}

function titleFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const index = trimmed.lastIndexOf('.');
  return (index > 0 ? trimmed.slice(0, index) : trimmed) || 'Untitled file reference';
}

function metadataNotes(file: Pick<File, 'name' | 'type' | 'size' | 'lastModified'>): string {
  const modified =
    Number.isFinite(file.lastModified) && file.lastModified > 0
      ? new Date(file.lastModified).toISOString().slice(0, 10)
      : 'Unknown';
  return [
    'File metadata',
    `File name: ${file.name}`,
    `MIME type: ${file.type || 'Unknown'}`,
    `Size: ${file.size.toLocaleString('en-US')} bytes`,
    `Last modified: ${modified}`,
    'File contents stored by Classroom: No',
  ].join('\n');
}

export function buildResourceUrlWorkbook(input: ResourceUrlSourceInput): ImportWorkbook {
  const title = input.title.trim();
  if (!title) throw new Error('Title is required for a URL Resource.');
  if (title.length > 240) throw new Error('Title exceeds 240 characters.');
  const inspection = inspectResourceUrl(input.url);
  if (inspection.error || !inspection.normalizedUrl) {
    throw new Error(inspection.error ?? 'The URL could not be normalized.');
  }

  return {
    kind: 'paste-url',
    sourceLabel: inspection.normalizedUrl,
    diagnostics: inspection.credentialParameters.length
      ? [
          {
            severity: 'warning',
            message: `The URL contains possible credential parameters: ${inspection.credentialParameters.join(', ')}.`,
            worksheetName: 'URL Resource',
            sourceRow: 2,
          },
        ]
      : [],
    worksheets: [
      {
        id: 'resource-url',
        name: 'URL Resource',
        rows: [
          [
            'Title',
            'Source or Location',
            'Resource Format',
            'Usage Notes',
            'External Source',
            'Resource ID',
            'Source Reference',
          ],
          [
            title,
            inspection.normalizedUrl,
            input.resourceFormat?.trim() ?? '',
            input.usageNotes?.trim() ?? '',
            input.externalSource?.trim() ?? '',
            input.externalKey?.trim() ?? '',
            input.sourceReference?.trim() ?? '',
          ],
        ],
      },
    ],
  };
}

export function buildResourceFileMetadataWorkbook(
  input: ResourceFileMetadataInput,
): ImportWorkbook {
  if (input.files.length === 0)
    throw new Error('Choose at least one file to create metadata rows.');
  if (input.files.length > 5000) throw new Error('Choose no more than 5,000 files at a time.');
  const location = input.locationLabel?.trim();
  if (location && location.length > 1000)
    throw new Error('Location label exceeds 1,000 characters.');

  const rows = input.files.map((file) => [
    titleFromFileName(file.name),
    resourceFormatSuggestionForFile(file) ?? '',
    location ? `${location} / ${file.name}` : file.name,
    metadataNotes(file),
    location ? '' : 'Only the file name is retained. Classroom does not store or reopen the file.',
  ]);

  return {
    kind: 'file-metadata',
    sourceLabel: `${input.files.length} local file metadata row${input.files.length === 1 ? '' : 's'}`,
    diagnostics: location
      ? []
      : [
          {
            severity: 'warning',
            message:
              'Only file names will be retained because no location label was provided. File contents are not stored.',
            worksheetName: 'File Metadata',
          },
        ],
    worksheets: [
      {
        id: 'resource-file-metadata',
        name: 'File Metadata',
        rows: [['Title', 'Resource Format', 'Source or Location', 'Usage Notes', 'Notes'], ...rows],
      },
    ],
  };
}
