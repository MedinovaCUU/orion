import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import './TravelPlannerModal.css';
import { getPriorityBadge, getStatusLabel, type TravelWorkflowStatus } from './travelPlanner';

interface TravelAdminPanelProps {
  refreshKey: number;
}

interface TravelRequestRecord {
  id: string;
  engineer_name: string;
  employee_number: string | null;
  service_type: string;
  workflow_status: TravelWorkflowStatus;
  priority: 'baja' | 'media' | 'alta' | 'critica';
  origin_airport: string | null;
  destination_airport: string | null;
  desired_departure_date: string | null;
  desired_return_date: string | null;
  client_name: string | null;
  destination_city: string | null;
  service_reference: string | null;
  equipment_name: string | null;
  risk_level: 'green' | 'amber' | 'red' | null;
  convenience_score: number | null;
  total_estimated_cost: number | null;
  currency: string | null;
  request_snapshot?: {
    summary?: {
      messageText?: string;
      riskSummary?: string;
    };
  } | null;
  created_at: string;
}

const STATUS_FILTERS: Array<{ value: 'all' | TravelWorkflowStatus; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'solicitud_enviada', label: 'Pendientes' },
  { value: 'en_revision_administrativa', label: 'En revision' },
  { value: 'reservado', label: 'Reservados' },
  { value: 'requiere_cambios', label: 'Requiere cambios' },
];

export default function TravelAdminPanel({ refreshKey }: TravelAdminPanelProps) {
  const [requests, setRequests] = useState<TravelRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | TravelWorkflowStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TravelRequestRecord['priority']>('all');
  const [search, setSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  async function fetchRequests() {
    setLoading(true);
    setFeedback('');

    const { data, error } = await supabase
      .from('travel_requests')
      .select(
        'id, engineer_name, employee_number, service_type, workflow_status, priority, origin_airport, destination_airport, desired_departure_date, desired_return_date, client_name, destination_city, service_reference, equipment_name, risk_level, convenience_score, total_estimated_cost, currency, request_snapshot, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      setFeedback(error.message);
      setRequests([]);
    } else {
      setRequests((data || []) as TravelRequestRecord[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchRequests();
  }, [refreshKey]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      const matchesStatus = statusFilter === 'all' || request.workflow_status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || request.priority === priorityFilter;
      const haystack = [
        request.engineer_name,
        request.client_name,
        request.destination_city,
        request.service_reference,
        request.origin_airport,
        request.destination_airport,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = search.trim() === '' || haystack.includes(search.trim().toLowerCase());
      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [priorityFilter, requests, search, statusFilter]);

  const selectedRequest = filteredRequests.find((request) => request.id === selectedRequestId) || null;

  const updateStatus = async (request: TravelRequestRecord, status: TravelWorkflowStatus) => {
    setFeedback('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: requestError } = await supabase
      .from('travel_requests')
      .update({ workflow_status: status, updated_by: user?.id || null })
      .eq('id', request.id);

    if (requestError) {
      setFeedback(requestError.message);
      return;
    }

    const { error: historyError } = await supabase.from('travel_request_status_history').insert({
      travel_request_id: request.id,
      status,
      changed_by: user?.id || null,
      reason: 'Cambio desde panel administrativo.',
      metadata: {
        source: 'travel_admin_panel',
      },
    });

    if (historyError) {
      setFeedback(historyError.message);
      return;
    }

    await fetchRequests();
    setSelectedRequestId(request.id);
  };

  return (
    <section className="travel-admin-shell">
      <div className="travel-admin-toolbar">
        <div>
          <h3 style={{ margin: 0 }}>Panel Administrativo de Reservas</h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            Visualiza solicitudes pendientes, urgencias, vuelos seleccionados y cambia estatus con trazabilidad.
          </p>
        </div>
        <div className="travel-pill-row">
          <span className="travel-badge">Total {requests.length}</span>
          <span className="travel-badge">Urgentes {requests.filter((request) => request.priority === 'critica').length}</span>
          <span className="travel-badge">
            Pendientes {requests.filter((request) => request.workflow_status === 'solicitud_enviada').length}
          </span>
        </div>
      </div>

      {feedback && <div className="travel-banner error">{feedback}</div>}

      <div className="travel-grid-4" style={{ marginBottom: '1rem' }}>
        <div className="travel-field">
          <label>Estatus</label>
          <select className="input-field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | TravelWorkflowStatus)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
        <div className="travel-field">
          <label>Prioridad</label>
          <select
            className="input-field"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as 'all' | TravelRequestRecord['priority'])}
          >
            <option value="all">Todas</option>
            <option value="critica">Critica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div className="travel-field" style={{ gridColumn: 'span 2' }}>
          <label>Buscar</label>
          <input
            className="input-field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ingeniero, cliente, ciudad, ruta o folio"
          />
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Cargando solicitudes de viaje...</p>
      ) : filteredRequests.length === 0 ? (
        <div className="travel-banner">No hay solicitudes de viaje que coincidan con los filtros actuales.</div>
      ) : (
        <div className="travel-admin-grid">
          {filteredRequests.map((request) => {
            const priority = getPriorityBadge(request.priority);
            const isSelected = selectedRequestId === request.id;
            return (
              <article key={request.id} className="travel-admin-card">
                <header>
                  <div>
                    <strong>{request.engineer_name}</strong>
                    <p>
                      {request.client_name || 'Cliente sin capturar'} • {request.service_reference || 'Sin folio'}
                    </p>
                  </div>
                  <div className="travel-pill-row">
                    <span className="travel-badge" style={{ color: priority.color }}>
                      {priority.label}
                    </span>
                    <span className={`travel-badge travel-risk-${request.risk_level || 'green'}`}>
                      {(request.risk_level || 'green').toUpperCase()}
                    </span>
                  </div>
                </header>

                <p>
                  {request.origin_airport && request.destination_airport
                    ? `${request.origin_airport} -> ${request.destination_airport}`
                    : request.destination_city
                      ? `Sin vuelo | ${request.destination_city}`
                      : 'Sin vuelo requerido'}
                  <br />
                  {request.desired_departure_date || 'Sin fecha'} {request.desired_return_date ? ` / ${request.desired_return_date}` : ''}
                </p>

                <div className="travel-pill-row">
                  <span className="travel-badge">{getStatusLabel(request.workflow_status)}</span>
                  <span className="travel-badge">
                    {request.currency || 'MXN'} {(request.total_estimated_cost || 0).toLocaleString('es-MX')}
                  </span>
                  <span className="travel-badge">Score {request.convenience_score || 0}</span>
                </div>

                <div className="travel-actions-group">
                  <button type="button" className={`button-primary ${isSelected ? '' : 'inactive'}`} onClick={() => setSelectedRequestId(isSelected ? null : request.id)}>
                    {isSelected ? 'Ocultar detalle' : 'Ver detalle'}
                  </button>
                  <select
                    className="input-field"
                    style={{ minWidth: '170px' }}
                    value={request.workflow_status}
                    onChange={(event) => updateStatus(request, event.target.value as TravelWorkflowStatus)}
                  >
                    <option value="solicitud_enviada">Solicitud enviada</option>
                    <option value="en_revision_administrativa">En revision administrativa</option>
                    <option value="reservado">Reservado</option>
                    <option value="requiere_cambios">Requiere cambios</option>
                    <option value="rechazado">Rechazado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                {isSelected && (
                  <div className="travel-request-card">
                    <strong>Resumen operativo</strong>
                    <p style={{ marginTop: '0.7rem' }}>
                      {request.request_snapshot?.summary?.riskSummary || 'Sin resumen de riesgo.'}
                    </p>
                    <pre>{request.request_snapshot?.summary?.messageText || 'No hay plantilla de reserva disponible.'}</pre>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedRequest && (
        <div className="travel-banner" style={{ marginTop: '1rem' }}>
          Solicitud activa: {selectedRequest.engineer_name} • {selectedRequest.client_name || 'Cliente sin capturar'} •{' '}
          {getStatusLabel(selectedRequest.workflow_status)}
        </div>
      )}
    </section>
  );
}
