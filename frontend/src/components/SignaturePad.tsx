import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface SignaturePadProps {
  value: string;
  onChange: (value: string) => void;
}

interface PointerPoint {
  x: number;
  y: number;
}

export default function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<PointerPoint | null>(null);

  const drawImage = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = dataUrl;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) {
      return;
    }

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(Math.floor(frame.clientWidth), 320);
    const height = Math.max(Math.floor(frame.clientHeight), 180);
    const snapshot = value || canvas.toDataURL('image/png');

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.4;
    context.strokeStyle = 'rgba(245, 247, 250, 0.95)';
    context.fillStyle = 'rgba(255, 255, 255, 0)';
    context.clearRect(0, 0, width, height);

    if (snapshot) {
      drawImage(snapshot);
    }
  }, [drawImage, value]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    if (value) {
      drawImage(value);
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [drawImage, value]);

  const getRelativePoint = (event: ReactPointerEvent<HTMLCanvasElement>): PointerPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getRelativePoint(event);
    if (!point) {
      return;
    }

    drawingRef.current = true;
    lastPointRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const point = getRelativePoint(event);
    const lastPoint = lastPointRef.current;
    if (!canvas || !context || !point || !lastPoint) {
      return;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  };

  const endStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);

    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    onChange('');
  };

  return (
    <div className="signature-pad-shell">
      <div className="signature-pad-frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          className="signature-pad-canvas"
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
        />
        {!value && <div className="signature-pad-placeholder">Firma aqui con dedo, pluma o trackpad.</div>}
      </div>
      <div className="signature-pad-actions">
        <span>{value ? 'Firma capturada.' : 'Aun no hay firma registrada.'}</span>
        <button type="button" className="button-primary inactive" onClick={clearPad}>
          Limpiar firma
        </button>
      </div>
    </div>
  );
}
