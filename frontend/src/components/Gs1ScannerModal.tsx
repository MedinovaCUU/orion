import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserCodeReader, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { createMaterialItemFromScan, type ServiceReportMaterialItem } from './gs1DataMatrix';
import './ServiceReportModal.css';

interface Gs1ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (item: ServiceReportMaterialItem) => void;
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

const isIgnorableScanError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  return ['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name);
};

const choosePreferredDevice = (devices: MediaDeviceInfo[]) =>
  devices.find((device) => /back|rear|environment|trasera/i.test(device.label))?.deviceId || devices[0]?.deviceId || '';

export default function Gs1ScannerModal({ isOpen, onClose, onDetected }: Gs1ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const resolvingRef = useRef(false);
  const objectUrlRef = useRef<string>('');

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [scannerStatus, setScannerStatus] = useState('Solicita permiso de camara para leer el codigo GS1 DataMatrix.');
  const [scannerError, setScannerError] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);

  const hints = useMemo(() => {
    const next = new Map<DecodeHintType, unknown>();
    next.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE]);
    next.set(DecodeHintType.ASSUME_GS1, true);
    return next;
  }, []);

  const stopScanner = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  const cleanupObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      cleanupObjectUrl();
      resolvingRef.current = false;
      return undefined;
    }

    readerRef.current = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 250,
      delayBetweenScanSuccess: 900,
    });

    const loadDevices = async () => {
      try {
        const devices = await BrowserCodeReader.listVideoInputDevices();
        setCameraDevices(devices);
        setSelectedDeviceId((current) => current || choosePreferredDevice(devices));
      } catch (error) {
        setScannerError(
          getErrorMessage(error, 'No fue posible enumerar las camaras del equipo. Puedes continuar cargando una foto del codigo.'),
        );
      }
    };

    void loadDevices();

    return () => {
      stopScanner();
      cleanupObjectUrl();
      readerRef.current = null;
      resolvingRef.current = false;
    };
  }, [hints, isOpen]);

  useEffect(() => {
    if (!isOpen || !videoRef.current || !readerRef.current) {
      return undefined;
    }

    let cancelled = false;
    stopScanner();
    setCameraBusy(true);
    setScannerError('');
    setScannerStatus('Enfoca el DataMatrix de BioSystems dentro del recuadro.');

    const start = async () => {
      try {
        const controls = await readerRef.current?.decodeFromVideoDevice(
          selectedDeviceId || undefined,
          videoRef.current || undefined,
          async (result, error) => {
            if (cancelled || resolvingRef.current) {
              return;
            }

            if (result) {
              resolvingRef.current = true;
              stopScanner();
              setScannerStatus('Codigo detectado. Interpretando GTIN, lote y caducidad...');

              try {
                const item = await createMaterialItemFromScan({
                  rawText: result.getText(),
                  scanMethod: 'camera',
                  scanFormat: String(result.getBarcodeFormat()),
                });
                onDetected(item);
                onClose();
                return;
              } catch (parseError) {
                resolvingRef.current = false;
                setScannerError(getErrorMessage(parseError, 'Se detecto un codigo, pero no se pudo interpretar.'));
                setScannerStatus('Ajusta el enfoque o intenta cargar una foto del empaque.');
                return;
              }
            }

            if (error && !isIgnorableScanError(error)) {
              setScannerError(getErrorMessage(error, 'No fue posible leer la camara.'));
            }
          },
        );

        if (!cancelled) {
          controlsRef.current = controls || null;
          setCameraBusy(false);
        }
      } catch (error) {
        if (!cancelled) {
          setCameraBusy(false);
          setScannerError(
            getErrorMessage(error, 'No fue posible abrir la camara. Puedes seguir con una foto del codigo o capturar manualmente.'),
          );
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [isOpen, onClose, onDetected, selectedDeviceId]);

  const handleImageUpload = async (file: File | null) => {
    if (!file || !readerRef.current) {
      return;
    }

    cleanupObjectUrl();
    objectUrlRef.current = URL.createObjectURL(file);
    setUploadBusy(true);
    setScannerError('');
    setScannerStatus('Analizando imagen del codigo...');

    try {
      const result = await readerRef.current.decodeFromImageUrl(objectUrlRef.current);
      const item = await createMaterialItemFromScan({
        rawText: result.getText(),
        scanMethod: 'image',
        scanFormat: String(result.getBarcodeFormat()),
      });
      onDetected(item);
      onClose();
    } catch (error) {
      setScannerError(
        getErrorMessage(
          error,
          'No se pudo leer el codigo desde la imagen. Intenta con una foto mas cercana, con menos brillo o usa la camara en vivo.',
        ),
      );
    } finally {
      setUploadBusy(false);
      cleanupObjectUrl();
    }
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="travel-alert-overlay service-report-scanner-overlay" onClick={onClose}>
      <div className="service-report-scanner-shell" onClick={(event) => event.stopPropagation()}>
        <div className="service-report-scanner-header">
          <div>
            <div className="travel-alert-kicker">Escaner GS1</div>
            <h3>Escanear reactivo o refaccion BioSystems</h3>
            <p>
              Lee el DataMatrix del empaque para capturar REF, GTIN, lote y caducidad. Si el producto existe en el
              catalogo, se reconocera automaticamente.
            </p>
          </div>
          <button type="button" className="travel-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="service-report-scanner-body">
          <div className="service-report-scanner-preview">
            <video ref={videoRef} className="service-report-scanner-video" muted playsInline />
            <div className="service-report-scanner-reticle" />
            <div className="service-report-scanner-status">
              {cameraBusy ? 'Abriendo camara...' : scannerStatus}
            </div>
          </div>

          <div className="service-report-scanner-side">
            {cameraDevices.length > 1 && (
              <div className="travel-field">
                <label>Camara</label>
                <select
                  className="input-field"
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                >
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camara ${device.deviceId.slice(0, 4)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="service-report-upload-card service-report-scanner-upload">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploadBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void handleImageUpload(file);
                  event.currentTarget.value = '';
                }}
              />
              <div>
                <strong>{uploadBusy ? 'Leyendo imagen...' : 'Cargar foto del codigo'}</strong>
                <span>
                  Si la camara en vivo no enfoca bien el DataMatrix, sube una foto cercana tomada desde el mismo celular.
                </span>
              </div>
            </label>

            <div className="service-report-scanner-tips">
              <strong>Lectura esperada</strong>
              <span>AI (01): GTIN del producto</span>
              <span>AI (17): fecha de caducidad</span>
              <span>AI (10): lote</span>
            </div>

            {scannerError && <div className="travel-banner error">{scannerError}</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
