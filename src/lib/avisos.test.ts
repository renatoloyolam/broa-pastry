import { describe, expect, it } from 'vitest'
import { avisoUrgente, hayPedidosCercanos, textoPedidos, textoVencimiento, type ResumenPedidos } from './avisos'

const pedidos = (p: Partial<ResumenPedidos>): ResumenPedidos => ({ hoy: 0, manana: 0, atrasados: 0, proximos_7: 0, saldo_pendiente: 0, ...p })
const base = { pedidos: null, pago: null, fechasSinVentas: [] as string[], ayer: '2026-11-04', puedeImportar: true }

describe('avisos del inicio', () => {
  it('sin nada urgente no muestra línea', () => {
    expect(avisoUrgente(base)).toBeNull()
    // Un pedido para mañana o un pago futuro esperan en la campana
    expect(avisoUrgente({ ...base, pedidos: pedidos({ manana: 2 }), pago: { nombre: 'Luz', monto: 1, dias: 3 } })).toBeNull()
  })

  it('dice de qué día faltan las ventas', () => {
    expect(avisoUrgente({ ...base, fechasSinVentas: ['2026-11-04'] })).toMatchObject({ texto: 'Falta subir las ventas de ayer', accion: 'Subir', a: '/ventas/importar' })
    expect(avisoUrgente({ ...base, fechasSinVentas: ['2026-11-02'] })?.texto).toBe('Falta subir las ventas del 02/11')
    expect(avisoUrgente({ ...base, fechasSinVentas: ['2026-11-02', '2026-11-03'] })?.texto).toBe('Falta subir las ventas de 2 días')
  })

  it('quien no importa no recibe ese llamado', () => {
    expect(avisoUrgente({ ...base, fechasSinVentas: ['2026-11-04'], puedeImportar: false })).toBeNull()
  })

  it('prioridad: atrasados, pago vencido, pedidos de hoy, ventas', () => {
    const todo = {
      ...base,
      pedidos: pedidos({ atrasados: 1, hoy: 2 }),
      pago: { nombre: 'Arriendo', monto: 1, dias: -2 },
      fechasSinVentas: ['2026-11-04'],
    }
    expect(avisoUrgente(todo)?.texto).toBe('1 pedido de tortas atrasado')
    expect(avisoUrgente({ ...todo, pedidos: pedidos({ hoy: 2 }) })?.texto).toBe('Arriendo venció hace 2 días')
    expect(avisoUrgente({ ...todo, pedidos: pedidos({ hoy: 2 }), pago: null })?.texto).toBe('2 pedidos de tortas para hoy')
  })

  it('textos', () => {
    expect(textoPedidos(pedidos({ atrasados: 2, hoy: 1, manana: 3 }))).toBe('2 atrasados · 1 para hoy · 3 para mañana')
    expect(hayPedidosCercanos(pedidos({ proximos_7: 4 }))).toBe(false)
    expect(textoVencimiento(0)).toBe('vence hoy')
    expect(textoVencimiento(1)).toBe('vence en 1 día')
  })
})
