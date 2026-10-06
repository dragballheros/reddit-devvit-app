import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MenuApp } from './MenuApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MenuApp />
  </StrictMode>,
);
