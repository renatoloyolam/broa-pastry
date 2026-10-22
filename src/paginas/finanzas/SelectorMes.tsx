import { moverMes, nombreMes } from '../../lib/finanzas'

export const PESTANAS_FINANZAS = [
  { a: '/finanzas', texto: 'Resumen', fin: true },
  { a: '/finanzas/iva', texto: 'IVA' },
  { a: '/finanzas/insumos', texto: 'Insumos' },
]

/** ‹ octubre 2026 › — permite llegar hasta el mes siguiente al actual. */
export function SelectorMes({ mes, mesActual, onCambio }: { mes: string; mesActual: string; onCambio: (mes: string) => void }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-borde bg-superficie">
      <button type="button" aria-label="Mes anterior" onClick={() => onCambio(moverMes(mes, -1))} className="h-12 w-14 text-2xl text-primario">
        ‹
      </button>
      <span className="font-semibold first-letter:uppercase">{nombreMes(mes)}</span>
      <button
        type="button"
        aria-label="Mes siguiente"
        disabled={mes > mesActual}
        onClick={() => onCambio(moverMes(mes, 1))}
        className="h-12 w-14 text-2xl text-primario disabled:opacity-30"
      >
        ›
      </button>
    </div>
  )
}
