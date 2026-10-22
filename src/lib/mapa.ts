// Mapa de productos (ingeniería de menú): cada producto se compara con los de
// su misma categoría en dos cosas:
//   * popularidad: unidades vendidas vs. el 70% de lo "esperable" (1/N del total)
//   * margen: % de ganancia sobre el precio sin IVA vs. el margen del grupo
//     (en % y no en pesos, para no comparar una media luna con una caja de 6)
// Si una categoría tiene menos de 3 productos comparables, se compara con todos.

export interface ProductoMapa {
  id: number
  nombre: string
  categoria: string
  unidades: number
  ventas: number
  ventas_netas: number
  costo: number | null
  completo: boolean
}

export interface DatosMapa {
  divisor: number
  productos: ProductoMapa[]
  sin_ventas: { id: number; nombre: string; categoria: string }[]
  ultimo_dia: string | null
}

export type Cuadrante = 'estrella' | 'popular' | 'rentable' | 'debil'

export const CUADRANTES: Record<Cuadrante, { icono: string; titulo: string; resumen: string; accion: string }> = {
  estrella: {
    icono: '⭐',
    titulo: 'Estrellas',
    resumen: 'Se venden mucho y dejan buen margen',
    accion: 'Cuídalos: mantén la calidad, que siempre haya y que se vean. No les bajes el precio.',
  },
  popular: {
    icono: '🐴',
    titulo: 'Populares de bajo margen',
    resumen: 'Se venden mucho pero dejan poco',
    accion: 'Súbeles el precio de a poco o baja su costo (porción, receta o proveedor). Se venden igual.',
  },
  rentable: {
    icono: '🧩',
    titulo: 'Rentables poco vendidos',
    resumen: 'Dejan buen margen pero se venden poco',
    accion: 'Promociónalos: mejor lugar en la vitrina, que el equipo los recomiende, combos o degustación.',
  },
  debil: {
    icono: '🐶',
    titulo: 'Débiles',
    resumen: 'Se venden poco y dejan poco',
    accion: 'Evalúa sacarlos, cambiar la receta o reemplazarlos por algo nuevo.',
  },
}

export const MINIMO_GRUPO = 3
const FACTOR_POPULARIDAD = 0.7

export interface Clasificado extends ProductoMapa {
  cuadrante: Cuadrante
  grupo: string
  precioPromedio: number
  gananciaUnidad: number
  ganancia: number
  margen: number | null
  /** Unidades vendidas respecto del umbral de popularidad del grupo (1 = justo en el límite) */
  popularidad: number
  /** Margen del producto respecto del margen del grupo (1 = igual al promedio) */
  rentabilidad: number
  /** Margen promedio del grupo (fracción) */
  margenGrupo: number
  /** Precio (con IVA) que lo llevaría al margen del grupo; si la subida es muy grande, un primer paso de +15% */
  precioSugerido: number | null
  esPaso: boolean
  /** Precio (con IVA) desde el que deja de perder plata, si hoy se vende bajo el costo */
  precioMinimo: number | null
}

function metricas(p: ProductoMapa, divisor: number) {
  const ganancia = p.ventas_netas - (p.costo ?? 0)
  return {
    precioPromedio: p.ventas / p.unidades,
    costoUnidad: (p.costo ?? 0) / p.unidades,
    gananciaUnidad: ganancia / p.unidades,
    ganancia,
    margen: p.ventas_netas > 0 ? ganancia / p.ventas_netas : null,
    divisor,
  }
}

/** Redondea hacia arriba a un precio redondo: 559 → 560 · 1.309 → 1.350 · 13.171 → 13.200 */
export function precioRedondo(v: number) {
  const paso = v < 1000 ? 10 : v < 5000 ? 50 : 100
  return Math.ceil(v / paso) * paso
}
const aCentena = precioRedondo

export function clasificar(d: DatosMapa) {
  const comparables = d.productos.filter((p) => p.completo && p.unidades > 0)
  const sinCosto = d.productos.filter((p) => !p.completo)

  // Grupos: cada categoría con al menos MINIMO_GRUPO productos; el resto se compara con todos
  const porCategoria = new Map<string, ProductoMapa[]>()
  for (const p of comparables) porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), p])
  const grupoDe = (p: ProductoMapa) => ((porCategoria.get(p.categoria)?.length ?? 0) >= MINIMO_GRUPO ? p.categoria : 'Todos')

  const umbrales = new Map<string, { popularidad: number; margen: number }>()
  const calcularUmbral = (lista: ProductoMapa[]) => {
    const unidades = lista.reduce((s, p) => s + p.unidades, 0)
    const ganancia = lista.reduce((s, p) => s + metricas(p, d.divisor).ganancia, 0)
    const netas = lista.reduce((s, p) => s + p.ventas_netas, 0)
    return { popularidad: (unidades / lista.length) * FACTOR_POPULARIDAD, margen: netas ? ganancia / netas : 0 }
  }
  for (const [cat, lista] of porCategoria) if (lista.length >= MINIMO_GRUPO) umbrales.set(cat, calcularUmbral(lista))
  if (comparables.length > 0) umbrales.set('Todos', calcularUmbral(comparables))

  const productos: Clasificado[] = comparables.map((p) => {
    const m = metricas(p, d.divisor)
    const grupo = grupoDe(p)
    const u = umbrales.get(grupo)!
    const popular = p.unidades >= u.popularidad
    const rentable = (m.margen ?? 0) >= u.margen
    const cuadrante: Cuadrante = popular ? (rentable ? 'estrella' : 'popular') : rentable ? 'rentable' : 'debil'
    // Precio con el que tendría el margen del grupo; si es una subida de más de 40%, un primer paso de +15%
    const objetivo = u.margen < 1 ? aCentena((m.costoUnidad / (1 - u.margen)) * d.divisor) : 0
    const subida = objetivo / m.precioPromedio - 1
    const esPaso = !rentable && subida > 0.4
    return {
      ...p,
      cuadrante,
      grupo,
      precioPromedio: m.precioPromedio,
      gananciaUnidad: m.gananciaUnidad,
      ganancia: m.ganancia,
      margen: m.margen,
      popularidad: u.popularidad > 0 ? p.unidades / u.popularidad : 0,
      rentabilidad: u.margen > 0 ? (m.margen ?? 0) / u.margen : 0,
      margenGrupo: u.margen,
      precioSugerido: rentable || subida <= 0.01 ? null : esPaso ? aCentena(m.precioPromedio * 1.15) : objetivo,
      esPaso,
      precioMinimo: m.ganancia < 0 ? aCentena(m.costoUnidad * d.divisor) : null,
    }
  })

  const resumen = (Object.keys(CUADRANTES) as Cuadrante[]).map((c) => {
    const lista = productos.filter((p) => p.cuadrante === c)
    return {
      cuadrante: c,
      cantidad: lista.length,
      ganancia: lista.reduce((s, p) => s + p.ganancia, 0),
      ventas: lista.reduce((s, p) => s + p.ventas, 0),
    }
  })
  const gananciaTotal = productos.reduce((s, p) => s + p.ganancia, 0)

  const perdidas = productos.filter((p) => p.ganancia < 0).sort((a, b) => a.ganancia - b.ganancia)

  return { productos, resumen, gananciaTotal, perdidas, sinCosto, sinVentas: d.sin_ventas, grupos: [...umbrales.keys()] }
}

/** Orden dentro de cada cuadrante: lo más importante primero. */
export function ordenar(lista: Clasificado[], c: Cuadrante) {
  const copia = lista.slice()
  if (c === 'estrella') return copia.sort((a, b) => b.ganancia - a.ganancia)
  if (c === 'popular') return copia.sort((a, b) => b.unidades - a.unidades)
  if (c === 'rentable') return copia.sort((a, b) => (b.margen ?? 0) - (a.margen ?? 0))
  return copia.sort((a, b) => a.ganancia - b.ganancia)
}
