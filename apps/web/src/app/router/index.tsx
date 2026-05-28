import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes.js';
import { ErrorBoundary } from '@shared/components/errors/ErrorBoundary.js';

const router = createBrowserRouter(routes, {
  future: {
    v7_normalizeFormMethod: true,
  },
});

export function AppRouter() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
