import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorState, LoadingState } from './components/ui';
import { AppProvider, useApp } from './context/AppContext';
import { Alerts } from './pages/Alerts';
import { Catalog } from './pages/Catalog';
import { Dashboard } from './pages/Dashboard';
import { FlowMap } from './pages/FlowMap';
import { Integration } from './pages/Integration';
import { PLANS, Roadmap } from './pages/Roadmap';

function DataGate({ children }: { children: React.ReactNode }) {
  const { loading, error, reload, store } = useApp();
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !store) return <LoadingState text="Carregando indicadores das URAs…" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Layout>
          <Routes>
            <Route path="/" element={<DataGate><Dashboard /></DataGate>} />
            <Route path="/uras" element={<DataGate><Catalog /></DataGate>} />
            <Route path="/mapa" element={<DataGate><FlowMap /></DataGate>} />
            <Route path="/alertas" element={<DataGate><Alerts /></DataGate>} />
            <Route path="/integracao" element={<Integration />} />
            {Object.entries(PLANS).map(([k, p]) => <Route key={k} path={`/${k}`} element={<Roadmap plan={p} />} />)}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
