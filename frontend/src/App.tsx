import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getValidatedSession, supabase } from './supabaseClient';
import BrandLockup from './components/BrandLockup';

const Login = lazy(() => import('./components/Login'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const PublicTicketForm = lazy(() => import('./components/PublicTicketForm'));

const routerBasename = (() => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  if (baseUrl === '/') {
    return '/';
  }

  return baseUrl.replace(/\/+$/, '');
})();

const AppLoadingFallback = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      padding: '1.5rem',
    }}
  >
    <BrandLockup
      variant="loading"
      eyebrow="BioSystems"
      title="Orion operativo"
      subtitle="Cargando modulos, perfil y contexto de servicio."
    />
  </div>
);

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const hydrateSession = async () => {
      const session = await getValidatedSession();

      if (!cancelled) {
        setSession(session);
        setLoading(false);
      }
    };

    void hydrateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (cancelled) {
        return;
      }

      if (!nextSession) {
        setSession(null);
        setLoading(false);
        return;
      }

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(nextSession);
        setLoading(false);
      }

      const validatedSession = await getValidatedSession();
      if (cancelled) {
        return;
      }

      setSession(validatedSession ?? nextSession);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <AppLoadingFallback />;
  }

  return (
    <Router basename={routerBasename}>
      <Suspense fallback={<AppLoadingFallback />}>
        <Routes>
          <Route 
            path="/" 
            element={<PublicTicketForm />} 
          />
          <Route 
            path="/login" 
            element={!session ? <Login /> : <Navigate to="/dashboard" replace />} 
          />
          <Route 
            path="/dashboard" 
            element={session ? <Dashboard session={session} /> : <Navigate to="/login" replace />} 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
