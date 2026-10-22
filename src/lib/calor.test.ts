import { describe, expect, it } from 'vitest'
import { calcularCalor, rangoHora, type DatosCalor } from './calor'

const celda = (dia: number, hora: number, ventas: number) => ({ dia, hora, ventas, transacciones: ventas / 1000, unidades: ventas / 500 })

// 2 sábados y 1 lunes en el período
const datos: DatosCalor = {
  desde: '2026-10-01',
  hasta: '2026-10-31',
  dias: [
    { dia: 1, cantidad: 1 },
    { dia: 6, cantidad: 2 },
  ],
  celdas: [celda(6, 10, 200_000), celda(6, 11, 100_000), celda(6, 17, 40_000), celda(1, 9, 30_000), celda(1, 20, 2_000)],
  categorias: [],
}

describe('mapa de calor', () => {
  const r = calcularCalor(datos, 'ventas')

  it('promedia cada celda por la cantidad de días de ese tipo', () => {
    expect(r.celda(6, 10)).toBe(100_000) // 200.000 en 2 sábados
    expect(r.celda(1, 9)).toBe(30_000)
    expect(r.celda(3, 10)).toBe(0)
    expect(r.horas).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(r.dias).toEqual([1, 6])
  })

  it('niveles de color de 0 a 5 respecto del máximo', () => {
    expect(r.nivel(100_000)).toBe(5)
    expect(r.nivel(50_000)).toBe(3)
    expect(r.nivel(1)).toBe(1)
    expect(r.nivel(0)).toBe(0)
  })

  it('hora punta, mejor día, parte de la mañana y horas flojas', () => {
    expect(r.punta).toEqual({ dia: 6, hora: 10, valor: 100_000 })
    expect(r.mejorDia!.dia).toBe(6)
    expect(r.peorDia!.dia).toBe(1)
    // AM (antes de 15:00): 200 + 100 + 30 = 330 de 372
    expect(r.parteAm).toBeCloseTo(330 / 372)
    expect(r.flojas).toContain(20)
    expect(r.flojas).not.toContain(10)
  })

  it('no muestra horas con ventas sueltas', () => {
    const conSuelta = { ...datos, celdas: [...datos.celdas, { dia: 6, hora: 21, ventas: 2600, transacciones: 1, unidades: 1 }] }
    expect(calcularCalor(conSuelta, 'ventas').horas).not.toContain(21)
  })

  it('otras medidas y sin datos', () => {
    expect(calcularCalor(datos, 'transacciones').celda(6, 10)).toBe(100)
    expect(calcularCalor({ ...datos, celdas: [] }, 'ventas').vacio).toBe(true)
    expect(rangoHora(9)).toBe('09:00–10:00')
  })
})
