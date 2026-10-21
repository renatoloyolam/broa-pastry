import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { estadoCosto, TEXTO_ESTADO, useCatalogo, type Opcion, type Producto } from '../../lib/catalogo'
import { margenReferencia } from '../../lib/costeo'
import { leerNumero, pesos, porcentaje } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Campo, Encabezado, Insignia, Interruptor, Selector, Tarjeta } from '../../componentes/ui'
import { EditorCosto } from './EditorCosto'
import { useConfirmar } from '../../componentes/Confirmar'

function DatosProducto({ p }: { p: Producto }) {
  const { categorias, recargar } = useCatalogo()
  const { puede } = useSesion()
  const editable = puede('editar_catalogo')
  const [form, setForm] = useState({
    nombre: p.nombre,
    categoria_id: p.categoria_id ?? '',
    tipo: p.tipo,
    precio: p.precio_referencia?.toString() ?? '',
    activo: p.activo,
  })
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  async function guardar() {
    setEstado(null)
    const precio = form.precio.trim() ? leerNumero(form.precio) : null
    if (form.precio.trim() && (precio == null || precio < 0)) return setEstado({ tipo: 'error', texto: 'Revisa el precio.' })
    const { error } = await supabase
      .from('productos')
      .update({
        nombre: form.nombre.trim(),
        categoria_id: form.categoria_id || null,
        tipo: form.tipo,
        precio_referencia: precio == null ? null : Math.round(precio),
        activo: form.activo,
      })
      .eq('id', p.id)
    if (error) {
      return setEstado({ tipo: 'error', texto: error.code === '23505' ? 'Ya existe otro producto con ese nombre.' : mensajeError(error) })
    }
    await recargar()
    setEstado({ tipo: 'ok', texto: 'Datos guardados.' })
  }

  return (
    <details className="mb-4 rounded-2xl border border-borde bg-superficie">
      <summary className="flex min-h-14 cursor-pointer items-center px-4 font-semibold">Datos del producto</summary>
      <div className="space-y-4 border-t border-borde p-4">
        <Campo
          etiqueta="Nombre (igual que en influye.app)"
          value={form.nombre}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <Selector
          etiqueta="Categoría"
          value={form.categoria_id}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, categoria_id: e.target.value ? Number(e.target.value) : '' })}
        >
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Selector
          etiqueta="Tipo"
          value={form.tipo}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, tipo: e.target.value as Producto['tipo'] })}
        >
          <option value="producto">Producto (se vende y tiene costo)</option>
          <option value="abono">Abono de torta (no es venta de producto)</option>
          <option value="ajuste">Ajuste (ej.: Ley Redondeo)</option>
        </Selector>
        <Campo
          etiqueta="Precio de venta de referencia (con IVA)"
          inputMode="numeric"
          value={form.precio}
          disabled={!editable}
          onChange={(e) => setForm({ ...form, precio: e.target.value })}
          ayuda="Solo para estimar el margen aquí. Las ventas usan el precio real del Excel."
        />
        <Interruptor
          etiqueta="Activo"
          ayuda="Desactívalo si ya no se vende. Se conserva su historial."
          activo={form.activo}
          deshabilitado={!editable}
          onCambio={(v) => setForm({ ...form, activo: v })}
        />
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        {editable && (
          <Boton variante="secundario" onClick={guardar}>
            Guardar datos
          </Boton>
        )}
      </div>
    </details>
  )
}

function FilaOpcion({ p, o }: { p: Producto; o: Opcion }) {
  const { costoDeOpcion, costoDeProducto, recargar } = useCatalogo()
  const { puede } = useSesion()
  const [abierta, setAbierta] = useState(false)
  const c = costoDeOpcion.get(o.id)
  const base = costoDeProducto.get(p.id)?.costo_vigente
  const costoTotal = c?.costo_vigente != null && base != null ? base + c.costo_vigente : null
  const precioTotal = (p.precio_referencia ?? 0) + (o.precio_referencia ?? 0)
  const margen = margenReferencia(precioTotal, costoTotal)

  async function alternarActiva() {
    await supabase.from('opciones').update({ activa: !o.activa }).eq('id', o.id)
    await recargar()
  }

  return (
    <li className={o.activa ? '' : 'opacity-50'}>
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-superficie-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{o.nombre}</span>
          <span className="block text-xs text-suave">
            {o.precio_referencia ? `+${pesos(o.precio_referencia)} en precio` : 'Sin recargo'}
            {!o.activa && ' · Inactiva'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {c?.costo_vigente != null ? (
            <>
              <span className="cifra block font-semibold">{c.modo === 'cero' ? '$0' : pesos(c.costo_vigente)}</span>
              {margen != null && precioTotal > 0 && (
                <span className={`cifra block text-xs ${margen < 0.3 ? 'text-peligro' : 'text-suave'}`}>
                  margen {porcentaje(margen, 0)}
                </span>
              )}
            </>
          ) : (
            <Insignia clase={TEXTO_ESTADO.sin_costo.clase}>Sin costo</Insignia>
          )}
        </span>
      </button>
      {abierta && (
        <div className="space-y-3 border-t border-borde bg-fondo/50 p-4">
          <EditorCosto opcionId={o.id} costo={c} />
          {puede('editar_catalogo') && (
            <Boton variante="texto" onClick={alternarActiva}>
              {o.activa ? 'Desactivar esta opción' : 'Reactivar esta opción'}
            </Boton>
          )}
        </div>
      )}
    </li>
  )
}

function OpcionesACero({ productoId, pendientes }: { productoId: number; pendientes: number }) {
  const { recargar } = useCatalogo()
  const [mensaje, setMensaje] = useState('')
  const confirmar = useConfirmar()
  if (pendientes === 0) return null

  async function aplicar() {
    if (!(await confirmar({ mensaje: `¿Dejar en $0 las ${pendientes} opciones que no tienen costo? Útil para opciones como "Leche entera" o "Sin leche" que no cambian el costo. Después puedes editar cualquiera.`, accion: 'Dejar en $0' }))) return
    const { data, error } = await supabase.rpc('opciones_sin_costo_a_cero', { p_producto: productoId })
    if (error) return setMensaje(mensajeError(error))
    setMensaje(`Listo: ${data} opciones quedaron en $0.`)
    await recargar()
  }

  return (
    <div className="mb-3 space-y-2">
      <Boton variante="secundario" onClick={aplicar}>
        Dejar en $0 las {pendientes} opciones sin costo
      </Boton>
      {mensaje && <Aviso tipo="info">{mensaje}</Aviso>}
    </div>
  )
}

function NuevaOpcion({ productoId }: { productoId: number }) {
  const { recargar } = useCatalogo()
  const [abierta, setAbierta] = useState(false)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [error, setError] = useState('')

  async function crear() {
    setError('')
    if (!nombre.trim()) return setError('Escribe el nombre de la opción tal como aparece en influye.app.')
    const { error } = await supabase
      .from('opciones')
      .insert({ producto_id: productoId, nombre: nombre.trim(), precio_referencia: leerNumero(precio) ?? 0 })
    if (error) return setError(error.code === '23505' ? 'Esa opción ya existe.' : mensajeError(error))
    setNombre('')
    setPrecio('')
    setAbierta(false)
    await recargar()
  }

  if (!abierta) {
    return (
      <Boton variante="secundario" onClick={() => setAbierta(true)}>
        + Agregar opción
      </Boton>
    )
  }
  return (
    <Tarjeta className="space-y-3">
      <Campo etiqueta="Nombre de la opción" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      <Campo
        etiqueta="Recargo en el precio (con IVA)"
        inputMode="numeric"
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        ayuda="Si la opción no cambia el precio, déjalo vacío."
      />
      {error && <Aviso>{error}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Boton variante="secundario" onClick={() => setAbierta(false)}>
          Cancelar
        </Boton>
        <Boton onClick={crear}>Agregar</Boton>
      </div>
    </Tarjeta>
  )
}

export function ProductoDetalle() {
  const { id } = useParams()
  const catalogo = useCatalogo()
  const { puede } = useSesion()
  const p = catalogo.productos.find((x) => x.id === Number(id))

  if (catalogo.cargando) return null
  if (!p) {
    return (
      <>
        <Encabezado titulo="Producto" volver="/productos" />
        <Aviso tipo="info">No encontramos ese producto.</Aviso>
      </>
    )
  }

  const ops = catalogo.opcionesDe.get(p.id) ?? []
  const costo = catalogo.costoDeProducto.get(p.id)
  const estado = estadoCosto(p, catalogo)
  const margen = ops.length === 0 ? margenReferencia(p.precio_referencia, costo?.costo_vigente) : null

  return (
    <>
      <Encabezado titulo={p.nombre} volver="/productos" />
      <div className="-mt-3 mb-4 flex flex-wrap items-center gap-2">
        <Insignia clase={TEXTO_ESTADO[estado].clase}>{TEXTO_ESTADO[estado].texto}</Insignia>
        {p.precio_referencia ? (
          <span className="text-sm text-suave">Precio {pesos(p.precio_referencia)}</span>
        ) : null}
        {margen != null && <span className="text-sm text-suave">· Margen {porcentaje(margen)}</span>}
      </div>

      <DatosProducto key={p.id + p.nombre} p={p} />

      {p.tipo !== 'producto' ? (
        <Aviso tipo="info">
          {p.tipo === 'abono'
            ? 'Los abonos de tortas no son venta de productos: no llevan costo y se verán aparte en los informes.'
            : 'Los ajustes (como Ley Redondeo) no llevan costo.'}
        </Aviso>
      ) : (
        <>
          <section className="mb-6">
            <h2 className="mb-1 text-lg font-semibold">Costo del producto</h2>
            <p className="mb-3 text-sm text-suave">
              {ops.length > 0
                ? 'Si el costo depende del sabor o tamaño elegido, marca "Sin costo propio" y define el costo en cada opción. Si hay algo común (ej.: vaso), ponlo aquí.'
                : 'Costo de una unidad vendida, sin IVA.'}
            </p>
            <Tarjeta>
              <EditorCosto key={costo?.definicion_id ?? 'nuevo'} productoId={p.id} costo={costo} />
            </Tarjeta>
          </section>

          <section>
            <h2 className="mb-1 text-lg font-semibold">Opciones ({ops.length})</h2>
            <p className="mb-3 text-sm text-suave">
              Sabores, tamaños o extras que se eligen en caja. El costo de cada opción se suma al del producto. Toca
              una para editar su costo.
            </p>
            {ops.length > 0 && (
              <ul className="mb-3 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                {ops
                  .slice()
                  .sort((a, b) => Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre, 'es'))
                  .map((o) => (
                    <FilaOpcion key={o.id} p={p} o={o} />
                  ))}
              </ul>
            )}
            {puede('editar_catalogo') && (
              <OpcionesACero productoId={p.id} pendientes={ops.filter((o) => !catalogo.costoDeOpcion.has(o.id)).length} />
            )}
            {puede('editar_catalogo') && <NuevaOpcion productoId={p.id} />}
          </section>
        </>
      )}
    </>
  )
}
