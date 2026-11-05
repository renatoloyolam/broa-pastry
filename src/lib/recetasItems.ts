// Ítems para ordenar las recetas (Galletería, Bollería…).

export interface ItemRecetas {
  id: number
  nombre: string
  orden: number
}

export interface GrupoRecetas<R> {
  clave: string
  nombre: string
  recetas: R[]
}

/** Recetas agrupadas en el orden de los ítems; las que no tienen ítem van al final. Se omiten los ítems vacíos. */
export function agruparRecetas<R extends { item_id: number | null }>(recetas: R[], items: ItemRecetas[]): GrupoRecetas<R>[] {
  const ordenados = [...items].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  const ids = new Set(ordenados.map((i) => i.id))
  const grupos: GrupoRecetas<R>[] = ordenados.map((i) => ({ clave: String(i.id), nombre: i.nombre, recetas: recetas.filter((r) => r.item_id === i.id) }))
  grupos.push({ clave: 'sin', nombre: 'Sin ítem', recetas: recetas.filter((r) => r.item_id == null || !ids.has(r.item_id)) })
  return grupos.filter((g) => g.recetas.length > 0)
}

/** Intercambia el orden de un ítem con el vecino (arriba = -1, abajo = 1). Devuelve los cambios a guardar. */
export function moverItem(items: ItemRecetas[], id: number, direccion: -1 | 1): { id: number; orden: number }[] {
  const lista = [...items].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
  const i = lista.findIndex((x) => x.id === id)
  const j = i + direccion
  if (i < 0 || j < 0 || j >= lista.length) return []
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  // Se renumera todo para que nunca queden dos con el mismo orden
  return lista.map((x, k) => ({ id: x.id, orden: (k + 1) * 10 })).filter((x) => items.find((y) => y.id === x.id)?.orden !== x.orden)
}
