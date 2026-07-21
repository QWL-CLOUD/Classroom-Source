import { PagePlaceholder } from '@/shared/ui/PagePlaceholder';

export function InsightsRoute() {
  return (
    <PagePlaceholder
      eyebrow="Reflect"
      title="Teaching Insights"
      description="Reflection, teaching memory, and source-linked insights will be developed after the catalog and alignment foundations."
      status="planned"
      phase="Phase 4 — Teaching Intelligence"
      nextStep="Session Reflection and explicit Next Steps must exist before Classroom can produce trustworthy teaching insights."
      availableNow={[
        { to: '/learners', label: 'Open Learners' },
        { to: '/agenda', label: 'Open Agenda' },
      ]}
    />
  );
}
