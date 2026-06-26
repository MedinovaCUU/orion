import { createPortal } from 'react-dom';
import type { EquipmentSummary } from './servicesPlanning';

interface EquipmentDetailsModalProps {
  equipment: EquipmentSummary | null;
  serial: string | null;
  onClose: () => void;
}

const sectionLabelStyle = {
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
  textTransform: 'uppercase' as const,
  marginBottom: '0.3rem',
};

const formatEquipmentDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'N.D.';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('es-MX', {
    dateStyle: 'medium',
  });
};

const getLocationLine = (equipment: EquipmentSummary) => {
  if (!equipment.ciudad && !equipment.municipio) {
    return 'N.D.';
  }

  return `${equipment.ciudad || ''}${equipment.municipio ? ` (${equipment.municipio})` : ''}`.trim();
};

const getAddressLine = (equipment: EquipmentSummary) => {
  const segments = [
    equipment.direccion || 'Domicilio no registrado',
    equipment.colonia ? `Col. ${equipment.colonia}` : null,
    equipment.codigo_postal ? `C.P. ${equipment.codigo_postal}` : null,
  ].filter(Boolean);

  return segments.join(', ');
};

export default function EquipmentDetailsModal({
  equipment,
  serial,
  onClose,
}: EquipmentDetailsModalProps) {
  if (!serial) {
    return null;
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1100,
        padding: '1rem',
        backdropFilter: 'blur(5px)',
      }}
      onClick={onClose}
    >
      <div
        className="card card-scroll-shell"
        style={{
          maxWidth: '720px',
          width: 'min(720px, calc(100vw - 2.5rem))',
          border: '1px solid var(--border-color)',
          maxHeight: '90vh',
          padding: 0,
          overflow: 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="card-scroll-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '0.2rem' }}>Detalles Integrales del Equipo</h3>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Vista rápida abierta desde el módulo de asesorías.
              </p>
            </div>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}
              onClick={onClose}
              aria-label="Cerrar detalle del equipo"
            >
              &times;
            </button>
          </div>

          {!equipment ? (
            <div
              style={{
                padding: '1rem 1.1rem',
                borderRadius: '18px',
                border: '1px solid rgba(243, 39, 53, 0.18)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,245,246,0.94))',
                color: 'var(--brand-red-ink)',
              }}
            >
              No se encontró una ficha de equipo registrada para la serie <strong>{serial}</strong>.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
                <div>
                  <h4 style={sectionLabelStyle}>No. de Serie / Modelo</h4>
                  <p style={{ fontWeight: '500', fontSize: '1.1rem', margin: 0 }}>{equipment.numero_serie}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--primary-color)', margin: 0 }}>
                    {equipment.modelo ? `Modelo: ${equipment.modelo}` : 'Modelo Genérico'}
                  </p>
                </div>
                <div>
                  <h4 style={sectionLabelStyle}>Cliente (Razón Social)</h4>
                  <p style={{ fontWeight: '500' }}>{equipment.clientes?.razon_social || 'Desconocido / N.D.'}</p>
                </div>

                <div>
                  <h4 style={sectionLabelStyle}>Contacto del Sitio</h4>
                  <p style={{ margin: 0, fontWeight: '500' }}>{equipment.clientes?.persona_contacto || 'Sin contacto registrado'}</p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{equipment.clientes?.telefono || 'Sin teléfono registrado'}</p>
                </div>
                <div>
                  <h4 style={sectionLabelStyle}>Software / Firmware</h4>
                  <p style={{ margin: 0, fontWeight: '500' }}>
                    {equipment.software || 'N.D.'} {equipment.firmware ? `· FW ${equipment.firmware}` : ''}
                  </p>
                </div>

                <div>
                  <h4 style={sectionLabelStyle}>Fecha de Instalación / Comienzo</h4>
                  <p>{formatEquipmentDateLabel(equipment.fecha_inicio)}</p>
                </div>
                <div>
                  <h4 style={sectionLabelStyle}>Término de Servicio (Estimado)</h4>
                  <p>{formatEquipmentDateLabel(equipment.termino_garantia)}</p>
                </div>

                <div>
                  <h4 style={sectionLabelStyle}>Ingeniero que Instaló / Asignó</h4>
                  <p style={{ color: 'var(--primary-color)' }}>{equipment.asigna?.nombre_completo || 'Administración Central'}</p>
                </div>
                <div>
                  <h4 style={sectionLabelStyle}>Ingeniero que Retiró</h4>
                  <p style={{ color: 'var(--text-secondary)' }}>{equipment.retira?.nombre_completo || 'Vigente / N.D.'}</p>
                </div>

                <div>
                  <h4 style={sectionLabelStyle}>Doc. de Asignación / Contrato</h4>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      background: equipment.doc_asignacion ? 'var(--success-color)' : 'rgba(255,255,255,0.05)',
                      color: equipment.doc_asignacion ? '#000' : 'var(--text-secondary)',
                      fontSize: '0.8rem',
                      fontWeight: '500',
                    }}
                  >
                    {equipment.doc_asignacion ? 'Documento Entregado' : 'No Registrado'}
                  </span>
                </div>

                <div>
                  <h4 style={sectionLabelStyle}>Estado y Fecha Fin</h4>
                  {equipment.fecha_fin ? (
                    <span style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>
                      Finalizado el {formatEquipmentDateLabel(equipment.fecha_fin)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--success-color)' }}>Servicio Activo</span>
                  )}
                </div>

                {equipment.fecha_fin ? (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <h4 style={sectionLabelStyle}>Doc. Terminación de Servicio / Baja</h4>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '4px',
                        background: equipment.doc_terminacion ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '0.8rem',
                        fontWeight: '500',
                      }}
                    >
                      {equipment.doc_terminacion ? 'Documento PDF Registrado' : 'No tiene acta / Faltante'}
                    </span>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem', fontSize: '1.1rem' }}>Ubicación Física del Equipo</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <h4 style={sectionLabelStyle}>País / Estado</h4>
                    <p style={{ margin: 0, fontWeight: '500' }}>
                      {equipment.pais || 'N.D.'} {equipment.estado ? `- ${equipment.estado}` : ''}
                    </p>
                  </div>
                  <div>
                    <h4 style={sectionLabelStyle}>Ciudad / Municipio</h4>
                    <p style={{ margin: 0, fontWeight: '500' }}>{getLocationLine(equipment)}</p>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <h4 style={sectionLabelStyle}>Dirección Completa</h4>
                    <p style={{ margin: 0, fontWeight: '500' }}>{getAddressLine(equipment)}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
