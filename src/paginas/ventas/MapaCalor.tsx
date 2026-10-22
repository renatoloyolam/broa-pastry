import { useEffect, useMemo, useState } from 'react'
import { Aviso, Encabezado, Selector, Tarjeta } from '../../componentes/ui'
import { calcularCalor, DIA_CORTO, NIVELES, NOMBRE_DIA, rangoHora, type DatosCalor, type Medida } from '../../lib/calor'
import { fechaDia, hoyIso, numero, pesos, porcentaje } from '../../lib/formato'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'

const MEDIDAS: [Medida, string][] = [
  ['ventas', 'Ventas $'],
  ['transacciones', 'Clientes'],
  ['unidades', 'Unidades'],
]

/** Un solo tono (verde de la marca), de claro a oscuro. Funciona en modo claro y oscuro. */
const fondo = (nivel: number) =>
  nivel === 0 ? 'var(--superficie-2)' : `color-mix(in oklab, var(--primario) ${[0, 18, 36, 55, 75, 100][nivel]}%, var(--superficie))`

export function MapaCalor() {
  const hoy = hoyIso()
  const [semanas, setSemanas] = useState(8)
  const [categoria, setCategoria] = useState('')
  const [medida, setMedida] = useState<Medida>('ventas')
  const [d, setD] = useState<DatosCalor | null>(null)
  const [error, setError] = useState('')
  const [elegida, setElegida] = useState<{ dia: number; hora: number } | null>(null)
  const hasta = sumarDias(hoy, -1)
  const desde = sumarDias(hasta, -(semanas * 7 - 1))

  useEffect(() => {
    let vivo = true
    setD(null)
    setElegida(null)
    supabase
      .rpc('mapa_calor', { p_desde: desde, p_hasta: hasta, p_categoria: categoria ? Number(categoria) : null })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setError(mensajeError(error))
        else {
          setError('')
          setD(data as DatosCalor)
        }
      })
    return () => {
      vivo = false
    }
  }, [desde, hasta, categoria])

  const r = useMemo(() => (d ? calcularCalor(d, medida) : null), [d, medida])
  const unidad = medida === 'ventas' ? '' : medida === 'transacciones' ? ' clientes' : ' unidades'
  const valorTexto = (v: number) => (medida === 'ventas' ? pesos(v) : `${v < 10 ? v.toFixed(1).replace('.', ',') : numero(Math.round(v))}${unidad}`)

  return (
    <>
      <Encabezado titulo="Horarios" volver="/ventas" />
      <p className="mb-3 text-sm text-suave">Cuándo se vende más, en promedio, cada día de la semana y a cada hora.</p>

      <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-superficie-2 p-1">
        {MEDIDAS.map(([m, texto]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMedida(m)}
            className={`min-h-10 rounded-xl text-sm font-semibold ${medida === m ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {texto}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Selector aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todo</option>
          {d?.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Selector aria-label="Período" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
          {[4, 8, 12].map((n) => (
            <option key={n} value={n}>
              Últimas {n} semanas
            </option>
          ))}
        </Selector>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && r && r.vacio && <Aviso tipo="info">No hay ventas en este período.</Aviso>}

      {d && r && !r.vacio && (
        <div className="space-y-5">
          <Tarjeta className="p-3">
            <table className="w-full table-fixed border-separate" style={{ borderSpacing: 2 }}>
              <caption className="sr-only">Promedio por día de la semana y hora</caption>
              <thead>
                <tr>
                  <th className="w-11" />
                  {r.dias.map((x) => (
                    <th key={x} scope="col" className="pb-1 text-center text-xs font-semibold text-suave">
                      {DIA_CORTO[x]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.horas.map((h) => (
                  <tr key={h}>
                    <th scope="row" className="pr-1 text-right text-[11px] font-medium text-suave">
                      {String(h).padStart(2, '0')}:00
                    </th>
                    {r.dias.map((x) => {
                      const v = r.celda(x, h)
                      const activa = elegida?.dia === x && elegida.hora === h
                      return (
                        <td key={x} className="p-0">
                          <button
                            type="button"
                            onClick={() => setElegida(activa ? null : { dia: x, hora: h })}
                            title={`${NOMBRE_DIA[x]} ${rangoHora(h)}: ${valorTexto(v)}`}
                            aria-label={`${NOMBRE_DIA[x]} ${rangoHora(h)}: ${valorTexto(v)}`}
                            aria-pressed={activa}
                            className={`block h-7 w-full rounded ${activa ? 'ring-2 ring-texto ring-offset-1 ring-offset-superficie' : ''}`}
                            style={{ background: fondo(r.nivel(v)) }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-suave" aria-hidden>
              <span>Menos</span>
              {Array.from({ length: NIVELES }, (_, i) => (
                <span key={i} className="h-3 w-5 rounded-sm" style={{ background: fondo(i + 1) }} />
              ))}
              <span>Más</span>
            </div>
          </Tarjeta>

          {elegida ? (
            <Aviso tipo="info">
              <b className="text-texto">
                {NOMBRE_DIA[elegida.dia]} {rangoHora(elegida.hora)}
              </b>
              : en promedio {valorTexto(r.celda(elegida.dia, elegida.hora))}
              {r.maximo > 0 && ` (${porcentaje(r.celda(elegida.dia, elegida.hora) / r.maximo, 0)} de la hora más fuerte).`}
            </Aviso>
          ) : (
            <p className="text-center text-xs text-suave">Toca un cuadro para ver su promedio.</p>
          )}

          <section>
            <h2 className="mb-2 text-lg font-semibold">Lo que muestra</h2>
            <Tarjeta className="space-y-2 text-sm">
              {r.punta && (
                <p>
                  🔥 Hora más fuerte: <b>{NOMBRE_DIA[r.punta.dia].toLowerCase()} de {rangoHora(r.punta.hora)}</b>, con{' '}
                  {valorTexto(r.punta.valor)} en promedio.
                </p>
              )}
              {r.mejorDia && (
                <p>
                  📈 Mejor día: <b>{NOMBRE_DIA[r.mejorDia.dia].toLowerCase()}</b> ({valorTexto(r.mejorDia.valor)} en un día promedio)
                  {r.peorDia && (
                    <>
                      ; el más flojo, <b>{NOMBRE_DIA[r.peorDia.dia].toLowerCase()}</b> ({valorTexto(r.peorDia.valor)}).
                    </>
                  )}
                </p>
              )}
              {r.parteAm != null && (
                <p>
                  ☀️ Antes de las 15:00 se hace el <b>{porcentaje(r.parteAm, 0)}</b> y después el {porcentaje(1 - r.parteAm, 0)}.
                </p>
              )}
              {r.flojas.length > 0 && (
                <p>
                  💤 Horas flojas (menos de un cuarto de la hora más fuerte):{' '}
                  <b>{r.flojas.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')}</b>. Buen momento para hornear, ordenar o
                  probar una promoción.
                </p>
              )}
            </Tarjeta>
          </section>

          <details className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">Ver como tabla (promedio por día)</summary>
            <ul className="mt-2 space-y-1">
              {[...r.porDia].sort((a, b) => a.dia - b.dia).map((x) => (
                <li key={x.dia} className="flex justify-between">
                  <span>{NOMBRE_DIA[x.dia]}</span>
                  <span className="cifra">{valorTexto(x.valor)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 mb-1 font-semibold">Promedio por hora (cualquier día)</p>
            <ul className="space-y-1">
              {[...r.porHora].sort((a, b) => a.hora - b.hora).map((x) => (
                <li key={x.hora} className="flex justify-between">
                  <span>{rangoHora(x.hora)}</span>
                  <span className="cifra">{valorTexto(x.valor)}</span>
                </li>
              ))}
            </ul>
          </details>

          <p className="text-xs text-suave">
            Del {fechaDia(desde)} al {fechaDia(hasta)}, hora de Chile. Cada cuadro es el promedio de ese día de la semana a esa hora. Sin
            abonos de tortas.
          </p>
        </div>
      )}
    </>
  )
}
