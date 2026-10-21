// Si se abre la app en Safari del iPhone sin instalarla, explica cómo
// agregarla a la pantalla de inicio (no hay botón automático en iOS).

function esIphoneSinInstalar() {
  if (typeof window === 'undefined') return false
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const instalada =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !instalada
}

export function AyudaInstalar() {
  if (!esIphoneSinInstalar()) return null
  return (
    <div className="mt-6 rounded-2xl border border-borde bg-superficie p-4 text-sm">
      <p className="mb-1 font-semibold">Instala Broa en tu iPhone</p>
      <ol className="list-decimal space-y-1 pl-5 text-suave">
        <li>
          Toca el botón <b>Compartir</b> (cuadrado con flecha) abajo en Safari.
        </li>
        <li>
          Elige <b>Agregar a pantalla de inicio</b> y luego <b>Agregar</b>.
        </li>
        <li>Abre Broa desde el ícono nuevo.</li>
      </ol>
    </div>
  )
}
