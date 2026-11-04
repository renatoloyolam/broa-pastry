import { describe, expect, it } from 'vitest'
import { costoHoras, costoReceta, esCostoIndirecto, margenReferencia, precioPorUnidadBase, precioPorUnidadMayor, type Ingrediente, type Unidad } from './costeo'

// Mismo caso que supabase/tests/costos_fase2.sql, para que app y base coincidan.
const ing: Ingrediente[] = [
  { id: 1, nombre: 'Harina', cantidad_compra: 25, unidad_compra: 'kg', precio_compra_neto: 18000 },
  { id: 2, nombre: 'Mantequilla', cantidad_compra: 1, unidad_compra: 'kg', precio_compra_neto: 8000 },
  { id: 3, nombre: 'Huevo', cantidad_compra: 30, unidad_compra: 'un', precio_compra_neto: 6000 },
  { id: 4, nombre: 'Cacao', cantidad_compra: 1, unidad_compra: 'kg', precio_compra_neto: 12000 },
]
const mapa = new Map(ing.map((i) => [i.id, i]))

describe('costo de recetas', () => {
  it('precio por gramo y por kg', () => {
    expect(precioPorUnidadBase(ing[0])).toBeCloseTo(0.72)
    expect(precioPorUnidadMayor(ing[0])).toBeCloseTo(720)
    expect(precioPorUnidadMayor(ing[2])).toBeCloseTo(200) // por huevo
  })

  it('masa base: 600 g harina + 400 g mantequilla = $3.632 por kg', () => {
    const r = costoReceta(
      [
        { ingrediente_id: 1, cantidad: 600, unidad: 'g' },
        { ingrediente_id: 2, cantidad: 0.4, unidad: 'kg' },
      ],
      [],
      1,
      mapa,
      new Map(),
    )
    expect(r.total).toBeCloseTo(3632)
  })

  it('brownie con receta base y mano de obra: $501,33 c/u', () => {
    const subrecetas = new Map<number, { unidad_rendimiento: Unidad; costo_unitario: number | null }>([
      [10, { unidad_rendimiento: 'kg', costo_unitario: 3632 }],
    ])
    const r = costoReceta(
      [
        { subreceta_id: 10, cantidad: 500, unidad: 'g' },
        { ingrediente_id: 3, cantidad: 3, unidad: 'un' },
        { ingrediente_id: 4, cantidad: 100, unidad: 'g' },
      ],
      [{ monto_neto: 2400 }],
      12,
      mapa,
      subrecetas,
    )
    expect(r.total).toBeCloseTo(6016)
    expect(r.unitario).toBeCloseTo(501.33, 2)
  })

  it('unidades incompatibles dejan la receta incompleta y explican por qué', () => {
    const r = costoReceta([{ ingrediente_id: 1, cantidad: 100, unidad: 'ml' }], [], 1, mapa, new Map())
    expect(r.total).toBeNull()
    expect(r.lineas[0].error).toMatch(/compatible/)
  })
})

describe('margen de referencia', () => {
  it('brownie a $2.380 con IVA ($2.000 neto) y costo $500 → 75%', () => {
    expect(margenReferencia(2380, 500)).toBeCloseTo(0.75)
  })
  it('sin precio o sin costo no hay margen', () => {
    expect(margenReferencia(0, 500)).toBeNull()
    expect(margenReferencia(2380, null)).toBeNull()
  })
})

describe('mano de obra por horas', () => {
  it('calcula horas × valor hora, igual que la planilla', () => {
    const c = costoHoras(5, 1, { mano_obra: 4438.87, gif: 3188.19 })
    expect(c.manoObra).toBeCloseTo(22194.35)
    expect(c.gif).toBeCloseTo(3188.19)
    expect(c.total).toBeCloseTo(25382.54)
  })

  it('reconoce los adicionales que ya son mano de obra o G.I.F.', () => {
    expect(esCostoIndirecto('Mano de obra y gastos (planilla)')).toBe(true)
    expect(esCostoIndirecto('G.I.F.')).toBe(true)
    expect(esCostoIndirecto('gif')).toBe(true)
    expect(esCostoIndirecto('Caja')).toBe(false)
    expect(esCostoIndirecto('Otros costos')).toBe(false)
  })
})
