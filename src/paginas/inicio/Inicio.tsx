import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GraficoDias } from '../../componentes/GraficoDias'
import { PanelAlertas, useAlertas } from '../alertas/Alertas'
import { Aviso, Boton, EstadoVacio, Tarjeta } from '../../componentes/ui'
import { avisoUrgente, hayPedidosCercanos, type ResumenPedidos } from '../../lib/avisos'
import { calcularFinanzas, nombreMes, proximosPagos, type DatosFinanzas } from '../../lib/finanzas'
import { fechaDia, fechaLarga, horaSantiago, hoyIso, numero, pesos, porcentaje, saludo } from '../../lib/formato'
import {
  ganancia,
  margen,
  pesosCompacto,
  puntosLinea,
  rankingRentabilidad,
  ticketPromedio,
  variacion,
  type DatosPanel,
  type ProductoPanel,
} from '../../lib/panel'
import { calcularPeriodo, calcularRango, moverAncla, sumarDias, type Periodo, type TipoPeriodo } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion, type Permiso } from '../../sesion/SesionProvider'
import { ICONOS } from '../../componentes/iconos'

const TIPOS: { valor: TipoPeriodo; texto: string }[] = [
  { valor: 'dia', texto: 'Día' },
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
  { valor: 'rango', texto: 'Rango' },
]

// Funciones que no están en la barra de abajo. Los 3 primeros que la persona puede usar quedan
// a la vista; el resto, en "Ver todo".
const ACCESOS: { a: string; icono: LucideIcon; titulo: string; permiso: Permiso }[] = [
  { a: '/produccion', icono: ICONOS.produccion, titulo: 'Producción', permiso: 'ver_ventas' },
  { a: '/pedidos', icono: ICONOS.pedidos, titulo: 'Pedidos', permiso: 'gestionar_pedidos' },
  { a: '/finanzas', icono: ICONOS.finanzas, titulo: 'Finanzas', permiso: 'gestionar_finanzas' },
  { a: '/ventas/importar', icono: ICONOS.importar, titulo: 'Importar', permiso: 'importar_ventas' },
  { a: '/resumen', icono: ICONOS.resumen, titulo: 'Resumen', permiso: 'ver_ventas' },
  { a: '/comparar', icono: ICONOS.comparar, titulo: 'Comparar', permiso: 'ver_ventas' },
  { a: '/ventas/horarios', icono: ICONOS.horarios, titulo: 'Horarios', permiso: 'ver_ventas' },
  { a: '/productos/mapa', icono: ICONOS.mapa, titulo: 'Mapa', permiso: 'ver_costos' },
]

const ICONO_URGENTE = { pedidos: ICONOS.pedidos, pago: ICONOS.gastos, ventas: ICONOS.importar }

const CLASE_CIRCULO = 'mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-borde bg-superficie text-primario'

function AccesoRedondo({ a, icono: Icono, titulo }: { a: string; icono: LucideIcon; titulo: string }) {
  return (
    <Link to={a} className="block min-w-0 text-center text-xs font-medium">
      <span className={CLASE_CIRCULO}>
        <Icono className="h-5 w-5" aria-hidden />
      </span>
      {titulo}
    </Link>
  )
}

/** Cambio sobre el fondo oscuro de la tarjeta principal, con icono y no solo color. */
function CambioMarca({ actual, anterior }: { actual: number | null; anterior: number | null | undefined }) {
  const v = variacion(actual, anterior)
  if (v == null) return null
  const baja = v < -0.0005
  const Icono = baja ? ICONOS.baja : ICONOS.sube
  return (
    <span className={`cifra inline-flex items-center gap-1 text-sm font-semibold ${baja ? 'text-marca-baja' : 'text-marca-detalle'}`}>
      <Icono className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">{baja ? 'Baja' : 'Sube'} </span>
      {porcentaje(Math.abs(v), 0)}
    </span>
  )
}

function CifraChica({ titulo, valor, cambio }: { titulo: string; valor: string; cambio?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-borde bg-superficie p-3">
      <p className="text-xs text-suave">{titulo}</p>
      <p className="cifra truncate text-base font-bold">{valor}</p>
      {cambio && <p className="leading-none">{cambio}</p>}
    </div>
  )
}

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
}: {
  titulo: string
  valor: string
  detalle?: ReactNode
  cambio?: ReactNode
}) {
  return (
    <Tarjeta>
      <p className="text-xs font-medium tracking-wide text-suave uppercase">{titulo}</p>
      <p className="cifra mt-1 text-2xl leading-tight font-bold">{valor}</p>
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
  const { info, puede } = useSesion()
  const hoy = hoyIso()
  const puedeFinanzas = puede('gestionar_finanzas')
  const puedePedidos = puede('gestionar_pedidos')
  const avisos = useAlertas()
  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [ancla, setAncla] = useState(hoy)
  const [rango, setRango] = useState({ desde: hoy, hasta: hoy })
  const [datos, setDatos] = useState<DatosPanel | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [verTodos, setVerTodos] = useState(false)
  const [refresco, setRefresco] = useState(0)
  const [finanzas, setFinanzas] = useState<DatosFinanzas | null>(null)
  const [pedidos, setPedidos] = useState<ResumenPedidos | null>(null)
  const [verAlertas, setVerAlertas] = useState(false)
  const [verAccesos, setVerAccesos] = useState(false)
  const [verCifras, setVerCifras] = useState(false)

  // Al volver a la app (ej.: después de importar desde el computador) se actualizan las cifras
  useEffect(() => {
    const alVolver = () => document.visibilityState === 'visible' && setRefresco((n) => n + 1)
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

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
  }, [periodo, refresco])

  // Meta del mes en curso (el mes se prepara solo: copia los gastos fijos del anterior)
  useEffect(() => {
    if (!puedeFinanzas) return
    const mes = hoyIso()
    supabase
      .rpc('preparar_mes_gastos', { p_mes: mes })
      .then(() => supabase.rpc('finanzas_mes', { p_mes: mes }))
      .then(({ data }) => setFinanzas(data as DatosFinanzas | null))
  }, [puedeFinanzas, refresco])

  useEffect(() => {
    if (!puedePedidos) return
    supabase.rpc('resumen_pedidos').then(({ data }) => setPedidos(data as ResumenPedidos | null))
  }, [puedePedidos, refresco])

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
  const f = finanzas ? calcularFinanzas(finanzas) : null
  const pago = finanzas ? proximosPagos(finanzas.gastos, finanzas.mes, finanzas.hoy).find((p) => p.dias <= 5) ?? null : null
  const urgente = avisoUrgente({
    pedidos,
    pago,
    fechasSinVentas: avisos.fechasSinVentas,
    ayer: sumarDias(hoy, -1),
    puedeImportar: puede('importar_ventas'),
  })
  const cantidadAvisos = avisos.alertas.length + (avisos.pedirRespaldo ? 1 : 0) + (hayPedidosCercanos(pedidos) ? 1 : 0) + (pago ? 1 : 0)
  const accesos = ACCESOS.filter((x) => puede(x.permiso))
  const linea = datos ? puntosLinea(datos.dias.map((d) => (verCostos ? ganancia(d) ?? 0 : d.ventas)), 260, 36) : ''

  function irAlUltimoDia() {
    if (!datos?.ultimo_dia) return
    setTipo('dia')
    setAncla(datos.ultimo_dia)
  }

  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg leading-tight font-semibold">
            {saludo(horaSantiago())}, {primerNombre}
          </h1>
          <p className="text-sm text-suave">{fechaLarga(hoy)}</p>
        </div>
        <button
          type="button"
          onClick={() => setVerAlertas(!verAlertas)}
          aria-expanded={verAlertas}
          aria-label={cantidadAvisos === 1 ? '1 alerta' : `${cantidadAvisos} alertas`}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-borde bg-superficie text-primario active:bg-superficie-2"
        >
          <ICONOS.alertas className="h-5 w-5" aria-hidden />
          {cantidadAvisos > 0 && (
            <span className="cifra absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-peligro px-1 text-xs font-bold text-white" aria-hidden>
              {cantidadAvisos}
            </span>
          )}
        </button>
      </header>

      {verAlertas && <PanelAlertas {...avisos} pedidos={pedidos} pago={pago} />}

      {/* Tarjeta principal: lo que más importa, sin tener que bajar */}
      <section className="mb-3 rounded-3xl bg-marca p-4 text-marca-texto" aria-label="Resultados">
        <div className="mb-3 flex gap-1 rounded-xl bg-white/10 p-1" role="tablist" aria-label="Período">
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
              className={`min-h-9 flex-1 rounded-lg text-sm font-semibold ${tipo === t.valor ? 'bg-marca-texto text-marca' : 'text-marca-texto'}`}
            >
              {t.texto}
            </button>
          ))}
        </div>

        {tipo === 'rango' ? (
          <div className="mb-2 grid grid-cols-2 gap-2 text-xs text-marca-suave">
            <label className="block">
              Desde
              <input type="date" value={rango.desde} max={hoy} onChange={(e) => e.target.value && setRango({ ...rango, desde: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl bg-superficie px-2 text-sm text-texto" />
            </label>
            <label className="block">
              Hasta
              <input type="date" value={rango.hasta} max={hoy} onChange={(e) => e.target.value && setRango({ ...rango, hasta: e.target.value })} className="mt-1 min-h-11 w-full rounded-xl bg-superficie px-2 text-sm text-texto" />
            </label>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-sm text-marca-suave">
            {puede('ver_costos') ? 'Ganancia' : 'Ventas'} · {periodo.etiqueta}
          </p>
          {tipo !== 'rango' && (
            <>
              <button type="button" aria-label="Período anterior" onClick={() => setAncla(moverAncla(tipo, ancla, -1))} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full active:bg-white/10">
                <ICONOS.anterior className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" aria-label="Período siguiente" disabled={!puedeAvanzar} onClick={() => setAncla(moverAncla(tipo, ancla, 1))} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full active:bg-white/10 disabled:opacity-30">
                <ICONOS.siguiente className="h-5 w-5" aria-hidden />
              </button>
            </>
          )}
        </div>

        <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="cifra text-4xl leading-tight font-bold">{pesos(verCostos ? g : r?.ventas)}</span>
            {verCostos ? <CambioMarca actual={g} anterior={gAnt} /> : <CambioMarca actual={r?.ventas ?? null} anterior={ant?.ventas} />}
          </p>
          {linea && (
            <svg viewBox="0 0 260 36" preserveAspectRatio="none" className="mt-1 block h-9 w-full text-marca-detalle" role="img" aria-label={`${verCostos ? 'Ganancia' : 'Ventas'} día a día en el período`}>
              <polyline points={linea} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>

        {finanzas && f && (
          <Link to="/finanzas" className="mt-2 block rounded-lg active:opacity-80">
            <span className="mb-1.5 flex justify-between gap-2 text-sm">
              <span>Meta de {nombreMes(finanzas.mes).split(' ')[0]}</span>
              {f.meta != null ? (
                <span className="cifra">
                  {pesosCompacto(f.ventas)} de {pesosCompacto(f.meta)}
                </span>
              ) : (
                <span className="text-marca-suave">{finanzas.gastos.length === 0 ? 'Ingresa los gastos' : 'Sin ventas aún'}</span>
              )}
            </span>
            <span
              role="progressbar"
              aria-label="Avance hacia la meta del mes"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, f.avance ?? 0) * 100)}
              className="block h-2 overflow-hidden rounded-full bg-white/20"
            >
              <span className="block h-full rounded-full bg-marca-detalle transition-all" style={{ width: `${Math.min(1, f.avance ?? 0) * 100}%` }} />
            </span>
          </Link>
        )}
      </section>

      {urgente && (() => {
        const IconoUrgente = ICONO_URGENTE[urgente.clave]
        return (
          <Link to={urgente.a} className="mb-3 flex min-h-12 items-center gap-2 rounded-2xl border border-aviso/40 bg-superficie px-3 py-2 text-sm active:bg-superficie-2">
            <IconoUrgente className="h-5 w-5 shrink-0 text-aviso" aria-hidden />
            <span className="min-w-0 flex-1">{urgente.texto}</span>
            <span className="shrink-0 font-semibold text-primario">{urgente.accion}</span>
          </Link>
        )
      })()}

      <nav aria-label="Accesos rápidos" className="mb-4 grid grid-cols-4 gap-2">
        {accesos.slice(0, 3).map((x) => (
          <AccesoRedondo key={x.a} a={x.a} icono={x.icono} titulo={x.titulo} />
        ))}
        {accesos.length > 3 && (
          <button type="button" onClick={() => setVerAccesos(!verAccesos)} aria-expanded={verAccesos} className="block min-w-0 text-center text-xs font-medium">
            <span className={CLASE_CIRCULO}>
              {verAccesos ? <ICONOS.cancelar className="h-5 w-5" aria-hidden /> : <ICONOS.verTodo className="h-5 w-5" aria-hidden />}
            </span>
            {verAccesos ? 'Ver menos' : 'Ver todo'}
          </button>
        )}
        {verAccesos && accesos.slice(3).map((x) => <AccesoRedondo key={x.a} a={x.a} icono={x.icono} titulo={x.titulo} />)}
      </nav>

      {error && <Aviso>{error}</Aviso>}
      {cargando && !datos && <p className="py-10 text-center text-suave">Cargando…</p>}

      {r && sinVentas && (
        <div className={cargando ? 'opacity-50' : ''}>
          <EstadoVacio icono={ICONOS.ventas} titulo="No hay ventas importadas en este período">
            {datos?.ultimo_dia ? (
              <>
                <p>Último día con ventas: {fechaDia(datos.ultimo_dia)}.</p>
                <div className="mt-4 space-y-2">
                  <Boton icono={ICONOS.calendario} onClick={irAlUltimoDia}>Ver el {fechaDia(datos.ultimo_dia)}</Boton>
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
          {/* Cifras principales: 3 a la vista y el resto en "Ver más" */}
          <div className="grid grid-cols-3 gap-2">
            {verCostos ? (
              <>
                <CifraChica titulo="Ventas" valor={pesosCompacto(r.ventas)} cambio={<Cambio actual={r.ventas} anterior={ant?.ventas} />} />
                <CifraChica titulo="Margen" valor={porcentaje(m, 0)} />
              </>
            ) : (
              <>
                <CifraChica titulo="Ticket" valor={pesos(ticketPromedio(r))} />
                <CifraChica titulo="Productos" valor={numero(r.unidades)} />
              </>
            )}
            <CifraChica titulo="Clientes" valor={numero(r.transacciones)} cambio={<Cambio actual={r.transacciones} anterior={ant?.transacciones} />} />
          </div>
          <button
            type="button"
            onClick={() => setVerCifras(!verCifras)}
            aria-expanded={verCifras}
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primario"
          >
            {verCifras ? 'Ver menos' : 'Ver más cifras'}
            <ICONOS.expandir className={`h-4 w-4 transition-transform ${verCifras ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {verCifras && (
            <div className="mb-2 grid grid-cols-2 gap-3">
              {verCostos && (
                <>
                  <Indicador titulo="Ventas" valor={pesos(r.ventas)} detalle="con IVA" />
                  <Indicador titulo="Costo de lo vendido" valor={pesos(r.costo)} />
                  <Indicador
                    titulo="Mermas"
                    valor={pesos(r.mermas)}
                    cambio={<Cambio actual={r.mermas} anterior={ant?.mermas} invertir />}
                    detalle={
                      <Link to="/mermas/reporte" className="font-semibold text-primario">
                        ver detalle
                      </Link>
                    }
                  />
                  <Indicador titulo="Ticket promedio" valor={pesos(ticketPromedio(r))} />
                </>
              )}
              {masVendido && <Indicador titulo="Más vendido" valor={masVendido.nombre} detalle={`${numero(masVendido.unidades)} unidades`} />}
            </div>
          )}
          {ant && <p className="text-xs text-suave">Las flechas comparan con {periodo.etiquetaAnt}.</p>}

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
                    titulo="Ganancia por día (sin IVA, menos mermas)"
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
              <Boton icono={ICONOS.expandir} variante="texto" onClick={() => setVerTodos(!verTodos)}>
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
