import DriPage from './DriPage';

export default function DriPreviewPage() {
  return (
    <main
      style={{
        width: 'min(1880px, calc(100% - 2rem))',
        margin: '0 auto',
        padding: '1rem 0 4rem',
      }}
    >
      <div
        role="status"
        style={{
          position: 'sticky',
          top: '0.75rem',
          zIndex: 100,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '1rem',
          padding: '0.72rem 1rem',
          border: '1px solid rgba(var(--environmental-rgb), 0.32)',
          borderRadius: '1rem',
          background: 'rgba(247, 250, 252, 0.92)',
          boxShadow: '0 14px 34px rgba(86, 105, 124, 0.14)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>ORION · DEMO BA400</strong>
          <span style={{ marginLeft: '0.65rem', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
            Caso de prueba · sin persistencia en producción
          </span>
        </div>
        <code style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          DRI / EXPLORACIÓN 3D
        </code>
      </div>

      <DriPage subPermissions={['captura', 'grafo', 'diagnostico']} previewMode />
    </main>
  );
}
