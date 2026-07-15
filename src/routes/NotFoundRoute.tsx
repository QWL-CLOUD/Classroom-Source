import { Link } from 'react-router-dom';

export function NotFoundRoute() {
  return (
    <section className="card empty-state">
      <h1>Page not found</h1>
      <p>The requested Classroom route is not registered.</p>
      <Link className="button" to="/today">
        Return to Today
      </Link>
    </section>
  );
}
