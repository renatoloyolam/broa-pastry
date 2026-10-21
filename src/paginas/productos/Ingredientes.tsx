import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCatalogo } from '../../lib/catalogo'
import { nombreUnidadMayor, precioPorUnidadMayor, UNIDADES, type Unidad } from '../../lib/costeo'
import { decimal, fecha, fechaHora, leerNumero, pesos } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Campo, Encabezado, EstadoVacio, Pestanas, Selector, Tarjeta } from '../../componentes/ui'
import { PESTANAS_CATALOGO } from './Productos'

export function IngredientesLista() {
  const { ingredientes, cargando, error } = useCatalogo()
  const { puede } = useSesion()
  const [busqueda, setBusqueda] = useState('')
  const filtrados = ingredientes.filter((i) => i.nombre.toLowerCase().includes(busqueda.toLowerCase().trim()))

  return (
    <>
      <Encabezado titulo="Ingredientes" />
      <Pestanas opciones={PESTANAS_CATALOGO} />
      {error && <Aviso>{error}</Aviso>}
      {puede('editar_catalogo') && (
        <Link
          to="/productos/ingredientes/nuevo"
          className="mb-3 flex min-h-12 items-center justify-center rounded-2xl bg-primario font-semibold text-primario-texto"
        >
          + Nuevo ingrediente
        </Link>
      )}
      {ingredientes.length > 5 && (
        <input
          type="search"
          placeholder="Buscar ingrediente…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="mb-3 min-h-12 w-full rounded-xl border border-borde bg-superficie px-4"
        />
      )}
      {!cargando && ingredientes.length === 0 && (
        <EstadoVacio icono="🧈" titulo="Aún no hay ingredientes">
          Agrega cada ingrediente con lo que pagas por él (sin IVA). Ej.: Harina, 25 kg, $18.000. Cuando el precio
          cambie, lo actualizas aquí y todas las recetas se recalculan solas.
        </EstadoVacio>
      )}
      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
        {filtrados.map((i) => (
          <li key={i.id}>
            <Link to={`/productos/ingredientes/${i.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-superficie-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.nombre}</span>
                <span className="block text-xs text-suave">
                  {decimal(i.cantidad_compra)} {i.unidad_compra} a {pesos(i.precio_compra_neto)} · {fecha(i.actualizado_en)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="cifra block font-semibold">{pesos(precioPorUnidadMayor(i))}</span>
                <span className="block text-xs text-suave">por {nombreUnidadMayor(i.unidad_compra)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

interface Historial {
  id: number
  cantidad_compra: number
  unidad_compra: Unidad
  precio_compra_neto: number
  registrado_en: string
}

export function IngredienteEditor() {
  const { id } = useParams()
  const esNuevo = id === 'nuevo'
  const navegar = useNavigate()
  const { ingredientes, recetas, recargar, cargando } = useCatalogo()
  const { puede } = useSesion()
  const editable = puede('editar_catalogo')
  const ing = ingredientes.find((i) => i.id === Number(id))

  const [nombre, setNombre] = useState(ing?.nombre ?? '')
  const [cantidad, setCantidad] = useState(ing ? decimal(ing.cantidad_compra, 3) : '')
  const [unidad, setUnidad] = useState<Unidad>(ing?.unidad_compra ?? 'kg')
  const [precio, setPrecio] = useState(ing ? decimal(ing.precio_compra_neto) : '')
  const [conIva, setConIva] = useState('')
  const [historial, setHistorial] = useState<Historial[]>([])
  const [usos, setUsos] = useState<string[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!ing) return
    setNombre(ing.nombre)
    setCantidad(decimal(ing.cantidad_compra, 3))
    setUnidad(ing.unidad_compra)
    setPrecio(decimal(ing.precio_compra_neto))
  }, [ing])

  useEffect(() => {
    if (esNuevo || !id) return
    supabase
      .from('ingrediente_precios')
      .select('*')
      .eq('ingrediente_id', Number(id))
      .order('registrado_en', { ascending: false })
      .limit(10)
      .then(({ data }) => setHistorial((data ?? []) as Historial[]))
    supabase
      .from('receta_items')
      .select('receta_id')
      .eq('ingrediente_id', Number(id))
      .then(({ data }) => {
        const ids = new Set((data ?? []).map((x) => x.receta_id))
        setUsos(recetas.filter((r) => ids.has(r.id)).map((r) => r.nombre))
      })
  }, [esNuevo, id, recetas])

  const vista = useMemo(() => {
    const c = leerNumero(cantidad)
    const p = leerNumero(precio)
    if (!c || p == null) return null
    return precioPorUnidadMayor({ cantidad_compra: c, unidad_compra: unidad, precio_compra_neto: p })
  }, [cantidad, precio, unidad])

  async function guardar() {
    setError('')
    setOk('')
    const c = leerNumero(cantidad)
    const p = leerNumero(precio)
    if (!nombre.trim()) return setError('Escribe el nombre del ingrediente.')
    if (!(c && c > 0)) return setError('Escribe la cantidad que compras (ej.: 25 si es un saco de 25 kg).')
    if (p == null || p < 0) return setError('Escribe el precio sin IVA.')
    setGuardando(true)
    const fila = { nombre: nombre.trim(), cantidad_compra: c, unidad_compra: unidad, precio_compra_neto: p }
    const { data, error } = esNuevo
      ? await supabase.from('ingredientes').insert(fila).select('id').single()
      : await supabase.from('ingredientes').update(fila).eq('id', Number(id)).select('id').single()
    setGuardando(false)
    if (error) return setError(error.code === '23505' ? 'Ya existe un ingrediente con ese nombre.' : mensajeError(error))
    await recargar()
    if (esNuevo) navegar(`/productos/ingredientes/${data.id}`, { replace: true })
    else
      setOk(
        usos.length
          ? `Guardado. Se recalcularon ${usos.length} receta(s) y los costos de sus productos desde hoy.`
          : 'Guardado.',
      )
  }

  async function eliminar() {
    if (!ing || !confirm(`¿Eliminar "${ing.nombre}"?`)) return
    const { error } = await supabase.from('ingredientes').delete().eq('id', ing.id)
    if (error) {
      return setError(
        error.code === '23503' ? 'No se puede eliminar: hay recetas que lo usan. Quítalo de ellas primero.' : mensajeError(error),
      )
    }
    await recargar()
    navegar('/productos/ingredientes', { replace: true })
  }

  if (cargando) return null
  if (!esNuevo && !ing) {
    return (
      <>
        <Encabezado titulo="Ingrediente" volver="/productos/ingredientes" />
        <Aviso tipo="info">No encontramos ese ingrediente.</Aviso>
      </>
    )
  }

  return (
    <>
      <Encabezado titulo={esNuevo ? 'Nuevo ingrediente' : 'Ingrediente'} volver="/productos/ingredientes" />
      <div className="space-y-4">
        <Tarjeta className="space-y-4">
          <Campo etiqueta="Nombre" value={nombre} disabled={!editable} onChange={(e) => setNombre(e.target.value)} />
          <p className="text-sm font-medium text-suave">¿Cómo lo compras?</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta="Cantidad"
              inputMode="decimal"
              placeholder="Ej.: 25"
              value={cantidad}
              disabled={!editable}
              onChange={(e) => setCantidad(e.target.value)}
            />
            <Selector etiqueta="Unidad" value={unidad} disabled={!editable} onChange={(e) => setUnidad(e.target.value as Unidad)}>
              {UNIDADES.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.texto}
                </option>
              ))}
            </Selector>
          </div>
          <Campo
            etiqueta="Precio pagado, sin IVA"
            inputMode="decimal"
            placeholder="Ej.: 18.000"
            value={precio}
            disabled={!editable}
            onChange={(e) => {
              setPrecio(e.target.value)
              setConIva('')
            }}
          />
          {editable && (
            <Campo
              etiqueta="¿Solo tienes el precio con IVA? Escríbelo aquí"
              inputMode="decimal"
              placeholder="Ej.: 21.420"
              value={conIva}
              onChange={(e) => {
                setConIva(e.target.value)
                const v = leerNumero(e.target.value)
                setPrecio(v == null ? '' : decimal(Math.round((v / 1.19) * 100) / 100))
              }}
              ayuda="Lo convertimos a precio sin IVA automáticamente."
            />
          )}
          {vista != null && (
            <div className="flex items-baseline justify-between rounded-xl bg-superficie-2 px-4 py-3">
              <span className="text-sm text-suave">Precio por {nombreUnidadMayor(unidad)}</span>
              <span className="cifra text-xl font-bold">{pesos(vista)}</span>
            </div>
          )}
        </Tarjeta>

        {error && <Aviso>{error}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        {editable && (
          <Boton onClick={guardar} cargando={guardando}>
            Guardar
          </Boton>
        )}

        {usos.length > 0 && (
          <Aviso tipo="info">
            <b>Se usa en:</b> {usos.join(', ')}
          </Aviso>
        )}

        {historial.length > 1 && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">Historial de precios</h2>
            <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie text-sm">
              {historial.map((h) => (
                <li key={h.id} className="flex justify-between px-4 py-3">
                  <span className="text-suave">{fechaHora(h.registrado_en)}</span>
                  <span className="cifra">
                    {decimal(Number(h.cantidad_compra))} {h.unidad_compra} a {pesos(Number(h.precio_compra_neto))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {editable && !esNuevo && (
          <Boton variante="texto" onClick={eliminar}>
            Eliminar ingrediente
          </Boton>
        )}
      </div>
    </>
  )
}
