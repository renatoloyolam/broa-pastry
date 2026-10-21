import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pesos } from '../../lib/formato'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

interface Resumen {
  hoy: number
  manana: number
  atrasados: number
  proximos_7: number
  saldo_pendiente: number
}

/** Tarjeta en Inicio con las entregas de tortas cercanas. */
export function ResumenPedidos() {
  const { puede } = useSesion()
  const permitido = puede('gestionar_pedidos')
  const [r, setR] = useState<Resumen | null>(null)

  useEffect(() => {
    if (!permitido) return
    supabase.rpc('resumen_pedidos').then(({ data }) => setR(data as Resumen | null))
  }, [permitido])

  if (!r || (r.hoy === 0 && r.manana === 0 && r.atrasados === 0)) return null

  const partes = [
    r.atrasados > 0 && `${r.atrasados} atrasado${r.atrasados > 1 ? 's' : ''}`,
    r.hoy > 0 && `${r.hoy} para hoy`,
    r.manana > 0 && `${r.manana} para mañana`,
  ].filter(Boolean)

  return (
    <Link
      to="/pedidos"
      className={`mb-4 flex items-center gap-3 rounded-2xl border bg-superficie px-4 py-3 active:bg-superficie-2 ${
        r.atrasados > 0 ? 'border-peligro/50' : 'border-borde'
      }`}
    >
      <span className="text-2xl" aria-hidden>
        🎂
      </span>
      <span className="flex-1 text-sm">
        <span className="block font-semibold">Pedidos de tortas: {partes.join(' · ')}</span>
        <span className="block text-xs text-suave">Saldo por cobrar {pesos(r.saldo_pendiente)}</span>
      </span>
      <span className="text-suave" aria-hidden>
        ›
      </span>
    </Link>
  )
}
