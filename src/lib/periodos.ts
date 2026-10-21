// Períodos del panel y el período anterior con el que se comparan.
// Todas las fechas son días de calendario "AAAA-MM-DD" (hora de Santiago).

export type TipoPeriodo = 'dia' | 'semana' | 'mes' | 'rango'

export interface Periodo {
  tipo: TipoPeriodo
  desde: string
  hasta: string
  desdeAnt: string
  hastaAnt: string
  etiqueta: string
  etiquetaAnt: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function aFecha(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}
function aIso(f: Date) {
  return f.toISOString().slice(0, 10)
}
export function sumarDias(iso: string, n: number) {
  const f = aFecha(iso)
  f.setUTCDate(f.getUTCDate() + n)
  return aIso(f)
}
function sumarMeses(iso: string, n: number) {
  const f = aFecha(iso)
  return aIso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + n, 1)))
}
function finDeMes(iso: string) {
  const f = aFecha(iso)
  return aIso(new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)))
}
export function diasEntre(desde: string, hasta: string) {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86400000)
}
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const larga = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const min = (a: string, b: string) => (a < b ? a : b)

/**
 * Calcula el período que contiene `ancla`.
 * Si el período no ha terminado (semana o mes en curso), se corta en `hoy` y
 * se compara contra el mismo tramo del período anterior, para comparar parejo.
 */
export function calcularPeriodo(tipo: Exclude<TipoPeriodo, 'rango'>, ancla: string, hoy: string): Periodo {
  if (tipo === 'dia') {
    const ant = sumarDias(ancla, -1)
    const etiqueta = ancla === hoy ? `Hoy, ${larga(ancla)}` : ancla === sumarDias(hoy, -1) ? `Ayer, ${larga(ancla)}` : larga(ancla)
    return { tipo, desde: ancla, hasta: ancla, desdeAnt: ant, hastaAnt: ant, etiqueta, etiquetaAnt: 'el día anterior' }
  }
  if (tipo === 'semana') {
    const dow = (aFecha(ancla).getUTCDay() + 6) % 7 // lunes = 0
    const desde = sumarDias(ancla, -dow)
    const hasta = min(sumarDias(desde, 6), hoy < desde ? sumarDias(desde, 6) : hoy)
    const largo = diasEntre(desde, hasta)
    const desdeAnt = sumarDias(desde, -7)
    return {
      tipo,
      desde,
      hasta,
      desdeAnt,
      hastaAnt: sumarDias(desdeAnt, largo),
      etiqueta: `Semana del ${corta(desde)} al ${corta(sumarDias(desde, 6))}`,
      etiquetaAnt: 'la semana anterior',
    }
  }
  const desde = ancla.slice(0, 8) + '01'
  const fin = finDeMes(desde)
  const hasta = hoy >= desde && hoy < fin ? hoy : fin
  const desdeAnt = sumarMeses(desde, -1)
  const hastaAnt = min(sumarDias(desdeAnt, diasEntre(desde, hasta)), finDeMes(desdeAnt))
  const mes = Number(desde.slice(5, 7)) - 1
  return {
    tipo,
    desde,
    hasta,
    desdeAnt,
    hastaAnt,
    etiqueta: `${MESES[mes][0].toUpperCase()}${MESES[mes].slice(1)} ${desde.slice(0, 4)}`,
    etiquetaAnt: hasta < fin ? `los mismos días de ${MESES[(mes + 11) % 12]}` : MESES[(mes + 11) % 12],
  }
}

/** Rango libre: se compara contra el mismo número de días justo antes. */
export function calcularRango(desde: string, hasta: string): Periodo {
  if (hasta < desde) [desde, hasta] = [hasta, desde]
  const largo = diasEntre(desde, hasta)
  const hastaAnt = sumarDias(desde, -1)
  return {
    tipo: 'rango',
    desde,
    hasta,
    desdeAnt: sumarDias(hastaAnt, -largo),
    hastaAnt,
    etiqueta: desde === hasta ? larga(desde) : `${larga(desde)} al ${larga(hasta)}`,
    etiquetaAnt: `los ${largo + 1} días anteriores`,
  }
}

/** Mueve el período hacia atrás (-1) o adelante (+1). */
export function moverAncla(tipo: Exclude<TipoPeriodo, 'rango'>, ancla: string, paso: -1 | 1) {
  if (tipo === 'dia') return sumarDias(ancla, paso)
  if (tipo === 'semana') return sumarDias(ancla, 7 * paso)
  return sumarMeses(ancla, paso)
}
