import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '../styles.css';
import ClubApp from './ClubApp';

// The PaddleQ app: club screens only (no personal Home, Matches, Train, Stats or Coach).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClubApp />
  </StrictMode>,
);
