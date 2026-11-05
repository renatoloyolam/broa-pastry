// Mermas durante la producción y de materia prima: lo que se anota y cómo se muestra.
import { decimal, leerNumero } from './formato'
import type { Unidad } from './costeo'

export type EtapaProceso = 'produccion' | 'materia_prima'
export type EtapaMerma = 'producto' | EtapaProceso

export const NOMBRE_ETAPA: Record<EtapaMerma, string> = {
  producto: 'Producto terminado',
  produccion: 'En producción',
  materia_prima: 'Materia prima',
}

export interface ItemProceso {
  id: number
  nombre: string
  unidad: Unidad
  rendimiento?: number // solo recetas
}

export interface OpcionesProceso {
  recetas: (ItemProceso & { rendimiento: number })[]
  ingredientes: ItemProceso[]
}

/** "tanda" es una receta completa: se convierte a su rendimiento al guardar. */
export type UnidadProceso = Unidad | 'tanda'

export interface FormProceso {
  item: ItemProceso | null
  sinItem: boolean
  descripcion: string
  monto: string
  cantidad: string
  unidad: UnidadProceso | null
}

export const FORM_VACIO: FormProceso = { item: null, sinItem: false, descripcion: '', monto: '', cantidad: '1', unidad: null }

/** Unidades con las que se puede anotar lo que se mide en `u`. */
export function unidadesPara(u: Unidad): Unidad[] {
  if (u === 'g' || u === 'kg') return ['g', 'kg']
  if (u === 'ml' || u === 'l') return ['ml', 'l']
  return ['un']
}

export function unidadesItem(item: ItemProceso): UnidadProceso[] {
  return item.rendimiento != null ? ['tanda', ...unidadesPara(item.unidad)] : unidadesPara(item.unidad)
}

export function nombreUnidad(u: UnidadProceso, cantidad = 2) {
  if (u === 'tanda') return cantidad === 1 ? 'tanda' : 'tandas'
  return u
}

/** "2 kg" · "6 un" · "" cuando no se anotó cantidad */
export function textoCantidad(cantidad: number | null, unidad: Unidad | null) {
  if (cantidad == null) return ''
  return unidad ? `${decimal(cantidad)} ${unidad}` : decimal(cantidad)
}

export interface ArgsRegistro {
  p_fecha: string
  p_etapa: EtapaProceso
  p_receta: number | null
  p_ingrediente: number | null
  p_descripcion: string | null
  p_cantidad: number | null
  p_unidad: Unidad | null
  p_motivo: number
  p_evitable: boolean
  p_nota: string | null
  p_monto: number | null
}

/** Revisa el formulario y arma lo que se envía; el valor siempre lo calcula la base. */
export function armarRegistro(
  etapa: EtapaProceso,
  f: FormProceso,
  comun: { fecha: string; motivo: number | null; evitable: boolean; nota: string },
): { error: string } | { args: ArgsRegistro } {
  const base = { p_fecha: comun.fecha, p_etapa: etapa, p_evitable: comun.evitable, p_nota: comun.nota.trim() || null }
  let args: Omit<ArgsRegistro, 'p_motivo' | keyof typeof base>

  if (f.sinItem) {
    const descripcion = f.descripcion.trim()
    if (!descripcion) return { error: 'Escribe qué se perdió.' }
    const monto = f.monto.trim() ? leerNumero(f.monto) : null
    if (f.monto.trim() && !(monto != null && monto > 0)) return { error: 'Revisa el monto estimado.' }
    args = { p_receta: null, p_ingrediente: null, p_descripcion: descripcion, p_cantidad: null, p_unidad: null, p_monto: monto }
  } else {
    if (!f.item) return { error: etapa === 'produccion' ? 'Elige la receta.' : 'Elige el ingrediente.' }
    const cantidad = leerNumero(f.cantidad)
    if (!(cantidad != null && cantidad > 0)) return { error: 'Escribe cuánto se perdió.' }
    if (!f.unidad) return { error: 'Elige la unidad.' }
    const esTanda = f.unidad === 'tanda'
    args = {
      p_receta: etapa === 'produccion' ? f.item.id : null,
      p_ingrediente: etapa === 'materia_prima' ? f.item.id : null,
      p_descripcion: null,
      p_cantidad: esTanda ? cantidad * (f.item.rendimiento ?? 1) : cantidad,
      p_unidad: esTanda ? f.item.unidad : (f.unidad as Unidad),
      p_monto: null,
    }
  }
  if (comun.motivo == null) return { error: 'Elige el motivo.' }
  return { args: { ...base, ...args, p_motivo: comun.motivo } }
}
