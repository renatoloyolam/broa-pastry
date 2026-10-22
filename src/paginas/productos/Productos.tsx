import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { estadoCosto, TEXTO_ESTADO, useCatalogo, type EstadoCosto } from '../../lib/catalogo'
import { margenReferencia } from '../../lib/costeo'
import { pesos, porcentaje } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Campo, Encabezado, EstadoVacio, Insignia, Pestanas, Selector, Tarjeta } from '../../componentes/ui'

export const PESTANAS_CATALOGO = [
  { a: '/productos', texto: 'Productos', fin: true },
  { a: '/productos/recetas', texto: 'Recetas' },
  { a: '/productos/ingredientes', texto: 'Ingredientes' },
  { a: '/productos/mapa', texto: 'Mapa' },
]

function normalizar(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

type Filtro = 'todos' | 'pendientes'

export function ProductosLista() {
  const catalogo = useCatalogo()
  const { productos, categorias, cargando, error, costoDeProducto, opcionesDe } = catalogo
  const { puede } = useSesion()
  const navegar = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<number | ''>('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [errorNuevo, setErrorNuevo] = useState('')

  const filas = useMemo(() => {
    const q = normalizar(busqueda)
    return productos
      .map((p) => ({ p, estado: estadoCosto(p, catalogo) }))
      .filter(({ p, estado }) => {
        if (q && !normalizar(p.nombre).includes(q)) return false
        if (categoria && p.categoria_id !== categoria) return false
        if (filtro === 'pendientes' && (estado === 'completo' || estado === 'no_aplica')) return false
        return true
      })
      .sort((a, b) => Number(b.p.activo) - Number(a.p.activo) || a.p.nombre.localeCompare(b.p.nombre, 'es'))
  }, [productos, busqueda, categoria, filtro, catalogo])

  const resumen = useMemo(() => {
    const cuenta: Record<EstadoCosto, number> = { completo: 0, parcial: 0, sin_costo: 0, no_aplica: 0 }
    for (const p of productos) if (p.activo) cuenta[estadoCosto(p, catalogo)]++
    return cuenta
  }, [productos, catalogo])

  async function crear() {
    setErrorNuevo('')
    if (!nuevoNombre.trim()) return setErrorNuevo('Escribe el nombre tal como aparece en influye.app.')
    const { data, error } = await supabase
      .from('productos')
      .insert({ nombre: nuevoNombre.trim(), categoria_id: categoria || null })
      .select('id')
      .single()
    if (error) {
      return setErrorNuevo(
        error.code === '23505' ? 'Ya existe un producto con ese nombre.' : mensajeError(error),
      )
    }
    await catalogo.recargar()
    navegar(`/productos/p/${data.id}`)
  }

  const nombreCategoria = (id: number | null) => categorias.find((c) => c.id === id)?.nombre ?? 'Sin categoría'
  const pendientes = resumen.parcial + resumen.sin_costo

  return (
    <>
      <Encabezado titulo="Productos">
        <Link to="/productos/categorias" className="text-sm font-semibold text-primario">
          Categorías
        </Link>
      </Encabezado>
      <Pestanas opciones={PESTANAS_CATALOGO} />
      {error && <Aviso>{error}</Aviso>}

      {!cargando && productos.length > 0 && (
        <Tarjeta className="mb-4">
          <p className="text-sm text-suave">Productos activos con costo completo</p>
          <p className="cifra text-3xl font-bold">
            {resumen.completo} <span className="text-lg font-medium text-suave">de {resumen.completo + pendientes}</span>
          </p>
          {pendientes > 0 && (
            <p className="mt-1 text-sm text-aviso">
              Faltan {pendientes}. Sin costo, sus ventas no se pueden incluir en la ganancia.
            </p>
          )}
        </Tarjeta>
      )}

      <div className="mb-3 space-y-2">
        <input
          type="search"
          placeholder="Buscar producto…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="min-h-12 w-full rounded-xl border border-borde bg-superficie px-4"
        />
        <div className="flex gap-2">
          <Selector
            aria-label="Categoría"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
          <button
            type="button"
            onClick={() => setFiltro(filtro === 'todos' ? 'pendientes' : 'todos')}
            className={`min-h-12 shrink-0 rounded-xl border px-3 text-sm font-semibold ${
              filtro === 'pendientes' ? 'border-aviso bg-aviso/10 text-aviso' : 'border-borde text-suave'
            }`}
          >
            {filtro === 'pendientes' ? 'Solo pendientes ✓' : 'Solo pendientes'}
          </button>
        </div>
      </div>

      <Link
        to="/productos/excel"
        className="mb-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-borde bg-superficie text-sm font-semibold text-primario active:bg-superficie-2"
      >
        📊 Costos en Excel (descargar o subir plantilla)
      </Link>

      {puede('editar_catalogo') &&
        (creando ? (
          <Tarjeta className="mb-3 space-y-3">
            <Campo
              etiqueta="Nombre del producto (igual que en influye.app)"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              autoFocus
            />
            {errorNuevo && <Aviso>{errorNuevo}</Aviso>}
            <div className="grid grid-cols-2 gap-2">
              <Boton variante="secundario" onClick={() => setCreando(false)}>
                Cancelar
              </Boton>
              <Boton onClick={crear}>Crear</Boton>
            </div>
          </Tarjeta>
        ) : (
          <Boton variante="secundario" className="mb-3" onClick={() => setCreando(true)}>
            + Nuevo producto
          </Boton>
        ))}

      {!cargando && filas.length === 0 && (
        <EstadoVacio icono="🔎" titulo="No hay productos que coincidan">
          {productos.length === 0
            ? 'Aún no hay productos. Se crean solos al importar el Excel de influye.app, o con el botón de arriba.'
            : 'Prueba con otra búsqueda o quita los filtros.'}
        </EstadoVacio>
      )}

      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
        {filas.map(({ p, estado }) => {
          const ops = opcionesDe.get(p.id) ?? []
          const c = costoDeProducto.get(p.id)
          const margen = ops.length === 0 ? margenReferencia(p.precio_referencia, c?.costo_vigente) : null
          return (
            <li key={p.id}>
              <Link
                to={`/productos/p/${p.id}`}
                className={`flex min-h-16 items-center gap-3 px-4 py-3 active:bg-superficie-2 ${p.activo ? '' : 'opacity-50'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="block text-xs text-suave">
                    {nombreCategoria(p.categoria_id)}
                    {ops.length > 0 && ` · ${ops.length} opciones`}
                    {!p.activo && ' · Inactivo'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {ops.length === 0 && c?.costo_vigente != null ? (
                    <>
                      <span className="cifra block font-semibold">{pesos(c.costo_vigente)}</span>
                      {margen != null && (
                        <span className={`cifra block text-xs ${margen < 0.3 ? 'text-peligro' : 'text-suave'}`}>
                          margen {porcentaje(margen, 0)}
                        </span>
                      )}
                    </>
                  ) : (
                    <Insignia clase={TEXTO_ESTADO[estado].clase}>{TEXTO_ESTADO[estado].texto}</Insignia>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
