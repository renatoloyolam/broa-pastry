// Compras de insumos vs. lo que se usó según los costos de cada producto.
// Los datos vienen de insumos_periodo().

export const CATEGORIAS_INSUMO = ['Insumos', 'Packaging'] as const

export interface CompraProveedor {
  categoria: string
  rut: string
  proveedor: string
  documentos: number
  monto: number
}

export interface DatosInsumos {
  desde: string
  hasta: string
  ultimo_dia: string | null
  compras: CompraProveedor[]
  uso: { origen: 'ventas' | 'mermas'; categoria: string; costo: number; insumos: number }[]
  ventas: { netas_costeadas: number; netas_sin_costo: number }
}

export type Veredicto = 'sin_compras' | 'calza' | 'sobra' | 'falta'

/** Margen dentro del cual compras y uso se consideran parejos. */
export const TOLERANCIA = 0.1

export function calcularInsumos(d: DatosInsumos) {
  const deInsumos = d.compras.filter((c) => (CATEGORIAS_INSUMO as readonly string[]).includes(c.categoria))
  const comprado = deInsumos.reduce((s, c) => s + Number(c.monto), 0)
  const porClasificar = d.compras.filter((c) => c.categoria === 'Por clasificar')

  const usoVentas = d.uso.filter((u) => u.origen === 'ventas').reduce((s, u) => s + Number(u.insumos), 0)
  const usoMermas = d.uso.filter((u) => u.origen === 'mermas').reduce((s, u) => s + Number(u.insumos), 0)
  // Lo vendido sin costo cargado también usó insumos: se estima con la proporción del resto
  const proporcion = d.ventas.netas_costeadas > 0 ? usoVentas / d.ventas.netas_costeadas : 0
  const usoEstimado = d.ventas.netas_sin_costo * proporcion
  const usado = usoVentas + usoMermas + usoEstimado

  const diferencia = comprado - usado
  const relativa = usado > 0 ? diferencia / usado : null
  const veredicto: Veredicto =
    comprado <= 0 ? 'sin_compras' : relativa == null || Math.abs(relativa) <= TOLERANCIA ? 'calza' : relativa > 0 ? 'sobra' : 'falta'

  const porCategoria = new Map<string, number>()
  for (const u of d.uso) porCategoria.set(u.categoria, (porCategoria.get(u.categoria) ?? 0) + Number(u.insumos))

  return {
    comprado,
    usoVentas,
    usoMermas,
    usoEstimado,
    usado,
    diferencia,
    relativa,
    veredicto,
    /** Insumos como % de las ventas sin IVA (cuánto de cada venta se va en ingredientes y packaging) */
    pesoEnVentas: d.ventas.netas_costeadas + d.ventas.netas_sin_costo > 0 ? usado / (d.ventas.netas_costeadas + d.ventas.netas_sin_costo) : null,
    proveedores: deInsumos.slice().sort((a, b) => b.monto - a.monto),
    porClasificar,
    montoPorClasificar: porClasificar.reduce((s, c) => s + Number(c.monto), 0),
    usoPorCategoria: [...porCategoria].map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto),
  }
}
