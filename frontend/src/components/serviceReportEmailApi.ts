import { supabase } from '../supabaseClient';
import { getDisabledIntegrationMessage, runtimeFlags } from '../config/runtimeFlags';
import type { ServiceReportFormData, ServiceReportStatus } from './serviceReports';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const USING_LOCAL_SUPABASE = /127\.0\.0\.1:54321|localhost:54321/.test(SUPABASE_URL);

interface SendServiceReportEmailResponse {
  ok?: boolean;
  to?: string;
  subject?: string;
  error?: string;
}

export interface ServiceReportEmailPayload {
  reportId: string;
  status: ServiceReportStatus;
  reportReference: string;
  reportTitle: string;
  generatedAt: string;
  generatedByName: string;
  engineerName: string;
  engineerEmail: string;
  form: ServiceReportFormData;
  pdfFileName: string;
  pdfBase64: string;
  pdfPublicUrl?: string;
}

const LOCAL_EDGE_HINT =
  'Si estas trabajando en local, verifica que Supabase este levantado y ejecuta `supabase functions serve send-service-report-email --env-file supabase/functions/.env --no-verify-jwt`.';

export const isServiceReportEmailEnabled = () => runtimeFlags.serviceReportEmailEnabled;

export const getServiceReportEmailDisabledMessage = () => getDisabledIntegrationMessage('serviceReportEmail');

const extractFunctionErrorMessage = async (error: unknown) => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
          return payload.error;
        }
      } catch {
        try {
          const text = await context.clone().text();
          if (text.trim()) {
            return text.trim();
          }
        } catch {
          // ignore parse issues and fall through
        }
      }
    }
  }

  const fallback = error instanceof Error ? error.message : 'No fue posible enviar el correo del reporte.';
  if (
    USING_LOCAL_SUPABASE &&
    /non-2xx status code|failed to fetch|fetch failed|functions relay error/i.test(fallback)
  ) {
    return `${fallback}. ${LOCAL_EDGE_HINT}`;
  }

  return fallback;
};

export const sendServiceReportEmail = async (payload: ServiceReportEmailPayload) => {
  if (!isServiceReportEmailEnabled()) {
    throw new Error(getServiceReportEmailDisabledMessage());
  }

  const { data, error } = await supabase.functions.invoke<SendServiceReportEmailResponse>('send-service-report-email', {
    body: payload,
  });

  if (error) {
    const message = await extractFunctionErrorMessage(error);
    throw new Error(message);
  }

  if (!data?.ok) {
    throw new Error(data?.error || 'La funcion de correo no confirmo el envio del reporte.');
  }

  return data;
};
