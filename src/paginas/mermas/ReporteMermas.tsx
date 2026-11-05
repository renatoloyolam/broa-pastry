import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccionEnlace, Aviso, Campo, Encabezado, EstadoVacio, Tarjeta } from '../../componentes/ui'
import { decimal, hoyIso, pesos, porcentaje } from '../../lib/formato'
import { calcularPeriodo, calcularRango, moverAncla, type TipoPeriodo } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { ICONOS } from '../../componentes/iconos'
import { NOMBRE_ETAPA, textoCantidad, type EtapaProceso } from '../../lib/mermasProceso'
import type { Unidad } from '../../lib/costeo'

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
  perdida: { insumos: number; mano_obra: number } | null
  proceso: {
    registros: number
    registros_evitables: number
    por_valorizar: number | null
    valor: number | null
    valor_evitable: number | null
    por_etapa: { etapa: EtapaProceso; registros: number; valor: number | null }[]
    por_motivo: { motivo: string; registros: number; valor: number | null }[]
    por_item: {
      etapa: EtapaProceso
      nombre: string
      unidad: Unidad | null
      registros: number
      cantidad: number | null
      valor: number | null
      falta_valor: boolean | null
      estimado: boolean | null
    }[]
  }
}

const veces = (n: number) => `${n} ${n === 1 ? 'vez' : 'veces'}`

/** Producción y materia prima se miden distinto (kg, tandas): sin barras de unidades. */
function ListaProceso({ filas, verCostos }: { filas: { clave: string; nombre: string; valor: number | null; detalle: string; pendiente?: boolean }[]; verCostos: boolean }) {
  return (
    <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
      {filas.map((f) => (
        <li key={f.clave} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{f.nombre}</span>
            {verCostos && <span className="cifra shrink-0 font-semibold">{pesos(f.valor)}</span>}
          </div>
          <p className="mt-0.5 text-xs text-suave">
            {f.detalle}
            {f.pendiente && <span className="text-aviso"> · falta valorizar</span>}
          </p>
        </li>
      ))}
    </ul>
  )
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
  const p = datos?.proceso
  const hayProducto = (t?.registros ?? 0) > 0
  const hayProceso = (p?.registros ?? 0) > 0
  const valorTotal = (t?.valor ?? 0) + (p?.valor ?? 0)
  const valorEvitable = (t?.valor_evitable ?? 0) + (p?.valor_evitable ?? 0)
  const registrosTotal = (t?.registros ?? 0) + (p?.registros ?? 0)

  return (
    <>
      <Encabezado titulo="Reporte de mermas" volver="/mermas">
        {puede('editar_configuracion') && (
          <AccionEnlace a="/mermas/motivos" icono={ICONOS.motivos}>
            Motivos
          </AccionEnlace>
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
            <ICONOS.anterior className="mx-auto block h-6 w-6" aria-hidden />
          </button>
          <p className="flex-1 text-center font-semibold">{periodo.etiqueta}</p>
          <button
            type="button"
            aria-label="Siguiente"
            disabled={periodo.hasta >= hoy}
            onClick={() => setAncla(moverAncla(tipo, ancla, 1))}
            className="h-11 w-11 rounded-full text-2xl text-primario disabled:opacity-25"
          >
            <ICONOS.siguiente className="mx-auto block h-6 w-6" aria-hidden />
          </button>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}

      {t && p && registrosTotal === 0 && (
        <EstadoVacio icono={ICONOS.mermas} titulo="Sin mermas en este período">
          Regístralas desde la pestaña Mermas, también las de producción y materia prima.
        </EstadoVacio>
      )}

      {datos && t && p && registrosTotal > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <Tarjeta className="col-span-2">
              <p className="text-xs font-medium tracking-wide text-suave uppercase">{verCostos ? 'Costo de las mermas' : 'Mermas registradas'}</p>
              <p className="cifra mt-1 text-4xl font-bold text-primario">{verCostos ? pesos(valorTotal) : registrosTotal}</p>
              <p className="mt-1 text-xs text-suave">
                {verCostos ? `${registrosTotal} ${registrosTotal === 1 ? 'registro' : 'registros'} · se descuenta de la ganancia` : `${decimal(t.unidades)} unidades de producto terminado · ${p.registros} en producción y materia prima`}
              </p>
            </Tarjeta>
            {verCostos && datos.perdida && (
              <>
                <Tarjeta>
                  <p className="text-xs font-medium tracking-wide text-suave uppercase">Ingredientes perdidos</p>
                  <p className="cifra mt-1 text-2xl font-bold">{pesos(datos.perdida.insumos)}</p>
                </Tarjeta>
                <Tarjeta>
                  <p className="text-xs font-medium tracking-wide text-suave uppercase">Mano de obra perdida</p>
                  <p className="cifra mt-1 text-2xl font-bold">{pesos(datos.perdida.mano_obra)}</p>
                </Tarjeta>
                <p className="col-span-2 -mt-1 text-xs text-suave">
                  Finanzas resta solo los ingredientes: los sueldos ya están en Gastos.
                </p>
              </>
            )}
            {(verCostos || hayProducto) && (
              <>
                <Tarjeta>
                  <p className="text-xs font-medium tracking-wide text-suave uppercase">Evitables</p>
                  <p className="cifra mt-1 text-2xl font-bold">{verCostos ? pesos(valorEvitable) : decimal(t.unidades_evitables)}</p>
                  <p className="mt-1 text-xs text-suave">
                    {verCostos
                      ? valorTotal > 0
                        ? `${porcentaje(valorEvitable / valorTotal, 0)} del total`
                        : ''
                      : `${porcentaje(t.unidades_evitables / t.unidades, 0)} de las unidades`}
                  </p>
                </Tarjeta>
                <Tarjeta>
                  <p className="text-xs font-medium tracking-wide text-suave uppercase">No evitables</p>
                  <p className="cifra mt-1 text-2xl font-bold">
                    {verCostos ? pesos(valorTotal - valorEvitable) : decimal(t.unidades - t.unidades_evitables)}
                  </p>
                </Tarjeta>
              </>
            )}
          </div>

          {verCostos && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">¿Dónde se perdió?</h2>
              <ListaProceso
                verCostos
                filas={[
                  ...(hayProducto ? [{ clave: 'producto', nombre: NOMBRE_ETAPA.producto, valor: t.valor, detalle: `${decimal(t.unidades)} unidades` }] : []),
                  ...p.por_etapa.map((e) => ({ clave: e.etapa, nombre: NOMBRE_ETAPA[e.etapa], valor: e.valor, detalle: veces(e.registros) })),
                ]}
              />
            </section>
          )}

          {verCostos && (p.por_valorizar ?? 0) > 0 && (
            <Aviso tipo="info">
              {p.por_valorizar === 1 ? '1 merma espera' : `${p.por_valorizar} mermas esperan`} un monto y aún no suma aquí.{' '}
              <Link to="/mermas" className="font-semibold text-primario">
                Ponerle monto
              </Link>
            </Aviso>
          )}

          {verCostos && (t.unidades_sin_costo ?? 0) > 0 && (
            <Aviso tipo="info">
              {decimal(t.unidades_sin_costo)} unidades son de productos sin costo definido y no están valorizadas.{' '}
              <Link to="/productos" className="font-semibold text-primario">
                Completar costos
              </Link>
            </Aviso>
          )}

          {hayProducto && (
          <>
          <section>
            <h2 className="mb-2 text-lg font-semibold">Producto terminado: por motivo</h2>
            <Lista verCostos={verCostos} filas={datos.por_motivo.map((m) => ({ clave: m.motivo, nombre: m.motivo, unidades: m.unidades, valor: m.valor }))} />
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Producto terminado: por producto</h2>
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
          </>
          )}

          {hayProceso && (
            <>
              <section>
                <h2 className="mb-2 text-lg font-semibold">Producción y materia prima: lo más perdido</h2>
                <ListaProceso
                  verCostos={verCostos}
                  filas={p.por_item.map((i) => ({
                    clave: `${i.etapa}-${i.nombre}-${i.unidad}`,
                    nombre: i.nombre,
                    valor: i.valor,
                    pendiente: !!i.falta_valor,
                    detalle: [NOMBRE_ETAPA[i.etapa], textoCantidad(i.cantidad, i.unidad), veces(i.registros), i.estimado ? 'estimado' : ''].filter(Boolean).join(' · '),
                  }))}
                />
              </section>
              <section>
                <h2 className="mb-2 text-lg font-semibold">Producción y materia prima: por motivo</h2>
                <ListaProceso
                  verCostos={verCostos}
                  filas={p.por_motivo.map((m) => ({ clave: m.motivo, nombre: m.motivo, valor: m.valor, detalle: veces(m.registros) }))}
                />
              </section>
            </>
          )}
        </div>
      )}
    </>
  )
}
