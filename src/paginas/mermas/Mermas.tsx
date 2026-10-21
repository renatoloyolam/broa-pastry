import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Boton, Campo, Encabezado, Insignia } from '../../componentes/ui'
import { decimal, fechaDia, hoyIso, leerNumero, numero, pesos } from '../../lib/formato'
import { normalizar } from '../../lib/importador'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

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

/** Botón tipo "chip" grande, fácil de tocar con el pulgar. */
function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
        activo ? 'border-primario bg-primario text-primario-texto' : 'border-borde bg-superficie text-texto active:bg-superficie-2'
      }`}
    >
      {children}
    </button>
  )
}

export function Mermas() {
  const { puede } = useSesion()
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
    const { data, error } = await supabase.rpc('mermas_del_dia', { p_fecha: fecha })
    if (error) setError(mensajeError(error))
    else setLista(data as MermaDia[])
  }, [fecha])

  useEffect(() => {
    void cargarLista()
  }, [cargarLista])

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

  async function guardar() {
    setError('')
    setOk('')
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
    if (!confirm(`¿Borrar ${decimal(m.cantidad)} × ${m.producto}?`)) return
    const { error } = await supabase.from('mermas').delete().eq('id', m.id)
    if (error) return setError(mensajeError(error))
    await cargarLista()
  }

  const totalValor = lista.reduce((s, m) => s + (m.valor ?? 0), 0)

  return (
    <>
      <Encabezado titulo="Mermas">
        <Link to="/mermas/reporte" className="text-sm font-semibold text-primario">
          Reporte
        </Link>
      </Encabezado>

      <section className="space-y-5 rounded-2xl border border-borde bg-superficie p-4">
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
        <Boton onClick={guardar} cargando={guardando} className="min-h-14 text-lg">
          Guardar merma
        </Boton>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            {fecha === hoy ? 'Registradas hoy' : `Registradas el ${fechaDia(fecha)}`}
          </h2>
          {puede('ver_costos') && lista.length > 0 && <span className="cifra font-semibold">{pesos(totalValor)}</span>}
        </div>
        {lista.length === 0 ? (
          <p className="text-sm text-suave">Todavía no hay mermas para este día.</p>
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
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
        {lista.length > 0 && (
          <p className="mt-2 text-xs text-suave">{numero(lista.length)} registros. Toca × para borrar uno anotado por error.</p>
        )}
      </section>
    </>
  )
}
