import { describe, expect, it } from 'vitest'
import { agruparMeses, diasSinDatos, type DiaVenta } from './ventas'

const dia = (fecha: string, ventas: number): DiaVenta => ({ fecha, ventas, transacciones: 10, abonos: 0, unidades: 20 })

describe('ventas por mes', () => {
  const dias = [
    dia('2026-09-01', 1000), dia('2026-09-02', 1000), dia('2026-09-30', 1000),
    dia('2026-10-01', 1500), dia('2026-10-02', 1500), dia('2026-10-04', 1500),
  ]
  const meses = agruparMeses(dias)

  it('agrupa del más reciente al más antiguo, con totales', () => {
    expect(meses.map((m) => m.mes)).toEqual(['2026-10', '2026-09'])
    expect(meses[0]).toMatchObject({ ventas: 4500, dias: 3, transacciones: 30, unidades: 60, primerDia: '2026-10-01', ultimoDia: '2026-10-04' })
  })

  it('compara el promedio diario (parejo aunque el mes vaya a medias)', () => {
    expect(meses[0].promedioDia).toBe(1500)
    expect(meses[0].cambioPromedio).toBeCloseTo(0.5)
    expect(meses[1].cambioPromedio).toBeNull()
  })

  it('marca el mes en curso y los días sin datos', () => {
    expect(meses[0].enCurso).toBe(true)
    expect(meses[1].enCurso).toBe(false)
    expect(diasSinDatos(meses[0])).toBe(1) // falta el 3 de octubre
  })
})
