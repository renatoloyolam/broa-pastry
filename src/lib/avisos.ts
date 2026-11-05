// Avisos del Inicio: todos van en la campana, y el más urgente también queda a la vista en una línea.

export interface ResumenPedidos {
  hoy: number
  manana: number
  atrasados: number
  proximos_7: number
  saldo_pendiente: number
}

export interface PagoProximo {
  nombre: string
  monto: number
  dias: number
}

export interface AvisoUrgente {
  clave: 'pedidos' | 'pago' | 'ventas'
  texto: string
  a: string
  accion: string
}

const plural = (n: number, palabra: string) => `${n} ${palabra}${n === 1 ? '' : 's'}`

export function hayPedidosCercanos(p: ResumenPedidos | null) {
  return !!p && (p.atrasados > 0 || p.hoy > 0 || p.manana > 0)
}

/** "2 atrasados · 1 para hoy · 3 para mañana" */
export function textoPedidos(p: ResumenPedidos) {
  return [
    p.atrasados > 0 && plural(p.atrasados, 'atrasado'),
    p.hoy > 0 && `${p.hoy} para hoy`,
    p.manana > 0 && `${p.manana} para mañana`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "vence hoy" · "vence en 3 días" · "venció hace 2 días" */
export function textoVencimiento(dias: number) {
  if (dias < 0) return `venció hace ${plural(-dias, 'día')}`
  return dias === 0 ? 'vence hoy' : `vence en ${plural(dias, 'día')}`
}

/** Lo único que merece quedar a la vista; lo demás espera en la campana. */
export function avisoUrgente(d: {
  pedidos: ResumenPedidos | null
  pago: PagoProximo | null
  fechasSinVentas: string[]
  ayer: string
  puedeImportar: boolean
}): AvisoUrgente | null {
  const { pedidos, pago, fechasSinVentas: f } = d
  if (pedidos && pedidos.atrasados > 0) {
    return { clave: 'pedidos', texto: `${plural(pedidos.atrasados, 'pedido')} de tortas atrasado${pedidos.atrasados === 1 ? '' : 's'}`, a: '/pedidos', accion: 'Ver' }
  }
  if (pago && pago.dias <= 0) {
    return { clave: 'pago', texto: `${pago.nombre} ${textoVencimiento(pago.dias)}`, a: '/finanzas', accion: 'Ver' }
  }
  if (pedidos && pedidos.hoy > 0) {
    return { clave: 'pedidos', texto: `${plural(pedidos.hoy, 'pedido')} de tortas para hoy`, a: '/pedidos', accion: 'Ver' }
  }
  if (d.puedeImportar && f.length > 0) {
    const cuando =
      f.length > 1 ? `de ${f.length} días` : f[0] === d.ayer ? 'de ayer' : `del ${f[0].slice(8, 10)}/${f[0].slice(5, 7)}`
    return { clave: 'ventas', texto: `Falta subir las ventas ${cuando}`, a: '/ventas/importar', accion: 'Subir' }
  }
  return null
}
