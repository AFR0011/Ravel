'use client';

import type { MouseEvent } from 'react';
import SettingsWorkspace from './SettingsWorkspace';

export default function SettingsPageClient() {
  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const settingsHomeLink = target.closest<HTMLAnchorElement>('a[href="/app/settings"]');
    if (
      !settingsHomeLink ||
      window.location.pathname !== '/app/settings' ||
      !window.location.hash
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    window.dispatchEvent(new Event('hashchange'));
  };

  return (
    <div onClickCapture={handleClickCapture}>
      <SettingsWorkspace />
    </div>
  );
}
