// Ventas agrupadas por mes (desde v_ventas_dia) y tipos del desglose (detalle_ventas()).
import { diasEntre } from './periodos'

export interface DiaVenta {
  fecha: string
  transacciones: number
  ventas: number
  abonos: number
  unidades: number
}

export interface MesVenta {
  mes: string // AAAA-MM
  ventas: number
  abonos: number
  transacciones: number
  unidades: number
  dias: number
  primerDia: string
  ultimoDia: string
  promedioDia: number
  /** Cambio del promedio diario contra el mes anterior (parejo aunque el mes vaya a medias) */
  cambioPromedio: number | null
  enCurso: boolean
}

const finDeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

/** Agrupa los días por mes, del más reciente al más antiguo. */
export function agruparMeses(dias: DiaVenta[]): MesVenta[] {
  const mapa = new Map<string, DiaVenta[]>()
  for (const d of dias) {
    const k = d.fecha.slice(0, 7)
    mapa.set(k, [...(mapa.get(k) ?? []), d])
  }
  const ultimoGlobal = dias.reduce((m, d) => (d.fecha > m ? d.fecha : m), '')
  const meses = [...mapa]
    .map(([mes, lista]) => {
      const suma = (f: (d: DiaVenta) => number) => lista.reduce((s, d) => s + Number(f(d)), 0)
      const fechas = lista.map((d) => d.fecha).sort()
      const ventas = suma((d) => d.ventas)
      const ultimoDia = fechas[fechas.length - 1]
      return {
        mes,
        ventas,
        abonos: suma((d) => d.abonos),
        transacciones: suma((d) => d.transacciones),
        unidades: suma((d) => d.unidades),
        dias: lista.length,
        primerDia: fechas[0],
        ultimoDia,
        promedioDia: lista.length ? ventas / lista.length : 0,
        cambioPromedio: null as number | null,
        // El mes de los datos más recientes, si aún no llega a su último día
        enCurso: ultimoDia === ultimoGlobal && ultimoDia < finDeMes(mes),
      }
    })
    .sort((a, b) => b.mes.localeCompare(a.mes))
  meses.forEach((m, i) => {
    const anterior = meses[i + 1]
    if (anterior && anterior.promedioDia > 0) m.cambioPromedio = m.promedioDia / anterior.promedioDia - 1
  })
  return meses
}

/** Días del mes que hay entre el primero y el último con ventas (para avisar si falta importar alguno). */
export function diasSinDatos(m: MesVenta) {
  return diasEntre(m.primerDia, m.ultimoDia) + 1 - m.dias
}

export interface DetalleVentas {
  desde: string
  hasta: string
  resumen: { ventas: number; abonos: number; transacciones: number; unidades: number; descuentos: number; dias: number }
  por_turno: { turno: 'AM' | 'PM'; ventas: number; transacciones: number }[]
  por_medio: { medio: string; ventas: number; transacciones: number }[]
  por_vendedor: { vendedor: string; ventas: number; transacciones: number }[]
  por_categoria: { categoria: string; ventas: number; unidades: number }[]
  productos: { id: number; nombre: string; categoria: string; unidades: number; ventas: number; opciones: { nombre: string; unidades: number }[] }[]
  boletas:
    | {
        numero: number
        hora: string
        turno: string
        vendedor: string
        medio: string
        total: number
        descuento: number
        con_boleta: boolean | null
        items: { texto: string; opciones: string | null; monto: number }[]
      }[]
    | null
}
