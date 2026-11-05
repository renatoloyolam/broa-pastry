import { describe, expect, it } from 'vitest'
import { agruparRecetas, moverItem, type ItemRecetas } from './recetasItems'

const items: ItemRecetas[] = [
  { id: 2, nombre: 'Bollería', orden: 20 },
  { id: 1, nombre: 'Galletería', orden: 10 },
  { id: 3, nombre: 'Cafetería', orden: 30 },
]
const r = (id: number, item_id: number | null) => ({ id, item_id })

describe('ítems de recetas', () => {
  it('agrupa en el orden de los ítems, sin ítem al final y sin grupos vacíos', () => {
    const g = agruparRecetas([r(1, 2), r(2, null), r(3, 1), r(4, 2), r(5, 99)], items)
    expect(g.map((x) => x.nombre)).toEqual(['Galletería', 'Bollería', 'Sin ítem'])
    expect(g[1].recetas.map((x) => x.id)).toEqual([1, 4])
    // Un ítem borrado cuenta como sin ítem
    expect(g[2].recetas.map((x) => x.id)).toEqual([2, 5])
  })

  it('mover intercambia con el vecino y renumera', () => {
    expect(moverItem(items, 2, -1)).toEqual([
      { id: 2, orden: 10 },
      { id: 1, orden: 20 },
    ])
    expect(moverItem(items, 1, -1)).toEqual([])
    expect(moverItem(items, 3, 1)).toEqual([])
  })

  it('renumera si había órdenes repetidos', () => {
    const repetidos = [
      { id: 1, nombre: 'A', orden: 100 },
      { id: 2, nombre: 'B', orden: 100 },
    ]
    expect(moverItem(repetidos, 2, -1)).toEqual([
      { id: 2, orden: 10 },
      { id: 1, orden: 20 },
    ])
  })
})
