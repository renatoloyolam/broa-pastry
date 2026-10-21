import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCatalogo } from '../../lib/catalogo'
import { costoReceta, UNIDADES, type ItemReceta, type Unidad } from '../../lib/costeo'
import { decimal, leerNumero, pesos } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Campo, Encabezado, EstadoVacio, Insignia, Interruptor, Pestanas, Selector, Tarjeta } from '../../componentes/ui'
import { PESTANAS_CATALOGO } from './Productos'

export function RecetasLista() {
  const { recetas, cargando, error } = useCatalogo()
  const { puede } = useSesion()
  const [busqueda, setBusqueda] = useState('')
  const filtradas = recetas.filter((r) => r.nombre.toLowerCase().includes(busqueda.toLowerCase().trim()))

  return (
    <>
      <Encabezado titulo="Recetas" />
      <Pestanas opciones={PESTANAS_CATALOGO} />
      {error && <Aviso>{error}</Aviso>}
      {puede('editar_catalogo') && (
        <Link
          to="/productos/recetas/nueva"
          className="mb-3 flex min-h-12 items-center justify-center rounded-2xl bg-primario font-semibold text-primario-texto"
        >
          + Nueva receta
        </Link>
      )}
      {recetas.length > 5 && (
        <input
          type="search"
          placeholder="Buscar receta…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="mb-3 min-h-12 w-full rounded-xl border border-borde bg-superficie px-4"
        />
      )}
      {!cargando && recetas.length === 0 && (
        <EstadoVacio icono="📖" titulo="Aún no hay recetas">
          Crea una receta con sus ingredientes y cuánto rinde (ej.: 1 receta = 12 brownies). Para usar recetas, primero
          agrega los ingredientes con su precio en la pestaña Ingredientes.
        </EstadoVacio>
      )}
      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
        {filtradas.map((r) => (
          <li key={r.id}>
            <Link to={`/productos/recetas/${r.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-superficie-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {r.nombre} {r.es_base && <Insignia clase="bg-acento/20 text-primario">Base</Insignia>}
                </span>
                <span className="block text-xs text-suave">
                  Rinde {decimal(r.rendimiento)} {r.unidad_rendimiento}
                  {r.costo_total != null && ` · Total ${pesos(r.costo_total)}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {r.costo_unitario == null ? (
                  <Insignia clase="bg-aviso/15 text-aviso">Incompleta</Insignia>
                ) : (
                  <>
                    <span className="cifra block font-semibold">
                      {r.costo_unitario < 10 ? `$${decimal(r.costo_unitario, 2)}` : pesos(r.costo_unitario)}
                    </span>
                    <span className="block text-xs text-suave">por {r.unidad_rendimiento}</span>
                  </>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

interface ItemForm {
  tipo: 'ingrediente' | 'receta'
  refId: number | ''
  cantidad: string
  unidad: Unidad
}

export function RecetaEditor() {
  const { id } = useParams()
  const esNueva = id === 'nueva'
  const navegar = useNavigate()
  const { recetas, ingredientes, productos, opciones, costos, recargar, cargando } = useCatalogo()
  const { puede } = useSesion()
  const editable = puede('editar_catalogo')
  const receta = recetas.find((r) => r.id === Number(id))

  const [nombre, setNombre] = useState('')
  const [rendimiento, setRendimiento] = useState('')
  const [unidad, setUnidad] = useState<Unidad>('un')
  const [esBase, setEsBase] = useState(false)
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<ItemForm[]>([])
  const [adicionales, setAdicionales] = useState<{ concepto: string; monto: string }[]>([])
  const [listo, setListo] = useState(esNueva)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Cargar ítems y adicionales de la receta existente
  useEffect(() => {
    if (esNueva || !receta || listo) return
    let vivo = true
    Promise.all([
      supabase.from('receta_items').select('*').eq('receta_id', receta.id).order('orden'),
      supabase.from('receta_adicionales').select('*').eq('receta_id', receta.id).order('id'),
    ]).then(([its, ads]) => {
      if (!vivo) return
      setNombre(receta.nombre)
      setRendimiento(decimal(receta.rendimiento, 3))
      setUnidad(receta.unidad_rendimiento)
      setEsBase(receta.es_base)
      setNotas(receta.notas ?? '')
      setItems(
        (its.data ?? []).map((i) => ({
          tipo: i.ingrediente_id ? 'ingrediente' : 'receta',
          refId: i.ingrediente_id ?? i.subreceta_id,
          cantidad: decimal(Number(i.cantidad), 3),
          unidad: i.unidad,
        })),
      )
      setAdicionales((ads.data ?? []).map((a) => ({ concepto: a.concepto, monto: decimal(Number(a.monto_neto)) })))
      setListo(true)
    })
    return () => {
      vivo = false
    }
  }, [esNueva, receta, listo])

  const mapaIng = useMemo(() => new Map(ingredientes.map((i) => [i.id, i])), [ingredientes])
  const mapaSub = useMemo(
    () => new Map(recetas.map((r) => [r.id, { unidad_rendimiento: r.unidad_rendimiento, costo_unitario: r.costo_unitario }])),
    [recetas],
  )
  const itemsCalculo: ItemReceta[] = items.map((i) => ({
    ingrediente_id: i.tipo === 'ingrediente' && i.refId ? i.refId : null,
    subreceta_id: i.tipo === 'receta' && i.refId ? i.refId : null,
    cantidad: leerNumero(i.cantidad) ?? 0,
    unidad: i.unidad,
  }))
  const rend = leerNumero(rendimiento) ?? 0
  const calculo = costoReceta(
    itemsCalculo,
    adicionales.map((a) => ({ monto_neto: leerNumero(a.monto) ?? 0 })),
    rend,
    mapaIng,
    mapaSub,
  )

  // Dónde se usa esta receta
  const usos = useMemo(() => {
    if (!receta) return []
    const lista: string[] = []
    for (const c of costos.filter((x) => x.receta_id === receta.id)) {
      if (c.producto_id) lista.push(productos.find((p) => p.id === c.producto_id)?.nombre ?? '')
      if (c.opcion_id) {
        const o = opciones.find((x) => x.id === c.opcion_id)
        const p = productos.find((x) => x.id === o?.producto_id)
        lista.push(`${p?.nombre} · ${o?.nombre}`)
      }
    }
    return lista.filter(Boolean)
  }, [receta, costos, productos, opciones])

  const recetasBase = recetas.filter((r) => r.id !== receta?.id && (r.es_base || items.some((i) => i.tipo === 'receta' && i.refId === r.id)))

  async function guardar() {
    setError('')
    setOk('')
    if (!nombre.trim()) return setError('Escribe el nombre de la receta.')
    if (!(rend > 0)) return setError('Escribe cuánto rinde la receta.')
    if (items.some((i) => !i.refId || !((leerNumero(i.cantidad) ?? 0) > 0))) {
      return setError('Revisa los ingredientes: a cada uno le falta elegir o la cantidad.')
    }
    const conError = calculo.lineas.find((l) => l.error)
    if (conError) return setError(conError.error!)
    setGuardando(true)
    const { data, error } = await supabase.rpc('guardar_receta', {
      p_id: esNueva ? null : Number(id),
      p_nombre: nombre.trim(),
      p_rendimiento: rend,
      p_unidad_rendimiento: unidad,
      p_es_base: esBase,
      p_notas: notas,
      p_items: itemsCalculo.map((i) => ({
        ingrediente_id: i.ingrediente_id,
        subreceta_id: i.subreceta_id,
        cantidad: i.cantidad,
        unidad: i.unidad,
      })),
      p_adicionales: adicionales
        .filter((a) => a.concepto.trim())
        .map((a) => ({ concepto: a.concepto.trim(), monto_neto: leerNumero(a.monto) ?? 0 })),
    })
    setGuardando(false)
    if (error) return setError(error.code === '23505' ? 'Ya existe una receta con ese nombre.' : mensajeError(error))
    await recargar()
    if (esNueva) {
      navegar(`/productos/recetas/${data}`, { replace: true })
    } else {
      setOk(
        usos.length
          ? 'Receta guardada. Los costos de los productos que la usan se actualizaron desde hoy.'
          : 'Receta guardada.',
      )
    }
  }

  async function eliminar() {
    if (!receta || !confirm(`¿Eliminar la receta "${receta.nombre}"?`)) return
    const { error } = await supabase.from('recetas').delete().eq('id', receta.id)
    if (error) {
      return setError(
        error.code === '23503'
          ? 'No se puede eliminar: hay productos u otras recetas que la usan. Cámbialos primero.'
          : mensajeError(error),
      )
    }
    await recargar()
    navegar('/productos/recetas', { replace: true })
  }

  if (cargando || (!esNueva && !listo)) {
    if (!cargando && !receta) {
      return (
        <>
          <Encabezado titulo="Receta" volver="/productos/recetas" />
          <Aviso tipo="info">No encontramos esa receta.</Aviso>
        </>
      )
    }
    return null
  }

  const actualizarItem = (i: number, cambios: Partial<ItemForm>) =>
    setItems(items.map((x, j) => (j === i ? { ...x, ...cambios } : x)))

  return (
    <>
      <Encabezado titulo={esNueva ? 'Nueva receta' : 'Receta'} volver="/productos/recetas" />
      <div className="space-y-4 pb-24">
        <Tarjeta className="space-y-4">
          <Campo etiqueta="Nombre" value={nombre} disabled={!editable} onChange={(e) => setNombre(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta="Rinde"
              inputMode="decimal"
              placeholder="Ej.: 12"
              value={rendimiento}
              disabled={!editable}
              onChange={(e) => setRendimiento(e.target.value)}
            />
            <Selector etiqueta="Unidad" value={unidad} disabled={!editable} onChange={(e) => setUnidad(e.target.value as Unidad)}>
              {UNIDADES.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.texto}
                </option>
              ))}
            </Selector>
          </div>
          <Interruptor
            etiqueta="Receta base"
            ayuda="Una masa, relleno o crema que se usa dentro de otras recetas"
            activo={esBase}
            deshabilitado={!editable}
            onCambio={setEsBase}
          />
        </Tarjeta>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Ingredientes</h2>
          {ingredientes.length === 0 && (
            <Aviso tipo="info">Primero agrega ingredientes con su precio en la pestaña Ingredientes.</Aviso>
          )}
          <div className="space-y-2">
            {items.map((it, i) => {
              const linea = calculo.lineas[i]
              return (
                <Tarjeta key={i} className="space-y-2 p-3">
                  <div className="flex gap-2">
                    <Selector
                      aria-label="Tipo"
                      value={it.tipo}
                      disabled={!editable}
                      className="w-32 shrink-0"
                      onChange={(e) => actualizarItem(i, { tipo: e.target.value as ItemForm['tipo'], refId: '' })}
                    >
                      <option value="ingrediente">Ingrediente</option>
                      <option value="receta">Receta base</option>
                    </Selector>
                    <Selector
                      aria-label="Cuál"
                      value={it.refId}
                      disabled={!editable}
                      onChange={(e) => {
                        const ref = e.target.value ? Number(e.target.value) : ''
                        const ing = it.tipo === 'ingrediente' && ref ? mapaIng.get(ref) : null
                        const sub = it.tipo === 'receta' && ref ? mapaSub.get(ref) : null
                        // Sugerir una unidad compatible
                        const sugerida: Unidad | undefined = ing
                          ? ing.unidad_compra === 'kg' ? 'g' : ing.unidad_compra === 'l' ? 'ml' : ing.unidad_compra
                          : sub
                            ? sub.unidad_rendimiento === 'kg' ? 'g' : sub.unidad_rendimiento === 'l' ? 'ml' : sub.unidad_rendimiento
                            : undefined
                        actualizarItem(i, { refId: ref, ...(sugerida ? { unidad: sugerida } : {}) })
                      }}
                    >
                      <option value="">Elegir…</option>
                      {(it.tipo === 'ingrediente' ? ingredientes : recetasBase).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre}
                        </option>
                      ))}
                    </Selector>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Cantidad"
                      inputMode="decimal"
                      placeholder="Cantidad"
                      value={it.cantidad}
                      disabled={!editable}
                      onChange={(e) => actualizarItem(i, { cantidad: e.target.value })}
                      className="min-h-12 w-28 rounded-xl border border-borde bg-superficie px-3 text-right"
                    />
                    <Selector
                      aria-label="Unidad"
                      value={it.unidad}
                      disabled={!editable}
                      className="w-28"
                      onChange={(e) => actualizarItem(i, { unidad: e.target.value as Unidad })}
                    >
                      {UNIDADES.map((u) => (
                        <option key={u.valor} value={u.valor}>
                          {u.texto}
                        </option>
                      ))}
                    </Selector>
                    <span className="cifra flex-1 text-right font-semibold">
                      {linea?.costo != null ? pesos(linea.costo) : '—'}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        aria-label="Quitar ingrediente"
                        onClick={() => setItems(items.filter((_, j) => j !== i))}
                        className="h-12 w-10 shrink-0 rounded-xl text-xl text-suave active:bg-superficie-2"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {linea?.error && it.refId && <p className="text-xs text-aviso">{linea.error}</p>}
                </Tarjeta>
              )
            })}
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => setItems([...items, { tipo: 'ingrediente', refId: '', cantidad: '', unidad: 'g' }])}
              className="mt-2 min-h-11 text-sm font-semibold text-primario"
            >
              + Agregar ingrediente
            </button>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">Costos adicionales de la receta</h2>
          <p className="mb-2 text-sm text-suave">Por tanda completa: mano de obra, gas, moldes… (sin IVA)</p>
          <div className="space-y-2">
            {adicionales.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label="Concepto"
                  placeholder="Ej.: Mano de obra"
                  value={a.concepto}
                  disabled={!editable}
                  onChange={(e) => setAdicionales(adicionales.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))}
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-borde bg-superficie px-3"
                />
                <input
                  aria-label="Monto"
                  inputMode="decimal"
                  placeholder="$"
                  value={a.monto}
                  disabled={!editable}
                  onChange={(e) => setAdicionales(adicionales.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))}
                  className="min-h-12 w-28 rounded-xl border border-borde bg-superficie px-3 text-right"
                />
                {editable && (
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setAdicionales(adicionales.filter((_, j) => j !== i))}
                    className="h-12 w-10 shrink-0 rounded-xl text-xl text-suave active:bg-superficie-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {editable && (
            <button
              type="button"
              onClick={() => setAdicionales([...adicionales, { concepto: '', monto: '' }])}
              className="mt-2 min-h-11 text-sm font-semibold text-primario"
            >
              + Agregar costo adicional
            </button>
          )}
        </section>

        <Campo etiqueta="Notas (opcional)" value={notas} disabled={!editable} onChange={(e) => setNotas(e.target.value)} />

        {usos.length > 0 && (
          <Aviso tipo="info">
            <b>Se usa en:</b> {usos.join(', ')}
          </Aviso>
        )}
        {error && <Aviso>{error}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        {editable && !esNueva && (
          <Boton variante="texto" onClick={eliminar}>
            Eliminar receta
          </Boton>
        )}
      </div>

      {/* Resumen fijo sobre la barra inferior */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-borde bg-superficie/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-suave">
              Total {calculo.total != null ? pesos(calculo.total) : '—'}
              {rend > 0 && ` · rinde ${decimal(rend)} ${unidad}`}
            </p>
            <p className="cifra text-xl font-bold">
              {calculo.unitario != null
                ? `${calculo.unitario < 10 ? '$' + decimal(calculo.unitario, 2) : pesos(calculo.unitario)} por ${unidad}`
                : 'Incompleta'}
            </p>
          </div>
          {editable && (
            <Boton className="!w-auto" onClick={guardar} cargando={guardando}>
              Guardar
            </Boton>
          )}
        </div>
      </div>
    </>
  )
}
