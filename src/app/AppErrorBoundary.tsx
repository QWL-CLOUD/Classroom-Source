import { AlertTriangle, HeartPulse, RefreshCcw, RotateCcw, ShieldCheck } from 'lucide-react';
import { Component, type ReactNode } from 'react';

import styles from './AppErrorBoundary.module.css';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // React reports the development error separately. The recovery view deliberately
    // avoids rendering stack traces or application record content.
  }

  private resetView = (): void => {
    this.setState({ hasError: false });
  };

  private reloadApplication = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className={styles.page}>
        <section className={styles.card} role="alert" aria-labelledby="app-error-heading">
          <div className={styles.iconWrap} aria-hidden="true">
            <AlertTriangle size={30} />
          </div>
          <p className={styles.eyebrow}>Classroom recovery</p>
          <h1 id="app-error-heading">This view could not be opened safely.</h1>
          <p className={styles.summary}>
            An unexpected application error interrupted the screen. This error does not itself
            delete the Classroom records stored in this browser.
          </p>
          <div className={styles.safetyNote}>
            <ShieldCheck size={20} aria-hidden="true" />
            <span>
              Use System Health to download a privacy-safe diagnostic report, and Backup &amp;
              Recovery to create a portable copy before making larger changes.
            </span>
          </div>
          <div className={styles.actions} aria-label="Recovery actions">
            <button className="button button-primary" type="button" onClick={this.resetView}>
              <RotateCcw size={17} aria-hidden="true" /> Try this view again
            </button>
            <button className="button" type="button" onClick={this.reloadApplication}>
              <RefreshCcw size={17} aria-hidden="true" /> Reload Classroom
            </button>
            <a className="button" href="#/system-health">
              <HeartPulse size={17} aria-hidden="true" /> System Health
            </a>
            <a className="button" href="#/export">
              <ShieldCheck size={17} aria-hidden="true" /> Backup &amp; Recovery
            </a>
          </div>
        </section>
      </main>
    );
  }
}
