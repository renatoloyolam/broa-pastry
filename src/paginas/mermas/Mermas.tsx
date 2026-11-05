import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccionEnlace, Aviso, Boton, Campo, Encabezado, Insignia } from '../../componentes/ui'
import { decimal, fechaDia, hoyIso, leerNumero, numero, pesos } from '../../lib/formato'
import { normalizar } from '../../lib/importador'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { useConfirmar } from '../../componentes/Confirmar'
import { ICONOS } from '../../componentes/iconos'
import { armarRegistro, FORM_VACIO, NOMBRE_ETAPA, type EtapaMerma, type FormProceso, type OpcionesProceso } from '../../lib/mermasProceso'
import { Chip, FilaProceso, PorValorizar, SeccionProceso, type MermaProcesoDia } from './MermaProceso'

const ETAPAS: { valor: EtapaMerma; icono: typeof ICONOS.mermas; texto: string }[] = [
  { valor: 'producto', icono: ICONOS.mermaProducto, texto: 'Producto terminado' },
  { valor: 'produccion', icono: ICONOS.mermaProduccion, texto: 'En producción' },
  { valor: 'materia_prima', icono: ICONOS.mermaMateriaPrima, texto: 'Materia prima' },
]

interface ProductoSimple {
  id: number
  nombre: string
}
interface OpcionSimple {
  id: number
  producto_id: number
  nombre: string
}
interface Motivo {
  id: number
  nombre: string
  evitable_sugerido: boolean
}
interface MermaDia {
  id: number
  producto: string
  opciones: string | null
  cantidad: number
  motivo: string
  evitable: boolean
  nota: string | null
  valor: number | null
  sin_costo: boolean | null
}

export function Mermas() {
  const { puede } = useSesion()
  const confirmar = useConfirmar()
  const hoy = hoyIso()
  const [productos, setProductos] = useState<ProductoSimple[]>([])
  const [opciones, setOpciones] = useState<OpcionSimple[]>([])
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [frecuentes, setFrecuentes] = useState<number[]>([])

  const [fecha, setFecha] = useState(hoy)
  const [busqueda, setBusqueda] = useState('')
  const [producto, setProducto] = useState<ProductoSimple | null>(null)
  const [opcion, setOpcion] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState('1')
  const [motivo, setMotivo] = useState<Motivo | null>(null)
  const [evitable, setEvitable] = useState<boolean | null>(null)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [lista, setLista] = useState<MermaDia[]>([])
  const [listaProceso, setListaProceso] = useState<MermaProcesoDia[]>([])
  const [etapa, setEtapa] = useState<EtapaMerma>('producto')
  const [form, setForm] = useState<FormProceso>(FORM_VACIO)
  const [opcionesProceso, setOpcionesProceso] = useState<OpcionesProceso | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('productos').select('id, nombre').eq('activo', true).eq('tipo', 'producto').order('nombre'),
      supabase.from('opciones').select('id, producto_id, nombre').eq('activa', true).order('nombre'),
      supabase.from('motivos_merma').select('id, nombre, evitable_sugerido').eq('activo', true).order('orden'),
      // Los más vendidos de la última semana, como accesos rápidos
      supabase.rpc('panel', { p_desde: sumarDias(hoy, -14), p_hasta: hoy, p_desde_ant: null, p_hasta_ant: null }),
    ]).then(([p, o, m, f]) => {
      if (p.error || o.error || m.error) return setError(mensajeError(p.error ?? o.error ?? m.error))
      setProductos(p.data ?? [])
      setOpciones(o.data ?? [])
      setMotivos(m.data ?? [])
      const top = ((f.data as { productos?: { producto_id: number }[] } | null)?.productos ?? []).slice(0, 8)
      setFrecuentes(top.map((x) => x.producto_id))
    })
  }, [hoy])

  const cargarLista = useCallback(async () => {
    const [d, m] = await Promise.all([
      supabase.rpc('mermas_del_dia', { p_fecha: fecha }),
      supabase.rpc('mermas_proceso_del_dia', { p_fecha: fecha }),
    ])
    if (d.error || m.error) return setError(mensajeError(d.error ?? m.error))
    setLista(d.data as MermaDia[])
    setListaProceso(m.data as MermaProcesoDia[])
  }, [fecha])

  useEffect(() => {
    void cargarLista()
  }, [cargarLista])

  // Recetas e ingredientes (sin precios) recién cuando se necesitan
  useEffect(() => {
    if (etapa === 'producto' || opcionesProceso) return
    supabase.rpc('opciones_merma_proceso').then(({ data, error }) => {
      if (error) setError(mensajeError(error))
      else setOpcionesProceso(data as OpcionesProceso)
    })
  }, [etapa, opcionesProceso])

  const resultados = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return []
    return productos.filter((p) => normalizar(p.nombre).includes(q)).slice(0, 8)
  }, [busqueda, productos])

  const opcionesProducto = producto ? opciones.filter((o) => o.producto_id === producto.id) : []
  const productosFrecuentes = frecuentes.map((id) => productos.find((p) => p.id === id)).filter(Boolean) as ProductoSimple[]
  const cant = leerNumero(cantidad) ?? 0

  function elegirProducto(p: ProductoSimple) {
    setProducto(p)
    setOpcion(null)
    setBusqueda('')
  }

  function elegirMotivo(m: Motivo) {
    setMotivo(m)
    setEvitable(m.evitable_sugerido)
  }

  function cambiarEtapa(e: EtapaMerma) {
    setEtapa(e)
    setForm(FORM_VACIO)
    setError('')
    setOk('')
  }

  async function guardarProceso(e: Exclude<EtapaMerma, 'producto'>) {
    const r = armarRegistro(e, form, { fecha, motivo: motivo?.id ?? null, evitable: evitable ?? motivo?.evitable_sugerido ?? false, nota })
    if ('error' in r) return setError(r.error)
    setGuardando(true)
    const { error } = await supabase.rpc('registrar_merma_proceso', { ...r.args })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setOk(`Guardado: ${form.item?.nombre ?? form.descripcion.trim()} (${NOMBRE_ETAPA[e].toLowerCase()})`)
    setForm(FORM_VACIO)
    setNota('')
    setVersion((v) => v + 1)
    await cargarLista()
  }

  async function borrarProceso(m: MermaProcesoDia) {
    if (!(await confirmar({ mensaje: `¿Borrar la merma de ${m.nombre}?`, accion: 'Borrar', peligro: true }))) return
    const { error } = await supabase.rpc('borrar_merma_proceso', { p_id: m.id })
    if (error) return setError(mensajeError(error))
    setVersion((v) => v + 1)
    await cargarLista()
  }

  async function guardar() {
    setError('')
    setOk('')
    if (etapa !== 'producto') return guardarProceso(etapa)
    if (!producto) return setError('Elige el producto.')
    if (!(cant > 0)) return setError('Escribe la cantidad.')
    if (!motivo) return setError('Elige el motivo.')
    setGuardando(true)
    const { error } = await supabase.from('mermas').insert({
      fecha,
      producto_id: producto.id,
      opcion_ids: opcion ? [opcion] : [],
      cantidad: cant,
      motivo_id: motivo.id,
      evitable: evitable ?? motivo.evitable_sugerido,
      nota: nota.trim() || null,
    })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    const nombreOp = opcion ? opciones.find((o) => o.id === opcion)?.nombre : null
    setOk(`Guardado: ${decimal(cant)} × ${producto.nombre}${nombreOp ? ` (${nombreOp})` : ''}`)
    // Se mantienen fecha y motivo para anotar la siguiente rápido
    setProducto(null)
    setOpcion(null)
    setCantidad('1')
    setNota('')
    await cargarLista()
  }

  async function borrar(m: MermaDia) {
    if (!(await confirmar({ mensaje: `¿Borrar la merma de ${decimal(m.cantidad)} × ${m.producto}?`, accion: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('mermas').delete().eq('id', m.id)
    if (error) return setError(mensajeError(error))
    await cargarLista()
  }

  const verCostos = puede('ver_costos')
  const totalValor = lista.reduce((s, m) => s + (m.valor ?? 0), 0) + listaProceso.reduce((s, m) => s + (m.valor ?? 0), 0)
  const registros = lista.length + listaProceso.length

  return (
    <>
      <Encabezado titulo="Mermas" />
      <nav aria-label="Más sobre mermas" className="mb-4 grid grid-cols-2 gap-2">
        <AccionEnlace a="/mermas/reporte" icono={ICONOS.reporte}>
          Reporte
        </AccionEnlace>
        <AccionEnlace a="/produccion" icono={ICONOS.produccion}>
          Producción
        </AccionEnlace>
      </nav>

      {verCostos && (
        <PorValorizar
          version={version}
          alCambiar={() => {
            void cargarLista()
          }}
        />
      )}

      <section className="space-y-5 rounded-2xl border border-borde bg-superficie p-4">
        {/* Dónde ocurrió */}
        <div>
          <p className="mb-2 text-sm font-medium text-suave">¿Dónde se perdió?</p>
          <div className="grid grid-cols-3 gap-2">
            {ETAPAS.map((e) => (
              <button
                key={e.valor}
                type="button"
                aria-pressed={etapa === e.valor}
                onClick={() => cambiarEtapa(e.valor)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center text-xs leading-tight font-medium ${
                  etapa === e.valor ? 'border-primario bg-primario text-primario-texto' : 'border-borde bg-superficie text-texto active:bg-superficie-2'
                }`}
              >
                <e.icono className="h-6 w-6 shrink-0" aria-hidden />
                {e.texto}
              </button>
            ))}
          </div>
        </div>

        {/* Fecha */}
        <div>
          <p className="mb-2 text-sm font-medium text-suave">¿Cuándo?</p>
          <div className="flex flex-wrap items-center gap-2">
            <Chip activo={fecha === hoy} onClick={() => setFecha(hoy)}>
              Hoy
            </Chip>
            <Chip activo={fecha === sumarDias(hoy, -1)} onClick={() => setFecha(sumarDias(hoy, -1))}>
              Ayer
            </Chip>
            <input
              type="date"
              aria-label="Otra fecha"
              value={fecha}
              max={hoy}
              onChange={(e) => e.target.value && setFecha(e.target.value)}
              className="min-h-11 rounded-full border border-borde bg-superficie px-3 text-sm"
            />
          </div>
        </div>

        {etapa !== 'producto' ? (
          <SeccionProceso key={etapa} etapa={etapa} opciones={opcionesProceso} form={form} onChange={setForm} />
        ) : (
          <>
        {/* Producto */}
        <div>
          <p className="mb-2 text-sm font-medium text-suave">¿Qué producto?</p>
          {producto ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-xl bg-superficie-2 px-4 py-3 font-semibold">{producto.nombre}</span>
              <button type="button" onClick={() => setProducto(null)} className="min-h-11 px-3 text-sm font-semibold text-primario">
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                placeholder="Buscar producto…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="mb-2 min-h-12 w-full rounded-xl border border-borde bg-superficie px-4"
              />
              {resultados.length > 0 && (
                <ul className="mb-2 divide-y divide-borde overflow-hidden rounded-xl border border-borde">
                  {resultados.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => elegirProducto(p)} className="min-h-12 w-full px-4 text-left active:bg-superficie-2">
                        {p.nombre}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {busqueda && resultados.length === 0 && <p className="mb-2 text-sm text-suave">No hay productos con ese nombre.</p>}
              {!busqueda && productosFrecuentes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {productosFrecuentes.map((p) => (
                    <Chip key={p.id} activo={false} onClick={() => elegirProducto(p)}>
                      {p.nombre}
                    </Chip>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Opción (sabor) */}
        {producto && opcionesProducto.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-suave">¿Qué sabor u opción? (opcional)</p>
            <div className="flex flex-wrap gap-2">
              {opcionesProducto.map((o) => (
                <Chip key={o.id} activo={opcion === o.id} onClick={() => setOpcion(opcion === o.id ? null : o.id)}>
                  {o.nombre}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Cantidad */}
        <div>
          <p className="mb-2 text-sm font-medium text-suave">¿Cuántos?</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Uno menos"
              onClick={() => setCantidad(decimal(Math.max(1, cant - 1)))}
              className="h-14 w-14 rounded-2xl border border-borde text-2xl font-bold active:bg-superficie-2"
            >
              −
            </button>
            <input
              aria-label="Cantidad"
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="cifra h-14 w-24 rounded-2xl border border-borde bg-superficie text-center text-2xl font-bold"
            />
            <button
              type="button"
              aria-label="Uno más"
              onClick={() => setCantidad(decimal(cant + 1))}
              className="h-14 w-14 rounded-2xl border border-borde text-2xl font-bold active:bg-superficie-2"
            >
              +
            </button>
          </div>
        </div>

          </>
        )}

        {/* Motivo */}
        <div>
          <p className="mb-2 text-sm font-medium text-suave">¿Por qué?</p>
          <div className="flex flex-wrap gap-2">
            {motivos.map((m) => (
              <Chip key={m.id} activo={motivo?.id === m.id} onClick={() => elegirMotivo(m)}>
                {m.nombre}
              </Chip>
            ))}
          </div>
        </div>

        {/* Evitable */}
        {motivo && (
          <div>
            <p className="mb-2 text-sm font-medium text-suave">¿Se podía evitar?</p>
            <div className="grid grid-cols-2 gap-2">
              <Chip activo={evitable === true} onClick={() => setEvitable(true)}>
                Sí, evitable
              </Chip>
              <Chip activo={evitable === false} onClick={() => setEvitable(false)}>
                No
              </Chip>
            </div>
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-sm text-suave">Agregar una nota (opcional)</summary>
          <div className="mt-2">
            <Campo etiqueta="Nota" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>
        </details>

        {error && <Aviso>{error}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <Boton icono={ICONOS.guardar} onClick={guardar} cargando={guardando} className="min-h-14 text-lg">
          Guardar merma
        </Boton>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            {fecha === hoy ? 'Registradas hoy' : `Registradas el ${fechaDia(fecha)}`}
          </h2>
          {verCostos && registros > 0 && <span className="cifra font-semibold">{pesos(totalValor)}</span>}
        </div>
        {registros === 0 ? (
          <p className="text-sm text-suave">Todavía no hay mermas para este día.</p>
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
            {listaProceso.map((m) => (
              <FilaProceso key={`p${m.id}`} m={m} verCostos={verCostos} onBorrar={() => borrarProceso(m)} />
            ))}
            {lista.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <span className="cifra w-10 text-center text-lg font-bold">{decimal(m.cantidad)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.producto}
                    {m.opciones && <span className="text-suave"> · {m.opciones}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-suave">
                    {m.motivo}
                    {m.evitable ? (
                      <Insignia clase="bg-aviso/15 text-aviso">evitable</Insignia>
                    ) : (
                      <Insignia clase="bg-superficie-2 text-suave">no evitable</Insignia>
                    )}
                  </span>
                </span>
                {puede('ver_costos') && (
                  <span className="cifra shrink-0 text-sm">
                    {m.sin_costo ? <span className="text-xs text-aviso">sin costo</span> : pesos(m.valor)}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Borrar ${m.producto}`}
                  onClick={() => borrar(m)}
                  className="h-11 w-9 shrink-0 rounded-xl text-xl text-suave active:bg-superficie-2"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {puede('ver_costos') && lista.some((m) => m.sin_costo) && (
          <p className="mt-2 text-xs text-suave">
            Las marcadas "sin costo" no se descuentan de la ganancia hasta que el producto tenga costo.
          </p>
        )}
        {registros > 0 && (
          <p className="mt-2 text-xs text-suave">{numero(registros)} registros. Toca × para borrar uno anotado por error.</p>
        )}
      </section>
    </>
  )
}
