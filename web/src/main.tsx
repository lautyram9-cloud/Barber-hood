import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import './index.css';
import { App } from './App';
import { SessionProvider } from './state/session';
import { PeriodProvider } from './state/period';
import { FeedbackProvider } from './state/feedback';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <PeriodProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </PeriodProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// PWA: solo cuando la app está en la raíz del sitio (corte final). En la vista previa (/next/) NO se
// registra, para no competir con el service worker de la versión estable que cubre esa ruta.
if ('serviceWorker' in navigator && import.meta.env.PROD && !location.pathname.includes('/next/')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
