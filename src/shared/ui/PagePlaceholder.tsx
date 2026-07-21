import { Link } from 'react-router-dom';
import styles from './PagePlaceholder.module.css';

interface AvailableWorkspaceLink {
  to: string;
  label: string;
}

interface PagePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
  status?: 'planned';
  phase?: string;
  nextStep?: string;
  availableNow?: AvailableWorkspaceLink[];
  children?: React.ReactNode;
}

export function PagePlaceholder({
  eyebrow,
  title,
  description,
  status,
  phase,
  nextStep,
  availableNow = [],
  children,
}: PagePlaceholderProps) {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{eyebrow}</p>
          <div className={styles.titleRow}>
            <h1 className="page-title">{title}</h1>
            {status === 'planned' ? <span className={styles.statusBadge}>Planned</span> : null}
          </div>
          <p className="page-subtitle">{description}</p>
        </div>
      </header>
      {children ?? (
        <div className={`card ${styles.plannedCard}`}>
          <div>
            <h2>Planned workspace</h2>
            {phase ? <p className={styles.phase}>{phase}</p> : null}
          </div>
          <p>
            {nextStep ??
              'This workspace is reserved for a future Classroom phase and is not broken or missing data.'}
          </p>
          {availableNow.length > 0 ? (
            <div className={styles.availableNow}>
              <strong>Available now</strong>
              <div className={styles.links}>
                {availableNow.map((link) => (
                  <Link key={link.to} className="button button-secondary" to={link.to}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
