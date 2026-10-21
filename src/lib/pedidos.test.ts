import { describe, expect, it } from 'vitest'
import { cuandoEntrega, estadoPago, linkWhatsapp } from './pedidos'

describe('pedidos', () => {
  it('cuándo se entrega', () => {
    expect(cuandoEntrega('2026-10-21', '2026-10-21').texto).toBe('Hoy')
    expect(cuandoEntrega('2026-10-22', '2026-10-21').texto).toBe('Mañana')
    expect(cuandoEntrega('2026-10-24', '2026-10-21')).toEqual({ texto: 'sábado 24/10', urgente: false, atrasado: false })
    expect(cuandoEntrega('2026-10-20', '2026-10-21').atrasado).toBe(true)
  })

  it('link de WhatsApp con teléfonos chilenos', () => {
    expect(linkWhatsapp('+56 9 1234 5678')).toBe('https://wa.me/56912345678')
    expect(linkWhatsapp('9 1234 5678')).toBe('https://wa.me/56912345678')
    expect(linkWhatsapp('12345678')).toBe('https://wa.me/56912345678')
    expect(linkWhatsapp('2 2345 6789')).toBeNull() // fijo de Santiago
    expect(linkWhatsapp('')).toBeNull()
  })

  it('estado del pago', () => {
    expect(estadoPago({ precio_total: 28000, abonado: 0 })).toBe('sin_abono')
    expect(estadoPago({ precio_total: 28000, abonado: 14000 })).toBe('abonado')
    expect(estadoPago({ precio_total: 28000, abonado: 28000 })).toBe('pagado')
  })
})
