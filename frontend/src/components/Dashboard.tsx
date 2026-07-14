import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import BrandLockup from './BrandLockup';
import EmployeeCredentialModal, { type EmployeeCredentialProfile } from './EmployeeCredentialModal';
import {
  DEFAULT_USER_ACCESS,
  MODULE_KEYS,
  canManageUserPermissions,
  coerceModules,
  coerceSubPermissions,
  getModuleSubPermissions,
  type ModuleKey,
  type UserAccess,
} from '../accessControl';
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
const DriPage = lazy(() => import('../modules/dri/DriPage'));
const PermissionsAdmin = lazy(() => import('./PermissionsAdmin'));
const DEFAULT_DASHBOARD_TAB: DashboardTabKey = 'tickets';

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
  | 'monitoreo'
  | 'dri'
  | 'permisos';

type DashboardTone = 'clinical' | 'environmental' | 'environmental-blue' | 'veterinary' | 'bioprocess' | 'food';

interface DashboardNavigationItem {
  key: DashboardTabKey;
  label: string;
  tone: DashboardTone;
  showBadge?: boolean;
}

const DASHBOARD_TAB_KEYS: DashboardTabKey[] = [
  'tickets',
  'servicios',
  'asesoria',
  'trazabilidad',
  'refacciones',
  'inventario',
  'tutoriales',
  'pno',
  'equipos',
  'monitoreo',
  'dri',
  'permisos',
];

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
      email?: string | null;
    };
  } | null;
  initialTab?: DashboardTabKey;
}

export default function Dashboard({ session, initialTab }: DashboardProps) {
  const navigate = useNavigate();
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTabKey>(initialTab ?? DEFAULT_DASHBOARD_TAB);
  const [authReady, setAuthReady] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [advisoryUnreadCount, setAdvisoryUnreadCount] = useState(0);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [viewerProfile, setViewerProfile] = useState<EmployeeCredentialProfile | null>(null);
  const [userAccess, setUserAccess] = useState<UserAccess>(DEFAULT_USER_ACCESS);
  const requestedAdvisoryId = searchParams.get('advisory')?.trim() || null;
  const requestedTab = (() => {
    const tabParam = searchParams.get('tab')?.trim() || '';
    if (DASHBOARD_TAB_KEYS.includes(tabParam as DashboardTabKey)) {
      return tabParam as DashboardTabKey;
    }

    return requestedAdvisoryId ? 'asesoria' : null;
  })();

  const isStaffRole = (role: string | null) => role === 'admin' || role === 'tecnico';
  const canManagePermissions = canManageUserPermissions(session?.user?.id, session?.user?.email);
  const baseAllowedTabs: DashboardTabKey[] = userRole === 'admin'
    ? DASHBOARD_TAB_KEYS.filter((tab) => tab !== 'permisos')
    : userAccess.modules.filter((module): module is DashboardTabKey => DASHBOARD_TAB_KEYS.includes(module as DashboardTabKey));
  const allowedTabs: DashboardTabKey[] = canManagePermissions
    ? [...new Set([...baseAllowedTabs, 'permisos' as DashboardTabKey])]
    : baseAllowedTabs;
  const canAccessTab = (tab: DashboardTabKey) => allowedTabs.includes(tab);
  const welcomeLabel = viewerProfile?.nombre_completo?.trim() || session?.user?.email?.trim() || 'usuario';
  const navigationItems: DashboardNavigationItem[] = [
    { key: 'tickets', label: 'Tickets', tone: 'clinical' },
    { key: 'servicios', label: 'Planeación', tone: 'environmental' },
    { key: 'asesoria', label: 'Asesoría', tone: 'veterinary', showBadge: true },
    { key: 'monitoreo', label: 'Monitoreo', tone: 'environmental-blue' },
    { key: 'trazabilidad', label: 'Trazabilidad', tone: 'environmental-blue' },
    { key: 'refacciones', label: 'Refacciones', tone: 'bioprocess' },
    { key: 'inventario', label: 'Inventario', tone: 'food' },
    { key: 'tutoriales', label: 'Tutoriales', tone: 'clinical' },
    { key: 'pno', label: 'PNO', tone: 'veterinary' },
    { key: 'equipos', label: 'Equipos', tone: 'food' },
    { key: 'dri', label: 'DRI', tone: 'environmental-blue' },
    { key: 'permisos', label: 'Permisos', tone: 'clinical' },
  ];
  const visibleNavigationItems = navigationItems.filter((item) => canAccessTab(item.key));
  const activeTabIsVisible = visibleNavigationItems.some((item) => item.key === activeTab);

  useEffect(() => {
    if (!activeTabIsVisible) {
      const fallbackTab = visibleNavigationItems[0]?.key ?? DEFAULT_DASHBOARD_TAB;
      if (activeTab !== fallbackTab) {
        setActiveTab(fallbackTab);
      }
    }
  }, [activeTab, activeTabIsVisible, visibleNavigationItems]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (!requestedTab) {
      return;
    }

    if (visibleNavigationItems.some((item) => item.key === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab, visibleNavigationItems]);

  useEffect(() => {
    let mounted = true;
    const userId = session?.user?.id ?? null;

    setAuthReady(false);

    if (!userId) {
      setUserRole(null);
      setViewerProfile(null);
      setUserAccess(DEFAULT_USER_ACCESS);
      setAdvisoryUnreadCount(0);
      setAuthReady(true);
      return () => {
        mounted = false;
      };
    }

    async function fetchRoleAndUnread() {
      const [{ data, error }, { data: permissionData, error: permissionError }] = await Promise.all([
        supabase.from('profiles').select('id, nombre_completo, rol, telefono, territorio, employee_type, employee_number, puesto, credential_photo_path, credential_metadata, creado_en').eq('id', userId).maybeSingle(),
        supabase.from('user_module_permissions').select('modules, sub_permissions, can_receive_tickets, can_view_restricted_tutorials').eq('user_id', userId).maybeSingle(),
      ]);
      if (!mounted) {
        return;
      }

      if (error) {
        console.error('No se pudo refrescar el rol del usuario en Dashboard.', error);
        setViewerProfile(null);
        setAuthReady(true);
        return;
      }

      if (!data?.rol) {
        setUserRole(null);
        setViewerProfile(data as EmployeeCredentialProfile | null);
        setAuthReady(true);
        return;
      }

      setViewerProfile(data as EmployeeCredentialProfile);
      setUserRole(data.rol);
      if (!permissionError && permissionData) {
        setUserAccess({
          modules: coerceModules(permissionData.modules),
          canReceiveTickets: Boolean(permissionData.can_receive_tickets),
          canViewRestrictedTutorials: Boolean(permissionData.can_view_restricted_tutorials),
          subPermissions: coerceSubPermissions(permissionData.sub_permissions),
        });
      } else {
        setUserAccess(data.rol === 'admin' ? { modules: [...MODULE_KEYS] as ModuleKey[], canReceiveTickets: true, canViewRestrictedTutorials: true, subPermissions: {} } : DEFAULT_USER_ACCESS);
      }

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

  useEffect(() => {
    if (!isActionMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !actionMenuRef.current?.contains(target)) {
        setIsActionMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsActionMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isActionMenuOpen]);

  const handleOpenCredential = () => {
    setCredentialOpen(true);
    setIsActionMenuOpen(false);
  };

  const handleChangePassword = () => {
    setIsActionMenuOpen(false);
    navigate('/reset-password?mode=change');
  };

  const handleLogout = async () => {
    setIsActionMenuOpen(false);
    await supabase.auth.signOut();
    window.location.assign(import.meta.env.BASE_URL || '/');
  };

  const renderHeaderActionButtons = () => (
    <>
      {isStaffRole(userRole) ? (
        <button
          type="button"
          onClick={handleOpenCredential}
          className="button-primary inactive dashboard-header__button dashboard-header__button--secondary"
        >
          Mi credencial
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleChangePassword}
        className="button-primary inactive dashboard-header__button dashboard-header__button--secondary"
      >
        Cambiar contraseña
      </button>
      <button type="button" onClick={handleLogout} className="button-primary dashboard-header__button">
        Cerrar sesión
      </button>
    </>
  );

  if (!authReady) {
    return <DashboardPanelFallback />;
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header__brand-block">
          <BrandLockup
            variant="header"
            eyebrow="BioSystems"
            title="Centro operativo Orion"
            subtitle="Tickets, planeación, tutoriales y trazabilidad de servicio en una consola más clara, sobria y utilizable."
          />
          <span className="dashboard-header__meta dashboard-header__meta--mobile">{`Bienvenido ${welcomeLabel}`}</span>
        </div>
        <div
          ref={actionMenuRef}
          className={`dashboard-header__actions${isActionMenuOpen ? ' is-menu-open' : ''}`}
        >
          <div className="dashboard-header__actions-top">
            <span className="dashboard-header__meta dashboard-header__meta--desktop">{`Bienvenido ${welcomeLabel}`}</span>
            <button
              type="button"
              aria-label={isActionMenuOpen ? 'Cerrar menú de acciones' : 'Abrir menú de acciones'}
              aria-expanded={isActionMenuOpen}
              className={`dashboard-header__hamburger${isActionMenuOpen ? ' is-open' : ''}`}
              onClick={() => setIsActionMenuOpen((current) => !current)}
            >
              <span className="dashboard-header__hamburger-line" />
              <span className="dashboard-header__hamburger-line" />
              <span className="dashboard-header__hamburger-line" />
            </button>
          </div>
          <div className="dashboard-header__action-list">
            {renderHeaderActionButtons()}
          </div>
        </div>
      </header>

      <div className="dashboard-nav">
        {visibleNavigationItems.map((item) => {
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
          {activeTab === 'tickets' && canAccessTab('tickets') && <Tickets subPermissions={getModuleSubPermissions(userAccess, 'tickets')} />}
          {activeTab === 'servicios' && canAccessTab('servicios') && <Services subPermissions={getModuleSubPermissions(userAccess, 'servicios')} />}
          {activeTab === 'asesoria' && canAccessTab('asesoria') && (
            <EscalatedAdvisory
              onNotificationCountChange={setAdvisoryUnreadCount}
              requestedAdvisoryId={requestedAdvisoryId}
              subPermissions={getModuleSubPermissions(userAccess, 'asesoria')}
            />
          )}
          {activeTab === 'monitoreo' && canAccessTab('monitoreo') && <EquipmentMonitoring subPermissions={getModuleSubPermissions(userAccess, 'monitoreo')} />}
          {activeTab === 'trazabilidad' && canAccessTab('trazabilidad') && <Traceability subPermissions={getModuleSubPermissions(userAccess, 'trazabilidad')} />}
          {activeTab === 'refacciones' && canAccessTab('refacciones') && <Refacciones subPermissions={getModuleSubPermissions(userAccess, 'refacciones')} />}
          {activeTab === 'inventario' && canAccessTab('inventario') && <Inventario subPermissions={getModuleSubPermissions(userAccess, 'inventario')} />}
          {activeTab === 'tutoriales' && canAccessTab('tutoriales') && <Tutoriales canViewRestricted={userRole === 'admin' || userAccess.canViewRestrictedTutorials} />}
          {activeTab === 'pno' && canAccessTab('pno') && <PNO subPermissions={getModuleSubPermissions(userAccess, 'pno')} />}
          {activeTab === 'equipos' && canAccessTab('equipos') && <Equipos />}
          {activeTab === 'dri' && canAccessTab('dri') && <DriPage subPermissions={getModuleSubPermissions(userAccess, 'dri')} />}
          {activeTab === 'permisos' && canAccessTab('permisos') && canManagePermissions && <PermissionsAdmin />}
        </Suspense>
      </div>

      <EmployeeCredentialModal
        open={credentialOpen && isStaffRole(userRole)}
        profile={viewerProfile}
        userEmail={session?.user?.email || ''}
        onClose={() => setCredentialOpen(false)}
        onProfileUpdated={setViewerProfile}
      />
    </div>
  );
}
