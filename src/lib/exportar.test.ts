import { describe, expect, it } from 'vitest'
import { aCsv, hojasReporte, nombreArchivo } from './exportar'
import type { DatosPanel } from './panel'

const panel = (verCostos: boolean): DatosPanel => ({
  ver_costos: verCostos,
  resumen: {
    transacciones: 2, unidades: 3, ventas: 2380, abonos: 0,
    ventas_netas_costeadas: verCostos ? 2000 : null, costo: verCostos ? 1000 : null, mermas: verCostos ? 100 : null,
    ventas_sin_costo: verCostos ? 0 : null, unidades_sin_costo: verCostos ? 0 : null,
  },
  anterior: null,
  productos: [{ producto_id: 1, nombre: 'Brownie', unidades: 3, ventas: 2380, ventas_netas_costeadas: verCostos ? 2000 : null, costo: verCostos ? 1000 : null, unidades_sin_costo: verCostos ? 0 : null }],
  dias: [{ fecha: '2026-10-10', transacciones: 2, ventas: 2380, ventas_netas_costeadas: verCostos ? 2000 : null, costo: verCostos ? 1000 : null, mermas: verCostos ? 100 : null }],
  turnos: [],
  categorias: [],
  ultimo_dia: '2026-10-10',
})
const periodo = { desde: '2026-10-10', hasta: '2026-10-10', etiqueta: '10/10/2026' }

describe('hoja de mermas', () => {
  it('incluye producción y materia prima, e ingredientes y mano de obra por separado', () => {
    const hojas = hojasReporte(periodo, panel(true), {
      ver_costos: true,
      por_motivo: [],
      por_producto: [],
      total: { unidades: 0, valor: 0, valor_evitable: 0, unidades_evitables: 0 },
      perdida: { insumos: 1332, mano_obra: 500 },
      proceso: { por_item: [{ etapa: 'materia_prima', nombre: 'Frutillas', unidad: 'kg', cantidad: 2, valor: 1332 }] },
    }, null)
    const filas = hojas.find((h) => h.nombre === 'Mermas')!.filas
    expect(filas).toContainEqual(['Frutillas (Materia prima)', '2 kg', 1332])
    expect(filas).toContainEqual(['Mano de obra perdida', '', 500])
  })
})

describe('exportación', () => {
  it('con permiso de costos incluye ganancia y margen', () => {
    const hojas = hojasReporte(periodo, panel(true), null, null)
    const resumen = hojas[0].filas
    expect(resumen).toContainEqual(['Ganancia', 900])
    expect(resumen).toContainEqual(['Margen %', 45])
    expect(hojas.find((h) => h.nombre === 'Productos')!.columnas).toContain('Costo')
    expect(hojas.find((h) => h.nombre === 'Por día')!.filas[0]).toEqual(['10/10/2026', 2, 2380, 2000, 1000, 100, 900])
  })

  it('sin permiso de costos no hay NINGUNA columna de costo, ganancia o margen', () => {
    const hojas = hojasReporte(periodo, panel(false), null, null)
    const todo = JSON.stringify(hojas)
    expect(todo).not.toMatch(/Costo|Ganancia|Margen|Mermas/)
  })

  it('CSV con punto y coma, comillas y BOM para tildes', () => {
    const csv = aCsv({ nombre: 'x', columnas: ['Producto', 'Total'], filas: [['Café; grande', 2500], ['Pan "rico"', 1000]] })
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"Café; grande";2500')
    expect(csv).toContain('"Pan ""rico""";1000')
  })

  it('nombre de archivo con el período', () => {
    expect(nombreArchivo('ventas', { desde: '2026-10-01', hasta: '2026-10-31' }, 'xlsx')).toBe('broa-ventas-2026-10-01_a_2026-10-31.xlsx')
    expect(nombreArchivo('resumen', { desde: '2026-10-10', hasta: '2026-10-10' }, 'pdf')).toBe('broa-resumen-2026-10-10.pdf')
  })
})
