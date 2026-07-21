import { PagePlaceholder } from '@/shared/ui/PagePlaceholder';

export function LibraryRoute() {
  return (
    <PagePlaceholder
      eyebrow="Resources"
      title="Library"
      description="Reusable activities, resources, assessments, and standards will live here after the managed-vocabulary foundation is complete."
      status="planned"
      phase="Phase 3E-2 — Library Catalog Foundation"
      nextStep="Phase 3E-1 will establish Categories & Labels first, so Library records can use stable formats, tags, and identities instead of temporary free text."
      availableNow={[
        { to: '/planning/edit', label: 'Open Planning' },
        { to: '/learners', label: 'Open Learners' },
      ]}
    />
  );
}
