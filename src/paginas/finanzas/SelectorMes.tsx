import { moverMes, nombreMes } from '../../lib/finanzas'
import { ICONOS } from '../../componentes/iconos'

export const PESTANAS_FINANZAS = [
  { a: '/finanzas', texto: 'Resumen', fin: true, icono: ICONOS.finanzas },
  { a: '/finanzas/iva', texto: 'IVA', icono: ICONOS.iva },
  { a: '/finanzas/insumos', texto: 'Insumos', icono: ICONOS.insumos },
]

/** ‹ octubre 2026 › — permite llegar hasta el mes siguiente al actual. */
export function SelectorMes({ mes, mesActual, onCambio }: { mes: string; mesActual: string; onCambio: (mes: string) => void }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-borde bg-superficie">
      <button type="button" aria-label="Mes anterior" onClick={() => onCambio(moverMes(mes, -1))} className="h-12 w-14 text-2xl text-primario">
        <ICONOS.anterior className="mx-auto block h-6 w-6" aria-hidden />
      </button>
      <span className="font-semibold first-letter:uppercase">{nombreMes(mes)}</span>
      <button
        type="button"
        aria-label="Mes siguiente"
        disabled={mes > mesActual}
        onClick={() => onCambio(moverMes(mes, 1))}
        className="h-12 w-14 text-2xl text-primario disabled:opacity-30"
      >
        <ICONOS.siguiente className="mx-auto block h-6 w-6" aria-hidden />
      </button>
    </div>
  )
}
