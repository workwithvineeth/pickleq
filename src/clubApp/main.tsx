import {initializeTheme,chooseSkin,chooseTheme,currentTheme} from '../theme';
import { applyDisplayEffects } from '../displayEffects';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import '../shell.css';
import ClubApp from './ClubApp';

// The RallyQ app: club screens only (no personal Home, Matches, Train, Stats or Coach).
applyDisplayEffects();
initializeTheme();
chooseSkin('court');
if(currentTheme()==='auto')chooseTheme('dark');

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
