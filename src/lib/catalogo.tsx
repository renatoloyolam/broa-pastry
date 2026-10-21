import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import type { Ingrediente, Unidad } from './costeo'
import { mensajeError, supabase } from './supabase'

export interface Categoria {
  id: number
  nombre: string
  orden: number
  activa: boolean
}

export interface Producto {
  id: number
  nombre: string
  categoria_id: number | null
  tipo: 'producto' | 'ajuste' | 'abono'
  precio_referencia: number | null
  activo: boolean
}

export interface Opcion {
  id: number
  producto_id: number
  nombre: string
  precio_referencia: number | null
  activa: boolean
}

export type ModoCosto = 'manual' | 'receta' | 'cero'

export interface Costo {
  definicion_id: number
  producto_id: number | null
  opcion_id: number | null
  modo: ModoCosto
  costo_manual_neto: number | null
  receta_id: number | null
  cantidad_receta: number
  costo_calculado: number | null
  costo_vigente: number | null
  vigente_desde: string | null
}

export interface Adicional {
  id?: number
  definicion_id?: number
  concepto: string
  monto_neto: number
}

export interface Receta {
  id: number
  nombre: string
  rendimiento: number
  unidad_rendimiento: Unidad
  es_base: boolean
  notas: string | null
  costo_total: number | null
  costo_unitario: number | null
}

interface Datos {
  categorias: Categoria[]
  productos: Producto[]
  opciones: Opcion[]
  costos: Costo[]
  adicionales: Adicional[]
  recetas: Receta[]
  ingredientes: (Ingrediente & { activo: boolean; actualizado_en: string })[]
}

interface ContextoCatalogo extends Datos {
  cargando: boolean
  error: string
  recargar: () => Promise<void>
  costoDeProducto: Map<number, Costo>
  costoDeOpcion: Map<number, Costo>
  opcionesDe: Map<number, Opcion[]>
}

const Contexto = createContext<ContextoCatalogo | null>(null)
const vacio: Datos = { categorias: [], productos: [], opciones: [], costos: [], adicionales: [], recetas: [], ingredientes: [] }

/** Carga todo el catálogo una vez para las pantallas de Productos. */
export function CatalogoProvider({ children }: { children?: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(vacio)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const recargar = useCallback(async () => {
    const r = await Promise.all([
      supabase.from('categorias').select('*').order('orden').order('nombre'),
      supabase.from('productos').select('id, nombre, categoria_id, tipo, precio_referencia, activo').order('nombre'),
      supabase.from('opciones').select('id, producto_id, nombre, precio_referencia, activa').order('nombre'),
      supabase.from('v_costos').select('*'),
      supabase.from('costo_adicionales').select('*').order('id'),
      supabase.from('v_recetas').select('*').order('nombre'),
      supabase.from('ingredientes').select('*').order('nombre'),
    ])
    const fallo = r.find((x) => x.error)
    if (fallo) {
      setError(mensajeError(fallo.error))
    } else {
      const num = <T,>(filas: unknown[] | null) => (filas ?? []) as T[]
      setError('')
      setDatos({
        categorias: num(r[0].data),
        productos: num(r[1].data),
        opciones: num(r[2].data),
        costos: num<Costo>(r[3].data).map((c) => ({
          ...c,
          costo_calculado: c.costo_calculado == null ? null : Number(c.costo_calculado),
          costo_vigente: c.costo_vigente == null ? null : Number(c.costo_vigente),
          costo_manual_neto: c.costo_manual_neto == null ? null : Number(c.costo_manual_neto),
          cantidad_receta: Number(c.cantidad_receta),
        })),
        adicionales: num<Adicional>(r[4].data).map((a) => ({ ...a, monto_neto: Number(a.monto_neto) })),
        recetas: num<Receta>(r[5].data).map((x) => ({
          ...x,
          rendimiento: Number(x.rendimiento),
          costo_total: x.costo_total == null ? null : Number(x.costo_total),
          costo_unitario: x.costo_unitario == null ? null : Number(x.costo_unitario),
        })),
        ingredientes: num<Datos['ingredientes'][number]>(r[6].data).map((i) => ({
          ...i,
          cantidad_compra: Number(i.cantidad_compra),
          precio_compra_neto: Number(i.precio_compra_neto),
        })),
      })
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const indices = useMemo(() => {
    const costoDeProducto = new Map<number, Costo>()
    const costoDeOpcion = new Map<number, Costo>()
    for (const c of datos.costos) {
      if (c.producto_id) costoDeProducto.set(c.producto_id, c)
      if (c.opcion_id) costoDeOpcion.set(c.opcion_id, c)
    }
    const opcionesDe = new Map<number, Opcion[]>()
    for (const o of datos.opciones) {
      const lista = opcionesDe.get(o.producto_id) ?? []
      lista.push(o)
      opcionesDe.set(o.producto_id, lista)
    }
    return { costoDeProducto, costoDeOpcion, opcionesDe }
  }, [datos])

  return (
    <Contexto.Provider value={{ ...datos, ...indices, cargando, error, recargar }}>
      {children ?? <Outlet />}
    </Contexto.Provider>
  )
}

export function useCatalogo() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useCatalogo debe usarse dentro de CatalogoProvider')
  return c
}

export type EstadoCosto = 'completo' | 'parcial' | 'sin_costo' | 'no_aplica'

/** ¿El producto tiene todo su costo definido? (producto + todas sus opciones activas) */
export function estadoCosto(p: Producto, c: Pick<ContextoCatalogo, 'costoDeProducto' | 'costoDeOpcion' | 'opcionesDe'>): EstadoCosto {
  if (p.tipo !== 'producto') return 'no_aplica'
  const base = c.costoDeProducto.has(p.id)
  const ops = (c.opcionesDe.get(p.id) ?? []).filter((o) => o.activa)
  const conCosto = ops.filter((o) => c.costoDeOpcion.has(o.id)).length
  if (base && conCosto === ops.length) return 'completo'
  if (!base && conCosto === 0) return 'sin_costo'
  return 'parcial'
}

export const TEXTO_ESTADO: Record<EstadoCosto, { texto: string; clase: string }> = {
  completo: { texto: 'Con costo', clase: 'bg-exito/15 text-exito' },
  parcial: { texto: 'Costo incompleto', clase: 'bg-aviso/15 text-aviso' },
  sin_costo: { texto: 'Sin costo', clase: 'bg-peligro/15 text-peligro' },
  no_aplica: { texto: 'No lleva costo', clase: 'bg-superficie-2 text-suave' },
}
