import { describe, expect, it } from 'vitest'
import { ganancia, margen, pesosCompacto, rankingRentabilidad, ticketPromedio, variacion, type ProductoPanel } from './panel'

describe('indicadores del panel', () => {
  it('brownie: $100 neto vendido, $50 de costo → ganancia $50, margen 50%', () => {
    expect(ganancia({ ventas_netas_costeadas: 100, costo: 50 })).toBe(50)
    expect(margen({ ventas_netas_costeadas: 100, costo: 50 })).toBe(0.5)
  })

  it('las mermas se descuentan', () => {
    expect(ganancia({ ventas_netas_costeadas: 1000, costo: 500, mermas: 100 })).toBe(400)
    expect(margen({ ventas_netas_costeadas: 1000, costo: 500, mermas: 100 })).toBe(0.4)
  })

  it('sin permiso de costos no hay ganancia ni margen', () => {
    expect(ganancia({ ventas_netas_costeadas: null, costo: null })).toBeNull()
    expect(margen({ ventas_netas_costeadas: null, costo: null })).toBeNull()
  })

  it('variación contra el período anterior', () => {
    expect(variacion(120, 100)).toBeCloseTo(0.2)
    expect(variacion(80, 100)).toBeCloseTo(-0.2)
    expect(variacion(50, 0)).toBeNull()
    expect(variacion(-50, -100)).toBeCloseTo(0.5)
  })

  it('ticket promedio', () => {
    expect(ticketPromedio({ ventas: 10000, transacciones: 4 })).toBe(2500)
    expect(ticketPromedio({ ventas: 0, transacciones: 0 })).toBeNull()
  })

  it('ranking de rentabilidad ignora productos sin costo completo o con pocas ventas', () => {
    const p = (id: number, unidades: number, ventas: number, costo: number | null, sinCosto = 0): ProductoPanel => ({
      producto_id: id, nombre: `P${id}`, unidades, ventas: ventas * 1.19, ventas_netas_costeadas: costo == null ? null : ventas,
      costo, unidades_sin_costo: sinCosto,
    })
    const r = rankingRentabilidad([p(1, 10, 1000, 400), p(2, 10, 1000, 900), p(3, 10, 5000, 1000), p(4, 10, 1000, null, 10), p(5, 1, 9000, 1)])
    expect(r.masRentables.map((x) => x.producto_id)).toEqual([3, 1, 2])
    expect(r.menosRentables[0].producto_id).toBe(2)
  })

  it('montos compactos para el gráfico', () => {
    expect(pesosCompacto(850000)).toBe('$850 mil')
    expect(pesosCompacto(1234567)).toBe('$1,2 M')
    expect(pesosCompacto(2000000)).toBe('$2 M')
    expect(pesosCompacto(23659118)).toBe('$24 M')
    expect(pesosCompacto(500)).toBe('$500')
    expect(pesosCompacto(-45000)).toBe('-$45 mil')
  })
})
