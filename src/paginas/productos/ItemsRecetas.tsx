import { useState } from 'react'
import { useCatalogo } from '../../lib/catalogo'
import { mensajeError, supabase } from '../../lib/supabase'
import { moverItem, type ItemRecetas } from '../../lib/recetasItems'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Encabezado } from '../../componentes/ui'
import { useConfirmar } from '../../componentes/Confirmar'
import { ICONOS } from '../../componentes/iconos'

const yaExiste = (e: { code?: string }) => e.code === '23505'

function FilaItem({
  item,
  cantidad,
  editable,
  primero,
  ultimo,
  onMover,
}: {
  item: ItemRecetas
  cantidad: number
  editable: boolean
  primero: boolean
  ultimo: boolean
  onMover: (d: -1 | 1) => void
}) {
  const { recargar } = useCatalogo()
  const confirmar = useConfirmar()
  const [nombre, setNombre] = useState(item.nombre)
  const [error, setError] = useState('')

  async function renombrar() {
    const n = nombre.trim()
    if (!n || n === item.nombre) return setNombre(item.nombre)
    setError('')
    const { error } = await supabase.from('recetas_items').update({ nombre: n }).eq('id', item.id)
    if (error) {
      setNombre(item.nombre)
      return setError(yaExiste(error) ? 'Ya existe un ítem con ese nombre.' : mensajeError(error))
    }
    await recargar()
  }

  async function borrar() {
    const aviso = cantidad ? ` Sus ${cantidad} recetas quedan "Sin ítem"; no se borra ninguna receta.` : ''
    if (!(await confirmar({ mensaje: `¿Borrar el ítem "${item.nombre}"?${aviso}`, accion: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('recetas_items').delete().eq('id', item.id)
    if (error) return setError(mensajeError(error))
    await recargar()
  }

  const flecha = 'flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-primario active:bg-superficie-2 disabled:opacity-25'
  return (
    <li className="px-2 py-2">
      <div className="flex items-center gap-1">
        {editable && (
          <>
            <button type="button" aria-label={`Subir ${item.nombre}`} disabled={primero} onClick={() => onMover(-1)} className={flecha}>
              <ICONOS.anterior className="h-5 w-5 rotate-90" aria-hidden />
            </button>
            <button type="button" aria-label={`Bajar ${item.nombre}`} disabled={ultimo} onClick={() => onMover(1)} className={flecha}>
              <ICONOS.siguiente className="h-5 w-5 rotate-90" aria-hidden />
            </button>
          </>
        )}
        <input
          aria-label="Nombre del ítem"
          value={nombre}
          maxLength={60}
          disabled={!editable}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={renombrar}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 font-medium focus:border-borde"
        />
        <span className="shrink-0 text-xs text-suave">{cantidad} rec.</span>
        {editable && (
          <button type="button" aria-label={`Borrar ${item.nombre}`} onClick={borrar} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-suave active:bg-superficie-2">
            <ICONOS.borrar className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
      {error && <p className="px-2 text-xs text-peligro">{error}</p>}
    </li>
  )
}

/** Crear, renombrar, ordenar y borrar los ítems con que se agrupan las recetas. */
export function ItemsRecetas() {
  const { itemsRecetas, recetas, recargar } = useCatalogo()
  const { puede } = useSesion()
  const editable = puede('editar_catalogo')
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState('')
  const [moviendo, setMoviendo] = useState(false)
  const ordenados = [...itemsRecetas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))

  async function crear() {
    setError('')
    const n = nuevo.trim()
    if (!n) return setError('Escribe el nombre del ítem.')
    const orden = (ordenados.at(-1)?.orden ?? 0) + 10
    const { error } = await supabase.from('recetas_items').insert({ nombre: n, orden })
    if (error) return setError(yaExiste(error) ? 'Ese ítem ya existe.' : mensajeError(error))
    setNuevo('')
    await recargar()
  }

  async function mover(id: number, d: -1 | 1) {
    if (moviendo) return
    setMoviendo(true)
    setError('')
    const cambios = moverItem(itemsRecetas, id, d)
    const resultados = await Promise.all(cambios.map((c) => supabase.from('recetas_items').update({ orden: c.orden }).eq('id', c.id)))
    const fallo = resultados.find((r) => r.error)
    if (fallo?.error) setError(mensajeError(fallo.error))
    await recargar()
    setMoviendo(false)
  }

  return (
    <>
      <Encabezado titulo="Ítems de recetas" volver="/productos/recetas" />
      <p className="mb-4 text-sm text-suave">
        Las recetas se muestran agrupadas en este orden. Toca un nombre para cambiarlo y usa las flechas para ordenar.
      </p>
      {ordenados.length > 0 && (
        <ul className="mb-4 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
          {ordenados.map((it, i) => (
            <FilaItem
              key={`${it.id}-${it.nombre}`}
              item={it}
              cantidad={recetas.filter((r) => r.item_id === it.id).length}
              editable={editable}
              primero={i === 0}
              ultimo={i === ordenados.length - 1}
              onMover={(d) => mover(it.id, d)}
            />
          ))}
        </ul>
      )}
      {editable && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            placeholder="Nuevo ítem"
            aria-label="Nuevo ítem"
            maxLength={60}
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && crear()}
            className="min-h-12 min-w-0 rounded-xl border border-borde bg-superficie px-4"
          />
          <Boton icono={ICONOS.agregar} className="!w-auto" onClick={crear}>
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
