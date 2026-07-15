import { PagePlaceholder } from '@/shared/ui/PagePlaceholder';

export function SettingsRoute() {
  return (
    <PagePlaceholder
      eyebrow="System"
      title="Settings"
      description="Only lightweight UI preferences will use localStorage; domain records remain in IndexedDB."
    />
  );
}
