import { RootProviders } from '@app/providers/index.js';
import { AppRouter } from '@app/router/index.js';

export default function App() {
  return (
    <RootProviders>
      <AppRouter />
    </RootProviders>
  );
}
