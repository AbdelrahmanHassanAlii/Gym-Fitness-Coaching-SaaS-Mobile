import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { appQueryClient } from '@/query';

export function AppInfrastructureProvider({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={appQueryClient}>
      {children}
    </QueryClientProvider>
  );
}
