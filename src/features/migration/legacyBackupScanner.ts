import { z } from 'zod';

const legacyBackupEnvelopeSchema = z.object({
  format: z.string().min(1),
  appVersion: z.string().optional(),
  exportedAt: z.string().optional(),
  storageEncoding: z.string().optional(),
  data: z.record(z.string(), z.string()),
});

export interface LegacyBackupScan {
  format: string;
  appVersion?: string;
  exportedAt?: string;
  storageEncoding?: string;
  storeCount: number;
  recognizedStores: string[];
  warnings: string[];
}

const recognizedStoreNames = [
  'cos-calendar-events',
  'cos-schedule-blocks',
  'cos-lessons',
  'cos-tasks',
  'cos-students',
  'cos-classes',
  'cos-groups',
  'cos-toolkit',
  'cos-standards',
  'cos-planning-templates',
  'cos-calendar-quarantine-v19',
];

export function scanLegacyBackupJson(rawText: string): LegacyBackupScan {
  const parsedJson: unknown = JSON.parse(rawText);
  const envelope = legacyBackupEnvelopeSchema.parse(parsedJson);
  const storeNames = Object.keys(envelope.data);
  const recognizedStores = recognizedStoreNames.filter((store) => storeNames.includes(store));
  const warnings: string[] = [];

  if (envelope.storageEncoding !== 'raw-localStorage-strings') {
    warnings.push('This backup uses an unfamiliar storage encoding.');
  }
  if (recognizedStores.length === 0) {
    warnings.push('No known Classroom legacy stores were found.');
  }

  return {
    format: envelope.format,
    appVersion: envelope.appVersion,
    exportedAt: envelope.exportedAt,
    storageEncoding: envelope.storageEncoding,
    storeCount: storeNames.length,
    recognizedStores,
    warnings,
  };
}
