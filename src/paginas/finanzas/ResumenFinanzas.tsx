import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { calcularFinanzas, nombreMes, proximosPagos, type DatosFinanzas } from '../../lib/finanzas'
import { hoyIso, pesos, porcentaje } from '../../lib/formato'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { BarraMeta } from './BarraMeta'

/** Tarjeta en Inicio: cómo va la meta del mes y el próximo pago. */
export function ResumenFinanzas() {
  const { puede } = useSesion()
  const permitido = puede('gestionar_finanzas')
  const [d, setD] = useState<DatosFinanzas | null>(null)

  useEffect(() => {
    if (!permitido) return
    const mes = hoyIso()
    // El mes en curso se prepara solo (copia los gastos fijos del mes anterior)
    supabase
      .rpc('preparar_mes_gastos', { p_mes: mes })
      .then(() => supabase.rpc('finanzas_mes', { p_mes: mes }))
      .then(({ data }) => setD(data as DatosFinanzas | null))
  }, [permitido])

  if (!d) return null
  const f = calcularFinanzas(d)
  const pago = proximosPagos(d.gastos, d.mes, d.hoy).find((p) => p.dias <= 5)

  return (
    <Link to="/finanzas" className="mb-4 block rounded-2xl border border-borde bg-superficie px-4 py-3 active:bg-superficie-2">
      {f.meta == null ? (
        <span className="flex items-center gap-3 text-sm">
          <span className="text-2xl" aria-hidden>
            🎯
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Meta de {nombreMes(d.mes)}</span>
            <span className="block text-xs text-suave">
              {d.gastos.length === 0 ? 'Ingresa los gastos fijos del mes para saber cuánto necesitas vender.' : 'Aún no hay ventas para calcularla.'}
            </span>
          </span>
          <span className="text-suave" aria-hidden>
            ›
          </span>
        </span>
      ) : (
        <>
          <span className="mb-2 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">🎯 Meta de {nombreMes(d.mes).split(' ')[0]}</span>
            <span className="cifra font-semibold">{porcentaje(f.avance, 0)}</span>
          </span>
          <BarraMeta avance={f.avance ?? 0} />
          <span className="mt-2 block text-xs text-suave">
            {f.faltante === 0
              ? `Gastos cubiertos ✓ · ganancia real ${pesos(f.ganancia)}`
              : `Faltan ${pesos(f.faltante)}${f.porDia != null ? ` · ${pesos(f.porDia)} por día` : ''}`}
          </span>
        </>
      )}
      {pago && (
        <span className={`mt-2 block border-t border-borde pt-2 text-xs ${pago.dias < 0 ? 'text-peligro' : 'text-aviso'}`}>
          💳 {pago.nombre} {pesos(pago.monto)} ·{' '}
          {pago.dias < 0 ? `venció hace ${-pago.dias} día${pago.dias < -1 ? 's' : ''}` : pago.dias === 0 ? 'vence hoy' : `vence en ${pago.dias} día${pago.dias > 1 ? 's' : ''}`}
        </span>
      )}
    </Link>
  )
}
