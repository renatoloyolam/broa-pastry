// Comparación de dos meses (normalmente este y el anterior), con los datos de panel().
// "A la misma fecha": si el mes va en el día 20, se comparan del 1 al 20 de ambos,
// para no comparar un mes a medias contra uno completo.
import { moverMes } from './finanzas'
import { ganancia, margen, ticketPromedio, variacion, type DatosPanel } from './panel'
import { diasEntre, sumarDias } from './periodos'

export type Modo = 'misma_fecha' | 'completos'

const finDeMes = (mes: string) => sumarDias(moverMes(mes, 1), -1)

/** Rango de cada mes a comparar. `hasta` es el último día con ventas (o ayer). */
export function rangos(mesA: string, mesB: string, modo: Modo, hasta: string) {
  const finA = finDeMes(mesA)
  const finB = finDeMes(mesB)
  if (modo === 'completos') return { a: { desde: mesA, hasta: finA }, b: { desde: mesB, hasta: finB }, dia: null }
  // El día de corte sale del mes más reciente (B) si está en curso; si no, mes completo
  const enCurso = hasta >= mesB && hasta < finB
  const dia = enCurso ? Number(hasta.slice(8, 10)) : null
  if (dia == null) return { a: { desde: mesA, hasta: finA }, b: { desde: mesB, hasta: finB }, dia: null }
  const corte = (mes: string, fin: string) => {
    const f = `${mes.slice(0, 8)}${String(dia).padStart(2, '0')}`
    return f > fin ? fin : f
  }
  return { a: { desde: mesA, hasta: corte(mesA, finA) }, b: { desde: mesB, hasta: corte(mesB, finB) }, dia }
}

export interface Indicador {
  clave: string
  etiqueta: string
  a: number | null
  b: number | null
  tipo: 'pesos' | 'numero' | 'porcentaje'
  /** true si que suba es malo (mermas) */
  invertir?: boolean
  cambio: number | null
}

export function indicadores(A: DatosPanel, B: DatosPanel, diasA: number, diasB: number, gananciaReal?: { a: number; b: number }) {
  const ra = A.resumen
  const rb = B.resumen
  const fila = (clave: string, etiqueta: string, a: number | null, b: number | null, tipo: Indicador['tipo'], invertir = false): Indicador => ({
    clave,
    etiqueta,
    a,
    b,
    tipo,
    invertir,
    // Para porcentajes, el cambio es en puntos (b − a); para el resto, variación relativa
    cambio: tipo === 'porcentaje' ? (a != null && b != null ? b - a : null) : variacion(b, a),
  })
  const gA = ganancia({ ...ra, mermas: ra.mermas })
  const gB = ganancia({ ...rb, mermas: rb.mermas })
  const lista: Indicador[] = [
    fila('ventas', 'Ventas', ra.ventas, rb.ventas, 'pesos'),
    fila('diario', 'Venta promedio por día', diasA ? ra.ventas / diasA : null, diasB ? rb.ventas / diasB : null, 'pesos'),
    fila('clientes', 'Clientes (boletas)', ra.transacciones, rb.transacciones, 'numero'),
    fila('ticket', 'Ticket promedio', ticketPromedio(ra), ticketPromedio(rb), 'pesos'),
    fila('unidades', 'Unidades vendidas', ra.unidades, rb.unidades, 'numero'),
  ]
  if (A.ver_costos && B.ver_costos) {
    lista.push(
      fila('ganancia', 'Ganancia (antes de gastos)', gA, gB, 'pesos'),
      fila('margen', 'Margen', margen({ ...ra, mermas: ra.mermas }), margen({ ...rb, mermas: rb.mermas }), 'porcentaje'),
      fila('mermas', 'Mermas', ra.mermas, rb.mermas, 'pesos', true),
    )
  }
  if (gananciaReal) lista.push(fila('real', 'Ganancia real (después de gastos)', gananciaReal.a, gananciaReal.b, 'pesos'))
  return lista
}

export interface CambioItem {
  clave: string
  nombre: string
  a: number
  b: number
  unidadesA: number
  unidadesB: number
  diferencia: number
  cambio: number | null
}

/** Cambios por producto o categoría, ordenados por diferencia en $. */
function cambios<T>(listaA: T[], listaB: T[], clave: (x: T) => string, nombre: (x: T) => string, ventas: (x: T) => number, unidades: (x: T) => number) {
  const mapa = new Map<string, CambioItem>()
  const tomar = (x: T, lado: 'a' | 'b') => {
    const k = clave(x)
    const item = mapa.get(k) ?? { clave: k, nombre: nombre(x), a: 0, b: 0, unidadesA: 0, unidadesB: 0, diferencia: 0, cambio: null }
    if (lado === 'a') {
      item.a += Number(ventas(x))
      item.unidadesA += Number(unidades(x))
    } else {
      item.b += Number(ventas(x))
      item.unidadesB += Number(unidades(x))
    }
    mapa.set(k, item)
  }
  listaA.forEach((x) => tomar(x, 'a'))
  listaB.forEach((x) => tomar(x, 'b'))
  return [...mapa.values()]
    .map((x) => ({ ...x, diferencia: x.b - x.a, cambio: variacion(x.b, x.a) }))
    .sort((x, y) => y.diferencia - x.diferencia)
}

export function compararProductos(A: DatosPanel, B: DatosPanel) {
  const todos = cambios(A.productos, B.productos, (p) => String(p.producto_id), (p) => p.nombre, (p) => p.ventas, (p) => p.unidades)
  return {
    suben: todos.filter((x) => x.a > 0 && x.diferencia > 0).slice(0, 5),
    bajan: todos.filter((x) => x.b > 0 && x.diferencia < 0).reverse().slice(0, 5),
    nuevos: todos.filter((x) => x.a === 0 && x.b > 0),
    dejaron: todos.filter((x) => x.b === 0 && x.a > 0).sort((x, y) => y.a - x.a),
  }
}

export function compararCategorias(A: DatosPanel, B: DatosPanel) {
  return cambios(A.categorias, B.categorias, (c) => c.categoria, (c) => c.categoria, (c) => c.ventas, (c) => c.unidades).sort(
    (x, y) => y.b - x.b,
  )
}

/** Días con ventas en un rango (según el panel). */
export const diasConVenta = (d: DatosPanel) => d.dias.filter((x) => x.transacciones > 0).length

export const largoRango = (r: { desde: string; hasta: string }) => diasEntre(r.desde, r.hasta) + 1
