import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, Tarjeta } from '../../componentes/ui'
import { calcularFinanzas, nombreMes, proximosPagos, type DatosFinanzas } from '../../lib/finanzas'
import { fechaDia, hoyIso, nombreDia, numero, pesos, porcentaje } from '../../lib/formato'
import { ganancia, margen, ticketPromedio, variacion, type DiaPanel, type ProductoPanel, type ResumenPanel } from '../../lib/panel'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { BarraMeta } from '../finanzas/BarraMeta'

interface DatosSemana {
  desde: string
  hasta: string
  ultimo_dia: string | null
  ver_costos: boolean
  resumen: ResumenPanel
  anterior: ResumenPanel | null
  dias: DiaPanel[]
  productos: ProductoPanel[]
  finanzas: boolean
}

/** Lunes de la semana de una fecha. */
export function lunesDe(iso: string) {
  const dia = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7
  return sumarDias(iso, 1 - dia)
}

function Cambio({ a, b, invertir = false }: { a: number | null | undefined; b: number | null | undefined; invertir?: boolean }) {
  const v = variacion(b ?? null, a)
  if (v == null) return null
  const sube = v > 0.0005
  const baja = v < -0.0005
  const bueno = invertir ? baja : sube
  return (
    <span className={`cifra text-xs font-semibold ${bueno ? 'text-exito' : sube || baja ? 'text-peligro' : 'text-suave'}`}>
      {sube ? '▲' : baja ? '▼' : '='} {porcentaje(Math.abs(v), 0)}
    </span>
  )
}

export function ResumenSemanal() {
  const hoy = hoyIso()
  const [lunes, setLunes] = useState(sumarDias(lunesDe(hoy), -7))
  const [d, setD] = useState<DatosSemana | null>(null)
  const [fin, setFin] = useState<DatosFinanzas | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setD(null)
    supabase.rpc('resumen_semana', { p_lunes: lunes }).then(({ data, error }) => {
      if (!vivo) return
      if (error) return setError(mensajeError(error))
      setError('')
      setD(data as DatosSemana)
    })
    return () => {
      vivo = false
    }
  }, [lunes])

  // Meta del mes en curso y próximos pagos (solo quien ve finanzas)
  useEffect(() => {
    if (!d?.finanzas || fin) return
    supabase.rpc('finanzas_mes', { p_mes: hoy }).then(({ data }) => data && setFin(data as DatosFinanzas))
  }, [d, fin, hoy])

  const r = d?.resumen
  const a = d?.anterior
  const g = r ? ganancia(r) : null
  const gA = a ? ganancia(a) : null
  const conVentas = d?.dias.filter((x) => x.ventas > 0) ?? []
  const mejor = conVentas.length ? conVentas.reduce((m, x) => (x.ventas > m.ventas ? x : m)) : null
  const maxDia = Math.max(1, ...conVentas.map((x) => x.ventas))
  const f = fin ? calcularFinanzas(fin) : null
  const pagos = fin ? proximosPagos(fin.gastos, fin.mes, fin.hoy).filter((p) => p.dias <= 7) : []
  const esUltima = lunes >= sumarDias(lunesDe(hoy), -7)

  return (
    <>
      <Encabezado titulo="Resumen semanal" volver="/" />
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-borde bg-superficie">
        <button type="button" aria-label="Semana anterior" onClick={() => setLunes(sumarDias(lunes, -7))} className="h-12 w-14 text-2xl text-primario">
          ‹
        </button>
        <span className="text-center text-sm font-semibold">
          {fechaDia(lunes).slice(0, 5)} al {fechaDia(sumarDias(lunes, 6)).slice(0, 5)}
          {esUltima && <span className="block text-xs font-normal text-suave">la semana pasada</span>}
        </span>
        <button
          type="button"
          aria-label="Semana siguiente"
          disabled={lunes >= lunesDe(hoy)}
          onClick={() => setLunes(sumarDias(lunes, 7))}
          className="h-12 w-14 text-2xl text-primario disabled:opacity-30"
        >
          ›
        </button>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}

      {d && r && (
        <div className="space-y-5">
          {r.ventas === 0 ? (
            <Aviso tipo="info">No hay ventas cargadas de esta semana.</Aviso>
          ) : (
            <>
              <Tarjeta>
                <p className="text-sm text-suave">Ventas de la semana</p>
                <p className="flex items-baseline gap-2">
                  <span className="cifra text-3xl font-bold">{pesos(r.ventas)}</span>
                  <Cambio a={a?.ventas} b={r.ventas} />
                </p>
                <p className="text-xs text-suave">Semana anterior: {pesos(a?.ventas)}</p>
                {d.ultimo_dia && d.ultimo_dia < d.hasta && (
                  <p className="mt-1 text-xs text-aviso">Ventas cargadas hasta el {nombreDia(d.ultimo_dia)} {fechaDia(d.ultimo_dia)}.</p>
                )}
              </Tarjeta>

              <div className="grid grid-cols-2 gap-2">
                <Mini titulo="Clientes" valor={numero(r.transacciones)} cambio={<Cambio a={a?.transacciones} b={r.transacciones} />} />
                <Mini titulo="Ticket promedio" valor={pesos(ticketPromedio(r))} cambio={<Cambio a={a ? ticketPromedio(a) : null} b={ticketPromedio(r)} />} />
                {d.ver_costos && (
                  <>
                    <Mini titulo="Ganancia" valor={pesos(g)} cambio={<Cambio a={gA} b={g} />} />
                    <Mini titulo="Margen" valor={porcentaje(margen(r), 0)} />
                    <Mini titulo="Mermas" valor={pesos(r.mermas)} cambio={<Cambio a={a?.mermas} b={r.mermas} invertir />} />
                    <Mini titulo="Unidades" valor={numero(r.unidades)} cambio={<Cambio a={a?.unidades} b={r.unidades} />} />
                  </>
                )}
              </div>

              <section>
                <h2 className="mb-2 text-lg font-semibold">Día a día</h2>
                <Tarjeta className="space-y-1.5 text-sm">
                  {d.dias.map((x) => (
                    <div key={x.fecha} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                      <span className="first-letter:uppercase">{nombreDia(x.fecha)}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-superficie-2">
                        <span
                          className={`block h-full rounded-full ${x === mejor ? 'bg-primario' : 'bg-acento'}`}
                          style={{ width: `${(x.ventas / maxDia) * 100}%` }}
                        />
                      </span>
                      <span className="cifra text-right">{pesos(x.ventas)}</span>
                    </div>
                  ))}
                  {mejor && (
                    <p className="pt-1 text-xs text-suave">
                      Mejor día: <b className="text-texto">{nombreDia(mejor.fecha)}</b>.
                    </p>
                  )}
                </Tarjeta>
              </section>

              {d.productos.length > 0 && (
                <section>
                  <h2 className="mb-2 text-lg font-semibold">Lo más vendido</h2>
                  <Tarjeta className="space-y-1 text-sm">
                    {d.productos.map((p, i) => (
                      <div key={p.producto_id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {i + 1}. {p.nombre}
                        </span>
                        <span className="cifra shrink-0 text-suave">{numero(p.unidades)} u.</span>
                      </div>
                    ))}
                  </Tarjeta>
                </section>
              )}
            </>
          )}

          {f && fin && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">🎯 Meta de {nombreMes(fin.mes).split(' ')[0]}</h2>
              <Link to="/finanzas" className="block rounded-2xl border border-borde bg-superficie p-4 active:bg-superficie-2">
                {f.meta == null ? (
                  <span className="text-sm text-suave">Ingresa los gastos fijos del mes para ver la meta.</span>
                ) : (
                  <>
                    <span className="mb-2 flex justify-between text-sm">
                      <span>
                        {pesos(f.ventas)} de {pesos(f.meta)}
                      </span>
                      <b className="cifra">{porcentaje(f.avance, 0)}</b>
                    </span>
                    <BarraMeta avance={f.avance ?? 0} />
                    <span className="mt-2 block text-xs text-suave">
                      {f.faltante === 0 ? 'Gastos del mes cubiertos ✓' : `Faltan ${pesos(f.faltante)}${f.porDia != null ? ` · ${pesos(f.porDia)} por día` : ''}`}
                    </span>
                  </>
                )}
                {pagos.length > 0 && (
                  <span className="mt-3 block border-t border-borde pt-2 text-xs">
                    <b>Pagos de esta semana:</b>{' '}
                    {pagos.map((p) => `${p.nombre} ${pesos(p.monto)} (${p.dias < 0 ? 'vencido' : `día ${p.dia_pago}`})`).join(' · ')}
                  </span>
                )}
              </Link>
            </section>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link to="/comparar" className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-center font-semibold text-primario">
              Comparar meses
            </Link>
            <Link to="/ventas/horarios" className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-center font-semibold text-primario">
              Horarios
            </Link>
          </div>
          <p className="text-center text-xs text-suave">
            ¿Quieres que te llegue cada lunes? Actívalo en{' '}
            <Link to="/mas/cuenta" className="font-semibold text-primario">
              Más → Mi cuenta
            </Link>
            .
          </p>
        </div>
      )}
    </>
  )
}

function Mini({ titulo, valor, cambio }: { titulo: string; valor: string; cambio?: React.ReactNode }) {
  return (
    <Tarjeta className="p-3">
      <p className="text-xs text-suave">{titulo}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="cifra text-lg font-bold">{valor}</span>
        {cambio}
      </p>
    </Tarjeta>
  )
}
