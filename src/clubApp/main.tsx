import { applyDisplayEffects } from '../displayEffects';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import ClubApp from './ClubApp';

// The PaddleQ app: club screens only (no personal Home, Matches, Train, Stats or Coach).
applyDisplayEffects();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClubApp />
  </StrictMode>,
);
