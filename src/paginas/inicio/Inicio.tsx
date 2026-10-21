import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GraficoDias } from '../../componentes/GraficoDias'
import { Aviso, Boton, Campo, EstadoVacio, Tarjeta } from '../../componentes/ui'
import { fechaDia, hoyIso, numero, pesos, porcentaje } from '../../lib/formato'
import {
  ganancia,
  margen,
  rankingRentabilidad,
  ticketPromedio,
  variacion,
  type DatosPanel,
  type ProductoPanel,
} from '../../lib/panel'
import { calcularPeriodo, calcularRango, moverAncla, type Periodo, type TipoPeriodo } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

const TIPOS: { valor: TipoPeriodo; texto: string }[] = [
  { valor: 'dia', texto: 'Día' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
  { valor: 'rango', texto: 'Rango' },
]

/** "▲ 12%" contra el período anterior (con símbolo y texto, no solo color). */
function Cambio({ actual, anterior, invertir = false }: { actual: number | null; anterior: number | null | undefined; invertir?: boolean }) {
  const v = variacion(actual, anterior)
  if (v == null) return null
  const sube = v > 0.0005
  const baja = v < -0.0005
  const bueno = invertir ? baja : sube
  const malo = invertir ? sube : baja
  return (
    <span className={`cifra text-xs font-semibold ${bueno ? 'text-exito' : malo ? 'text-peligro' : 'text-suave'}`}>
      {sube ? '▲' : baja ? '▼' : '='} {porcentaje(Math.abs(v), 0)}
    </span>
  )
}

function Indicador({
  titulo,
  valor,
  detalle,
  cambio,
  destacado = false,
}: {
  titulo: string
  valor: string
  detalle?: ReactNode
  cambio?: ReactNode
  destacado?: boolean
}) {
  return (
    <Tarjeta className={destacado ? 'col-span-2 border-primario/30' : ''}>
      <p className="text-xs font-medium tracking-wide text-suave uppercase">{titulo}</p>
      <p className={`cifra mt-1 leading-tight font-bold ${destacado ? 'text-4xl text-primario' : 'text-2xl'}`}>{valor}</p>
      {(detalle || cambio) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-suave">
          {cambio}
          {detalle}
        </p>
      )}
    </Tarjeta>
  )
}

function Seccion({ titulo, children, ayuda }: { titulo: string; children: ReactNode; ayuda?: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {ayuda && <p className="mb-2 text-sm text-suave">{ayuda}</p>}
      <div className={ayuda ? '' : 'mt-2'}>{children}</div>
    </section>
  )
}

function FilaProducto({ p, verCostos, periodo }: { p: ProductoPanel; verCostos: boolean; periodo: Periodo }) {
  const [abierto, setAbierto] = useState(false)
  const [opciones, setOpciones] = useState<{ id: number; nombre: string; veces: number }[] | null>(null)
  const m = margen(p)

  async function abrir() {
    setAbierto(!abierto)
    if (opciones == null) {
      const { data } = await supabase.rpc('detalle_producto', { p_producto: p.producto_id, p_desde: periodo.desde, p_hasta: periodo.hasta })
      setOpciones((data as { opciones: { id: number; nombre: string; veces: number }[] })?.opciones ?? [])
    }
  }

  return (
    <li>
      <button type="button" onClick={abrir} aria-expanded={abierto} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-superficie-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.nombre}</span>
          <span className="block text-xs text-suave">
            {numero(p.unidades)} vendidos · {pesos(p.ventas)}
          </span>
        </span>
        {verCostos && (
          <span className="shrink-0 text-right text-sm">
            {p.unidades_sin_costo && p.unidades_sin_costo > 0 ? (
              <span className="text-xs text-aviso">sin costo</span>
            ) : (
              <>
                <span className="cifra block font-semibold">{pesos(ganancia(p))}</span>
                <span className={`cifra block text-xs ${m != null && m < 0.3 ? 'text-peligro' : 'text-suave'}`}>
                  margen {porcentaje(m, 0)}
                </span>
              </>
            )}
          </span>
        )}
      </button>
      {abierto && (
        <div className="border-t border-borde bg-fondo/60 px-4 py-3 text-sm">
          {opciones == null ? (
            <p className="text-suave">Cargando…</p>
          ) : opciones.length === 0 ? (
            <p className="text-suave">Este producto se vendió sin opciones.</p>
          ) : (
            <ul className="space-y-1">
              {opciones.map((o) => (
                <li key={o.id} className="flex justify-between gap-2">
                  <span>{o.nombre}</span>
                  <span className="cifra text-suave">{numero(o.veces)}</span>
                </li>
              ))}
            </ul>
          )}
          {verCostos && (
            <Link to={`/productos/p/${p.producto_id}`} className="mt-2 inline-block font-semibold text-primario">
              Ver costos del producto
            </Link>
          )}
        </div>
      )}
    </li>
  )
}

export function Inicio() {
  const { info } = useSesion()
  const hoy = hoyIso()
  const [tipo, setTipo] = useState<TipoPeriodo>('dia')
  const [ancla, setAncla] = useState(hoy)
  const [rango, setRango] = useState({ desde: hoy, hasta: hoy })
  const [datos, setDatos] = useState<DatosPanel | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [verTodos, setVerTodos] = useState(false)

  const periodo = useMemo(
    () => (tipo === 'rango' ? calcularRango(rango.desde, rango.hasta) : calcularPeriodo(tipo, ancla, hoy)),
    [tipo, ancla, rango, hoy],
  )

  useEffect(() => {
    let vivo = true
    setCargando(true)
    supabase
      .rpc('panel', { p_desde: periodo.desde, p_hasta: periodo.hasta, p_desde_ant: periodo.desdeAnt, p_hasta_ant: periodo.hastaAnt })
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) setError(mensajeError(error))
        else {
          setError('')
          setDatos(data as DatosPanel)
        }
        setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [periodo])

  const primerNombre = info?.perfil?.nombre.split(' ')[0]
  const r = datos?.resumen
  const ant = datos?.anterior
  const verCostos = datos?.ver_costos ?? false
  const sinVentas = r != null && r.transacciones === 0 && r.abonos === 0
  const g = r ? ganancia(r) : null
  const m = r ? margen(r) : null
  const gAnt = ant ? ganancia(ant) : null
  const masVendido = datos?.productos[0]
  const ranking = datos ? rankingRentabilidad(datos.productos) : null
  const puedeAvanzar = periodo.hasta < hoy

  function irAlUltimoDia() {
    if (!datos?.ultimo_dia) return
    setTipo('dia')
    setAncla(datos.ultimo_dia)
  }

  return (
    <>
      <header className="mb-4">
        <p className="text-sm text-suave">Hola, {primerNombre}</p>
        <h1 className="font-serif text-3xl font-bold tracking-tight">Resultados</h1>
      </header>

      {/* Selector de período */}
      <div className="mb-3 flex gap-1 rounded-2xl bg-superficie-2 p-1" role="tablist" aria-label="Período">
        {TIPOS.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="tab"
            aria-selected={tipo === t.valor}
            onClick={() => {
              setTipo(t.valor)
              if (t.valor !== 'rango') setAncla(tipo === 'rango' ? hoy : ancla)
              if (t.valor === 'rango') setRango({ desde: periodo.desde, hasta: periodo.hasta })
            }}
            className={`min-h-10 flex-1 rounded-xl text-sm font-semibold ${
              tipo === t.valor ? 'bg-superficie text-primario shadow-sm' : 'text-suave'
            }`}
          >
            {t.texto}
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
          <button
            type="button"
            aria-label="Período anterior"
            onClick={() => setAncla(moverAncla(tipo, ancla, -1))}
            className="h-11 w-11 rounded-full text-2xl text-primario active:bg-superficie-2"
          >
            ‹
          </button>
          <p className="flex-1 text-center font-semibold">{periodo.etiqueta}</p>
          <button
            type="button"
            aria-label="Período siguiente"
            disabled={!puedeAvanzar}
            onClick={() => setAncla(moverAncla(tipo, ancla, 1))}
            className="h-11 w-11 rounded-full text-2xl text-primario active:bg-superficie-2 disabled:opacity-25"
          >
            ›
          </button>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}
      {cargando && !datos && <p className="py-10 text-center text-suave">Cargando…</p>}

      {r && sinVentas && (
        <div className={cargando ? 'opacity-50' : ''}>
          <EstadoVacio icono="🥐" titulo="No hay ventas importadas en este período">
            {datos?.ultimo_dia ? (
              <>
                <p>Último día con ventas: {fechaDia(datos.ultimo_dia)}.</p>
                <div className="mt-4 space-y-2">
                  <Boton onClick={irAlUltimoDia}>Ver el {fechaDia(datos.ultimo_dia)}</Boton>
                  <Link to="/ventas" className="block font-semibold text-primario">
                    Importar ventas nuevas
                  </Link>
                </div>
              </>
            ) : (
              <p>
                Sube el Excel de influye.app en <Link to="/ventas" className="font-semibold text-primario">Ventas</Link>.
              </p>
            )}
          </EstadoVacio>
        </div>
      )}

      {r && !sinVentas && datos && (
        <div className={`transition-opacity ${cargando ? 'opacity-50' : ''}`}>
          {/* Indicadores principales */}
          <div className="grid grid-cols-2 gap-3">
            {verCostos ? (
              <>
                <Indicador
                  destacado
                  titulo="Ganancia"
                  valor={pesos(g)}
                  cambio={<Cambio actual={g} anterior={gAnt} />}
                  detalle={<>margen {porcentaje(m)} · sin IVA</>}
                />
                <Indicador titulo="Ventas" valor={pesos(r.ventas)} cambio={<Cambio actual={r.ventas} anterior={ant?.ventas} />} detalle="con IVA" />
                <Indicador titulo="Margen" valor={porcentaje(m)} detalle="sobre venta neta" />
                <Indicador titulo="Costo de lo vendido" valor={pesos(r.costo)} />
                <Indicador titulo="Mermas" valor={pesos(r.mermas)} detalle={r.mermas ? undefined : 'se registran en la Fase 5'} />
              </>
            ) : (
              <Indicador destacado titulo="Ventas" valor={pesos(r.ventas)} cambio={<Cambio actual={r.ventas} anterior={ant?.ventas} />} detalle="con IVA" />
            )}
            <Indicador
              titulo="Transacciones"
              valor={numero(r.transacciones)}
              cambio={<Cambio actual={r.transacciones} anterior={ant?.transacciones} />}
              detalle={<>ticket {pesos(ticketPromedio(r))}</>}
            />
            {masVendido && (
              <Indicador
                titulo="Más vendido"
                valor={masVendido.nombre}
                detalle={`${numero(masVendido.unidades)} unidades`}
              />
            )}
          </div>
          {ant && <p className="mt-2 text-xs text-suave">Las flechas comparan con {periodo.etiquetaAnt}.</p>}

          {verCostos && (r.ventas_sin_costo ?? 0) > 0 && (
            <div className="mt-4">
              <Aviso tipo="info">
                <p className="text-texto">
                  <b>{pesos(r.ventas_sin_costo)}</b> en ventas ({numero(r.unidades_sin_costo)} productos) no tienen costo
                  definido y <b>no están incluidas</b> en la ganancia ni en el margen.
                </p>
                <Link to="/productos" className="mt-1 inline-block font-semibold text-primario">
                  Completar costos →
                </Link>
              </Aviso>
            </div>
          )}
          {r.abonos > 0 && (
            <p className="mt-3 text-sm text-suave">
              Abonos de tortas recibidos en caja: <b className="cifra">{pesos(r.abonos)}</b> (no se cuentan como venta).
            </p>
          )}

          {/* Gráficos por día */}
          {datos.dias.length > 1 && (
            <Seccion titulo="Por día">
              <div className="space-y-3">
                <GraficoDias titulo="Ventas por día (con IVA)" puntos={datos.dias.map((d) => ({ fecha: d.fecha, valor: d.ventas }))} />
                {verCostos && (
                  <GraficoDias
                    titulo="Ganancia por día (sin IVA)"
                    puntos={datos.dias.map((d) => ({ fecha: d.fecha, valor: ganancia(d) }))}
                  />
                )}
              </div>
            </Seccion>
          )}

          {/* Ranking por cantidad */}
          <Seccion titulo="Más vendidos" ayuda="Toca un producto para ver sus sabores u opciones.">
            <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
              {datos.productos.slice(0, verTodos ? undefined : 10).map((p) => (
                <FilaProducto key={p.producto_id} p={p} verCostos={verCostos} periodo={periodo} />
              ))}
            </ul>
            {datos.productos.length > 10 && (
              <Boton variante="texto" onClick={() => setVerTodos(!verTodos)}>
                {verTodos ? 'Ver menos' : `Ver los ${datos.productos.length} productos`}
              </Boton>
            )}
          </Seccion>

          {/* Rentabilidad */}
          {verCostos && ranking && (
            <Seccion titulo="Rentabilidad" ayuda="Solo productos con costo completo y al menos 3 ventas.">
              {ranking.masRentables.length === 0 ? (
                <Aviso tipo="info">Cuando completes los costos de los productos verás aquí los más y menos rentables.</Aviso>
              ) : (
                <div className="grid gap-3">
                  <Tarjeta>
                    <p className="mb-2 text-sm font-semibold">Los que más ganancia dejan</p>
                    <ol className="space-y-1 text-sm">
                      {ranking.masRentables.map((p) => (
                        <li key={p.producto_id} className="flex justify-between gap-2">
                          <span className="truncate">{p.nombre}</span>
                          <span className="cifra shrink-0">
                            {pesos(p.ganancia)} <span className="text-suave">· {porcentaje(p.margen, 0)}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Tarjeta>
                  <Tarjeta>
                    <p className="mb-2 text-sm font-semibold">Los de menor margen</p>
                    <ol className="space-y-1 text-sm">
                      {ranking.menosRentables.map((p) => (
                        <li key={p.producto_id} className="flex justify-between gap-2">
                          <span className="truncate">{p.nombre}</span>
                          <span className={`cifra shrink-0 ${p.margen != null && p.margen < 0.3 ? 'text-peligro' : ''}`}>
                            {porcentaje(p.margen, 0)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </Tarjeta>
                </div>
              )}
            </Seccion>
          )}

          {/* Turnos */}
          {datos.turnos.length > 0 && (
            <Seccion titulo="Por turno" ayuda="AM: antes de la hora de corte; PM: después.">
              <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                {datos.turnos.map((t) => {
                  const gt = ganancia(t)
                  const variosVendedores = datos.turnos.filter((x) => x.turno === t.turno).length > 1
                  return (
                    <li key={t.turno + t.vendedor} className="flex min-h-14 items-center gap-3 px-4 py-2">
                      <span className="w-10 rounded-lg bg-superficie-2 py-1 text-center text-sm font-bold">{t.turno}</span>
                      <span className="min-w-0 flex-1">
                        {variosVendedores && <span className="block truncate text-sm font-medium">{t.vendedor}</span>}
                        <span className="block text-xs text-suave">
                          {numero(t.transacciones)} transacciones · {numero(t.unidades)} productos
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="cifra block font-semibold">{pesos(t.ventas)}</span>
                        {verCostos && gt != null && <span className="cifra block text-xs text-suave">gana {pesos(gt)}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </Seccion>
          )}

          {/* Categorías */}
          {datos.categorias.length > 0 && (
            <Seccion titulo="Por categoría">
              <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                {datos.categorias.map((c) => {
                  const total = datos.categorias.reduce((s, x) => s + x.ventas, 0) || 1
                  const mc = margen(c)
                  return (
                    <li key={c.categoria} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{c.categoria}</span>
                        <span className="cifra font-semibold">{pesos(c.ventas)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie-2" aria-hidden>
                        <div className="h-full rounded-full bg-grafico" style={{ width: `${(c.ventas / total) * 100}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-suave">
                        {porcentaje(c.ventas / total, 0)} de las ventas · {numero(c.unidades)} productos
                        {verCostos && mc != null && ` · margen ${porcentaje(mc, 0)} (de lo costeado)`}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </Seccion>
          )}
        </div>
      )}
    </>
  )
}
