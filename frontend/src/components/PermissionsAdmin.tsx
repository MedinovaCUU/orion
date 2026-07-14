import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_USER_ACCESS,
  MODULE_KEYS,
  MODULE_LABELS,
  MODULE_SUBPERMISSIONS,
  SUBPERMISSION_LABELS,
  coerceModules,
  coerceSubPermissions,
  type ModuleKey,
  type ModuleWithSubpermissions,
} from '../accessControl';
import { supabase } from '../supabaseClient';
import './PermissionsAdmin.css';

interface ProfileRow {
  id: string;
  nombre_completo: string | null;
  rol: string | null;
}

interface AccessRow {
  user_id: string;
  modules: unknown;
  sub_permissions?: unknown;
  can_receive_tickets: boolean;
  can_view_restricted_tutorials: boolean;
}

interface EditableAccess {
  modules: ModuleKey[];
  canReceiveTickets: boolean;
  canViewRestrictedTutorials: boolean;
  subPermissions: Partial<Record<ModuleWithSubpermissions, string[]>>;
}

const MANAGEABLE_MODULE_KEYS = MODULE_KEYS.filter((key) => key !== 'permisos');
const MODULES_WITH_SUBPERMISSIONS = Object.keys(MODULE_SUBPERMISSIONS) as ModuleWithSubpermissions[];
const ALL_SUBPERMISSIONS = MODULES_WITH_SUBPERMISSIONS.reduce<EditableAccess['subPermissions']>((acc, module) => {
  acc[module] = [...MODULE_SUBPERMISSIONS[module]];
  return acc;
}, {});
const FULL_ACCESS_WITHOUT_PERMISSIONS: EditableAccess = {
  modules: [...MANAGEABLE_MODULE_KEYS],
  canReceiveTickets: true,
  canViewRestrictedTutorials: true,
  subPermissions: ALL_SUBPERMISSIONS,
};

export default function PermissionsAdmin() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [accessByUser, setAccessByUser] = useState<Record<string, EditableAccess>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const [{ data: profileRows, error: profileError }, { data: accessRows, error: accessError }] = await Promise.all([
        supabase.from('profiles').select('id, nombre_completo, rol').order('nombre_completo'),
        supabase.from('user_module_permissions').select('user_id, modules, sub_permissions, can_receive_tickets, can_view_restricted_tutorials'),
      ]);

      if (!mounted) return;
      if (profileError || accessError) {
        setNotice('No se pudieron cargar los permisos. Ejecuta primero la migración de permisos en Supabase.');
        setLoading(false);
        return;
      }

      const mapped: Record<string, EditableAccess> = {};
      (accessRows as AccessRow[] | null)?.forEach((row) => {
        mapped[row.user_id] = {
          modules: coerceModules(row.modules),
          subPermissions: coerceSubPermissions(row.sub_permissions),
          canReceiveTickets: row.can_receive_tickets,
          canViewRestrictedTutorials: row.can_view_restricted_tutorials,
        };
      });
      setProfiles((profileRows as ProfileRow[] | null) || []);
      setAccessByUser(mapped);
      setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-MX');
    if (!query) return profiles;
    return profiles.filter((profile) =>
      `${profile.nombre_completo || ''} ${profile.rol || ''}`.toLocaleLowerCase('es-MX').includes(query),
    );
  }, [profiles, search]);

  const getAccess = (userId: string) => accessByUser[userId] || {
    ...DEFAULT_USER_ACCESS,
    modules: [...DEFAULT_USER_ACCESS.modules],
    subPermissions: { ...DEFAULT_USER_ACCESS.subPermissions },
  };

  const updateAccess = (userId: string, updater: (current: EditableAccess) => EditableAccess) => {
    setAccessByUser((current) => ({ ...current, [userId]: updater(getAccess(userId)) }));
    setNotice('');
  };

  const grantFullAccess = (userId: string) => {
    updateAccess(userId, () => ({
      ...FULL_ACCESS_WITHOUT_PERMISSIONS,
      modules: [...FULL_ACCESS_WITHOUT_PERMISSIONS.modules],
      subPermissions: { ...FULL_ACCESS_WITHOUT_PERMISSIONS.subPermissions },
    }));
  };

  const getSubPermissions = (access: EditableAccess, module: ModuleWithSubpermissions) =>
    access.subPermissions[module] ?? [...MODULE_SUBPERMISSIONS[module]];

  const toggleModule = (userId: string, module: ModuleKey, checked: boolean) => {
    updateAccess(userId, (current) => {
      const nextModules = checked
        ? [...new Set([...current.modules, module])]
        : current.modules.filter((item) => item !== module);
      const nextSubPermissions = { ...current.subPermissions };

      if (checked && module in MODULE_SUBPERMISSIONS) {
        nextSubPermissions[module as ModuleWithSubpermissions] = [...MODULE_SUBPERMISSIONS[module as ModuleWithSubpermissions]];
      }

      return { ...current, modules: nextModules, subPermissions: nextSubPermissions };
    });
  };

  const toggleSubPermission = (userId: string, module: ModuleWithSubpermissions, key: string, checked: boolean) => {
    updateAccess(userId, (current) => {
      const currentKeys = getSubPermissions(current, module);
      const nextKeys = checked ? [...new Set([...currentKeys, key])] : currentKeys.filter((item) => item !== key);
      return {
        ...current,
        modules: current.modules.includes(module) ? current.modules : [...current.modules, module],
        subPermissions: { ...current.subPermissions, [module]: nextKeys },
      };
    });
  };

  const save = async (profile: ProfileRow) => {
    setSavingId(profile.id);
    setNotice('');
    const access = getAccess(profile.id);
    const { error } = await supabase.from('user_module_permissions').upsert({
      user_id: profile.id,
      modules: access.modules,
      sub_permissions: access.subPermissions,
      can_receive_tickets: access.canReceiveTickets,
      can_view_restricted_tutorials: access.canViewRestrictedTutorials,
    });
    setSavingId(null);
    setNotice(error ? `No se guardaron los permisos de ${profile.nombre_completo || 'este usuario'}.` : 'Permisos guardados correctamente.');
  };

  return (
    <section className="permissions-admin">
      <div className="permissions-admin__header">
        <div><h3>Permisos por usuario</h3><p>Activa módulos y capacidades; los cambios se aplican al volver a cargar la sesión.</p></div>
        <input className="input-field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuario o rol…" />
      </div>
      {notice ? <div className="permissions-admin__notice">{notice}</div> : null}
      {loading ? <p>Cargando permisos…</p> : (
        <div className="permissions-admin__list">
          {filteredProfiles.map((profile) => {
            const access = getAccess(profile.id);
            return (
              <article className="permissions-admin__user" key={profile.id}>
                <div className="permissions-admin__identity">
                  <strong>{profile.nombre_completo || 'Usuario sin nombre'}</strong><span>{profile.rol || 'Sin rol'}</span>
                </div>
                <details className="permissions-admin__details">
                  <summary>Módulos y subpermisos</summary>
                  <div className="permissions-admin__modules">
                    {MANAGEABLE_MODULE_KEYS.map((key) => {
                      const hasSubPermissions = key in MODULE_SUBPERMISSIONS;
                      return (
                        <div className="permissions-admin__module-group" key={key}>
                          <label>
                            <input type="checkbox" checked={access.modules.includes(key)} onChange={(event) => toggleModule(profile.id, key, event.target.checked)} />
                            <span>{MODULE_LABELS[key]}</span>
                          </label>
                          {hasSubPermissions && access.modules.includes(key) ? (
                            <div className="permissions-admin__submodules">
                              {(MODULE_SUBPERMISSIONS[key as ModuleWithSubpermissions] as readonly string[]).map((subKey) => (
                                <label key={subKey}>
                                  <input
                                    type="checkbox"
                                    checked={getSubPermissions(access, key as ModuleWithSubpermissions).includes(subKey)}
                                    onChange={(event) => toggleSubPermission(profile.id, key as ModuleWithSubpermissions, subKey, event.target.checked)}
                                  />
                                  <span>{SUBPERMISSION_LABELS[key as ModuleWithSubpermissions][subKey]}</span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </details>
                <div className="permissions-admin__capabilities">
                  <label><input type="checkbox" checked={access.canReceiveTickets} onChange={(event) => updateAccess(profile.id, (current) => ({ ...current, canReceiveTickets: event.target.checked }))} /> Puede recibir tickets</label>
                  <label><input type="checkbox" checked={access.canViewRestrictedTutorials} onChange={(event) => updateAccess(profile.id, (current) => ({ ...current, canViewRestrictedTutorials: event.target.checked }))} /> Puede ver tutoriales restringidos</label>
                </div>
                <div className="permissions-admin__actions">
                  <button className="button-primary inactive" type="button" disabled={savingId === profile.id} onClick={() => grantFullAccess(profile.id)}>Acceso total</button>
                  <button className="button-primary" type="button" disabled={savingId === profile.id} onClick={() => void save(profile)}>{savingId === profile.id ? 'Guardando…' : 'Guardar permisos'}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
