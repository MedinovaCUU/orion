import imagotipoSrc from '../assets/orion-imagotipo.png';
import iconoSrc from '../assets/orion-icono.png';
import './BrandLockup.css';

type BrandVariant = 'auth' | 'header' | 'sidebar' | 'loading' | 'public';

interface BrandLockupProps {
  variant?: BrandVariant;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  className?: string;
  logo?: 'imagotipo' | 'icono';
}

export default function BrandLockup({
  variant = 'header',
  title,
  subtitle,
  eyebrow,
  className = '',
  logo,
}: BrandLockupProps) {
  const resolvedLogo = logo || (variant === 'sidebar' ? 'icono' : 'imagotipo');
  const imageSrc = resolvedLogo === 'icono' ? iconoSrc : imagotipoSrc;
  const imageAlt = resolvedLogo === 'icono' ? 'Orion icono' : 'Orion imagotipo';

  return (
    <div className={`brand-lockup brand-lockup--${variant} ${className}`.trim()}>
      <img className={`brand-lockup__logo brand-lockup__logo--${resolvedLogo}`} src={imageSrc} alt={imageAlt} />
      {(eyebrow || title || subtitle) && (
        <div className="brand-lockup__copy">
          {eyebrow && <span className="brand-lockup__eyebrow">{eyebrow}</span>}
          {title && <strong className="brand-lockup__title">{title}</strong>}
          {subtitle && <span className="brand-lockup__subtitle">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
