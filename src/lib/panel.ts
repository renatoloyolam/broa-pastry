// Tipos y cálculos derivados del panel (lo que devuelve la función panel()).
// Los campos de costo vienen en null para quien no tiene permiso.

export interface ResumenPanel {
  transacciones: number
  unidades: number
  ventas: number
  abonos: number
  ventas_netas_costeadas: number | null
  costo: number | null
  mermas: number | null
  ventas_sin_costo: number | null
  unidades_sin_costo: number | null
}

export interface FilaPanel {
  ventas: number
  ventas_netas_costeadas: number | null
  costo: number | null
}

export interface ProductoPanel extends FilaPanel {
  producto_id: number
  nombre: string
  unidades: number
  unidades_sin_costo: number | null
}

export interface DiaPanel extends FilaPanel {
  fecha: string
  transacciones: number
  mermas: number | null
}

export interface TurnoPanel extends FilaPanel {
  turno: 'AM' | 'PM'
  vendedor: string
  transacciones: number
  unidades: number
}

export interface CategoriaPanel extends FilaPanel {
  categoria: string
  unidades: number
}

export interface DatosPanel {
  ver_costos: boolean
  resumen: ResumenPanel
  anterior: ResumenPanel | null
  productos: ProductoPanel[]
  dias: DiaPanel[]
  turnos: TurnoPanel[]
  categorias: CategoriaPanel[]
  ultimo_dia: string | null
}

/** Ganancia = ventas netas (de lo que tiene costo) − costo − mermas. */
export function ganancia(f: Pick<FilaPanel, 'ventas_netas_costeadas' | 'costo'> & { mermas?: number | null }) {
  if (f.ventas_netas_costeadas == null || f.costo == null) return null
  return f.ventas_netas_costeadas - f.costo - (f.mermas ?? 0)
}

/** Margen sobre ventas netas costeadas (fracción). */
export function margen(f: Pick<FilaPanel, 'ventas_netas_costeadas' | 'costo'> & { mermas?: number | null }) {
  const g = ganancia(f)
  if (g == null || !f.ventas_netas_costeadas) return null
  return g / f.ventas_netas_costeadas
}

/** Variación porcentual contra el período anterior; null si no se puede comparar. */
export function variacion(actual: number | null | undefined, anterior: number | null | undefined) {
  if (actual == null || anterior == null || anterior === 0) return null
  return (actual - anterior) / Math.abs(anterior)
}

export function ticketPromedio(r: Pick<ResumenPanel, 'ventas' | 'transacciones'>) {
  return r.transacciones ? r.ventas / r.transacciones : null
}

/** Productos con costo completo, ordenados por ganancia total (más y menos rentables). */
export function rankingRentabilidad(productos: ProductoPanel[], minimoUnidades = 3) {
  const conCosto = productos
    .filter((p) => p.costo != null && p.ventas_netas_costeadas != null && p.unidades_sin_costo === 0 && p.unidades >= minimoUnidades)
    .map((p) => ({ ...p, ganancia: ganancia(p)!, margen: margen(p) }))
  const porGanancia = conCosto.slice().sort((a, b) => b.ganancia - a.ganancia)
  const porMargen = conCosto.slice().sort((a, b) => (a.margen ?? 0) - (b.margen ?? 0))
  return { masRentables: porGanancia.slice(0, 5), menosRentables: porMargen.slice(0, 5) }
}

/** Monto abreviado para ejes: 850000 → "$850 mil", 1234567 → "$1,2 M". */
export function pesosCompacto(v: number) {
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace('.', ',').replace(',0', '')} M`
  if (a >= 1000) return `${s}$${Math.round(a / 1000)} mil`
  return `${s}$${Math.round(a)}`
}
