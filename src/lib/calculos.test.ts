import { describe, expect, it } from 'vitest'
import { calcularResultado, calcularResultadoConIva, sinIva } from './calculos'

describe('ganancia y margen', () => {
  it('brownie: vendo a $100 y cuesta $50 → gano $50, margen 50%', () => {
    const r = calcularResultado({ ventas: 100, costo: 50 })
    expect(r.ganancia).toBe(50)
    expect(r.margen).toBe(0.5)
  })

  it('las mermas se descuentan de la ganancia', () => {
    // 10 brownies vendidos a $100 (costo $50 c/u) y 2 botados (costo $50 c/u)
    const r = calcularResultado({ ventas: 1000, costo: 500, mermas: 100 })
    expect(r.ganancia).toBe(400)
    expect(r.margen).toBe(0.4)
  })

  it('sin ventas el margen no existe (no divide por cero)', () => {
    const r = calcularResultado({ ventas: 0, costo: 0, mermas: 3000 })
    expect(r.ganancia).toBe(-3000)
    expect(r.margen).toBeNull()
  })

  it('ganancia negativa si el costo supera la venta', () => {
    const r = calcularResultado({ ventas: 100, costo: 130 })
    expect(r.ganancia).toBe(-30)
    expect(r.margen).toBeCloseTo(-0.3)
  })

  it('rechaza valores inválidos', () => {
    expect(() => calcularResultado({ ventas: Number.NaN, costo: 0 })).toThrow()
  })
})

describe('IVA', () => {
  it('$1.190 con IVA son $1.000 netos', () => {
    expect(sinIva(1190, 0.19)).toBeCloseTo(1000)
  })

  it('brownie con IVA: $119 de venta (= $100 neto), costo neto $50 → margen 50% sobre neto', () => {
    const r = calcularResultadoConIva(
      { ventas: 119, costo: 50 },
      { preciosIncluyenIva: true, margenSobreNeto: true, tasaIva: 0.19 },
    )
    expect(r.ventas).toBeCloseTo(100)
    expect(r.ganancia).toBeCloseTo(50)
    expect(r.margen).toBeCloseTo(0.5)
  })

  it('si se elige margen sobre bruto, no se descuenta el IVA', () => {
    const r = calcularResultadoConIva(
      { ventas: 119, costo: 50 },
      { preciosIncluyenIva: true, margenSobreNeto: false, tasaIva: 0.19 },
    )
    expect(r.ventas).toBe(119)
    expect(r.ganancia).toBe(69)
  })
})
