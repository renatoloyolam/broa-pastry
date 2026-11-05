import { describe, expect, it } from 'vitest'
import { armarRegistro, FORM_VACIO, textoCantidad, unidadesItem, unidadesPara, type ItemProceso } from './mermasProceso'

const comun = { fecha: '2026-11-05', motivo: 7, evitable: true, nota: '' }
const masa: ItemProceso = { id: 3, nombre: 'Masa', unidad: 'g', rendimiento: 1200 }
const frutilla: ItemProceso = { id: 9, nombre: 'Frutillas', unidad: 'kg' }

describe('mermas de producción y materia prima', () => {
  it('ofrece solo unidades compatibles', () => {
    expect(unidadesPara('kg')).toEqual(['g', 'kg'])
    expect(unidadesPara('l')).toEqual(['ml', 'l'])
    expect(unidadesPara('un')).toEqual(['un'])
    expect(unidadesItem(masa)).toEqual(['tanda', 'g', 'kg'])
    expect(unidadesItem(frutilla)).toEqual(['g', 'kg'])
  })

  it('una tanda se convierte al rendimiento de la receta', () => {
    const r = armarRegistro('produccion', { ...FORM_VACIO, item: masa, cantidad: '1,5', unidad: 'tanda' }, comun)
    expect(r).toMatchObject({ args: { p_receta: 3, p_ingrediente: null, p_cantidad: 1800, p_unidad: 'g', p_monto: null } })
  })

  it('materia prima usa el ingrediente y su cantidad', () => {
    const r = armarRegistro('materia_prima', { ...FORM_VACIO, item: frutilla, cantidad: '2', unidad: 'kg' }, comun)
    expect(r).toMatchObject({ args: { p_receta: null, p_ingrediente: 9, p_cantidad: 2, p_unidad: 'kg', p_etapa: 'materia_prima' } })
  })

  it('sin receta pide descripción; el monto es opcional', () => {
    expect(armarRegistro('produccion', { ...FORM_VACIO, sinItem: true }, comun)).toEqual({ error: 'Escribe qué se perdió.' })
    expect(armarRegistro('produccion', { ...FORM_VACIO, sinItem: true, descripcion: 'Cupcakes' }, comun)).toMatchObject({
      args: { p_descripcion: 'Cupcakes', p_cantidad: null, p_monto: null },
    })
    expect(armarRegistro('produccion', { ...FORM_VACIO, sinItem: true, descripcion: 'Cupcakes', monto: '$5.000' }, comun)).toMatchObject({
      args: { p_monto: 5000 },
    })
    expect(armarRegistro('produccion', { ...FORM_VACIO, sinItem: true, descripcion: 'Cupcakes', monto: 'mucho' }, comun)).toEqual({
      error: 'Revisa el monto estimado.',
    })
  })

  it('avisa lo que falta', () => {
    expect(armarRegistro('produccion', FORM_VACIO, comun)).toEqual({ error: 'Elige la receta.' })
    expect(armarRegistro('materia_prima', FORM_VACIO, comun)).toEqual({ error: 'Elige el ingrediente.' })
    expect(armarRegistro('materia_prima', { ...FORM_VACIO, item: frutilla, cantidad: '0', unidad: 'kg' }, comun)).toEqual({ error: 'Escribe cuánto se perdió.' })
    expect(armarRegistro('materia_prima', { ...FORM_VACIO, item: frutilla, unidad: 'kg' }, { ...comun, motivo: null })).toEqual({ error: 'Elige el motivo.' })
  })

  it('texto de la cantidad', () => {
    expect(textoCantidad(2.5, 'kg')).toBe('2,5 kg')
    expect(textoCantidad(null, null)).toBe('')
  })
})
