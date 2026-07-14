import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_USER_ACCESS, MODULE_KEYS, MODULE_LABELS, coerceModules, type ModuleKey } from '../accessControl';
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
  can_receive_tickets: boolean;
  can_view_restricted_tutorials: boolean;
}

interface EditableAccess {
  modules: ModuleKey[];
  canReceiveTickets: boolean;
  canViewRestrictedTutorials: boolean;
}

const MANAGEABLE_MODULE_KEYS = MODULE_KEYS.filter((key) => key !== 'permisos');
const FULL_ACCESS_WITHOUT_PERMISSIONS: EditableAccess = {
  modules: [...MANAGEABLE_MODULE_KEYS],
  canReceiveTickets: true,
  canViewRestrictedTutorials: true,
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
        supabase.from('user_module_permissions').select('user_id, modules, can_receive_tickets, can_view_restricted_tutorials'),
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

  const getAccess = (userId: string) => accessByUser[userId] || { ...DEFAULT_USER_ACCESS, modules: [...DEFAULT_USER_ACCESS.modules] };

  const updateAccess = (userId: string, updater: (current: EditableAccess) => EditableAccess) => {
    setAccessByUser((current) => ({ ...current, [userId]: updater(getAccess(userId)) }));
    setNotice('');
  };

  const grantFullAccess = (userId: string) => {
    updateAccess(userId, () => ({
      ...FULL_ACCESS_WITHOUT_PERMISSIONS,
      modules: [...FULL_ACCESS_WITHOUT_PERMISSIONS.modules],
    }));
  };

  const save = async (profile: ProfileRow) => {
    setSavingId(profile.id);
    setNotice('');
    const access = getAccess(profile.id);
    const { error } = await supabase.from('user_module_permissions').upsert({
      user_id: profile.id,
      modules: access.modules,
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
                <div className="permissions-admin__modules">
                  {MANAGEABLE_MODULE_KEYS.map((key) => (
                    <label key={key}>
                      <input type="checkbox" checked={access.modules.includes(key)} onChange={(event) => updateAccess(profile.id, (current) => ({ ...current, modules: event.target.checked ? [...new Set([...current.modules, key])] : current.modules.filter((module) => module !== key) }))} />
                      <span>{MODULE_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
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
