import { PagePlaceholder } from '@/shared/ui/PagePlaceholder';

export function ExportRoute() {
  return (
    <PagePlaceholder
      eyebrow="Settings & Data"
      title="Export & Backup"
      description="A versioned, privacy-safe Classroom backup and restore workflow is planned but is not available yet."
      status="planned"
      nextStep="Backup design will be completed only after the remaining catalog records and privacy rules are stable enough to define a durable export format."
      availableNow={[
        { to: '/system-health', label: 'Open System Health' },
        { to: '/import', label: 'Open Import Center' },
      ]}
    />
  );
}
