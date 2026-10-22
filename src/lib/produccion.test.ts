import { describe, expect, it } from 'vitest'
import { calcularProduccion, percentil, sugerir, textoParaCompartir, type DatosProduccion, type ProductoProduccion } from './produccion'

const prod = (p: Partial<ProductoProduccion>): ProductoProduccion => ({
  id: 1, nombre: 'Danesas', categoria: 'Galletería', vendidos: [], am: [], mermas: [], costo: null, ...p,
})

describe('sugerencia de producción', () => {
  it('percentil 75 con interpolación', () => {
    expect(percentil([27, 53, 53, 41, 34, 36], 0.75)).toBeCloseTo(50)
    expect(percentil([10], 0.75)).toBe(10)
  })

  it('si casi no se bota, alcanza para un día bueno (p75) y reparte AM/PM', () => {
    // Danesas reales: 6 sábados
    const s = sugerir(prod({ vendidos: [27, 53, 53, 41, 34, 36], am: [19, 38, 35, 7, 10, 7], mermas: [0, 0, 0, 0, 0, 0] }))
    expect(s.sugerido).toBe(50)
    expect(s.am + s.pm).toBe(50)
    expect(s.am).toBe(Math.round(50 * (116 / 244)))
    expect(s.min).toBe(27)
    expect(s.max).toBe(53)
    expect(s.deMas).toBe(0) // sin mermas registradas no se sabe cuánto sobra
  })

  it('si se bota más del 10%, sugiere el promedio y estima el ahorro', () => {
    // vende 20 y bota 6 cada día → hace 26
    const s = sugerir(prod({ vendidos: [18, 20, 22, 20], am: [9, 10, 11, 10], mermas: [6, 6, 6, 6], costo: 300 }))
    expect(s.seBotaMucho).toBe(true)
    expect(s.sugerido).toBe(20)
    expect(s.deMas).toBe(6)
    expect(s.ahorroDia).toBe(1800)
  })

  it('separa los productos que se venden solo algunos días', () => {
    const datos: DatosProduccion = {
      fecha: '2026-10-24',
      dias: ['2026-10-17', '2026-10-10', '2026-10-03', '2026-09-26'],
      dias_cerrado: [7],
      ver_costos: false,
      productos: [
        prod({ vendidos: [30, 40, 35, 38], am: [15, 20, 18, 19], mermas: [0, 0, 0, 0] }),
        prod({ id: 2, nombre: 'Torta especial', categoria: 'Pastelería', vendidos: [0, 1, 0, 0], am: [0, 1, 0, 0], mermas: [0, 0, 0, 0] }),
      ],
    }
    const r = calcularProduccion(datos)
    expect(r.regulares.map((p) => p.id)).toEqual([1])
    expect(r.ocasionales.map((p) => p.id)).toEqual([2])
    expect(r.cerrado).toBe(false)
    expect(r.hayMermas).toBe(false)
    expect(calcularProduccion({ ...datos, fecha: '2026-10-25' }).cerrado).toBe(true) // domingo
    const texto = textoParaCompartir(datos, r)
    expect(texto).toContain('sábado 24/10/2026')
    // p75 de 30, 35, 38, 40 = 38,5 → 39
    expect(texto).toContain('• Danesas: 39 (AM 20 · PM 19)')
  })
})
