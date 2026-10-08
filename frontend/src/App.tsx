import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getValidatedSession, supabase } from './supabaseClient';
import OrionSplashScreen, { OrionSplashGate } from './components/OrionSplash';
import { useSplashVisible } from './components/splashVisibleContext';
import BrandLockup from './components/BrandLockup';

const SurveyPage = lazy(() => import('./components/satisfaction/SurveyPage'));
const Login = lazy(() => import('./components/Login'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const PublicTicketForm = lazy(() => import('./components/PublicTicketForm'));
const DriPreviewPage = lazy(() => import('./modules/dri/DriPreviewPage'));

const routerBasename = (() => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  if (baseUrl === '/') {
    return '/';
  }

  return baseUrl.replace(/\/+$/, '');
})();

const AppLoadingFallback = () => {
  // Mientras el splash de la app (bienvenida) sigue en pantalla no montamos otro debajo.
  const splashVisible = useSplashVisible();
  return splashVisible ? null : <OrionSplashScreen status="Cargando módulos, perfil y contexto de servicio." />;
};

// `?splash` deja la pantalla de carga fija y `?loader` muestra el cargador de módulos, para revisarlos (diseño/QA).
const previewParam = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('splash') ? 'splash' : params.has('loader') ? 'loader' : null;
  } catch {
    return null;
  }
})();
const splashPreview = previewParam === 'splash';

const ModuleLoaderPreview = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
    <BrandLockup variant="loading" eyebrow="BioSystems" title="Abriendo panel" subtitle="Cargando el módulo seleccionado." />
  </div>
);

function AuthenticatedApp() {
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

  if (previewParam === 'loader') {
    return <ModuleLoaderPreview />;
  }

  if (splashPreview) {
    return <AppLoadingFallback />;
  }

  return (
    <OrionSplashGate ready={!loading} status="Cargando módulos, perfil y contexto de servicio.">
      <Router basename={routerBasename}>
        <Suspense fallback={<AppLoadingFallback />}>
          <Routes>
            <Route path="/encuesta" element={<SurveyPage />} />
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
            <Route
              path="/dri"
              element={session ? <Dashboard session={session} initialTab="dri" /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/dri-preview"
              element={import.meta.env.DEV ? <DriPreviewPage /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </OrionSplashGate>
  );
}

export default function App() {
  // Public survey entry must not wait for an expired or unavailable account session.
  const surveyPath = `${routerBasename === '/' ? '' : routerBasename}/encuesta`;
  if (window.location.pathname.replace(/\/$/, '') === surveyPath) {
    return <Suspense fallback={<AppLoadingFallback />}><SurveyPage /></Suspense>;
  }
  return <AuthenticatedApp />;
}
