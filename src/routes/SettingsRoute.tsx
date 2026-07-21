import { PagePlaceholder } from '@/shared/ui/PagePlaceholder';

export function SettingsRoute() {
  return (
    <PagePlaceholder
      eyebrow="Settings & Data"
      title="Settings"
      description="A dedicated settings workspace is planned for preferences that should be managed separately from teaching records."
      status="planned"
      nextStep="Current navigation preferences already persist on this device. Broader settings will be added only when their ownership and data rules are defined."
      availableNow={[{ to: '/system-health', label: 'Open System Health' }]}
    />
  );
}
