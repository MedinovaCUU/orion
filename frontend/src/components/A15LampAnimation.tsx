import type { ReactNode } from 'react';
import { A15_LAMP_SCENES, A15_SCENE_SECONDS } from '../data/a15LampScenes';
import './A15LampAnimation.css';


interface A15LampAnimationProps {
  step: number;
  playing: boolean;
  onStepChange: (step: number) => void;
  onTogglePlay: () => void;
  onFinish: () => void;
}

/* ---------- Piezas reutilizables ---------- */

function Lamp({ x = 0, y = 0, scale = 1, glow = false }: { x?: number; y?: number; scale?: number; glow?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {glow && <circle cx="0" cy="-40" r="58" fill="url(#a15-glow)" className="a15-lamp-glow" />}
      <rect x="-30" y="-95" width="60" height="110" rx="30" fill="url(#a15-glass)" stroke="#9fb3c2" strokeWidth="1.5" />
      <path d="M-14 -70 Q-18 -76 -10 -78" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
      <polyline
        points="-12,-30 -8,-46 -4,-30 0,-46 4,-30 8,-46 12,-30"
        fill="none"
        stroke={glow ? '#ffb347' : '#7d8b98'}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line x1="-12" y1="-30" x2="-12" y2="12" stroke="#8e9ba7" strokeWidth="1.5" />
      <line x1="12" y1="-30" x2="12" y2="12" stroke="#8e9ba7" strokeWidth="1.5" />
      <rect x="-22" y="12" width="44" height="30" rx="5" fill="url(#a15-metal)" stroke="#8e9ba7" />
      <line x1="-22" y1="22" x2="22" y2="22" stroke="#a9b5c0" />
      <line x1="-22" y1="31" x2="22" y2="31" stroke="#a9b5c0" />
      <line x1="-10" y1="42" x2="-10" y2="58" stroke="#7d8b98" strokeWidth="3" strokeLinecap="round" />
      <line x1="10" y1="42" x2="10" y2="58" stroke="#7d8b98" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Chip({ x, y, w, text, tone = 'info' }: { x: number; y: number; w: number; text: string; tone?: 'info' | 'risk' | 'ok' }) {
  return (
    <g className={`a15-chip a15-chip--${tone}`}>
      <rect x={x} y={y} width={w} height="26" rx="13" />
      <text x={x + w / 2} y={y + 17} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

function Cursor({ className }: { className: string }) {
  return (
    <g className={className}>
      <path d="M0 0 L0 22 L6 17 L10 27 L14 25 L10 15 L18 15 Z" fill="#17202b" stroke="#ffffff" strokeWidth="1.5" />
    </g>
  );
}

function HolderTop({ hot = false }: { hot?: boolean }) {
  return (
    <g>
      <rect x="-70" y="-60" width="140" height="120" rx="16" fill="url(#a15-pearl)" stroke="#8e9ba7" strokeWidth="1.5" />
      <circle cx="0" cy="0" r="34" fill="url(#a15-glass)" stroke="#9fb3c2" strokeWidth="1.5" />
      <circle cx="0" cy="0" r="12" fill={hot ? '#ffb347' : '#e9eef3'} stroke="#8e9ba7" />
      <circle cx="-52" cy="-42" r="4" fill="#c3ced8" />
      <circle cx="52" cy="42" r="4" fill="#c3ced8" />
      <path d="M-6 -50 L6 -50 L0 -40 Z" fill="#0aa6c8" />
      <text x="0" y="52" textAnchor="middle" className="a15-mini-label">
        A
      </text>
    </g>
  );
}

/* ---------- Escenas ---------- */

function SceneSleeping() {
  return (
    <g>
      <rect x="100" y="92" width="400" height="44" rx="20" fill="url(#a15-pearl)" stroke="#b9c5d0" />
      <rect x="100" y="118" width="400" height="200" rx="24" fill="url(#a15-pearl)" stroke="#a9b6c2" strokeWidth="1.5" />
      <rect x="132" y="150" width="180" height="116" rx="12" fill="#f4fafc" stroke="#0aa6c8" strokeOpacity="0.45" />
      <text x="146" y="172" className="a15-mini-label">
        ESTADO DEL ANALIZADOR
      </text>
      <g className="a15-s1-test">
        <circle cx="152" cy="212" r="7" fill="#0aa6c8" className="a15-pulse" />
        <text x="168" y="219" className="a15-screen-big a15-cyan">
          MODO TEST
        </text>
      </g>
      <g className="a15-s1-sleep">
        <circle cx="152" cy="212" r="7" fill="#8e9ba7" />
        <text x="168" y="219" className="a15-screen-big">
          SLEEPING
        </text>
      </g>
      <text x="146" y="252" className="a15-mini-label a15-s1-auto">
        Apagado automático…
      </text>
      <circle cx="412" cy="206" r="62" fill="#eef3f7" stroke="#a9b6c2" strokeWidth="1.5" />
      <circle cx="412" cy="206" r="40" fill="none" stroke="#c3ced8" strokeDasharray="4 6" />
      <text x="412" y="211" textAnchor="middle" className="a15-mini-label">
        ROTOR
      </text>
      <circle cx="470" cy="292" r="7" className="a15-s1-led" />
      <text x="456" y="296" textAnchor="end" className="a15-mini-label">
        POWER
      </text>
      <g className="a15-s1-z">
        <text x="320" y="160" className="a15-z">
          z
        </text>
        <text x="334" y="142" className="a15-z a15-z--2">
          z
        </text>
        <text x="350" y="122" className="a15-z a15-z--3">
          Z
        </text>
      </g>
      <Chip x={190} y={340} w={220} text="Requisito: estado “Sleeping”" />
    </g>
  );
}

function SceneNoTouch() {
  return (
    <g>
      <Lamp x={300} y={200} scale={1.35} />
      <line x1="345" y1="110" x2="420" y2="84" stroke="#a9b6c2" />
      <text x="424" y="88" className="a15-label">
        Halógena 10 W
      </text>
      <g className="a15-s2-smudge">
        <ellipse cx="322" cy="150" rx="8" ry="6" fill="none" stroke="#f32735" strokeOpacity="0.5" strokeDasharray="2 2" />
        <ellipse cx="322" cy="150" rx="4" ry="3" fill="none" stroke="#f32735" strokeOpacity="0.5" strokeDasharray="2 2" />
      </g>
      <g className="a15-s2-finger">
        <rect x="335" y="132" width="200" height="38" rx="19" fill="#f6e1d3" stroke="#d4b3a0" strokeWidth="1.5" />
        <rect x="341" y="138" width="22" height="26" rx="9" fill="#fbeee6" stroke="#dfc3b2" />
      </g>
      <g className="a15-s2-ban">
        <circle cx="322" cy="150" r="34" fill="rgba(243,39,53,0.06)" stroke="#f32735" strokeWidth="5" />
        <line x1="298" y1="126" x2="346" y2="174" stroke="#f32735" strokeWidth="5" strokeLinecap="round" />
        <Chip x={360} y={186} w={170} text="Nunca dedos desnudos" tone="risk" />
      </g>
      <g className="a15-s2-glove">
        <path d="M232 380 L232 300 Q232 286 246 286 L262 286 L262 236 Q262 226 270 226 Q278 226 278 236 L278 286" fill="#e3f4f8" stroke="#0aa6c8" strokeWidth="1.5" />
        <path d="M368 380 L368 300 Q368 286 354 286 L338 286 L338 236 Q338 226 330 226 Q322 226 322 236 L322 286" fill="#e3f4f8" stroke="#0aa6c8" strokeWidth="1.5" />
        <rect x="246" y="284" width="108" height="96" rx="18" fill="#e3f4f8" stroke="#0aa6c8" strokeWidth="1.5" />
        <Chip x={380} y={300} w={170} text="Sujétala por la base" tone="ok" />
      </g>
    </g>
  );
}

function SceneInstall() {
  return (
    <g>
      <rect x="200" y="96" width="200" height="236" rx="20" fill="#f3f7fa" stroke="#c3ced8" strokeDasharray="5 5" />
      <rect x="252" y="262" width="96" height="44" rx="10" fill="url(#a15-metal)" stroke="#8e9ba7" />
      <rect x="282" y="262" width="8" height="12" fill="#6f7c88" />
      <rect x="310" y="262" width="8" height="12" fill="#6f7c88" />
      <g className="a15-s3-lamp">
        <Lamp x={300} y={210} scale={0.95} />
      </g>
      <g className="a15-s3-rotor">
        <circle cx="490" cy="214" r="58" fill="#eef3f7" stroke="#a9b6c2" strokeWidth="1.5" />
        <g className="a15-spin">
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 12;
            return <rect key={i} x={490 + Math.cos(a) * 42 - 4} y={214 + Math.sin(a) * 42 - 6} width="8" height="12" rx="2" fill="#cfe9f1" stroke="#7fbfd1" />;
          })}
        </g>
      </g>
      <g className="a15-s3-cover1">
        <rect x="200" y="96" width="200" height="236" rx="20" fill="rgba(255,255,255,0.86)" stroke="#0aa6c8" strokeWidth="1.5" />
        <text x="300" y="214" textAnchor="middle" className="a15-label">
          Tapa de la óptica
        </text>
        <circle cx="220" cy="116" r="4" fill="#a9b6c2" />
        <circle cx="380" cy="116" r="4" fill="#a9b6c2" />
        <circle cx="220" cy="312" r="4" fill="#a9b6c2" />
        <circle cx="380" cy="312" r="4" fill="#a9b6c2" />
      </g>
      <g className="a15-s3-cover2">
        <circle cx="490" cy="214" r="64" fill="rgba(255,255,255,0.9)" stroke="#0aa6c8" strokeWidth="1.5" />
        <text x="490" y="210" textAnchor="middle" className="a15-label">
          Tapa
        </text>
        <text x="490" y="228" textAnchor="middle" className="a15-label">
          del rotor
        </text>
      </g>
      <g className="a15-s3-ok">
        <Chip x={70} y={348} w={460} text="Lámpara instalada · tapas de óptica y rotor colocadas" tone="ok" />
      </g>
    </g>
  );
}

function SoftwareWindow({ children, title }: { children: ReactNode; title: string }) {
  return (
    <g>
      <rect x="70" y="58" width="460" height="290" rx="18" fill="#ffffff" stroke="#b9c5d0" strokeWidth="1.5" filter="url(#a15-shadow)" />
      <path d="M70 76 Q70 58 88 58 L512 58 Q530 58 530 76 L530 92 L70 92 Z" fill="#f1f5f8" />
      <circle cx="92" cy="75" r="5" fill="#f32735" opacity="0.7" />
      <circle cx="108" cy="75" r="5" fill="#ffc45e" opacity="0.8" />
      <circle cx="124" cy="75" r="5" fill="#76d4a8" opacity="0.8" />
      <text x="300" y="80" textAnchor="middle" className="a15-mini-label">
        {title}
      </text>
      {children}
    </g>
  );
}

function SceneSoftware() {
  const menu = ['Rutina', 'Calibración', 'Control', 'Utilidades'];
  return (
    <SoftwareWindow title="A15 · Software de usuario">
      <rect x="70" y="92" width="120" height="256" fill="#f6f9fb" />
      {menu.map((item, i) => (
        <g key={item}>
          {item === 'Utilidades' && <rect x="80" y={108 + i * 34} width="100" height="26" rx="8" className="a15-s4-menu" />}
          <text x="92" y={126 + i * 34} className="a15-ui-text">
            {item}
          </text>
        </g>
      ))}
      <text x="212" y="122" className="a15-mini-label">
        UTILIDADES
      </text>
      {['Configuración', 'Cambio de la lámpara', 'Mantenimiento'].map((item, i) => (
        <g key={item}>
          <rect x="206" y={134 + i * 36} width="300" height="28" rx="8" fill="#f6f9fb" className={item === 'Cambio de la lámpara' ? 'a15-s4-item' : ''} />
          <text x="218" y={153 + i * 36} className="a15-ui-text">
            {item}
          </text>
        </g>
      ))}
      <g className="a15-s4-panel">
        <rect x="206" y="252" width="300" height="76" rx="10" fill="#f4fafc" stroke="#0aa6c8" strokeOpacity="0.3" />
        <text x="220" y="276" className="a15-mini-label">
          CAMBIO DE LA LÁMPARA
        </text>
        <rect x="220" y="288" width="96" height="30" rx="9" className="a15-s4-btn" />
        <text x="268" y="308" textAnchor="middle" className="a15-ui-text a15-s4-btn-text">
          Cambio
        </text>
        <rect x="326" y="288" width="96" height="30" rx="9" fill="#eef2f5" />
        <text x="374" y="308" textAnchor="middle" className="a15-ui-text a15-muted">
          Test
        </text>
        <circle cx="268" cy="303" r="6" className="a15-s4-ripple" />
      </g>
      <Cursor className="a15-s4-cursor" />
    </SoftwareWindow>
  );
}

function SceneTest() {
  return (
    <g>
      <rect x="70" y="40" width="460" height="64" rx="16" fill="#ffffff" stroke="#b9c5d0" filter="url(#a15-shadow)" />
      <rect x="92" y="57" width="96" height="30" rx="9" fill="#e3f4f8" />
      <text x="140" y="77" textAnchor="middle" className="a15-ui-text a15-cyan">
        ✓ Cambio
      </text>
      <rect x="202" y="57" width="96" height="30" rx="9" className="a15-s5-btn" />
      <text x="250" y="77" textAnchor="middle" className="a15-ui-text a15-s5-btn-text">
        Test
      </text>
      <circle cx="250" cy="72" r="6" className="a15-s5-ripple" />
      <text x="318" y="77" className="a15-mini-label a15-s5-status">
        Optimizando luminosidad…
      </text>
      <Cursor className="a15-s5-cursor" />

      <text x="80" y="146" className="a15-mini-label">
        SISTEMA FOTOMÉTRICO
      </text>
      <Lamp x={110} y={260} scale={0.62} glow />
      <line x1="132" y1="236" x2="448" y2="236" stroke="url(#a15-beam)" strokeWidth="10" strokeLinecap="round" className="a15-s5-beam" />
      <rect x="230" y="196" width="14" height="80" rx="4" fill="#dbe4ec" stroke="#8e9ba7" />
      <text x="237" y="296" textAnchor="middle" className="a15-mini-label">
        Filtro
      </text>
      <rect x="320" y="206" width="30" height="60" rx="4" fill="#e3f4f8" stroke="#7fbfd1" />
      <text x="335" y="296" textAnchor="middle" className="a15-mini-label">
        Cubeta
      </text>
      <rect x="440" y="210" width="20" height="52" rx="4" fill="#17202b" />
      <text x="450" y="296" textAnchor="middle" className="a15-mini-label">
        Detector
      </text>
      <rect x="490" y="150" width="22" height="160" rx="11" fill="#eef2f5" stroke="#c3ced8" />
      <rect x="490" y="150" width="22" height="160" rx="11" fill="url(#a15-meter)" className="a15-s5-meter" />
      <text x="501" y="330" textAnchor="middle" className="a15-mini-label">
        Intensidad
      </text>
    </g>
  );
}

function SceneRotate() {
  return (
    <g>
      <Chip x={110} y={40} w={380} text="El analizador se apaga y solicita extraer el portalámparas" />
      <rect x="110" y="104" width="190" height="196" rx="20" fill="#f3f7fa" stroke="#a9b6c2" strokeDasharray="6 5" />
      <text x="205" y="322" textAnchor="middle" className="a15-mini-label">
        Alojamiento
      </text>
      <g className="a15-s6-slide">
        <g transform="translate(205 202)">
          <g className="a15-s6-rot">
            <HolderTop />
          </g>
        </g>
      </g>
      <g className="a15-s6-arc">
        <path d="M 330 150 A 70 70 0 0 1 470 150" fill="none" stroke="#0aa6c8" strokeWidth="3" strokeDasharray="6 6" />
        <path d="M 462 138 L 472 154 L 480 140" fill="none" stroke="#0aa6c8" strokeWidth="3" strokeLinecap="round" />
        <text x="400" y="100" textAnchor="middle" className="a15-big-num">
          180°
        </text>
        <text x="400" y="352" textAnchor="middle" className="a15-mini-label">
          Gira sobre el eje de la lámpara
        </text>
      </g>
    </g>
  );
}

function SceneHot() {
  return (
    <g>
      <g transform="translate(300 220)">
        <HolderTop hot />
      </g>
      <g className="a15-s7-heat">
        {[262, 300, 338].map((x, i) => (
          <path key={x} d={`M${x} 150 q-8 -12 0 -24 t0 -24 t0 -24`} fill="none" stroke="#f08a3c" strokeWidth="3" strokeLinecap="round" className={`a15-wave a15-wave--${i}`} />
        ))}
      </g>
      <g>
        <rect x="102" y="96" width="22" height="190" rx="11" fill="#ffffff" stroke="#a9b6c2" strokeWidth="1.5" />
        <circle cx="113" cy="296" r="20" fill="#f32735" />
        <rect x="108" y="110" width="10" height="186" rx="5" fill="#f32735" className="a15-s7-mercury" />
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="128" x2="138" y1={120 + i * 34} y2={120 + i * 34} stroke="#a9b6c2" />
        ))}
        <text x="113" y="344" textAnchor="middle" className="a15-label a15-risk">
          Caliente
        </text>
      </g>
      <g className="a15-s7-tweezers">
        <path d="M560 160 L378 206" stroke="#7d8b98" strokeWidth="6" strokeLinecap="round" />
        <path d="M560 182 L378 234" stroke="#7d8b98" strokeWidth="6" strokeLinecap="round" />
        <path d="M560 160 Q580 171 560 182" fill="none" stroke="#7d8b98" strokeWidth="6" />
        <text x="470" y="270" textAnchor="middle" className="a15-label">
          Usa pinzas
        </text>
      </g>
      <g className="a15-s7-wait">
        <circle cx="470" cy="104" r="26" fill="#ffffff" stroke="#0aa6c8" strokeWidth="2" />
        <line x1="470" y1="104" x2="470" y2="86" stroke="#17202b" strokeWidth="2.5" strokeLinecap="round" className="a15-clock-hand" />
        <circle cx="470" cy="104" r="3" fill="#17202b" />
        <text x="470" y="152" textAnchor="middle" className="a15-mini-label">
          o espera a que se enfríe
        </text>
      </g>
      <Chip x={170} y={356} w={260} text="Advertencia: riesgo de quemadura" tone="risk" />
    </g>
  );
}

function SceneCompare() {
  return (
    <g>
      <text x="300" y="70" textAnchor="middle" className="a15-mini-label">
        MEDICIÓN DE INTENSIDAD LUMINOSA
      </text>
      <line x1="140" y1="300" x2="460" y2="300" stroke="#a9b6c2" />
      {[140, 180, 220, 260].map((y) => (
        <line key={y} x1="140" y1={y} x2="460" y2={y} stroke="#e1e7ed" strokeDasharray="3 5" />
      ))}
      <rect x="190" y="120" width="80" height="180" rx="10" fill="url(#a15-bar-muted)" className="a15-s8-barA" />
      <rect x="330" y="120" width="80" height="180" rx="10" fill="url(#a15-bar)" className="a15-s8-barB" />
      <text x="230" y="324" textAnchor="middle" className="a15-label">
        Posición 0°
      </text>
      <text x="370" y="324" textAnchor="middle" className="a15-label">
        Posición 180°
      </text>
      <text x="230" y="196" textAnchor="middle" className="a15-mini-label a15-s8-valA">
        1ª lectura
      </text>
      <text x="370" y="138" textAnchor="middle" className="a15-mini-label a15-s8-valB">
        2ª lectura
      </text>
      <g className="a15-s8-win">
        <rect x="322" y="112" width="96" height="196" rx="14" fill="none" stroke="#0aa6c8" strokeWidth="2.5" />
        <circle cx="418" cy="112" r="16" fill="#0aa6c8" />
        <path d="M410 112 L416 118 L427 106" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <Chip x={190} y={344} w={220} text="Mejor posición guardada" tone="ok" />
      </g>
    </g>
  );
}

const SCENES = [SceneSleeping, SceneNoTouch, SceneInstall, SceneSoftware, SceneTest, SceneRotate, SceneHot, SceneCompare];

export default function A15LampAnimation({ step, playing, onStepChange, onTogglePlay, onFinish }: A15LampAnimationProps) {
  const total = A15_LAMP_SCENES.length;
  const Scene = SCENES[step];
  const scene = A15_LAMP_SCENES[step];

  return (
    <div
      className={`a15-anim ${playing ? '' : 'is-paused'}`}
      style={{ ['--a15-dur' as string]: `${A15_SCENE_SECONDS}s` }}
    >
      <div className="a15-anim__head">
        <span className="a15-anim__kicker">Guía animada · A15</span>
        <span className={`a15-anim__step a15-anim__step--${scene.tono}`}>
          Paso {step + 1} de {total}
        </span>
      </div>
      <h3 className="a15-anim__title">{scene.titulo}</h3>

      <div className="a15-anim__stage">
        <span className="a15-corner a15-corner--tl" />
        <span className="a15-corner a15-corner--tr" />
        <span className="a15-corner a15-corner--bl" />
        <span className="a15-corner a15-corner--br" />
        <svg viewBox="0 0 600 400" role="img" aria-label={`Paso ${step + 1}: ${scene.titulo}`}>
          <defs>
            <linearGradient id="a15-pearl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#e6edf3" />
            </linearGradient>
            <linearGradient id="a15-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="0.6" stopColor="#e3f1f7" stopOpacity="0.8" />
              <stop offset="1" stopColor="#c9dde8" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="a15-metal" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#c3ced8" />
              <stop offset="0.5" stopColor="#f4f7fa" />
              <stop offset="1" stopColor="#b2bfcb" />
            </linearGradient>
            <radialGradient id="a15-glow">
              <stop offset="0" stopColor="#ffd98a" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="a15-beam" gradientUnits="userSpaceOnUse" x1="132" y1="0" x2="448" y2="0">
              <stop offset="0" stopColor="#ffd98a" />
              <stop offset="1" stopColor="#0aa6c8" />
            </linearGradient>
            <linearGradient id="a15-meter" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#0aa6c8" />
              <stop offset="1" stopColor="#69dde0" />
            </linearGradient>
            <linearGradient id="a15-bar" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#0aa6c8" />
              <stop offset="1" stopColor="#8be3ee" />
            </linearGradient>
            <linearGradient id="a15-bar-muted" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#a9b6c2" />
              <stop offset="1" stopColor="#dbe3ea" />
            </linearGradient>
            <filter id="a15-shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#17202b" floodOpacity="0.08" />
            </filter>
          </defs>
          <g key={step} className={`a15-scene a15-scene--${step + 1}`}>
            <Scene />
          </g>
        </svg>
      </div>

      <div className="a15-anim__controls">
        <button type="button" className="a15-btn" onClick={() => onStepChange(Math.max(0, step - 1))} disabled={step === 0} aria-label="Paso anterior">
          ‹
        </button>
        <button type="button" className="a15-btn a15-btn--play" onClick={onTogglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            {playing ? (
              <>
                <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
                <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
              </>
            ) : (
              <path d="M4.5 2.8 L13 8 L4.5 13.2 Z" fill="currentColor" />
            )}
          </svg>
        </button>
        <button type="button" className="a15-btn" onClick={() => onStepChange(Math.min(total - 1, step + 1))} disabled={step === total - 1} aria-label="Paso siguiente">
          ›
        </button>
        <div className="a15-anim__track">
          {A15_LAMP_SCENES.map((s, i) => (
            <button
              key={s.titulo}
              type="button"
              className={`a15-seg ${i < step ? 'is-done' : ''} ${i === step ? 'is-active' : ''} ${s.tono === 'risk' ? 'is-risk' : ''}`}
              onClick={() => onStepChange(i)}
              aria-label={`Ir al paso ${i + 1}`}
            >
              {i === step && (
                <span
                  key={`fill-${step}`}
                  className="a15-seg__fill"
                  onAnimationEnd={() => {
                    if (step < total - 1) onStepChange(step + 1);
                    else onFinish();
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
