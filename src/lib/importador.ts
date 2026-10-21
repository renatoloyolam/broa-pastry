// Lectura del Excel de influye.app (todo ocurre en el teléfono).
//
// influye exporta un libro con varias hojas. Usamos:
//   * "Items": una fila por unidad vendida (producto, opciones, precio).
//   * "Transacciones": una fila por boleta (total pagado, medio de pago).
//   * "Cancelados": transacciones anuladas, que se ignoran.
// Las columnas se detectan por su título. Si influye cambia los títulos,
// la persona las elige a mano y ese mapeo se guarda.
//
// Este archivo no depende de SheetJS: recibe las hojas como tablas
// (arreglos de filas), así se puede probar sin archivos reales.

export type Tabla = unknown[][]
export type Hojas = Record<string, Tabla>

export type CampoItem = 'numero' | 'fecha' | 'item' | 'seccion' | 'opciones' | 'precio' | 'vendedor' | 'turno'
export type MapeoGuardado = Partial<Record<CampoItem, string>>

export const CAMPOS_ITEM: { campo: CampoItem; texto: string; requerido: boolean; sinonimos: string[] }[] = [
  { campo: 'numero', texto: 'N° de transacción', requerido: true, sinonimos: ['#', 'n°', 'nº', 'numero', 'n° transaccion', 'id transaccion', 'boleta'] },
  { campo: 'fecha', texto: 'Fecha y hora', requerido: true, sinonimos: ['fecha ingreso', 'fecha', 'fecha venta', 'fecha y hora'] },
  { campo: 'item', texto: 'Producto', requerido: true, sinonimos: ['item', 'ítem', 'producto', 'nombre producto'] },
  { campo: 'precio', texto: 'Precio', requerido: true, sinonimos: ['precio', 'precio unitario', 'monto', 'valor'] },
  { campo: 'opciones', texto: 'Opciones / modificadores', requerido: false, sinonimos: ['comentario item', 'modificadores', 'opciones', 'variante'] },
  { campo: 'seccion', texto: 'Sección / categoría', requerido: false, sinonimos: ['seccion', 'sección', 'categoria', 'categoría'] },
  { campo: 'vendedor', texto: 'Vendedor', requerido: false, sinonimos: ['ingresada por', 'vendedor', 'cajero', 'usuario'] },
  { campo: 'turno', texto: 'Turno', requerido: false, sinonimos: ['turno'] },
]

export function normalizar(t: unknown): string {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------

/** Montos: números de Excel, "2,500.00" (formato de influye) o "2.500" (chileno). */
export function leerMonto(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let t = String(v ?? '').replace(/[$\s]/g, '')
  if (!t) return null
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) || /^-?\d+\.\d{1,2}$/.test(t)) t = t.replace(/,/g, '')
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const dos = (n: number) => String(n).padStart(2, '0')

/**
 * Fecha y hora local de Santiago como "AAAA-MM-DD HH:MM".
 * Acepta "09:01 10/10/2026" (influye), "10/10/2026 09:01", "2026-10-10 09:01",
 * fechas de Excel (número de serie) y objetos Date.
 */
export function leerFechaHora(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())} ${dos(v.getHours())}:${dos(v.getMinutes())}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de serie de Excel: días desde 30/12/1899 (sin zona horaria)
    const ms = Math.round((v - 25569) * 86400000)
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`
  }
  const t = String(v ?? '').trim()
  let m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s+(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) return armar(+m[5], +m[4], +m[3], +m[1], +m[2])
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/)
  if (m) return armar(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0))
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (m) return armar(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0))
  return null
}

function armar(a: number, mes: number, d: number, h: number, min: number): string | null {
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || h > 23 || min > 59 || a < 2000 || a > 2100) return null
  const f = new Date(Date.UTC(a, mes - 1, d))
  if (f.getUTCDate() !== d) return null // ej.: 31/02
  return `${a}-${dos(mes)}-${dos(d)} ${dos(h)}:${dos(min)}`
}

// ---------------------------------------------------------------------
// Detección de hojas y columnas
// ---------------------------------------------------------------------

interface Encabezado {
  fila: number
  titulos: string[] // normalizados
  originales: string[]
}

function buscarEncabezado(tabla: Tabla, requeridos: string[][]): Encabezado | null {
  for (let i = 0; i < Math.min(tabla.length, 15); i++) {
    const fila = tabla[i] ?? []
    const titulos = fila.map(normalizar)
    const coincide = (a: string) => normalizar(a) !== '' && titulos.includes(normalizar(a))
    if (requeridos.every((alternativas) => alternativas.some(coincide))) {
      return { fila: i, titulos, originales: fila.map((x) => String(x ?? '').trim()) }
    }
  }
  return null
}

function indice(enc: Encabezado, sinonimos: string[], preferido?: string): number {
  if (preferido) {
    const i = enc.titulos.indexOf(normalizar(preferido))
    if (i >= 0) return i
  }
  for (const s of sinonimos) {
    const i = enc.titulos.indexOf(normalizar(s))
    if (i >= 0) return i
  }
  return -1
}

function hojaPorNombre(hojas: Hojas, nombre: string): Tabla | undefined {
  const k = Object.keys(hojas).find((h) => normalizar(h) === normalizar(nombre))
  return k ? hojas[k] : undefined
}

// ---------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------

export interface LineaLeida {
  fila: number
  numero: number
  fechaHora: string
  item: string
  seccion: string
  opciones: string
  precio: number
  vendedor: string
  turno: string
}

export interface ErrorFila {
  hoja: string
  fila: number // como se ve en Excel (1 = primera fila)
  motivo: string
}

export interface DatosTx {
  total: number | null
  descuento: number | null
  metodo: string
  boleta: boolean | null
}

export type ResultadoLectura =
  | {
      ok: true
      lineas: LineaLeida[]
      transacciones: Map<number, DatosTx>
      cancelados: Set<number>
      errores: ErrorFila[]
      mapeo: MapeoGuardado
    }
  | {
      ok: false
      motivo: 'sin_items' | 'faltan_columnas'
      mensaje: string
      faltantes: CampoItem[]
      titulos: string[]
      hoja?: string
    }

/** Lee el libro. `mapeoGuardado` indica títulos elegidos a mano antes. */
export function leerLibro(hojas: Hojas, mapeoGuardado: MapeoGuardado = {}): ResultadoLectura {
  // 1. Hoja de ítems: la llamada "Items" o la primera que tenga producto + precio
  let nombreItems = Object.keys(hojas).find((h) => normalizar(h) === 'items')
  let enc: Encabezado | null = null
  const reqItems = [
    [mapeoGuardado.item ?? '', ...CAMPOS_ITEM[2].sinonimos],
    [mapeoGuardado.precio ?? '', ...CAMPOS_ITEM[3].sinonimos],
  ]
  if (nombreItems) enc = buscarEncabezado(hojas[nombreItems], reqItems)
  if (!enc) {
    for (const h of Object.keys(hojas)) {
      enc = buscarEncabezado(hojas[h], reqItems)
      if (enc) {
        nombreItems = h
        break
      }
    }
  }
  if (!enc || !nombreItems) {
    // Mostrar los títulos de la primera hoja para que se puedan elegir a mano
    const primera = Object.keys(hojas)[0]
    const tabla = primera ? hojas[primera] : []
    const filaTitulos = tabla.find((f) => (f ?? []).filter((x) => String(x ?? '').trim()).length >= 3) ?? []
    const titulos = filaTitulos.map((x) => String(x ?? '').trim()).filter(Boolean)
    const tieneTitulosElegidos = mapeoGuardado.item && mapeoGuardado.precio
    return {
      ok: false,
      motivo: tieneTitulosElegidos ? 'faltan_columnas' : 'sin_items',
      mensaje:
        'No encontramos la lista de productos vendidos en este archivo. ¿Es el Excel de "Transacciones" exportado desde influye.app?',
      faltantes: ['item', 'precio'],
      titulos,
      hoja: primera,
    }
  }

  const tabla = hojas[nombreItems]
  const col: Partial<Record<CampoItem, number>> = {}
  for (const c of CAMPOS_ITEM) {
    const i = indice(enc, c.sinonimos, mapeoGuardado[c.campo])
    if (i >= 0) col[c.campo] = i
  }
  const faltantes = CAMPOS_ITEM.filter((c) => c.requerido && col[c.campo] == null).map((c) => c.campo)
  if (faltantes.length) {
    return {
      ok: false,
      motivo: 'faltan_columnas',
      mensaje: 'Encontramos la hoja de productos, pero faltan algunas columnas. Elige cuál corresponde a cada dato.',
      faltantes,
      titulos: enc.originales.filter(Boolean),
      hoja: nombreItems,
    }
  }
  const mapeo: MapeoGuardado = {}
  for (const [k, i] of Object.entries(col)) mapeo[k as CampoItem] = enc.originales[i as number]

  // 2. Filas de ítems
  const lineas: LineaLeida[] = []
  const errores: ErrorFila[] = []
  const celda = (fila: unknown[], c: CampoItem) => (col[c] == null ? '' : fila[col[c]!])
  for (let i = enc.fila + 1; i < tabla.length; i++) {
    const fila = tabla[i] ?? []
    if (fila.every((x) => String(x ?? '').trim() === '')) continue
    const filaExcel = i + 1
    const numero = leerMonto(celda(fila, 'numero'))
    const fechaHora = leerFechaHora(celda(fila, 'fecha'))
    const item = String(celda(fila, 'item') ?? '').trim()
    const precio = leerMonto(celda(fila, 'precio'))
    const motivos: string[] = []
    if (numero == null || !Number.isInteger(numero) || numero <= 0) motivos.push('sin número de transacción')
    if (!fechaHora) motivos.push('fecha no válida')
    if (!item) motivos.push('sin producto')
    if (precio == null) motivos.push('precio no válido')
    if (motivos.length) {
      errores.push({ hoja: nombreItems, fila: filaExcel, motivo: motivos.join(', ') })
      // Guardamos el número (si existe) para descartar la transacción completa
      if (numero != null && Number.isInteger(numero)) {
        lineas.push({ fila: filaExcel, numero, fechaHora: '', item: '', seccion: '', opciones: '', precio: NaN, vendedor: '', turno: '' })
      }
      continue
    }
    lineas.push({
      fila: filaExcel,
      numero: numero!,
      fechaHora: fechaHora!,
      item,
      seccion: String(celda(fila, 'seccion') ?? '').trim(),
      opciones: String(celda(fila, 'opciones') ?? '').trim(),
      precio: Math.round(precio!),
      vendedor: String(celda(fila, 'vendedor') ?? '').trim(),
      turno: String(celda(fila, 'turno') ?? '').trim(),
    })
  }

  // 3. Hoja de transacciones (opcional): total pagado y medio de pago
  const transacciones = new Map<number, DatosTx>()
  for (const h of Object.keys(hojas)) {
    if (h === nombreItems) continue
    const e = buscarEncabezado(hojas[h], [['#', 'n°', 'numero'], ['total'], ['metodo de pago', 'medio de pago']])
    if (!e) continue
    const iNum = indice(e, ['#', 'n°', 'numero'])
    const iTotal = indice(e, ['total'])
    const iDesc = indice(e, ['descuento al total', 'descuento'])
    const iMetodo = indice(e, ['metodo de pago', 'medio de pago'])
    const iBoleta = indice(e, ['boleta electronica', 'boleta'])
    for (let i = e.fila + 1; i < hojas[h].length; i++) {
      const f = hojas[h][i] ?? []
      const n = leerMonto(f[iNum])
      if (n == null || !Number.isInteger(n)) continue
      const b = normalizar(f[iBoleta])
      transacciones.set(n, {
        total: leerMonto(f[iTotal]),
        descuento: iDesc >= 0 ? leerMonto(f[iDesc]) : null,
        metodo: String(f[iMetodo] ?? '').trim(),
        boleta: iBoleta < 0 ? null : b === 'si' ? true : b === 'no' ? false : null,
      })
    }
    break
  }

  // 4. Cancelados
  const cancelados = new Set<number>()
  const hojaCanc = hojaPorNombre(hojas, 'Cancelados')
  if (hojaCanc) {
    const e = buscarEncabezado(hojaCanc, [['#', 'n°', 'numero']])
    if (e) {
      const iNum = indice(e, ['#', 'n°', 'numero'])
      for (let i = e.fila + 1; i < hojaCanc.length; i++) {
        const n = leerMonto(hojaCanc[i]?.[iNum])
        if (n != null) cancelados.add(n)
      }
    }
  }

  return { ok: true, lineas, transacciones, cancelados, errores, mapeo }
}

// ---------------------------------------------------------------------
// Agrupar por transacción y repartir descuentos
// ---------------------------------------------------------------------

/**
 * Reparte un descuento entre ítems en proporción a su precio, en pesos
 * enteros, de modo que la suma de lo pagado calce exacto con el total.
 * Solo participan los ítems con precio positivo.
 */
export function repartirDescuento(precios: number[], descuento: number): number[] {
  const montos = precios.slice()
  const base = precios.reduce((s, p) => s + (p > 0 ? p : 0), 0)
  if (!descuento || base <= 0) return montos
  const exactos = precios.map((p) => (p > 0 ? (descuento * p) / base : 0))
  const enteros = exactos.map((x) => Math.trunc(x))
  let resto = descuento - enteros.reduce((s, x) => s + x, 0)
  // El resto (por redondeo) va a los ítems con mayor fracción
  const orden = exactos
    .map((x, i) => ({ i, f: Math.abs(x - Math.trunc(x)) }))
    .filter(({ i }) => precios[i] > 0)
    .sort((a, b) => b.f - a.f)
  const paso = Math.sign(resto)
  for (let k = 0; resto !== 0 && orden.length; k = (k + 1) % orden.length) {
    enteros[orden[k].i] += paso
    resto -= paso
  }
  return montos.map((p, i) => p - enteros[i])
}

export interface LineaTx extends LineaLeida {
  monto: number
}

export interface TransaccionLeida {
  numero: number
  fechaHora: string
  vendedor: string
  turno: string
  metodo: string
  boleta: boolean | null
  total: number
  descuento: number
  lineas: LineaTx[]
}

export function agruparTransacciones(lectura: Extract<ResultadoLectura, { ok: true }>) {
  const porNumero = new Map<number, LineaLeida[]>()
  for (const l of lectura.lineas) {
    const lista = porNumero.get(l.numero) ?? []
    lista.push(l)
    porNumero.set(l.numero, lista)
  }
  const transacciones: TransaccionLeida[] = []
  const descartadas: { numero: number; motivo: string }[] = []
  let canceladas = 0
  for (const [numero, lineas] of porNumero) {
    if (lectura.cancelados.has(numero)) {
      canceladas++
      continue
    }
    if (lineas.some((l) => !l.item || !Number.isFinite(l.precio))) {
      descartadas.push({ numero, motivo: 'tiene filas con errores' })
      continue
    }
    const suma = lineas.reduce((s, l) => s + l.precio, 0)
    const datos = lectura.transacciones.get(numero)
    const total = datos?.total != null ? Math.round(datos.total) : suma
    const descuento = suma - total
    const montos = repartirDescuento(
      lineas.map((l) => l.precio),
      descuento,
    )
    const primera = lineas[0]
    transacciones.push({
      numero,
      fechaHora: primera.fechaHora,
      vendedor: primera.vendedor,
      turno: primera.turno,
      metodo: datos?.metodo ?? '',
      boleta: datos?.boleta ?? null,
      total,
      descuento,
      lineas: lineas.map((l, i) => ({ ...l, monto: montos[i] })),
    })
  }
  transacciones.sort((a, b) => a.numero - b.numero)
  return { transacciones, descartadas, canceladas }
}

// ---------------------------------------------------------------------
// Vincular con el catálogo
// ---------------------------------------------------------------------

export interface CatalogoImport {
  productos: { id: number; nombre: string; tipo: string }[]
  opciones: { id: number; producto_id: number; nombre: string }[]
  aliasProductos: { alias: string; producto_id: number }[]
  /** opcion_id null = texto que se ignora (comentario escrito en caja) */
  aliasOpciones: { producto_id: number; alias: string; opcion_id: number | null }[]
}

export function indiceCatalogo(c: CatalogoImport) {
  const producto = new Map<string, number>()
  for (const p of c.productos) producto.set(normalizar(p.nombre), p.id)
  for (const a of c.aliasProductos) producto.set(a.alias, a.producto_id)
  const opcion = new Map<number, Map<string, number>>()
  const de = (pid: number) => {
    let m = opcion.get(pid)
    if (!m) opcion.set(pid, (m = new Map()))
    return m
  }
  const ignorar = new Map<number, Set<string>>()
  for (const o of c.opciones) de(o.producto_id).set(normalizar(o.nombre), o.id)
  for (const a of c.aliasOpciones) {
    if (a.opcion_id != null) de(a.producto_id).set(a.alias, a.opcion_id)
    else {
      const set = ignorar.get(a.producto_id) ?? new Set<string>()
      set.add(a.alias)
      ignorar.set(a.producto_id, set)
    }
  }
  return { producto, opcion, ignorar }
}

/**
 * Separa el texto de opciones de influye ("Latte, Leche sin lactosa").
 * Si una opción conocida contiene ", " en su nombre, se respeta.
 */
export function separarOpciones(texto: string, conocidas: Set<string>): string[] {
  if (!texto.trim()) return []
  const partes = texto.split(', ').map((x) => x.trim()).filter(Boolean)
  const res: string[] = []
  for (let i = 0; i < partes.length; ) {
    let tomado = 1
    for (let largo = partes.length - i; largo > 1; largo--) {
      if (conocidas.has(normalizar(partes.slice(i, i + largo).join(', ')))) {
        tomado = largo
        break
      }
    }
    res.push(partes.slice(i, i + tomado).join(', '))
    i += tomado
  }
  return res
}

export interface ProductoDesconocido {
  clave: string
  nombre: string
  seccion: string
  veces: number
  monto: number
}

export interface OpcionDesconocida {
  clave: string // productoClave|opcionClave
  productoClave: string
  productoNombre: string
  productoId: number | null
  nombre: string
  veces: number
}

export function buscarDesconocidos(transacciones: TransaccionLeida[], c: CatalogoImport) {
  const idx = indiceCatalogo(c)
  const productos = new Map<string, ProductoDesconocido>()
  const opciones = new Map<string, OpcionDesconocida>()
  for (const t of transacciones) {
    for (const l of t.lineas) {
      const pk = normalizar(l.item)
      const pid = idx.producto.get(pk) ?? null
      if (pid == null) {
        const d = productos.get(pk) ?? { clave: pk, nombre: l.item, seccion: l.seccion, veces: 0, monto: 0 }
        d.veces++
        d.monto += l.monto
        productos.set(pk, d)
      }
      const conocidas = new Set(pid != null ? idx.opcion.get(pid)?.keys() ?? [] : [])
      const ignoradas = pid != null ? idx.ignorar.get(pid) : undefined
      for (const op of separarOpciones(l.opciones, conocidas)) {
        const ok = normalizar(op)
        if (pid != null && (conocidas.has(ok) || ignoradas?.has(ok))) continue
        const clave = `${pk}|${ok}`
        const d = opciones.get(clave) ?? { clave, productoClave: pk, productoNombre: l.item, productoId: pid, nombre: op, veces: 0 }
        d.veces++
        opciones.set(clave, d)
      }
    }
  }
  return {
    productos: [...productos.values()].sort((a, b) => b.veces - a.veces),
    opciones: [...opciones.values()].sort((a, b) => a.productoNombre.localeCompare(b.productoNombre) || b.veces - a.veces),
  }
}

/** Categoría y tipo sugeridos para un producto nuevo según la sección de influye. */
export function sugerirProducto(nombre: string, seccion: string): { categoria: string; tipo: 'producto' | 'ajuste' | 'abono' } {
  const n = normalizar(nombre)
  const s = normalizar(seccion)
  if (n === 'ley redondeo') return { categoria: '', tipo: 'ajuste' }
  if (s.includes('abono')) return { categoria: 'Pastelería', tipo: 'abono' }
  const mapa: Record<string, string> = {
    galleteria: 'Galletería',
    bolleria: 'Bollería',
    cafeteria: 'Cafetería',
    pasteleria: 'Pastelería',
    panaderia: 'Panadería',
    bebestibles: 'Bebestibles',
    bebidas: 'Bebestibles',
    sandwich: 'Salados',
    salados: 'Salados',
  }
  for (const [k, v] of Object.entries(mapa)) if (s.includes(k)) return { categoria: v, tipo: 'producto' }
  if (s.includes('cafe') || s.includes('halloween')) return { categoria: 'Cafetería', tipo: 'producto' }
  return { categoria: 'Otras', tipo: 'producto' }
}

/** Arma los lotes para la base de datos. Todo producto/opción debe existir ya en el catálogo. */
export function armarLotes(transacciones: TransaccionLeida[], c: CatalogoImport, tamano = 300) {
  const idx = indiceCatalogo(c)
  const sinResolver = new Set<string>()
  const ventas = transacciones.map((t) => ({
    numero: t.numero,
    fecha_hora: t.fechaHora,
    turno: t.turno || null,
    vendedor: t.vendedor,
    metodo_pago: t.metodo,
    total: t.total,
    descuento: t.descuento,
    con_boleta: t.boleta,
    lineas: t.lineas.map((l) => {
      const pk = normalizar(l.item)
      const pid = idx.producto.get(pk)
      if (pid == null) sinResolver.add(l.item)
      const mapaOp = pid != null ? idx.opcion.get(pid) : undefined
      const conocidas = new Set(mapaOp?.keys() ?? [])
      const ignoradas = pid != null ? idx.ignorar.get(pid) : undefined
      const opcion_ids = separarOpciones(l.opciones, conocidas)
        .filter((o) => !ignoradas?.has(normalizar(o)))
        .map((o) => {
          const id = mapaOp?.get(normalizar(o))
          if (id == null) sinResolver.add(`${l.item} · ${o}`)
          return id
        })
      return {
        producto_id: pid,
        opcion_ids,
        precio: l.precio,
        monto: l.monto,
        texto_item: l.item,
        texto_opciones: l.opciones,
      }
    }),
  }))
  const lotes: (typeof ventas)[] = []
  for (let i = 0; i < ventas.length; i += tamano) lotes.push(ventas.slice(i, i + tamano))
  return { lotes, sinResolver: [...sinResolver] }
}
