import { describe, expect, it } from 'vitest'
import { clasificar, ordenar, precioRedondo, type ProductoMapa } from './mapa'

// precio con IVA 1.190 → neto 1.000
const p = (id: number, nombre: string, unidades: number, costoUnidad: number, categoria = 'Pastelería', precio = 1190): ProductoMapa => ({
  id, nombre, categoria, unidades, ventas: unidades * precio, ventas_netas: (unidades * precio) / 1.19, costo: unidades * costoUnidad, completo: true,
})

describe('mapa de productos', () => {
  // 4 productos, 400 unidades → umbral de popularidad = 100 × 0,7 = 70
  // ganancia total = 200×600 + 100×300 + 40×700 + 60×200 = 190.000 sobre 400.000 neto → margen 47,5%
  const datos = {
    divisor: 1.19,
    productos: [
      p(1, 'Croissant', 200, 400), // popular, gana 600 → estrella
      p(2, 'Danesa', 100, 700), //    popular, gana 300 → popular de bajo margen
      p(3, 'Torta', 40, 300), //      poco vendido, gana 700 → rentable
      p(4, 'Queque', 60, 800), //     poco vendido, gana 200 → débil
      { ...p(5, 'Pan especial', 30, 0), costo: null, completo: false },
      p(6, 'Café', 500, 200, 'Cafetería'), // solo 1 en su categoría → se compara con todos
    ],
    sin_ventas: [{ id: 9, nombre: 'Berlín', categoria: 'Bollería' }],
    ultimo_dia: '2026-10-20',
  }

  it('clasifica cada producto contra su categoría', () => {
    const r = clasificar(datos)
    const de = (id: number) => r.productos.find((x) => x.id === id)!
    expect(de(1).cuadrante).toBe('estrella')
    expect(de(2).cuadrante).toBe('popular')
    expect(de(3).cuadrante).toBe('rentable')
    expect(de(4).cuadrante).toBe('debil')
    expect(de(1).grupo).toBe('Pastelería')
    expect(de(6).grupo).toBe('Todos')
    expect(r.sinCosto.map((x) => x.id)).toEqual([5])
    expect(r.sinVentas).toHaveLength(1)
  })

  it('sugiere precio para llegar al margen promedio solo si la subida es razonable', () => {
    const r = clasificar(datos)
    const danesa = r.productos.find((x) => x.id === 2)!
    // margen del grupo = 190.000 / 400.000 = 47,5% → 700 / 0,525 = 1.333 neto → 1.587 con IVA → 1.600 (+34%)
    expect(danesa.precioSugerido).toBe(1600)
    expect(danesa.esPaso).toBe(false)
    // Queque: 800 / 0,525 × 1,19 = 1.813 → +60%: se sugiere un primer paso de +15% → 1.368 → 1.400
    const queque = r.productos.find((x) => x.id === 4)!
    expect(queque.precioSugerido).toBe(1400)
    expect(queque.esPaso).toBe(true)
    // Los de buen margen no reciben sugerencia
    expect(r.productos.find((x) => x.id === 1)!.precioSugerido).toBeNull()
  })

  it('avisa los productos que se venden bajo el costo', () => {
    const r = clasificar({ ...datos, productos: [...datos.productos, p(7, 'Kuchen', 20, 1100)] })
    expect(r.perdidas.map((x) => x.id)).toEqual([7])
    // costo 1.100 neto → 1.309 con IVA → 1.350
    expect(r.perdidas[0].precioMinimo).toBe(1350)
    expect(r.productos.find((x) => x.id === 1)!.precioMinimo).toBeNull()
  })

  it('redondea a precios redondos según el monto', () => {
    expect(precioRedondo(559)).toBe(560)
    expect(precioRedondo(1309)).toBe(1350)
    expect(precioRedondo(13171)).toBe(13200)
  })

  it('resumen por cuadrante y orden', () => {
    const r = clasificar(datos)
    const estrellas = r.resumen.find((x) => x.cuadrante === 'estrella')!
    expect(estrellas.cantidad).toBeGreaterThanOrEqual(1)
    const debiles = ordenar(r.productos.filter((x) => x.cuadrante === 'debil'), 'debil')
    expect(debiles[0].ganancia).toBeLessThanOrEqual(debiles[debiles.length - 1].ganancia)
  })
})
