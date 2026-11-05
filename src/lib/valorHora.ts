// Valor hora de mano de obra y G.I.F., igual que en la base (private.valor_hora_calculado).
// Sirve para mostrar el cálculo en vivo mientras se editan trabajadores y gastos.

export interface Trabajador {
  id: number
  nombre: string
  area: string | null
  horas_dia: number
  dias_mes: number
  costo_mensual: number
  incluir: boolean
}

export interface GastoGif {
  id: number
  concepto: string
  tipo: 'fijo' | 'variable'
  monto_mensual: number
}

const redondear = (v: number) => Math.round(v * 100) / 100

export function sueldoPorHora(t: Pick<Trabajador, 'horas_dia' | 'dias_mes' | 'costo_mensual'>) {
  const horas = Number(t.horas_dia) * Number(t.dias_mes)
  return horas > 0 ? Number(t.costo_mensual) / horas : 0
}

export interface CalculoValorHora {
  incluidos: number
  /** Suma del sueldo por hora de los incluidos (lo que la planilla llama "costo por hora") */
  sueldosPorHora: number
  manoObra: number | null
  totalGastos: number
  /** Gastos del mes por cada hora abierta, antes de repartir entre trabajadores */
  gastosPorHora: number
  gif: number | null
}

export function calcularValorHora(trabajadores: Trabajador[], gastos: GastoGif[], diasMes: number, horasDia: number): CalculoValorHora {
  const incluidos = trabajadores.filter((t) => t.incluir)
  const sueldosPorHora = incluidos.reduce((s, t) => s + sueldoPorHora(t), 0)
  const totalGastos = gastos.reduce((s, g) => s + Number(g.monto_mensual), 0)
  const gastosPorHora = diasMes > 0 && horasDia > 0 ? totalGastos / (diasMes * horasDia) : 0
  const n = incluidos.length
  return {
    incluidos: n,
    sueldosPorHora,
    manoObra: n ? redondear(sueldosPorHora / n) : null,
    totalGastos,
    gastosPorHora,
    gif: n ? redondear(gastosPorHora / n) : null,
  }
}
