import { describe, expect, it } from 'vitest'
import type { ProductoMapa } from './mapa'
import { baseDe, precioParaMargen, simular, simularGrupo } from './simulador'

// Danesas reales (octubre): 1.020 vendidas en 20 días, $495.453 cobrados, costo $265.333
const danesas: ProductoMapa = {
  id: 21, nombre: 'Danesas', categoria: 'Galletería', unidades: 1020, ventas: 495453,
  ventas_netas: 495453 / 1.19, costo: 265332.6, completo: true,
}

describe('simulador de precios', () => {
  const b = baseDe(danesas, 20, 1.19)

  it('lleva el período a un mes', () => {
    expect(b.unidadesMes).toBeCloseTo(1530)
    expect(b.precio).toBeCloseTo(485.74, 1)
    expect(b.costo).toBeCloseTo(260.13, 1)
  })

  it('sin cambios, la ganancia nueva es igual a la de hoy', () => {
    const s = simular(b, b.precio, b.costo, 0)
    expect(s.diferenciaMes).toBeCloseTo(0)
    expect(s.cambioVentasTolerable).toBeCloseTo(0)
  })

  it('subir el precio: más ganancia y cuánto pueden bajar las ventas sin perder', () => {
    const s = simular(b, 560, b.costo, 0)
    // hoy: 485,74/1,19 − 260,13 = 148,05 por unidad; nuevo: 560/1,19 − 260,13 = 210,46
    expect(s.hoy.gananciaUnidad).toBeCloseTo(148.05, 1)
    expect(s.nuevo.gananciaUnidad).toBeCloseTo(210.46, 1)
    expect(s.diferenciaMes).toBeCloseTo((210.46 - 148.05) * 1530, -2)
    // puede vender hasta ~29,7% menos y ganar lo mismo
    expect(s.cambioVentasTolerable!).toBeCloseTo(148.05 / 210.46 - 1, 2)
    // con 10% menos de ventas igual gana más
    expect(simular(b, 560, b.costo, 0.1).diferenciaMes).toBeGreaterThan(0)
  })

  it('bajar el precio exige vender más', () => {
    const s = simular(b, 450, b.costo, 0)
    expect(s.cambioVentasTolerable!).toBeGreaterThan(0)
  })

  it('precio para un margen', () => {
    // 260,13 / 0,5 × 1,19 = 619,1 → 620
    expect(precioParaMargen(b.costo, 0.5, 1.19)).toBe(620)
  })

  it('subir una categoría completa', () => {
    const g = simularGrupo([danesas, { ...danesas, id: 2, completo: false }], 20, 1.19, 0.1, 0)
    expect(g.filas).toHaveLength(1)
    expect(g.filas[0].nuevoPrecio).toBe(540) // 485,74 × 1,1 = 534,3 → 540
    expect(g.gananciaNueva).toBeGreaterThan(g.gananciaHoy)
  })
})
