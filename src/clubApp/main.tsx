import {initializeTheme,chooseSkin,chooseTheme,currentTheme} from '../theme';
import { applyDisplayEffects } from '../displayEffects';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../shell.css';
import ClubApp from './ClubApp';
import { initMonitoring, watchPageviews } from '../monitoring/monitoring';

// The RallyQ app: club screens only (no personal Home, Matches, Train, Stats or Coach).
applyDisplayEffects();
initializeTheme();
chooseSkin('court');
if(currentTheme()==='auto')chooseTheme('dark');

// Error and usage monitoring: does nothing unless VITE_SENTRY_DSN / VITE_POSTHOG_KEY are set when building. See docs/MONITORING.md.
void initMonitoring({ sentryDsn: import.meta.env.VITE_SENTRY_DSN, posthogKey: import.meta.env.VITE_POSTHOG_KEY, posthogHost: import.meta.env.VITE_POSTHOG_HOST, release: __BUILD_ID__, channel: import.meta.env.VITE_CHANNEL })
  .then((on) => { if (on.posthog) watchPageviews(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClubApp />
  </StrictMode>,
);

import '../skin.css';

import '../prototype6.css';

import '../club/matchday.css';

import '../court-skin.css';

import '../club/live-view.css';
import '../rallyq/tokens.css';
