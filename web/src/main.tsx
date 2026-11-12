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
