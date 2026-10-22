import { describe, expect, it } from 'vitest'
import { armarFilas, CONCEPTO_MANO_OBRA, leerPlantilla, type FilaPlantilla } from './plantillaCostos'

const datos = {
  categorias: [{ id: 1, nombre: 'Galletería', orden: 30, activa: true }],
  productos: [
    { id: 1, nombre: 'Danesas', categoria_id: 1, tipo: 'producto' as const, precio_referencia: 500, activo: true },
    { id: 2, nombre: 'Galletas', categoria_id: 1, tipo: 'producto' as const, precio_referencia: 0, activo: true },
    { id: 3, nombre: 'Pan pita', categoria_id: null, tipo: 'producto' as const, precio_referencia: 2200, activo: true },
    { id: 4, nombre: 'Ley Redondeo', categoria_id: null, tipo: 'ajuste' as const, precio_referencia: null, activo: true },
  ],
  opciones: [{ id: 10, producto_id: 2, nombre: 'Galleta nuez', precio_referencia: 500, activa: true }],
  costos: [
    { definicion_id: 100, producto_id: 1, opcion_id: null, modo: 'manual' as const, costo_manual_neto: 206.5, receta_id: null, cantidad_receta: 1, costo_calculado: 260.13, costo_vigente: 260.13, vigente_desde: '2000-01-01' },
    { definicion_id: 101, producto_id: 2, opcion_id: null, modo: 'cero' as const, costo_manual_neto: null, receta_id: null, cantidad_receta: 1, costo_calculado: 0, costo_vigente: 0, vigente_desde: '2000-01-01' },
    { definicion_id: 102, producto_id: null, opcion_id: 10, modo: 'manual' as const, costo_manual_neto: 115.79, receta_id: null, cantidad_receta: 1, costo_calculado: 166.06, costo_vigente: 166.06, vigente_desde: '2000-01-01' },
  ],
  adicionales: [
    { id: 1, definicion_id: 100, concepto: CONCEPTO_MANO_OBRA, monto_neto: 53.63 },
    { id: 2, definicion_id: 102, concepto: CONCEPTO_MANO_OBRA, monto_neto: 50.27 },
  ],
  recetas: [],
}

/** Convierte las filas a la tabla que tendría el Excel (mismas columnas). */
function aTabla(filas: FilaPlantilla[], cambiar: (f: FilaPlantilla) => unknown[] | null = () => null): unknown[][] {
  const enc = ['Código', 'Categoría', 'Producto', 'Opción', 'Precio de venta (con IVA)', 'Forma de costo',
    'Costo ingredientes y packaging (sin IVA)', 'Mano de obra y gastos (sin IVA)', 'Otros costos (sin IVA)', 'Costo total', 'Margen', 'Estado actual']
  return [enc, ...filas.map((f) => cambiar(f) ?? [f.codigo, f.categoria, f.producto, f.opcion, f.precio, f.forma, f.costo, f.manoObra || '', f.otros || '', '', '', f.estado])]
}

describe('plantilla de costos', () => {
  const filas = armarFilas(datos)

  it('trae productos y opciones con sus costos actuales, sin ajustes ni abonos', () => {
    expect(filas.map((f) => f.codigo)).toEqual(['P1', 'P2', 'O10', 'P3'])
    expect(filas[0]).toMatchObject({ forma: 'A mano', costo: 206.5, manoObra: 53.63, otros: 0, estado: 'Con costo' })
    expect(filas[1]).toMatchObject({ forma: 'Sin costo propio', costo: 0 })
    expect(filas[2]).toMatchObject({ opcion: 'Galleta nuez', precio: 500, codigoPadre: 'P2' })
    expect(filas[3]).toMatchObject({ forma: '', costo: null, estado: 'Sin costo' })
  })

  it('subir la plantilla sin tocar nada no genera cambios', () => {
    const r = leerPlantilla(aTabla(filas), filas)
    expect(r.errores).toEqual([])
    expect(r.cambios).toEqual([])
    expect(r.sinCambios).toBe(4)
  })

  it('detecta un costo cambiado y un producto que recibe costo por primera vez', () => {
    const tabla = aTabla(filas, (f) =>
      f.codigo === 'P1' ? ['P1', '', 'Danesas', '', 500, 'A mano', '$250', 53.63, 10] :
      f.codigo === 'P3' ? ['P3', '', 'Pan pita', '', 2200, '', 900] : null)
    const r = leerPlantilla(tabla, filas)
    expect(r.errores).toEqual([])
    expect(r.cambios).toHaveLength(2)
    expect(r.cambios[0]).toMatchObject({ codigo: 'P1', antes: 260.13, despues: 313.63 })
    expect(r.cambios[0].enviar).toEqual({ producto_id: 1, opcion_id: null, modo: 'manual', costo: 250, mano_obra: 53.63, otros: 10 })
    expect(r.cambios[1]).toMatchObject({ codigo: 'P3', antes: null, despues: 900 })
  })

  it('explica los errores con número de fila', () => {
    const tabla = aTabla(filas, (f) =>
      f.codigo === 'P1' ? ['P1', '', 'Danesas', '', 500, 'Otra cosa', 250] :
      f.codigo === 'O10' ? ['O10', '', 'Galletas', 'Galleta nuez', 500, 'A mano', 'cien'] :
      f.codigo === 'P3' ? ['P3', '', 'Pan pita', '', 2200, 'A mano', ''] : null)
    tabla.push(['P999', '', 'No existe', '', '', 'A mano', 100])
    const r = leerPlantilla(tabla, filas)
    expect(r.cambios).toEqual([])
    expect(r.errores).toHaveLength(4)
    expect(r.errores[0]).toMatch(/Fila 2 \(Danesas\): "Forma de costo"/)
    expect(r.errores.join(' ')).toMatch(/no es un número válido/)
    expect(r.errores.join(' ')).toMatch(/falta el costo/)
    expect(r.errores.join(' ')).toMatch(/P999 no existe/)
  })

  it('archivo equivocado: sin columna Código', () => {
    expect(leerPlantilla([['Nombre', 'Precio']], filas).errores[0]).toMatch(/Código/)
  })
})
