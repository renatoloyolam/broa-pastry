// Cálculo de costos de recetas en el teléfono, para mostrar el resultado
// mientras se edita. La base de datos hace el mismo cálculo y es la que
// manda (private.costo_receta_unitario); las pruebas cuidan que coincidan.

export type Unidad = 'g' | 'kg' | 'ml' | 'l' | 'un'

export const UNIDADES: { valor: Unidad; texto: string }[] = [
  { valor: 'g', texto: 'g' },
  { valor: 'kg', texto: 'kg' },
  { valor: 'ml', texto: 'ml' },
  { valor: 'l', texto: 'litros' },
  { valor: 'un', texto: 'unidades' },
]

const FACTOR: Record<Unidad, number> = { g: 1, kg: 1000, ml: 1, l: 1000, un: 1 }
const DIMENSION: Record<Unidad, string> = { g: 'masa', kg: 'masa', ml: 'volumen', l: 'volumen', un: 'unidad' }

export function compatibles(a: Unidad, b: Unidad) {
  return DIMENSION[a] === DIMENSION[b]
}

export interface Ingrediente {
  id: number
  nombre: string
  cantidad_compra: number
  unidad_compra: Unidad
  precio_compra_neto: number
}

/** Precio por unidad base (por g, ml o unidad). */
export function precioPorUnidadBase(i: Pick<Ingrediente, 'cantidad_compra' | 'unidad_compra' | 'precio_compra_neto'>) {
  return i.precio_compra_neto / (i.cantidad_compra * FACTOR[i.unidad_compra])
}

/** Precio por kg, litro o unidad (para mostrar). */
export function precioPorUnidadMayor(i: Pick<Ingrediente, 'cantidad_compra' | 'unidad_compra' | 'precio_compra_neto'>) {
  const base = precioPorUnidadBase(i)
  return DIMENSION[i.unidad_compra] === 'unidad' ? base : base * 1000
}

export function nombreUnidadMayor(u: Unidad) {
  return { masa: 'kg', volumen: 'litro', unidad: 'unidad' }[DIMENSION[u]]
}

export interface ItemReceta {
  ingrediente_id?: number | null
  subreceta_id?: number | null
  cantidad: number
  unidad: Unidad
}

export interface LineaCosteada {
  costo: number | null
  error?: string
}

/**
 * Costo de una línea de receta.
 * @param costoSubUnitario costo de 1 unidad de rendimiento de la subreceta
 */
export function costoLinea(
  item: ItemReceta,
  ingredientes: Map<number, Ingrediente>,
  subrecetas: Map<number, { unidad_rendimiento: Unidad; costo_unitario: number | null }>,
): LineaCosteada {
  if (!(item.cantidad > 0)) return { costo: null, error: 'Falta la cantidad' }
  if (item.ingrediente_id) {
    const ing = ingredientes.get(item.ingrediente_id)
    if (!ing) return { costo: null, error: 'Elige un ingrediente' }
    if (!compatibles(item.unidad, ing.unidad_compra)) {
      return { costo: null, error: `${ing.nombre} se compra en ${ing.unidad_compra}; usa una unidad compatible` }
    }
    return { costo: item.cantidad * FACTOR[item.unidad] * precioPorUnidadBase(ing) }
  }
  if (item.subreceta_id) {
    const sub = subrecetas.get(item.subreceta_id)
    if (!sub) return { costo: null, error: 'Elige una receta base' }
    if (!compatibles(item.unidad, sub.unidad_rendimiento)) {
      return { costo: null, error: `Esa receta rinde en ${sub.unidad_rendimiento}; usa una unidad compatible` }
    }
    if (sub.costo_unitario == null) return { costo: null, error: 'Esa receta base está incompleta' }
    return { costo: ((item.cantidad * FACTOR[item.unidad]) / FACTOR[sub.unidad_rendimiento]) * sub.costo_unitario }
  }
  return { costo: null, error: 'Elige un ingrediente o receta' }
}

export function costoReceta(
  items: ItemReceta[],
  adicionales: { monto_neto: number }[],
  rendimiento: number,
  ingredientes: Map<number, Ingrediente>,
  subrecetas: Map<number, { unidad_rendimiento: Unidad; costo_unitario: number | null }>,
) {
  const lineas = items.map((i) => costoLinea(i, ingredientes, subrecetas))
  const completo = lineas.every((l) => l.costo != null) && rendimiento > 0
  const total =
    lineas.reduce((s, l) => s + (l.costo ?? 0), 0) + adicionales.reduce((s, a) => s + (Number(a.monto_neto) || 0), 0)
  return { lineas, total: completo ? total : null, unitario: completo ? total / rendimiento : null }
}

/** Margen de referencia: precio de venta con IVA vs costo neto. */
export function margenReferencia(precioConIva: number | null | undefined, costoNeto: number | null | undefined, tasaIva = 0.19) {
  if (!precioConIva || costoNeto == null) return null
  const neto = precioConIva / (1 + tasaIva)
  return (neto - costoNeto) / neto
}
