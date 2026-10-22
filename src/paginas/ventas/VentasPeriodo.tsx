import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, Encabezado } from '../../componentes/ui'
import { moverMes, nombreMes } from '../../lib/finanzas'
import { fechaDia, hoyIso, nombreDia, numero, pesos, porcentaje } from '../../lib/formato'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import type { DetalleVentas, DiaVenta } from '../../lib/ventas'
import { DetalleTurnos, ListaBoletas, ListaProductos, PestanasDesglose, ResumenVentas, type Pestana } from './Desglose'

const finDeMes = (mes: string) => sumarDias(moverMes(mes, 1), -1)

function Navegacion({ anterior, siguiente, titulo, subtitulo }: { anterior: string; siguiente: string | null; titulo: string; subtitulo?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-2xl border border-borde bg-superficie">
      <Link to={anterior} aria-label="Anterior" className="flex h-12 w-14 items-center justify-center text-2xl text-primario">
        ‹
      </Link>
      <span className="text-center">
        <span className="block font-semibold first-letter:uppercase">{titulo}</span>
        {subtitulo && <span className="block text-xs text-suave">{subtitulo}</span>}
      </span>
      {siguiente ? (
        <Link to={siguiente} aria-label="Siguiente" className="flex h-12 w-14 items-center justify-center text-2xl text-primario">
          ›
        </Link>
      ) : (
        <span className="h-12 w-14" />
      )}
    </div>
  )
}

function useDetalle(desde: string, hasta: string, boletas = false) {
  const [d, setD] = useState<DetalleVentas | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    setD(null)
    supabase.rpc('detalle_ventas', { p_desde: desde, p_hasta: hasta, p_boletas: boletas }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setError(mensajeError(error))
      else {
        setError('')
        setD(data as DetalleVentas)
      }
    })
    return () => {
      vivo = false
    }
  }, [desde, hasta, boletas])
  return { d, error }
}

/** /ventas/mes/2026-10: el mes completo, con sus días, productos y turnos. */
export function VentasMes() {
  const { mes = '' } = useParams()
  const primero = `${mes}-01`
  const ultimo = finDeMes(primero)
  const { d, error } = useDetalle(primero, ultimo)
  const [dias, setDias] = useState<DiaVenta[]>([])
  const [pestana, setPestana] = useState<Pestana>('dias')
  const hoy = hoyIso().slice(0, 7)

  useEffect(() => {
    supabase
      .from('v_ventas_dia')
      .select('*')
      .gte('fecha', primero)
      .lte('fecha', ultimo)
      .order('fecha', { ascending: false })
      .then(({ data }) => setDias(((data ?? []) as DiaVenta[]).map((x) => ({ ...x, ventas: Number(x.ventas), abonos: Number(x.abonos) }))))
  }, [primero, ultimo])

  const maximo = Math.max(1, ...dias.map((x) => x.ventas))
  const mejor = dias.reduce<DiaVenta | null>((m, x) => (!m || x.ventas > m.ventas ? x : m), null)

  return (
    <>
      <Encabezado titulo="Ventas del mes" volver="/ventas" />
      <Navegacion
        anterior={`/ventas/mes/${moverMes(primero, -1).slice(0, 7)}`}
        siguiente={mes < hoy ? `/ventas/mes/${moverMes(primero, 1).slice(0, 7)}` : null}
        titulo={nombreMes(primero)}
      />
      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && d.resumen.dias === 0 && <Aviso tipo="info">No hay ventas importadas de este mes.</Aviso>}
      {d && d.resumen.dias > 0 && (
        <>
          <ResumenVentas
            d={d}
            extra={
              <p className="text-sm text-suave">
                {numero(d.resumen.dias)} días con ventas · promedio {pesos(d.resumen.ventas / d.resumen.dias)} por día
              </p>
            }
          />
          <PestanasDesglose opciones={['dias', 'productos', 'detalle']} activa={pestana} onCambio={setPestana} />
          {pestana === 'dias' && (
            <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
              {dias.map((x) => (
                <li key={x.fecha}>
                  <Link to={`/ventas/dia/${x.fecha}`} className="block px-4 py-2.5 active:bg-superficie-2">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium capitalize">
                        {nombreDia(x.fecha)} {x.fecha.slice(8, 10)}
                        {x === mejor && <span className="ml-1 text-xs font-normal normal-case text-exito">· mejor día</span>}
                      </span>
                      <span className="cifra font-semibold">{pesos(x.ventas)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-2">
                        <span className="block h-full rounded-full bg-acento" style={{ width: `${(x.ventas / maximo) * 100}%` }} />
                      </span>
                      <span className="shrink-0 text-xs text-suave">
                        {numero(x.transacciones)} clientes ›
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pestana === 'productos' && <ListaProductos d={d} />}
          {pestana === 'detalle' && <DetalleTurnos d={d} />}
        </>
      )}
    </>
  )
}

/** /ventas/dia/2026-10-17: un día, hasta el detalle de cada boleta. */
export function VentasDia() {
  const { fecha = '' } = useParams()
  const { d, error } = useDetalle(fecha, fecha, true)
  const [pestana, setPestana] = useState<Pestana>('productos')
  const hoy = hoyIso()
  const am = d?.por_turno.find((t) => t.turno === 'AM')?.ventas ?? 0

  return (
    <>
      <Encabezado titulo="Ventas del día" volver={`/ventas/mes/${fecha.slice(0, 7)}`} />
      <Navegacion
        anterior={`/ventas/dia/${sumarDias(fecha, -1)}`}
        siguiente={fecha < hoy ? `/ventas/dia/${sumarDias(fecha, 1)}` : null}
        titulo={`${nombreDia(fecha)} ${fechaDia(fecha)}`}
      />
      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && d.resumen.dias === 0 && <Aviso tipo="info">No hay ventas importadas de este día.</Aviso>}
      {d && d.resumen.dias > 0 && (
        <>
          <ResumenVentas
            d={d}
            extra={
              d.resumen.ventas > 0 && (
                <p className="text-sm text-suave">
                  AM {porcentaje(am / d.resumen.ventas, 0)} · PM {porcentaje(1 - am / d.resumen.ventas, 0)}
                </p>
              )
            }
          />
          <PestanasDesglose opciones={['productos', 'detalle', 'boletas']} activa={pestana} onCambio={setPestana} />
          {pestana === 'productos' && <ListaProductos d={d} />}
          {pestana === 'detalle' && <DetalleTurnos d={d} />}
          {pestana === 'boletas' && <ListaBoletas d={d} />}
        </>
      )}
    </>
  )
}
