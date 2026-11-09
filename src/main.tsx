import { initializeTheme } from './theme';
import { applyDisplayEffects } from './displayEffects';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './shell.css';
import App from './App';

applyDisplayEffects();
initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

import './skin.css';

import './prototype6.css';
