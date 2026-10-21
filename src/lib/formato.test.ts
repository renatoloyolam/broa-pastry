import { describe, expect, it } from 'vitest'
import { decimal, fecha, fechaDia, fechaHora, hoyIso, leerNumero, nombreDia, numero, pesos, porcentaje } from './formato'

describe('formato chileno', () => {
  it('pesos sin decimales y con punto de miles', () => {
    expect(pesos(1250)).toBe('$1.250')
    expect(pesos(100)).toBe('$100')
    expect(pesos(1234567)).toBe('$1.234.567')
    expect(pesos(1249.6)).toBe('$1.250')
    expect(pesos(-3000)).toBe('-$3.000')
    expect(pesos(0)).toBe('$0')
    expect(pesos(null)).toBe('—')
  })

  it('porcentajes con coma decimal', () => {
    expect(porcentaje(0.5)).toBe('50%')
    expect(porcentaje(0.4053)).toBe('40,5%')
    expect(porcentaje(-0.3)).toBe('-30%')
    expect(porcentaje(null)).toBe('—')
  })

  it('números con punto de miles', () => {
    expect(numero(12345)).toBe('12.345')
  })

  it('lee números escritos a la chilena', () => {
    expect(leerNumero('1.250')).toBe(1250)
    expect(leerNumero('$18.000')).toBe(18000)
    expect(leerNumero('1.250.000')).toBe(1250000)
    expect(leerNumero('2,5')).toBe(2.5)
    expect(leerNumero('1.250,75')).toBe(1250.75)
    expect(leerNumero('0.5')).toBe(0.5)
    expect(leerNumero('600')).toBe(600)
    expect(leerNumero('')).toBeNull()
    expect(leerNumero('abc')).toBeNull()
  })

  it('muestra decimales con coma', () => {
    expect(decimal(2.5)).toBe('2,5')
    expect(decimal(1250)).toBe('1.250')
    expect(decimal(501.333)).toBe('501,33')
  })

  it('días de calendario', () => {
    expect(fechaDia('2026-10-10')).toBe('10/10/2026')
    expect(nombreDia('2026-10-10')).toBe('sábado')
    expect(hoyIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('fechas dd/mm/aaaa en hora de Santiago', () => {
    // 21/10/2026 02:30 UTC = 20/10/2026 23:30 en Santiago (UTC-3 en horario de verano)
    expect(fecha('2026-10-21T02:30:00Z')).toBe('20/10/2026')
    expect(fechaHora('2026-10-21T17:05:00Z')).toBe('21/10/2026 14:05')
  })
})
