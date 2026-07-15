import { describe, expect, it } from 'vitest';
import { scanLegacyBackupJson } from './legacyBackupScanner';

describe('legacy backup scanner', () => {
  it('scans a synthetic envelope without writing data', () => {
    const scan = scanLegacyBackupJson(
      JSON.stringify({
        format: 'classroom-full-local-backup-v18',
        appVersion: '18.0.0',
        storageEncoding: 'raw-localStorage-strings',
        data: {
          'cos-calendar-events': '[]',
          'cos-schedule-blocks': '[]',
        },
      }),
    );
    expect(scan.storeCount).toBe(2);
    expect(scan.recognizedStores).toHaveLength(2);
    expect(scan.warnings).toHaveLength(0);
  });
});
