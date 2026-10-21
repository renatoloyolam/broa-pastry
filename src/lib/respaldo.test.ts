import { describe, expect, it } from 'vitest'
import { aCelda, diasDesdeRespaldo, TABLAS_RESPALDO } from './respaldo'

describe('respaldo', () => {
  it('convierte valores para el Excel', () => {
    expect(aCelda(null)).toBeNull()
    expect(aCelda(1250)).toBe(1250)
    expect(aCelda([30, 30])).toBe('30,30')
    expect(aCelda({ sin_costo: true })).toBe('{"sin_costo":true}')
    expect(aCelda('Danesas')).toBe('Danesas')
  })

  it('días desde el último respaldo', () => {
    const ahora = Date.parse('2026-10-21T12:00:00Z')
    expect(diasDesdeRespaldo(null, ahora)).toBeNull()
    expect(diasDesdeRespaldo('2026-10-14T12:00:00Z', ahora)).toBe(7)
    expect(diasDesdeRespaldo('2026-10-21T08:00:00Z', ahora)).toBe(0)
  })

  it('incluye ventas, costos, mermas y pedidos', () => {
    const tablas = TABLAS_RESPALDO.map(([t]) => t)
    for (const t of ['ventas', 'venta_lineas', 'costo_versiones', 'mermas', 'pedidos', 'pedido_abonos']) expect(tablas).toContain(t)
    expect(new Set(tablas).size).toBe(tablas.length)
  })
})
