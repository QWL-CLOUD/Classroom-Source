interface PagePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function PagePlaceholder({ eyebrow, title, description, children }: PagePlaceholderProps) {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{description}</p>
        </div>
      </header>
      {children ?? (
        <div className="card empty-state">
          <h2>Not available in this build</h2>
          <p>This workspace is reserved for a future Classroom update.</p>
        </div>
      )}
    </section>
  );
}
