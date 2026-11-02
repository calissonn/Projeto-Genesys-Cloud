import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorState, LoadingState } from './components/ui';
import { AppProvider, useApp } from './context/AppContext';
import { Admin } from './pages/Admin';
import { Alerts } from './pages/Alerts';
import { Catalog } from './pages/Catalog';
import { ChangeHistory } from './pages/ChangeHistory';
import { Compare } from './pages/Compare';
import { Disconnects } from './pages/Disconnects';
import { Failures } from './pages/Failures';
import { Reports } from './pages/Reports';
import { Tests } from './pages/Tests';
import { Dashboard } from './pages/Dashboard';
import { FlowMap } from './pages/FlowMap';
import { Integration } from './pages/Integration';
import { Intelligence } from './pages/Intelligence';
import { PLANS, Roadmap } from './pages/Roadmap';

function DataGate({ children }: { children: React.ReactNode }) {
  const { loading, error, reload, store } = useApp();
  // Recarregamentos posteriores acontecem em segundo plano, sem desmontar a tela atual.
  if (error && !store) return <ErrorState message={error} onRetry={reload} />;
  if (!store) return <LoadingState text={loading ? 'Carregando indicadores das URAs…' : 'Preparando…'} />;
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
            <Route path="/desligamentos" element={<DataGate><Disconnects /></DataGate>} />
            <Route path="/falhas" element={<DataGate><Failures /></DataGate>} />
            <Route path="/comparacao" element={<DataGate><Compare /></DataGate>} />
            <Route path="/relatorios" element={<DataGate><Reports /></DataGate>} />
            <Route path="/testes" element={<DataGate><Tests /></DataGate>} />
            <Route path="/historico" element={<DataGate><ChangeHistory /></DataGate>} />
            <Route path="/ia" element={<DataGate><Intelligence /></DataGate>} />
            <Route path="/integracao" element={<Integration />} />
            <Route path="/admin" element={<DataGate><Admin /></DataGate>} />
            {Object.entries(PLANS).map(([k, p]) => <Route key={k} path={`/${k}`} element={<Roadmap plan={p} />} />)}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppProvider>
  );
}
