import { describe, expect, it } from 'vitest'
import { calcularInsumos, type DatosInsumos } from './insumos'

const base: DatosInsumos = {
  desde: '2026-10-01',
  hasta: '2026-10-31',
  ultimo_dia: '2026-10-20',
  compras: [
    { categoria: 'Insumos', rut: '76123456-7', proveedor: 'Molino', documentos: 3, monto: 5_000_000 },
    { categoria: 'Packaging', rut: '77000000-1', proveedor: 'Cajas', documentos: 1, monto: 600_000 },
    { categoria: 'Gastos del local', rut: '96800570-7', proveedor: 'Luz', documentos: 1, monto: 200_000 },
    { categoria: 'Por clasificar', rut: '78000000-2', proveedor: 'Nuevo', documentos: 2, monto: 300_000 },
  ],
  uso: [
    { origen: 'ventas', categoria: 'Pastelería', costo: 4_000_000, insumos: 3_000_000 },
    { origen: 'ventas', categoria: 'Panadería', costo: 2_000_000, insumos: 1_500_000 },
    { origen: 'mermas', categoria: 'Pastelería', costo: 200_000, insumos: 150_000 },
  ],
  ventas: { netas_costeadas: 15_000_000, netas_sin_costo: 1_500_000 },
}

describe('compras de insumos vs. uso', () => {
  it('solo cuenta Insumos y Packaging; estima lo vendido sin costo', () => {
    const f = calcularInsumos(base)
    expect(f.comprado).toBe(5_600_000)
    expect(f.usoVentas).toBe(4_500_000)
    expect(f.usoMermas).toBe(150_000)
    // 4.500.000 / 15.000.000 = 30% → 1.500.000 × 30% = 450.000
    expect(f.usoEstimado).toBeCloseTo(450_000)
    expect(f.usado).toBeCloseTo(5_100_000)
    expect(f.diferencia).toBeCloseTo(500_000)
    expect(f.veredicto).toBe('calza') // 9,8% de diferencia
    expect(f.porClasificar).toHaveLength(1)
    expect(f.montoPorClasificar).toBe(300_000)
    expect(f.usoPorCategoria[0]).toEqual({ categoria: 'Pastelería', monto: 3_150_000 })
  })

  it('detecta compras de más y de menos', () => {
    const mas = { ...base, compras: [{ ...base.compras[0], monto: 7_000_000 }] }
    expect(calcularInsumos(mas).veredicto).toBe('sobra')
    const menos = { ...base, compras: [{ ...base.compras[0], monto: 3_000_000 }] }
    expect(calcularInsumos(menos).veredicto).toBe('falta')
    expect(calcularInsumos({ ...base, compras: [] }).veredicto).toBe('sin_compras')
  })
})
