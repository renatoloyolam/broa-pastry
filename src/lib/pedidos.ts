// Utilidades de pedidos de tortas.
import { fechaDia, nombreDia } from './formato'
import { diasEntre } from './periodos'

export type EstadoPedido = 'pendiente' | 'entregado' | 'cancelado'

export interface Abono {
  id: number
  fecha: string
  monto: number
  medio_pago: string | null
  nota: string | null
}

export interface PedidoLista {
  id: number
  cliente: string
  telefono: string | null
  descripcion: string
  producto: string | null
  fecha_entrega: string
  hora_entrega: string | null
  precio_total: number
  estado: EstadoPedido
  abonado: number
  saldo: number
  abonos: Abono[]
  costo_estimado: number | null
  costo_manual: boolean | null
  ganancia_esperada: number | null
}

/** "Hoy", "Mañana", "Atrasado (lunes 20/10)", "viernes 24/10" */
export function cuandoEntrega(fecha: string, hoy: string): { texto: string; urgente: boolean; atrasado: boolean } {
  const d = diasEntre(hoy, fecha)
  if (d === 0) return { texto: 'Hoy', urgente: true, atrasado: false }
  if (d === 1) return { texto: 'Mañana', urgente: true, atrasado: false }
  const dia = `${nombreDia(fecha)} ${fechaDia(fecha).slice(0, 5)}`
  if (d < 0) return { texto: `Atrasado · ${dia}`, urgente: true, atrasado: true }
  return { texto: dia, urgente: false, atrasado: false }
}

/** Link de WhatsApp para un teléfono chileno escrito de cualquier forma. */
export function linkWhatsapp(telefono: string | null | undefined): string | null {
  if (!telefono) return null
  let n = telefono.replace(/\D/g, '')
  if (n.length === 9 && n.startsWith('9')) n = '56' + n // 9 1234 5678
  if (n.length === 8) n = '569' + n // 1234 5678
  if (!/^569\d{8}$/.test(n)) return null
  return `https://wa.me/${n}`
}

/** Estado del pago de un pedido para mostrar. */
export function estadoPago(p: Pick<PedidoLista, 'precio_total' | 'abonado'>) {
  if (p.abonado <= 0) return 'sin_abono' as const
  if (p.abonado >= p.precio_total) return 'pagado' as const
  return 'abonado' as const
}
