import { useState } from 'react'
import { useCatalogo, type Categoria } from '../../lib/catalogo'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Encabezado } from '../../componentes/ui'

function FilaCategoria({ c, editable, cantidad }: { c: Categoria; editable: boolean; cantidad: number }) {
  const { recargar } = useCatalogo()
  const [nombre, setNombre] = useState(c.nombre)
  const [error, setError] = useState('')

  async function guardar(cambios: Partial<Categoria>) {
    setError('')
    const { error } = await supabase.from('categorias').update(cambios).eq('id', c.id)
    if (error) setError(error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : mensajeError(error))
    await recargar()
  }

  return (
    <li className={`px-4 py-3 ${c.activa ? '' : 'opacity-50'}`}>
      <div className="flex items-center gap-2">
        <input
          aria-label="Nombre de la categoría"
          value={nombre}
          disabled={!editable}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => nombre.trim() && nombre.trim() !== c.nombre && guardar({ nombre: nombre.trim() })}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 focus:border-borde"
        />
        <span className="text-xs text-suave">{cantidad} prod.</span>
        {editable && (
          <button
            type="button"
            onClick={() => guardar({ activa: !c.activa })}
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primario"
          >
            {c.activa ? 'Ocultar' : 'Mostrar'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-peligro">{error}</p>}
    </li>
  )
}

export function Categorias() {
  const { categorias, productos, recargar } = useCatalogo()
  const { puede } = useSesion()
  const editable = puede('editar_catalogo')
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')

  async function crear() {
    setError('')
    if (!nueva.trim()) return
    const { error } = await supabase.from('categorias').insert({ nombre: nueva.trim() })
    if (error) return setError(error.code === '23505' ? 'Esa categoría ya existe.' : mensajeError(error))
    setNueva('')
    await recargar()
  }

  return (
    <>
      <Encabezado titulo="Categorías" volver="/productos" />
      <p className="mb-4 text-sm text-suave">Toca un nombre para cambiarlo. Las categorías no se borran: se ocultan.</p>
      <ul className="mb-4 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
        {categorias.map((c) => (
          <FilaCategoria
            key={c.id}
            c={c}
            editable={editable}
            cantidad={productos.filter((p) => p.categoria_id === c.id).length}
          />
        ))}
      </ul>
      {editable && (
        <div className="flex gap-2">
          <input
            placeholder="Nueva categoría"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-borde bg-superficie px-4"
          />
          <Boton className="!w-auto" onClick={crear}>
            Agregar
          </Boton>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}
    </>
  )
}
