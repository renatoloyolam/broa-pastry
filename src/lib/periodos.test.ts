import { describe, expect, it } from 'vitest'
import { calcularPeriodo, calcularRango, moverAncla } from './periodos'

const hoy = '2026-10-21' // miércoles

describe('períodos del panel', () => {
  it('día: compara con el día anterior', () => {
    const p = calcularPeriodo('dia', hoy, hoy)
    expect(p).toMatchObject({ desde: hoy, hasta: hoy, desdeAnt: '2026-10-20', hastaAnt: '2026-10-20' })
    expect(p.etiqueta).toBe('Hoy, 21/10/2026')
    expect(calcularPeriodo('dia', '2026-10-20', hoy).etiqueta).toBe('Ayer, 20/10/2026')
  })

  it('semana en curso: de lunes a hoy, contra el mismo tramo de la semana anterior', () => {
    const p = calcularPeriodo('semana', hoy, hoy)
    expect(p).toMatchObject({ desde: '2026-10-19', hasta: '2026-10-21', desdeAnt: '2026-10-12', hastaAnt: '2026-10-14' })
    expect(p.etiqueta).toBe('Semana del 19/10 al 25/10')
  })

  it('semana pasada completa', () => {
    const p = calcularPeriodo('semana', '2026-10-15', hoy)
    expect(p).toMatchObject({ desde: '2026-10-12', hasta: '2026-10-18', desdeAnt: '2026-10-05', hastaAnt: '2026-10-11' })
  })

  it('mes en curso: del 1 a hoy, contra los mismos días del mes anterior', () => {
    const p = calcularPeriodo('mes', hoy, hoy)
    expect(p).toMatchObject({ desde: '2026-10-01', hasta: hoy, desdeAnt: '2026-09-01', hastaAnt: '2026-09-21' })
    expect(p.etiqueta).toBe('Octubre 2026')
    expect(p.etiquetaAnt).toBe('los mismos días de septiembre')
  })

  it('mes completo pasado y meses de distinto largo', () => {
    expect(calcularPeriodo('mes', '2026-09-10', hoy)).toMatchObject({
      desde: '2026-09-01', hasta: '2026-09-30', desdeAnt: '2026-08-01', hastaAnt: '2026-08-30',
    })
    // Marzo completo vs febrero (28 días): no se pasa de fin de febrero
    expect(calcularPeriodo('mes', '2027-03-15', '2027-06-01')).toMatchObject({
      desde: '2027-03-01', hasta: '2027-03-31', desdeAnt: '2027-02-01', hastaAnt: '2027-02-28',
    })
  })

  it('rango libre: compara con el mismo largo justo antes', () => {
    expect(calcularRango('2026-10-10', '2026-10-16')).toMatchObject({
      desdeAnt: '2026-10-03', hastaAnt: '2026-10-09',
    })
    expect(calcularRango('2026-10-16', '2026-10-10').desde).toBe('2026-10-10')
  })

  it('navegar entre períodos', () => {
    expect(moverAncla('dia', '2026-10-01', -1)).toBe('2026-09-30')
    expect(moverAncla('semana', hoy, 1)).toBe('2026-10-28')
    expect(moverAncla('mes', '2026-01-31', -1)).toBe('2025-12-01')
  })
})
