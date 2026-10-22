// Finanzas del mes: resultado real, meta (punto de equilibrio) y proyección.
// Los datos vienen de finanzas_mes(); aquí solo se hacen las cuentas.
import type { ResumenPanel } from './panel'
import { diasEntre, sumarDias } from './periodos'

export const CATEGORIAS_GASTO = [
  'Arriendo y local',
  'Sueldos y honorarios',
  'Servicios básicos',
  'Contabilidad y trámites',
  'Marketing',
  'Mantención y equipos',
  'Créditos y seguros',
  'Otros',
] as const
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

export interface Gasto {
  id: number
  nombre: string
  categoria: CategoriaGasto
  monto: number
  dia_pago: number | null
  se_repite: boolean
  pagado: boolean
  pagado_en: string | null
  nota: string | null
}

export interface DatosFinanzas {
  mes: string
  hasta: string
  hoy: string
  divisor: number
  resumen: ResumenPanel
  ultimo_dia: string | null
  dias_con_venta: number
  dias_cerrado: number[]
  comisiones: number
  por_medio: { medio: string; monto: number; comision: number }[]
  comision_debito: number
  comision_credito: number
  gastos: Gasto[]
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-10-01" → "octubre 2026" */
export function nombreMes(iso: string) {
  return `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** Primer día del mes `n` meses antes/después. */
export function moverMes(iso: string, n: number) {
  const f = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + n, 1))
  return f.toISOString().slice(0, 10)
}

/** Días abiertos entre dos fechas (ambas incluidas), sin los días que Broa cierra (1 = lunes … 7 = domingo). */
export function diasAbiertos(desde: string, hasta: string, cerrado: number[]) {
  let n = 0
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const dia = new Date(`${d}T12:00:00Z`).getUTCDay() || 7
    if (!cerrado.includes(dia)) n++
  }
  return n
}

export function calcularFinanzas(d: DatosFinanzas) {
  const r = d.resumen
  const ventas = r.ventas
  const ventasNetas = ventas / d.divisor
  const iva = ventas - ventasNetas
  const costoCargado = r.costo ?? 0
  // Lo vendido sin costo cargado se estima con la proporción de costo del resto del mes.
  const proporcionCosto = r.ventas_netas_costeadas ? costoCargado / r.ventas_netas_costeadas : null
  const ventasSinCosto = r.ventas_sin_costo ?? 0
  const costoEstimado = proporcionCosto != null ? (ventasSinCosto / d.divisor) * proporcionCosto : 0
  const mermas = r.mermas ?? 0
  const comisiones = d.comisiones
  // Lo que queda de las ventas para pagar los gastos fijos
  const contribucion = ventasNetas - costoCargado - costoEstimado - mermas - comisiones
  const tasaContribucion = ventasNetas > 0 ? contribucion / ventasNetas : null

  const gastos = d.gastos.reduce((s, g) => s + g.monto, 0)
  const pagado = d.gastos.filter((g) => g.pagado).reduce((s, g) => s + g.monto, 0)
  const ganancia = contribucion - gastos

  // Meta: ventas (con IVA, como en la caja) que cubren todos los gastos del mes.
  const meta = gastos > 0 && tasaContribucion != null && tasaContribucion > 0 ? (gastos / tasaContribucion) * d.divisor : null
  const avance = meta ? ventas / meta : null
  const faltante = meta != null ? Math.max(0, meta - ventas) : null

  // Días: se cuenta hasta el último día con ventas cargadas.
  const cerrado = d.dias_cerrado ?? []
  const ultimo = d.ultimo_dia
  const diasMes = diasEntre(d.mes, d.hasta) + 1
  const diasAbiertosMes = diasAbiertos(d.mes, d.hasta, cerrado)
  const diasTranscurridos = ultimo ? diasAbiertos(d.mes, ultimo, cerrado) : 0
  const desdeRestante = ultimo ? sumarDias(ultimo, 1) : d.mes
  const mesTerminado = d.hoy > d.hasta
  const diasRestantes = mesTerminado ? 0 : diasAbiertos(desdeRestante, d.hasta, cerrado)
  const porDia = faltante != null && diasRestantes > 0 ? faltante / diasRestantes : null

  // Proyección al ritmo actual (solo si el mes sigue abierto y ya hay ventas)
  const ritmo = diasTranscurridos > 0 ? ventas / diasTranscurridos : null
  const ventasProyectadas = ritmo != null ? ventas + ritmo * diasRestantes : null
  const gananciaProyectada =
    ventasProyectadas != null && tasaContribucion != null ? (ventasProyectadas / d.divisor) * tasaContribucion - gastos : null

  return {
    ventas,
    ventasNetas,
    iva,
    costoCargado,
    costoEstimado,
    ventasSinCosto,
    mermas,
    comisiones,
    contribucion,
    tasaContribucion,
    gastos,
    pagado,
    pendiente: gastos - pagado,
    ganancia,
    margenReal: ventasNetas > 0 ? ganancia / ventasNetas : null,
    meta,
    avance,
    faltante,
    porDia,
    diasMes,
    diasAbiertosMes,
    diasTranscurridos,
    diasRestantes,
    mesTerminado,
    ritmo,
    ventasProyectadas,
    gananciaProyectada,
  }
}

export type ResultadoFinanzas = ReturnType<typeof calcularFinanzas>

/** Gastos sin pagar con día de pago, en orden; marca los vencidos (solo en el mes en curso o pasados). */
export function proximosPagos(gastos: Gasto[], mes: string, hoy: string) {
  return gastos
    .filter((g) => !g.pagado && g.dia_pago != null)
    .map((g) => {
      const ultimoDia = diasEntre(mes, moverMes(mes, 1))
      const fecha = `${mes.slice(0, 8)}${String(Math.min(g.dia_pago!, ultimoDia)).padStart(2, '0')}`
      return { ...g, fecha, dias: diasEntre(hoy, fecha) }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Total de gastos por categoría, de mayor a menor. */
export function gastosPorCategoria(gastos: Gasto[]) {
  const mapa = new Map<string, number>()
  for (const g of gastos) mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + g.monto)
  return [...mapa].map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto)
}
