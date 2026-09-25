import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './styles/index.css';
import { App } from './App';
import { installTapSounds } from './audio/sound';

// Soft tap sounds for every button (docs/ART_DIRECTION.md › เสียง).
installTapSounds();

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
