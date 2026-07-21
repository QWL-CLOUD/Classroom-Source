import { Link } from 'react-router-dom';
import { FileJson } from 'lucide-react';
import { PagePlaceholder } from '@/shared/ui/PagePlaceholder';

export function ImportRoute() {
  return (
    <PagePlaceholder
      eyebrow="Settings & Data"
      title="Import Center"
      description="Scan a legacy backup locally before deciding whether to migrate supported records."
    >
      <div className="card empty-state">
        <FileJson size={34} />
        <p>Use the read-only v19 backup scanner to verify your private backup structure.</p>
        <Link className="button button-primary" to="/migration">
          Open migration preview
        </Link>
      </div>
    </PagePlaceholder>
  );
}
