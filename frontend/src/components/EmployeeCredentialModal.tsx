import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { downloadEmployeeCredentialPdf } from './employeeCredentialPdf';
import './EmployeeCredentialModal.css';

const DOCUMENTS_BUCKET = 'documentos';
const BRAND_LOGO_URL = `${import.meta.env.BASE_URL || '/'}bios-brand/BioS_Logo_300dpi.png`;
const BRAND_MARK_URL = `${import.meta.env.BASE_URL || '/'}favicon.png`;

interface EmployeeCredentialMetadata {
  issue_date?: string;
  valid_until?: string;
  validity_label?: string;
}

export interface EmployeeCredentialProfile {
  id: string;
  nombre_completo: string | null;
  rol?: string | null;
  telefono?: string | null;
  territorio?: string | null;
  employee_type?: string | null;
  employee_number?: string | null;
  puesto?: string | null;
  credential_photo_path?: string | null;
  credential_metadata?: EmployeeCredentialMetadata | null;
  creado_en?: string | null;
}

interface EmployeeCredentialModalProps {
  open: boolean;
  profile: EmployeeCredentialProfile | null;
  userEmail: string;
  onClose: () => void;
  onProfileUpdated: (profile: EmployeeCredentialProfile) => void;
}

const toIsoDate = (value?: string | null) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.slice(0, 10) : raw;
};

const formatDisplayDate = (value?: string | null) => {
  const iso = toIsoDate(value);
  if (!iso) return 'N/D';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'selfie';

const resolveAreaLabel = (employeeType?: string | null, role?: string | null) => {
  const normalized = String(employeeType || '').trim().toLowerCase();
  if (normalized === 'quimico' || normalized === 'químico') return 'Química Aplicativa';
  if (normalized === 'ingeniero') return 'Ingeniería de Campo';
  if (role === 'admin') return 'Administración Técnica';
  if (role === 'tecnico') return 'Servicio de Campo';
  return 'Personal BioSystems';
};

const resolveRoleLabel = (role?: string | null) => {
  if (role === 'admin') return 'Administrador';
  if (role === 'tecnico') return 'Ingeniero / Técnico';
  if (role === 'cliente') return 'Cliente';
  return 'Colaborador';
};

const buildVerificationCode = (profile: EmployeeCredentialProfile | null) => {
  if (!profile?.id) return 'ORION-PENDIENTE';
  const number = String(profile.employee_number || '').trim();
  if (number) return `BIOS-${number.toUpperCase()}`;
  return `BIOS-${profile.id.slice(0, 8).toUpperCase()}`;
};

const buildDocumentPublicUrl = (path: string | null) => {
  if (!path) return null;
  return supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
};

export default function EmployeeCredentialModal({
  open,
  profile,
  userEmail,
  onClose,
  onProfileUpdated,
}: EmployeeCredentialModalProps) {
  const [showBack, setShowBack] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [fullName, setFullName] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [territory, setTerritory] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [validityLabel, setValidityLabel] = useState('Vigente mientras conserve relación laboral.');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !profile) {
      return;
    }

    setShowBack(false);
    setIsPreviewExpanded(false);
    setFullName(profile.nombre_completo || '');
    setEmployeeNumber(profile.employee_number || '');
    setJobTitle(profile.puesto || '');
    setPhone(profile.telefono || '');
    setTerritory(profile.territorio || '');
    setIssueDate(
      toIsoDate(profile.credential_metadata?.issue_date) ||
        toIsoDate(profile.creado_en) ||
        new Date().toISOString().slice(0, 10),
    );
    setValidUntil(toIsoDate(profile.credential_metadata?.valid_until));
    setValidityLabel(
      profile.credential_metadata?.validity_label?.trim() ||
        'Vigente mientras conserve relación laboral.',
    );
    setPhotoPath(profile.credential_photo_path || null);
    setPhotoPreviewUrl(buildDocumentPublicUrl(profile.credential_photo_path || null));
    setStatusMessage('');
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const areaLabel = useMemo(() => resolveAreaLabel(profile?.employee_type, profile?.rol), [profile?.employee_type, profile?.rol]);
  const roleLabel = useMemo(() => resolveRoleLabel(profile?.rol), [profile?.rol]);
  const verificationCode = useMemo(
    () => buildVerificationCode(profile ? { ...profile, employee_number: employeeNumber } : null),
    [profile, employeeNumber],
  );
  const credentialInitials = useMemo(
    () =>
      (fullName || 'BioSystems')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((token) => token[0]?.toUpperCase() || '')
        .join('') || 'BS',
    [fullName],
  );
  const badgeLabel = useMemo(
    () => (jobTitle.trim() || areaLabel || roleLabel).trim(),
    [areaLabel, jobTitle, roleLabel],
  );

  const pendingFields = useMemo(() => {
    const missing: string[] = [];
    if (!fullName.trim()) missing.push('nombre');
    if (!employeeNumber.trim()) missing.push('número');
    if (!jobTitle.trim()) missing.push('puesto');
    if (!phone.trim()) missing.push('teléfono');
    if (!territory.trim()) missing.push('territorio');
    if (!photoPreviewUrl) missing.push('selfie oficial');
    return missing;
  }, [employeeNumber, fullName, jobTitle, phone, territory, photoPreviewUrl]);

  const handleUploadSelectedFile = async (file: File | null) => {
    if (!file || !profile?.id) {
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPhotoPreviewUrl(localPreview);
    setIsUploadingPhoto(true);
    setStatusMessage('Subiendo selfie oficial...');

    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'selfie';
      const fileName = `${Date.now()}-${slugify(baseName)}.${extension}`;
      const path = `staff-credentials/${profile.id}/${fileName}`;

      const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

      if (error) {
        throw error;
      }

      setPhotoPath(path);
      setPhotoPreviewUrl(buildDocumentPublicUrl(path));
      setStatusMessage('Selfie cargada. Guarda la credencial para dejarla oficial.');
    } catch (error) {
      console.error('No se pudo subir la selfie de la credencial.', error);
      setStatusMessage('La selfie no se pudo subir. Intenta nuevamente.');
    } finally {
      setIsUploadingPhoto(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      URL.revokeObjectURL(localPreview);
    }
  };

  const handleSave = async () => {
    if (!profile?.id) {
      return;
    }

    setIsSaving(true);
    setStatusMessage('');

    const nextProfile: EmployeeCredentialProfile = {
      ...profile,
      nombre_completo: fullName.trim() || null,
      employee_number: employeeNumber.trim() || null,
      puesto: jobTitle.trim() || null,
      telefono: phone.trim() || null,
      territorio: territory.trim() || null,
      credential_photo_path: photoPath,
      credential_metadata: {
        issue_date: issueDate || undefined,
        valid_until: validUntil || undefined,
        validity_label: validityLabel.trim() || 'Vigente mientras conserve relación laboral.',
      },
    };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          nombre_completo: nextProfile.nombre_completo,
          employee_number: nextProfile.employee_number,
          puesto: nextProfile.puesto,
          telefono: nextProfile.telefono,
          territorio: nextProfile.territorio,
          credential_photo_path: nextProfile.credential_photo_path,
          credential_metadata: nextProfile.credential_metadata,
        })
        .eq('id', profile.id);

      if (error) {
        throw error;
      }

      onProfileUpdated(nextProfile);
      setStatusMessage('Credencial actualizada y lista para mostrarse.');
    } catch (error) {
      console.error('No se pudo guardar la credencial del empleado.', error);
      setStatusMessage('No se pudo guardar la credencial. Revisa tus datos e intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      await downloadEmployeeCredentialPdf({
        fullName: fullName.trim() || 'Nombre pendiente',
        roleLabel,
        areaLabel,
        employeeNumber: employeeNumber.trim() || verificationCode,
        jobTitle: jobTitle.trim() || roleLabel,
        territory: territory.trim() || 'Territorio pendiente',
        phone: phone.trim() || 'N/D',
        email: userEmail || 'N/D',
        issueDate: formatDisplayDate(issueDate),
        validUntil: formatDisplayDate(validUntil),
        validityLabel: validityLabel.trim() || 'Vigente mientras conserve relación laboral.',
        verificationCode,
        photoUrl: photoPreviewUrl,
      });
      setStatusMessage('PDF generado correctamente.');
    } catch (error) {
      console.error('No se pudo generar el PDF de la credencial.', error);
      setStatusMessage('No se pudo generar el PDF en este momento.');
    }
  };

  if (!open || !profile) {
    return null;
  }

  return (
    <div className="credential-modal" role="dialog" aria-modal="true" aria-labelledby="credential-modal-title">
      <div className="credential-modal__backdrop" onClick={onClose} />
      <div className="credential-modal__panel card">
        <div className="credential-modal__header">
          <div>
            <span className="credential-modal__eyebrow">Identificación digital</span>
            <h2 id="credential-modal-title">Credencial de empleado BioSystems</h2>
            <p>Diseñada para mostrarse desde ORION cuando necesites identificarte en campo.</p>
          </div>
          <button type="button" className="credential-modal__close" onClick={onClose} aria-label="Cerrar credencial">
            ×
          </button>
        </div>

        <div className="credential-modal__layout">
          <section className="credential-modal__editor">
            <div className="credential-modal__tip-card">
              <strong>Selfie recomendada</strong>
              <p>Tómala frente a fondo blanco y, de preferencia, usando la playera polo roja de BioSystems.</p>
              <ul>
                <li>Rostro centrado y bien iluminado.</li>
                <li>Sin gafas oscuras ni fondo cargado.</li>
                <li>Encadre de hombros hacia arriba.</li>
              </ul>
            </div>

            <div className="credential-modal__photo-actions">
              <button
                type="button"
                className="button-primary inactive chip"
                onClick={() => uploadInputRef.current?.click()}
                disabled={isUploadingPhoto}
              >
                {isUploadingPhoto ? 'Subiendo...' : 'Subir selfie'}
              </button>
              <button
                type="button"
                className="button-primary chip"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isUploadingPhoto}
              >
                Tomar selfie
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => void handleUploadSelectedFile(event.target.files?.[0] || null)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={(event) => void handleUploadSelectedFile(event.target.files?.[0] || null)}
              />
            </div>

            <div className="credential-modal__grid">
              <label className="credential-modal__field credential-modal__field--wide">
                <span>Nombre completo</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nombre y apellidos" />
              </label>
              <label className="credential-modal__field">
                <span>No. de empleado</span>
                <input value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} placeholder="BIO-042" />
              </label>
              <label className="credential-modal__field">
                <span>Puesto</span>
                <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Ingeniero de servicio" />
              </label>
              <label className="credential-modal__field">
                <span>Teléfono</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+52..." />
              </label>
              <label className="credential-modal__field">
                <span>Territorio</span>
                <input value={territory} onChange={(event) => setTerritory(event.target.value)} placeholder="Chihuahua / Norte" />
              </label>
              <label className="credential-modal__field">
                <span>Área</span>
                <input value={areaLabel} readOnly />
              </label>
              <label className="credential-modal__field">
                <span>Correo</span>
                <input value={userEmail} readOnly />
              </label>
              <label className="credential-modal__field">
                <span>Fecha de emisión</span>
                <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
              </label>
              <label className="credential-modal__field">
                <span>Vigencia hasta</span>
                <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              </label>
              <label className="credential-modal__field credential-modal__field--wide">
                <span>Leyenda de vigencia</span>
                <input
                  value={validityLabel}
                  onChange={(event) => setValidityLabel(event.target.value)}
                  placeholder="Vigente mientras conserve relación laboral."
                />
              </label>
            </div>

            <div className="credential-modal__status-bar">
              <div>
                <strong>{pendingFields.length === 0 ? 'Credencial lista' : 'Campos pendientes'}</strong>
                <p>
                  {pendingFields.length === 0
                    ? 'Ya puedes mostrarla o descargarla en PDF.'
                    : `Faltan: ${pendingFields.join(', ')}.`}
                </p>
              </div>
              {statusMessage ? <span>{statusMessage}</span> : null}
            </div>

            <div className="credential-modal__footer">
              <button type="button" className="button-primary inactive" onClick={handleDownloadPdf}>
                Descargar PDF
              </button>
              <button type="button" className="button-primary" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar credencial'}
              </button>
            </div>
          </section>

          <section className={`credential-preview-shell ${isPreviewExpanded ? 'credential-preview-shell--expanded' : ''}`}>
            {isPreviewExpanded ? (
              <button
                type="button"
                className="credential-preview-shell__backdrop"
                onClick={() => setIsPreviewExpanded(false)}
                aria-label="Cerrar vista ampliada de la credencial"
              />
            ) : null}
            <div
              className={`credential-card-stage ${isPreviewExpanded ? 'credential-card-stage--expanded' : ''}`}
              onClick={() => setIsPreviewExpanded(true)}
              role="button"
              tabIndex={0}
              aria-label="Abrir credencial a pantalla completa"
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setIsPreviewExpanded(true);
                }
              }}
            >
              {isPreviewExpanded ? (
                <button
                  type="button"
                  className="credential-preview-shell__close"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPreviewExpanded(false);
                  }}
                  aria-label="Cerrar vista ampliada"
                >
                  ×
                </button>
              ) : null}
              <div className={`credential-card ${showBack ? 'credential-card--flipped' : ''}`}>
                <article className="credential-card__face credential-card__face--front">
                  <div className="credential-card__backplate" aria-hidden="true" />
                  <button
                    type="button"
                    className="credential-card__flip"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowBack(true);
                    }}
                    aria-label="Voltear credencial al reverso"
                  >
                    ↩︎
                  </button>
                  <div className="credential-card__panel">
                    <div className="credential-card__glow" aria-hidden="true" />

                    <div className="credential-card__header">
                      <div className="credential-card__brand-lockup">
                        <img className="credential-card__mark" src={BRAND_MARK_URL} alt="" aria-hidden="true" />
                        <img className="credential-card__logo" src={BRAND_LOGO_URL} alt="BioSystems" />
                      </div>
                      <div className="credential-card__header-copy">
                        <strong>Identificación laboral digital</strong>
                      </div>
                    </div>

                    <div className="credential-card__photo-shell">
                      <div className="credential-card__photo-frame">
                        {photoPreviewUrl ? (
                          <img src={photoPreviewUrl} alt={`Fotografía de ${fullName || 'empleado BioSystems'}`} />
                        ) : (
                          <div className="credential-card__photo-placeholder">{credentialInitials}</div>
                        )}
                      </div>
                    </div>

                    <div className="credential-card__front-copy">
                      <span className="credential-card__pill">{badgeLabel}</span>
                      <h3>{fullName || 'Nombre pendiente'}</h3>
                    </div>

                    <div className="credential-card__front-facts">
                      <div>
                        <span>No. empleado</span>
                        <strong>{employeeNumber || verificationCode}</strong>
                      </div>
                      <div>
                        <span>Territorio</span>
                        <strong>{territory || 'Pendiente'}</strong>
                      </div>
                      <div>
                        <span>Teléfono</span>
                        <strong>{phone || 'Pendiente'}</strong>
                      </div>
                    </div>
                  </div>
                </article>

                <article className="credential-card__face credential-card__face--back">
                  <div className="credential-card__backplate" aria-hidden="true" />
                  <button
                    type="button"
                    className="credential-card__flip"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowBack(false);
                    }}
                    aria-label="Voltear credencial al frente"
                  >
                    ↩︎
                  </button>
                  <div className="credential-card__panel">
                    <div className="credential-card__back-gradient" aria-hidden="true" />

                    <div className="credential-card__back-header">
                      <div className="credential-card__brand-lockup credential-card__brand-lockup--back">
                        <img className="credential-card__mark" src={BRAND_MARK_URL} alt="" aria-hidden="true" />
                        <img className="credential-card__back-logo" src={BRAND_LOGO_URL} alt="BioSystems" />
                      </div>
                    </div>

                    <div className="credential-card__back-grid">
                      <div className="credential-card__info-box credential-card__info-box--folio">
                        <span>Folio ORION</span>
                        <strong>{verificationCode}</strong>
                      </div>
                      <div className="credential-card__info-box">
                        <span>Área</span>
                        <strong>{areaLabel}</strong>
                      </div>
                      <div className="credential-card__info-box">
                        <span>Correo</span>
                        <strong>{userEmail || 'Pendiente'}</strong>
                      </div>
                      <div className="credential-card__info-box">
                        <span>Puesto</span>
                        <strong>{jobTitle || roleLabel}</strong>
                      </div>
                      <div className="credential-card__info-box credential-card__info-box--half">
                        <span>Emisión</span>
                        <strong>{formatDisplayDate(issueDate)}</strong>
                      </div>
                      <div className="credential-card__info-box credential-card__info-box--half">
                        <span>Vigencia</span>
                        <strong>{validUntil ? formatDisplayDate(validUntil) : 'Activa'}</strong>
                      </div>
                    </div>

                    <div className="credential-card__note">
                      <p>{validityLabel || 'Vigente mientras conserve relación laboral.'}</p>
                    </div>

                    <div className="credential-card__back-footer">
                      <div>
                        <span>Contacto</span>
                        <strong>{phone || userEmail || 'Pendiente'}</strong>
                      </div>
                      <small>{verificationCode}</small>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
