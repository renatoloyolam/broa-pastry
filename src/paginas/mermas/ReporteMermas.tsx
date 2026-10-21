import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Campo, Encabezado, EstadoVacio, Tarjeta } from '../../componentes/ui'
import { decimal, hoyIso, pesos, porcentaje } from '../../lib/formato'
import { calcularPeriodo, calcularRango, moverAncla, type TipoPeriodo } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

interface Reporte {
  ver_costos: boolean
  total: {
    registros: number
    unidades: number
    valor: number | null
    unidades_sin_costo: number | null
    valor_evitable: number | null
    unidades_evitables: number
  }
  por_motivo: { motivo: string; unidades: number; valor: number | null }[]
  por_producto: { producto_id: number; nombre: string; unidades: number; valor: number | null; falta_costo: boolean | null }[]
}

function Lista({ filas, verCostos }: { filas: { clave: string; nombre: string; unidades: number; valor: number | null; nota?: string }[]; verCostos: boolean }) {
  const max = Math.max(...filas.map((f) => (verCostos ? f.valor ?? 0 : f.unidades)), 1)
  return (
    <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
      {filas.map((f) => {
        const medida = verCostos ? f.valor ?? 0 : f.unidades
        return (
          <li key={f.clave} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{f.nombre}</span>
              <span className="cifra shrink-0 font-semibold">{verCostos ? pesos(f.valor) : `${decimal(f.unidades)} un`}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie-2" aria-hidden>
              <div className="h-full rounded-full bg-grafico" style={{ width: `${(medida / max) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-suave">
              {decimal(f.unidades)} unidades{f.nota ? ` · ${f.nota}` : ''}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

export function ReporteMermas() {
  const { puede } = useSesion()
  const hoy = hoyIso()
  const [tipo, setTipo] = useState<TipoPeriodo>('semana')
  const [ancla, setAncla] = useState(hoy)
  const [rango, setRango] = useState({ desde: hoy, hasta: hoy })
  const [datos, setDatos] = useState<Reporte | null>(null)
  const [error, setError] = useState('')

  const periodo = useMemo(
    () => (tipo === 'rango' ? calcularRango(rango.desde, rango.hasta) : calcularPeriodo(tipo, ancla, hoy)),
    [tipo, ancla, rango, hoy],
  )

  useEffect(() => {
    let vivo = true
    supabase.rpc('reporte_mermas', { p_desde: periodo.desde, p_hasta: periodo.hasta }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setError(mensajeError(error))
      else {
        setError('')
        setDatos(data as Reporte)
      }
    })
    return () => {
      vivo = false
    }
  }, [periodo])

  const t = datos?.total
  const verCostos = datos?.ver_costos ?? false

  return (
    <>
      <Encabezado titulo="Reporte de mermas" volver="/mermas">
        {puede('editar_configuracion') && (
          <Link to="/mermas/motivos" className="text-sm font-semibold text-primario">
            Motivos
          </Link>
        )}
      </Encabezado>

      <div className="mb-3 flex gap-1 rounded-2xl bg-superficie-2 p-1">
        {(['dia', 'semana', 'mes', 'rango'] as TipoPeriodo[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={tipo === v}
            onClick={() => setTipo(v)}
            className={`min-h-10 flex-1 rounded-xl text-sm font-semibold ${tipo === v ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {{ dia: 'Día', semana: 'Semana', mes: 'Mes', rango: 'Rango' }[v]}
          </button>
        ))}
      </div>
      {tipo === 'rango' ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Campo etiqueta="Desde" type="date" value={rango.desde} max={hoy} onChange={(e) => e.target.value && setRango({ ...rango, desde: e.target.value })} />
          <Campo etiqueta="Hasta" type="date" value={rango.hasta} max={hoy} onChange={(e) => e.target.value && setRango({ ...rango, hasta: e.target.value })} />
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <button type="button" aria-label="Anterior" onClick={() => setAncla(moverAncla(tipo, ancla, -1))} className="h-11 w-11 rounded-full text-2xl text-primario">
            ‹
          </button>
          <p className="flex-1 text-center font-semibold">{periodo.etiqueta}</p>
          <button
            type="button"
            aria-label="Siguiente"
            disabled={periodo.hasta >= hoy}
            onClick={() => setAncla(moverAncla(tipo, ancla, 1))}
            className="h-11 w-11 rounded-full text-2xl text-primario disabled:opacity-25"
          >
            ›
          </button>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}

      {t && t.registros === 0 && (
        <EstadoVacio icono="🧺" titulo="Sin mermas en este período">
          Registra las mermas al final del día desde la pestaña Mermas.
        </EstadoVacio>
      )}

      {datos && t && t.registros > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <Tarjeta className="col-span-2">
              <p className="text-xs font-medium tracking-wide text-suave uppercase">{verCostos ? 'Costo de las mermas' : 'Unidades perdidas'}</p>
              <p className="cifra mt-1 text-4xl font-bold text-primario">{verCostos ? pesos(t.valor) : decimal(t.unidades)}</p>
              <p className="mt-1 text-xs text-suave">
                {decimal(t.unidades)} unidades en {t.registros} registros · se descuenta de la ganancia
              </p>
            </Tarjeta>
            <Tarjeta>
              <p className="text-xs font-medium tracking-wide text-suave uppercase">Evitables</p>
              <p className="cifra mt-1 text-2xl font-bold">{verCostos ? pesos(t.valor_evitable) : decimal(t.unidades_evitables)}</p>
              <p className="mt-1 text-xs text-suave">
                {verCostos && t.valor
                  ? `${porcentaje((t.valor_evitable ?? 0) / t.valor, 0)} del total`
                  : `${porcentaje(t.unidades_evitables / t.unidades, 0)} de las unidades`}
              </p>
            </Tarjeta>
            <Tarjeta>
              <p className="text-xs font-medium tracking-wide text-suave uppercase">No evitables</p>
              <p className="cifra mt-1 text-2xl font-bold">
                {verCostos ? pesos((t.valor ?? 0) - (t.valor_evitable ?? 0)) : decimal(t.unidades - t.unidades_evitables)}
              </p>
            </Tarjeta>
          </div>

          {verCostos && (t.unidades_sin_costo ?? 0) > 0 && (
            <Aviso tipo="info">
              {decimal(t.unidades_sin_costo)} unidades son de productos sin costo definido y no están valorizadas.{' '}
              <Link to="/productos" className="font-semibold text-primario">
                Completar costos
              </Link>
            </Aviso>
          )}

          <section>
            <h2 className="mb-2 text-lg font-semibold">Por motivo</h2>
            <Lista verCostos={verCostos} filas={datos.por_motivo.map((m) => ({ clave: m.motivo, nombre: m.motivo, unidades: m.unidades, valor: m.valor }))} />
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Por producto</h2>
            <Lista
              verCostos={verCostos}
              filas={datos.por_producto
                .slice()
                .sort((a, b) => (verCostos ? (b.valor ?? 0) - (a.valor ?? 0) : b.unidades - a.unidades))
                .map((p) => ({
                  clave: String(p.producto_id),
                  nombre: p.nombre,
                  unidades: p.unidades,
                  valor: p.valor,
                  nota: p.falta_costo ? 'parte sin costo' : undefined,
                }))}
            />
          </section>
        </div>
      )}
    </>
  )
}
