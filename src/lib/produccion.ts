// Sugerencia de producción para un día, a partir de lo vendido y botado en
// los mismos días de la semana de las últimas semanas (produccion_sugerida()).
//
// Regla (simple y explicable):
//   * Si casi no se bota (≤ 10% de lo hecho): hacer lo que se vende en un día
//     bueno (percentil 75: alcanza 3 de cada 4 veces).
//   * Si se bota más de 10%: hacer lo que se vende en un día normal (promedio).
import { fechaDia, nombreDia } from './formato'

export interface ProductoProduccion {
  id: number
  nombre: string
  categoria: string
  vendidos: number[]
  am: number[]
  mermas: number[]
  costo: number | null
}

export interface DatosProduccion {
  fecha: string
  dias: string[]
  dias_cerrado: number[]
  ver_costos: boolean
  productos: ProductoProduccion[]
}

export const TOPE_MERMA = 0.1

const suma = (xs: number[]) => xs.reduce((s, x) => s + Number(x), 0)
const promedio = (xs: number[]) => (xs.length ? suma(xs) / xs.length : 0)

/** Percentil con interpolación lineal (p entre 0 y 1). */
export function percentil(xs: number[], p: number) {
  if (xs.length === 0) return 0
  const o = xs.map(Number).sort((a, b) => a - b)
  const pos = (o.length - 1) * p
  const i = Math.floor(pos)
  return o[i] + (o[Math.min(i + 1, o.length - 1)] - o[i]) * (pos - i)
}

export function sugerir(p: ProductoProduccion) {
  const n = p.vendidos.length
  const vendidoProm = promedio(p.vendidos)
  const hechos = p.vendidos.map((v, i) => Number(v) + Number(p.mermas[i] ?? 0))
  const hechoProm = promedio(hechos)
  const mermaProm = promedio(p.mermas)
  const tasaMerma = hechoProm > 0 ? mermaProm / hechoProm : 0
  const hayMermas = p.mermas.some((m) => Number(m) > 0)
  const seBotaMucho = tasaMerma > TOPE_MERMA

  const base = seBotaMucho ? vendidoProm : percentil(p.vendidos, 0.75)
  const sugerido = Math.ceil(base - 1e-9)
  const totalVendido = suma(p.vendidos)
  const parteAm = totalVendido > 0 ? suma(p.am) / totalVendido : 0.5
  const am = Math.round(sugerido * parteAm)
  // Lo que hoy se hace de más (solo se sabe si se registran mermas)
  const deMas = hayMermas ? Math.max(0, hechoProm - sugerido) : 0
  const ahorroDia = p.costo != null ? Math.min(deMas, mermaProm) * Number(p.costo) : 0
  const diasConVenta = p.vendidos.filter((v) => Number(v) > 0).length

  return {
    ...p,
    sugerido,
    am,
    pm: sugerido - am,
    min: Math.min(...p.vendidos.map(Number)),
    max: Math.max(...p.vendidos.map(Number)),
    vendidoProm,
    hechoProm,
    mermaProm,
    tasaMerma,
    seBotaMucho,
    deMas,
    ahorroDia,
    /** Se vende menos de la mitad de los días comparables */
    ocasional: n > 0 && diasConVenta < n / 2,
  }
}

export type Sugerencia = ReturnType<typeof sugerir>

export function calcularProduccion(d: DatosProduccion) {
  const lista = d.productos.map(sugerir)
  const regulares = lista.filter((p) => !p.ocasional && p.sugerido > 0)
  const ocasionales = lista.filter((p) => p.ocasional || p.sugerido === 0)
  const porCategoria = new Map<string, Sugerencia[]>()
  for (const p of regulares) porCategoria.set(p.categoria, [...(porCategoria.get(p.categoria) ?? []), p])
  const diaSemana = new Date(`${d.fecha}T12:00:00Z`).getUTCDay() || 7
  return {
    regulares,
    ocasionales,
    porCategoria: [...porCategoria],
    totalUnidades: regulares.reduce((s, p) => s + p.sugerido, 0),
    ahorroDia: regulares.reduce((s, p) => s + p.ahorroDia, 0),
    hayMermas: d.productos.some((p) => p.mermas.some((m) => Number(m) > 0)),
    cerrado: (d.dias_cerrado ?? []).includes(diaSemana),
    pocosDatos: d.dias.length < 3,
  }
}

/** Lista para mandar por WhatsApp a la cocina. */
export function textoParaCompartir(d: DatosProduccion, r: ReturnType<typeof calcularProduccion>) {
  const lineas = [`Producción sugerida · ${nombreDia(d.fecha)} ${fechaDia(d.fecha)}`]
  for (const [categoria, lista] of r.porCategoria) {
    lineas.push('', `*${categoria}*`)
    for (const p of lista) lineas.push(`• ${p.nombre}: ${p.sugerido} (AM ${p.am} · PM ${p.pm})`)
  }
  return lineas.join('\n')
}
