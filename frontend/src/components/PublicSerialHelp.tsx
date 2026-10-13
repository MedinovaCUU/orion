import { useState } from 'react';

// Example photos: the trailing digits and the data-matrix code are blurred so nobody reuses a real serial.
const asset = (name: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}portal-serie/${name}.webp`;

export type SerialHelpTab = 'ba' | 'a15';

export default function PublicSerialHelp({ initialTab }: { initialTab: SerialHelpTab }) {
  const [tab, setTab] = useState<SerialHelpTab>(initialTab);

  return (
    <section className="serial-help" aria-label="Dónde encontrar el número de serie">
      <div className="serial-help__tabs" role="tablist" aria-label="Modelo del equipo">
        <button type="button" role="tab" aria-selected={tab === 'ba'} className={tab === 'ba' ? 'is-active' : ''} onClick={() => setTab('ba')}>
          BA400 · BA200
        </button>
        <button type="button" role="tab" aria-selected={tab === 'a15'} className={tab === 'a15' ? 'is-active' : ''} onClick={() => setTab('a15')}>
          A15
        </button>
      </div>

      {tab === 'ba' ? (
        <div className="serial-help__panel" role="tabpanel">
          <figure>
            <img src={asset('ba400-software')} width={400} height={296} loading="lazy" alt="Software de usuario del BA400: menú Ayuda, opción Información del analizador, con el número de serie" />
            <figcaption>
              <strong>En el software de usuario</strong>
              Abre <b>Ayuda → Información del analizador</b>. Ahí aparece el «Número de Serie».
            </figcaption>
          </figure>
          <figure>
            <img src={asset('ba400-etiqueta')} width={600} height={528} loading="lazy" alt="Etiqueta trasera del BA400 con el número de serie junto a SN" />
            <figcaption>
              <strong>En la etiqueta de la parte trasera</strong>
              Junto a «SN». En el BA400 empieza con <code>83400</code> (o <code>83400ISE</code> si tiene ISE) y sigue con 4 números.
              En el BA200 es igual, pero empieza con <code>83200</code>.
            </figcaption>
          </figure>
        </div>
      ) : (
        <div className="serial-help__panel" role="tabpanel">
          <figure>
            <img src={asset('a15-software')} width={393} height={296} loading="lazy" alt="Software de usuario del A15 con la ventana Acerca de" />
            <figcaption>
              <strong>En el software de usuario</strong>
              Abre <b>Ayuda → Acerca de…</b> (<i>Help → About…</i> si está en inglés).
            </figcaption>
          </figure>
          <figure>
            <img src={asset('a15-etiqueta')} width={560} height={518} loading="lazy" alt="Etiqueta trasera del A15 con el número de serie junto a SN" />
            <figcaption>
              <strong>En la etiqueta de la parte trasera</strong>
              Junto a «SN». Empieza con <code>83105</code>; en equipos con nevera sigue una <code>C</code> y 4 números (<code>83105C</code> + 4 números).
            </figcaption>
          </figure>
          <figure>
            <img src={asset('a15-etiqueta-anterior')} width={560} height={589} loading="lazy" alt="Etiqueta anterior del A15 con REF 83105 y SN por separado" />
            <figcaption>
              <strong>Etiquetas anteriores</strong>
              Si la etiqueta muestra <b>REF 83105</b> y un <b>SN</b> de 5 números que empieza con 0, cambia ese 0 por C
              (la C indica que el equipo tiene nevera): REF 83105 y SN 04321 se escriben <code>83105C4321</code>.
            </figcaption>
          </figure>
        </div>
      )}

      <p className="serial-help__note">
        No uses el número que empieza con <code>(01)</code>: es el código del producto y es igual en todos los equipos del mismo modelo.
      </p>
    </section>
  );
}
