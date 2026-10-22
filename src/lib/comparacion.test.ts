import { describe, expect, it } from 'vitest'
import { compararCategorias, compararProductos, indicadores, rangos } from './comparacion'
import type { DatosPanel } from './panel'

const panel = (ventas: number, productos: [number, string, number, number][], extra: Partial<DatosPanel['resumen']> = {}): DatosPanel => ({
  ver_costos: true,
  resumen: {
    transacciones: ventas / 4000, unidades: 100, ventas, abonos: 0,
    ventas_netas_costeadas: ventas / 1.19, costo: ventas / 1.19 / 2, mermas: 10_000, ventas_sin_costo: 0, unidades_sin_costo: 0, ...extra,
  },
  anterior: null,
  productos: productos.map(([id, nombre, v, u]) => ({ producto_id: id, nombre, ventas: v, unidades: u, ventas_netas_costeadas: null, costo: null, unidades_sin_costo: 0 })),
  dias: [],
  turnos: [],
  categorias: [
    { categoria: 'Galletería', ventas: ventas / 2, unidades: 50, ventas_netas_costeadas: null, costo: null },
    { categoria: 'Bollería', ventas: ventas / 2, unidades: 50, ventas_netas_costeadas: null, costo: null },
  ],
  ultimo_dia: null,
})

describe('comparación de meses', () => {
  it('a la misma fecha corta ambos meses en el mismo día', () => {
    expect(rangos('2026-09-01', '2026-10-01', 'misma_fecha', '2026-10-20')).toEqual({
      a: { desde: '2026-09-01', hasta: '2026-09-20' },
      b: { desde: '2026-10-01', hasta: '2026-10-20' },
      dia: 20,
    })
    // 31 de marzo vs febrero: febrero se corta en su último día
    expect(rangos('2026-02-01', '2026-03-01', 'misma_fecha', '2026-03-30').a.hasta).toBe('2026-02-28')
    // Si el mes más reciente ya terminó, se comparan completos
    expect(rangos('2026-08-01', '2026-09-01', 'misma_fecha', '2026-10-20').dia).toBeNull()
    expect(rangos('2026-09-01', '2026-10-01', 'completos', '2026-10-20').b.hasta).toBe('2026-10-31')
  })

  it('indicadores con cambio relativo y margen en puntos', () => {
    const A = panel(10_000_000, [])
    const B = panel(12_000_000, [], { costo: 12_000_000 / 1.19 * 0.6 })
    const ind = indicadores(A, B, 20, 20)
    const de = (c: string) => ind.find((x) => x.clave === c)!
    expect(de('ventas').cambio).toBeCloseTo(0.2)
    expect(de('diario').a).toBe(500_000)
    expect(de('ticket').a).toBe(4000)
    // margen: 50% → 40% (menos mermas) = cae en puntos
    expect(de('margen').cambio!).toBeLessThan(0)
    expect(de('mermas').invertir).toBe(true)
    expect(ind.some((x) => x.clave === 'real')).toBe(false)
    expect(indicadores(A, B, 20, 20, { a: 1, b: 2 }).at(-1)!.clave).toBe('real')
  })

  it('sin permiso de costos no muestra ganancia ni margen', () => {
    const A = { ...panel(1000, []), ver_costos: false }
    expect(indicadores(A, A, 1, 1).map((x) => x.clave)).not.toContain('ganancia')
  })

  it('productos que suben, bajan, nuevos y que dejaron de venderse', () => {
    const A = panel(1000, [[1, 'Danesas', 500, 10], [2, 'Brownie', 300, 5], [3, 'Kuchen', 200, 2]])
    const B = panel(1000, [[1, 'Danesas', 800, 16], [2, 'Brownie', 100, 2], [4, 'Pumpkin', 100, 3]])
    const r = compararProductos(A, B)
    expect(r.suben.map((x) => x.nombre)).toEqual(['Danesas'])
    expect(r.bajan.map((x) => x.nombre)).toEqual(['Brownie'])
    expect(r.nuevos.map((x) => x.nombre)).toEqual(['Pumpkin'])
    expect(r.dejaron.map((x) => x.nombre)).toEqual(['Kuchen'])
    expect(compararCategorias(A, B)).toHaveLength(2)
  })
})
