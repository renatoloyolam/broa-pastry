import { describe, expect, it } from 'vitest'
import { calcularValorHora, sueldoPorHora, type GastoGif, type Trabajador } from './valorHora'

const t = (id: number, costo: number, horas: number, dias: number, incluir = true): Trabajador => ({
  id, nombre: `T${id}`, area: null, horas_dia: horas, dias_mes: dias, costo_mensual: costo, incluir,
})
const g = (monto: number, tipo: GastoGif['tipo'] = 'fijo'): GastoGif => ({ id: monto, concepto: 'x', tipo, monto_mensual: monto })

describe('valor hora calculado', () => {
  it('sueldo por hora = costo del mes ÷ horas del mes', () => {
    expect(sueldoPorHora(t(1, 670000, 8, 22))).toBeCloseTo(3806.82, 2)
  })

  it('mano de obra es el promedio y el G.I.F. se reparte entre los incluidos', () => {
    const r = calcularValorHora([t(1, 704000, 8, 22), t(2, 480000, 8, 20)], [g(300000), g(116000, 'variable')], 26, 8)
    expect(r).toMatchObject({ incluidos: 2, sueldosPorHora: 7000, manoObra: 3500, totalGastos: 416000, gastosPorHora: 2000, gif: 1000 })
  })

  it('los excluidos no cuentan ni en el promedio ni en el divisor', () => {
    const r = calcularValorHora([t(1, 704000, 8, 22), t(2, 480000, 8, 20, false)], [g(416000)], 26, 8)
    expect(r).toMatchObject({ incluidos: 1, manoObra: 4000, gif: 2000 })
  })

  it('igual que la planilla cuando hay 13 personas', () => {
    // 13 personas a $4.000/h: la planilla suma $52.000 y divide por 13
    const equipo = Array.from({ length: 13 }, (_, i) => t(i, 704000, 8, 22))
    const r = calcularValorHora(equipo, [g(8620863)], 26, 8)
    expect(r.sueldosPorHora).toBeCloseTo(52000, 6)
    expect(r.manoObra).toBe(4000)
    expect(r.gif).toBeCloseTo(8620863 / 26 / 8 / 13, 2)
  })

  it('sin trabajadores no hay valor', () => {
    expect(calcularValorHora([], [g(1000)], 26, 8)).toMatchObject({ manoObra: null, gif: null })
  })
})
