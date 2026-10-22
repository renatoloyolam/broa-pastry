// Simulador de precios: qué pasa con la ganancia del mes si cambia el precio
// (o el costo) de un producto, o si se suben los precios de una categoría.
// Usa las ventas de los últimos días (mapa_productos) llevadas a un mes.
import { precioRedondo, type ProductoMapa } from './mapa'

export const DIAS_MES = 30

export interface Base {
  /** Precio promedio cobrado, con IVA (incluye descuentos) */
  precio: number
  /** Costo por unidad, sin IVA */
  costo: number
  /** Unidades al mes al ritmo actual */
  unidadesMes: number
  divisor: number
}

/** Lleva un producto del período a "un mes". */
export function baseDe(p: ProductoMapa, diasPeriodo: number, divisor: number): Base {
  return {
    precio: p.ventas / p.unidades,
    costo: (p.costo ?? 0) / p.unidades,
    unidadesMes: diasPeriodo > 0 ? (p.unidades * DIAS_MES) / diasPeriodo : p.unidades,
    divisor,
  }
}

function resultado(precio: number, costo: number, unidades: number, divisor: number) {
  const neto = precio / divisor
  const gananciaUnidad = neto - costo
  return {
    precio,
    costo,
    unidades,
    gananciaUnidad,
    margen: neto > 0 ? gananciaUnidad / neto : null,
    ventasMes: precio * unidades,
    gananciaMes: gananciaUnidad * unidades,
  }
}

export function simular(b: Base, nuevoPrecio: number, nuevoCosto: number, caidaVentas: number) {
  const hoy = resultado(b.precio, b.costo, b.unidadesMes, b.divisor)
  const nuevo = resultado(nuevoPrecio, nuevoCosto, b.unidadesMes * (1 - caidaVentas), b.divisor)
  // Cuántas unidades se necesitan con el precio nuevo para ganar lo mismo que hoy
  const unidadesEquilibrio = nuevo.gananciaUnidad > 0 ? hoy.gananciaMes / nuevo.gananciaUnidad : null
  const cambioVentasTolerable = unidadesEquilibrio != null && b.unidadesMes > 0 ? unidadesEquilibrio / b.unidadesMes - 1 : null
  return {
    hoy,
    nuevo,
    diferenciaMes: nuevo.gananciaMes - hoy.gananciaMes,
    cambioPrecio: b.precio > 0 ? nuevoPrecio / b.precio - 1 : null,
    /** Negativo: puede vender hasta ese % menos y ganar lo mismo. Positivo: necesita vender ese % más. */
    cambioVentasTolerable,
  }
}

/** Precio (con IVA, redondo) con el que el producto tendría ese margen. */
export function precioParaMargen(costo: number, margen: number, divisor: number) {
  return margen < 1 ? precioRedondo((costo / (1 - margen)) * divisor) : null
}

/** Sube (o baja) en un % todos los productos de una lista. */
export function simularGrupo(
  productos: ProductoMapa[],
  diasPeriodo: number,
  divisor: number,
  cambioPrecio: number,
  caidaVentas: number,
) {
  const filas = productos
    .filter((p) => p.completo && p.unidades > 0)
    .map((p) => {
      const b = baseDe(p, diasPeriodo, divisor)
      const nuevoPrecio = precioRedondo(b.precio * (1 + cambioPrecio))
      return { producto: p, base: b, nuevoPrecio, s: simular(b, nuevoPrecio, b.costo, caidaVentas) }
    })
    .sort((a, b) => b.s.hoy.gananciaMes - a.s.hoy.gananciaMes)
  const suma = (f: (x: (typeof filas)[number]) => number) => filas.reduce((t, x) => t + f(x), 0)
  return {
    filas,
    gananciaHoy: suma((x) => x.s.hoy.gananciaMes),
    gananciaNueva: suma((x) => x.s.nuevo.gananciaMes),
    ventasHoy: suma((x) => x.s.hoy.ventasMes),
    ventasNuevas: suma((x) => x.s.nuevo.ventasMes),
  }
}
