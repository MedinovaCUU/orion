import { Suspense, lazy, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import BrandLockup from './BrandLockup';
import './Dashboard.css';

const Tickets = lazy(() => import('./Tickets'));
const Services = lazy(() => import('./Services'));
const EscalatedAdvisory = lazy(() => import('./EscalatedAdvisory'));
const Traceability = lazy(() => import('./Traceability'));
const Refacciones = lazy(() => import('./Refacciones'));
const Inventario = lazy(() => import('./Inventario'));
const Tutoriales = lazy(() => import('./Tutoriales'));
const Equipos = lazy(() => import('./Equipos'));
const PNO = lazy(() => import('./PNO'));
const EquipmentMonitoring = lazy(() => import('../modules/equipment-monitoring/EquipmentMonitoring'));

type DashboardTabKey =
  | 'tickets'
  | 'servicios'
  | 'asesoria'
  | 'trazabilidad'
  | 'refacciones'
  | 'inventario'
  | 'tutoriales'
  | 'pno'
  | 'equipos'
  | 'monitoreo';

type DashboardTone = 'clinical' | 'environmental' | 'environmental-blue' | 'veterinary' | 'bioprocess' | 'food';

interface DashboardNavigationItem {
  key: DashboardTabKey;
  label: string;
  tone: DashboardTone;
  staffOnly?: boolean;
  adminOnly?: boolean;
  showBadge?: boolean;
}

const DashboardPanelFallback = () => (
  <div
    style={{
      minHeight: '16rem',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '1.5rem',
    }}
  >
    <BrandLockup
      variant="loading"
      eyebrow="BioSystems"
      title="Abriendo panel"
      subtitle="Cargando el módulo seleccionado."
    />
  </div>
);

interface DashboardProps {
  session: {
    user?: {
      id?: string;
    };
  } | null;
}

export default function Dashboard({ session }: DashboardProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTabKey>('tickets');
  const [authReady, setAuthReady] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [advisoryUnreadCount, setAdvisoryUnreadCount] = useState(0);

  const isStaffRole = (role: string | null) => role === 'admin' || role === 'tecnico';
  const navigationItems: DashboardNavigationItem[] = [
    { key: 'tickets', label: 'Tickets', tone: 'clinical' },
    { key: 'servicios', label: 'Planeación', tone: 'environmental' },
    { key: 'asesoria', label: 'Asesoría', tone: 'veterinary', staffOnly: true, showBadge: true },
    { key: 'monitoreo', label: 'Monitoreo', tone: 'environmental-blue', staffOnly: true },
    { key: 'trazabilidad', label: 'Trazabilidad', tone: 'environmental-blue' },
    { key: 'refacciones', label: 'Refacciones', tone: 'bioprocess' },
    { key: 'inventario', label: 'Inventario', tone: 'food' },
    { key: 'tutoriales', label: 'Tutoriales', tone: 'clinical' },
    { key: 'pno', label: 'PNO', tone: 'veterinary' },
    { key: 'equipos', label: 'Equipos', tone: 'food', adminOnly: true },
  ];

  useEffect(() => {
    let mounted = true;
    const userId = session?.user?.id ?? null;

    setAuthReady(false);

    if (!userId) {
      setUserRole(null);
      setAdvisoryUnreadCount(0);
      setAuthReady(true);
      return () => {
        mounted = false;
      };
    }

    async function fetchRoleAndUnread() {
      const { data, error } = await supabase.from('profiles').select('rol').eq('id', userId).single();
      if (!mounted) {
        return;
      }

      if (error || !data) {
        setUserRole(null);
        setAdvisoryUnreadCount(0);
        setAuthReady(true);
        return;
      }

      setUserRole(data.rol ?? null);

      if (!isStaffRole(data.rol)) {
        setAdvisoryUnreadCount(0);
        setAuthReady(true);
        return;
      }

      const { count } = await supabase
        .from('asesorias_escaladas_destinatarios')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', userId)
        .is('leida_en', null);

      if (mounted) {
        setAdvisoryUnreadCount(count || 0);
        setAuthReady(true);
      }
    }

    void fetchRoleAndUnread();

    const timer = window.setInterval(() => {
      void fetchRoleAndUnread();
    }, 45000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [session?.user?.id]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (!authReady) {
    return <DashboardPanelFallback />;
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <BrandLockup
          variant="header"
          eyebrow="BioSystems"
          title="Centro operativo Orion"
          subtitle="Tickets, planeación, tutoriales y trazabilidad de servicio en una consola más clara, sobria y utilizable."
        />
        <div className="dashboard-header__actions">
          <span className="dashboard-header__meta">Mesa operativa unificada</span>
          <button onClick={handleLogout} className="button-primary dashboard-header__button">Cerrar sesión</button>
        </div>
      </header>

      <div className="dashboard-nav">
        {navigationItems
          .filter((item) => {
            if (item.staffOnly && !isStaffRole(userRole)) {
              return false;
            }

            if (item.adminOnly && userRole !== 'admin') {
              return false;
            }

            return true;
          })
          .map((item) => {
            const isActive = activeTab === item.key;

            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`button-primary dashboard-nav__button dashboard-nav__button--${item.tone} ${isActive ? '' : 'inactive'}`.trim()}
              >
                <span>{item.label}</span>
                {item.showBadge && advisoryUnreadCount > 0 ? (
                  <span className="dashboard-nav__badge">{advisoryUnreadCount}</span>
                ) : null}
              </button>
            );
          })}
      </div>

      <div className={`card dashboard-card ${activeTab === 'trazabilidad' ? 'dashboard-card--traceability' : ''}`}>
        <Suspense fallback={<DashboardPanelFallback />}>
          {activeTab === 'tickets' && <Tickets />}
          {activeTab === 'servicios' && <Services />}
          {activeTab === 'asesoria' && isStaffRole(userRole) && (
            <EscalatedAdvisory onNotificationCountChange={setAdvisoryUnreadCount} />
          )}
          {activeTab === 'monitoreo' && isStaffRole(userRole) && <EquipmentMonitoring />}
          {activeTab === 'trazabilidad' && <Traceability />}
          {activeTab === 'refacciones' && <Refacciones />}
          {activeTab === 'inventario' && <Inventario />}
          {activeTab === 'tutoriales' && <Tutoriales />}
          {activeTab === 'pno' && <PNO />}
          {activeTab === 'equipos' && userRole === 'admin' && <Equipos />}
        </Suspense>
      </div>
    </div>
  );
}
