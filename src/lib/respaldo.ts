// Respaldo completo: descarga todas las tablas a un Excel (una hoja por tabla).
// Solo para dueños. Sirve para guardar una copia fuera de Supabase y,
// si algún día hiciera falta, para reconstruir la información.
import { supabase } from './supabase'

/** Tablas a respaldar y la columna con que se ordenan (para paginar). */
export const TABLAS_RESPALDO: [tabla: string, orden: string][] = [
  ['configuracion', 'id'],
  ['permisos_admin', 'id'],
  ['umbrales_alertas', 'id'],
  ['perfiles', 'creado_en'],
  ['categorias', 'id'],
  ['productos', 'id'],
  ['opciones', 'id'],
  ['alias_productos', 'alias'],
  ['alias_opciones', 'alias'],
  ['ingredientes', 'id'],
  ['ingrediente_precios', 'id'],
  ['recetas', 'id'],
  ['receta_items', 'id'],
  ['receta_adicionales', 'id'],
  ['costo_definiciones', 'id'],
  ['costo_adicionales', 'id'],
  ['costo_versiones', 'id'],
  ['importaciones', 'id'],
  ['ventas', 'numero'],
  ['venta_lineas', 'id'],
  ['motivos_merma', 'id'],
  ['mermas', 'id'],
  ['pedidos', 'id'],
  ['pedido_abonos', 'id'],
  ['pedido_costos', 'pedido_id'],
]

const PAGINA = 1000

/** Convierte valores no simples (listas, objetos) en texto para el Excel. */
export function aCelda(v: unknown): string | number | boolean | null {
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.join(',')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export async function leerTabla(tabla: string, orden: string, alAvanzar?: (filas: number) => void) {
  const filas: Record<string, unknown>[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase.from(tabla).select('*').order(orden).range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`)
    filas.push(...(data ?? []))
    alAvanzar?.(filas.length)
    if (!data || data.length < PAGINA) break
  }
  return filas
}

export async function crearRespaldo(alAvanzar: (texto: string, fraccion: number) => void): Promise<{ blob: Blob; filas: number }> {
  const XLSX = await import('xlsx')
  const libro = XLSX.utils.book_new()
  let total = 0
  for (let i = 0; i < TABLAS_RESPALDO.length; i++) {
    const [tabla, orden] = TABLAS_RESPALDO[i]
    const filas = await leerTabla(tabla, orden, (n) => alAvanzar(`${tabla}: ${n} filas`, i / TABLAS_RESPALDO.length))
    total += filas.length
    const columnas = filas.length ? Object.keys(filas[0]) : ['(vacía)']
    const hoja = XLSX.utils.aoa_to_sheet([columnas, ...filas.map((f) => columnas.map((c) => aCelda(f[c])))])
    XLSX.utils.book_append_sheet(libro, hoja, tabla.slice(0, 31))
  }
  alAvanzar('Armando el archivo…', 1)
  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer
  return { blob: new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filas: total }
}

/** Días desde el último respaldo (null si nunca se ha hecho). */
export function diasDesdeRespaldo(ultimo: string | null | undefined, ahora = Date.now()): number | null {
  if (!ultimo) return null
  return Math.floor((ahora - Date.parse(ultimo)) / 86_400_000)
}
