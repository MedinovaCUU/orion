import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getValidatedSession, supabase } from './supabaseClient';
import OrionSplashScreen from './components/OrionSplash';

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

const AppLoadingFallback = () => <OrionSplashScreen status="Cargando módulos, perfil y contexto de servicio." />;

// `?splash` deja la pantalla de carga fija para revisarla (diseño/QA), igual que `?intro` en Andrómeda.
const splashPreview = (() => {
  try {
    return new URLSearchParams(window.location.search).has('splash');
  } catch {
    return false;
  }
})();

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

  if (loading || splashPreview) {
    return <AppLoadingFallback />;
  }

  return (
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
