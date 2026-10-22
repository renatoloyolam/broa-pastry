// Plantilla Excel de costos: se descarga con todos los productos y opciones
// (y sus costos actuales), se completa y se vuelve a subir.
//
// Cada fila tiene un "Código" (P12 = producto 12, O345 = opción 345) que
// permite reconocerla al subirla aunque se cambie el orden de las filas.
// Columnas editables: Forma de costo, Costo ingredientes y packaging,
// Mano de obra y gastos, Otros costos. Todo SIN IVA.

import type { Adicional, Categoria, Costo, Opcion, Producto, Receta } from './catalogo'
import { leerMonto, normalizar } from './importador'

export const CONCEPTO_MANO_OBRA = 'Mano de obra y gastos (planilla)'

export type Forma = 'A mano' | 'Sin costo propio' | 'Receta' | ''

export interface FilaPlantilla {
  codigo: string
  producto_id: number
  opcion_id: number | null
  categoria: string
  producto: string
  opcion: string
  /** Precio de venta con IVA (producto + opción) */
  precio: number | null
  forma: Forma
  costo: number | null
  manoObra: number
  otros: number
  estado: 'Con costo' | 'Sin costo' | 'Por receta'
  /** Fila del producto "padre" (para el margen de las opciones) */
  codigoPadre: string | null
}

interface DatosCatalogo {
  categorias: Categoria[]
  productos: Producto[]
  opciones: Opcion[]
  costos: Costo[]
  adicionales: Adicional[]
  recetas: Receta[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Arma las filas de la plantilla con los costos actuales. */
export function armarFilas(d: DatosCatalogo): FilaPlantilla[] {
  const cat = new Map(d.categorias.map((c) => [c.id, c]))
  const costoDe = (pid: number | null, oid: number | null) =>
    d.costos.find((c) => (oid ? c.opcion_id === oid : c.producto_id === pid && c.opcion_id == null))
  const adicionalesDe = (defId: number) => d.adicionales.filter((a) => a.definicion_id === defId)

  const fila = (p: Producto, o: Opcion | null): FilaPlantilla => {
    const c = costoDe(o ? null : p.id, o?.id ?? null)
    const adic = c ? adicionalesDe(c.definicion_id) : []
    const manoObra = r2(adic.filter((a) => a.concepto === CONCEPTO_MANO_OBRA).reduce((s, a) => s + a.monto_neto, 0))
    const otros = r2(adic.filter((a) => a.concepto !== CONCEPTO_MANO_OBRA).reduce((s, a) => s + a.monto_neto, 0))
    let forma: Forma = ''
    let costo: number | null = null
    if (c?.modo === 'manual') {
      forma = 'A mano'
      costo = c.costo_manual_neto
    } else if (c?.modo === 'cero') {
      forma = 'Sin costo propio'
      costo = 0
    } else if (c?.modo === 'receta') {
      forma = 'Receta'
      const receta = d.recetas.find((x) => x.id === c.receta_id)
      costo = receta?.costo_unitario != null ? r2(receta.costo_unitario * c.cantidad_receta) : null
    }
    return {
      codigo: o ? `O${o.id}` : `P${p.id}`,
      producto_id: p.id,
      opcion_id: o?.id ?? null,
      categoria: (p.categoria_id && cat.get(p.categoria_id)?.nombre) || 'Sin categoría',
      producto: p.nombre,
      opcion: o?.nombre ?? '',
      precio: o ? (p.precio_referencia ?? 0) + (o.precio_referencia ?? 0) || null : p.precio_referencia || null,
      forma,
      costo,
      manoObra,
      otros,
      estado: !c ? 'Sin costo' : c.modo === 'receta' ? 'Por receta' : 'Con costo',
      codigoPadre: o ? `P${p.id}` : null,
    }
  }

  const ordenCat = (p: Producto) => (p.categoria_id ? (cat.get(p.categoria_id)?.orden ?? 500) : 999)
  const productos = d.productos
    .filter((p) => p.tipo === 'producto' && p.activo)
    .sort((a, b) => ordenCat(a) - ordenCat(b) || a.nombre.localeCompare(b.nombre, 'es'))
  const filas: FilaPlantilla[] = []
  for (const p of productos) {
    filas.push(fila(p, null))
    for (const o of d.opciones.filter((x) => x.producto_id === p.id && x.activa).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
      filas.push(fila(p, o))
    }
  }
  return filas
}

// ---------------------------------------------------------------------
// Lectura de la plantilla completada
// ---------------------------------------------------------------------

export interface CambioCosto {
  codigo: string
  nombre: string
  antes: number | null
  despues: number
  enviar: { producto_id: number; opcion_id: number | null; modo: 'manual' | 'cero'; costo: number; mano_obra: number; otros: number }
}

export interface ResultadoPlantilla {
  cambios: CambioCosto[]
  errores: string[]
  sinCambios: number
  filasLeidas: number
}

const total = (f: Pick<FilaPlantilla, 'costo' | 'manoObra' | 'otros'>) => (f.costo ?? 0) + f.manoObra + f.otros
const igual = (a: number, b: number) => Math.abs(a - b) < 0.005

function leerForma(v: unknown): Forma | null {
  const t = normalizar(v)
  if (!t) return ''
  if (t.startsWith('a mano') || t === 'manual') return 'A mano'
  if (t.startsWith('sin costo')) return 'Sin costo propio'
  if (t.startsWith('receta') || t.startsWith('por receta')) return 'Receta'
  return null
}

/**
 * Compara la plantilla subida con los costos actuales y devuelve solo lo que
 * cambió. `tabla` son las filas de la hoja "Costos" (arreglos de celdas).
 */
export function leerPlantilla(tabla: unknown[][], actuales: FilaPlantilla[]): ResultadoPlantilla {
  const errores: string[] = []
  const iEnc = tabla.findIndex((f) => (f ?? []).some((c) => normalizar(c) === 'codigo'))
  if (iEnc < 0) {
    return { cambios: [], errores: ['No encontramos la columna "Código". Usa la plantilla descargada desde la app sin borrar columnas.'], sinCambios: 0, filasLeidas: 0 }
  }
  const enc = tabla[iEnc].map(normalizar)
  const col = (...nombres: string[]) => enc.findIndex((e) => nombres.some((n) => e.startsWith(n)))
  const iCod = col('codigo')
  const iForma = col('forma de costo')
  const iCosto = col('costo ingredientes')
  const iMO = col('mano de obra')
  const iOtros = col('otros costos')
  if ([iForma, iCosto, iMO, iOtros].some((i) => i < 0)) {
    return { cambios: [], errores: ['Faltan columnas de la plantilla. Descárgala de nuevo desde la app.'], sinCambios: 0, filasLeidas: 0 }
  }

  const porCodigo = new Map(actuales.map((f) => [f.codigo, f]))
  const cambios: CambioCosto[] = []
  let sinCambios = 0
  let filasLeidas = 0
  const vistos = new Set<string>()

  for (let i = iEnc + 1; i < tabla.length; i++) {
    const fila = tabla[i] ?? []
    const codigo = String(fila[iCod] ?? '').trim().toUpperCase()
    if (!codigo) continue
    filasLeidas++
    const nFila = i + 1
    const actual = porCodigo.get(codigo)
    if (!actual) {
      errores.push(`Fila ${nFila}: el código ${codigo} no existe (¿se modificó o el producto se desactivó?).`)
      continue
    }
    if (vistos.has(codigo)) {
      errores.push(`Fila ${nFila}: el código ${codigo} está repetido.`)
      continue
    }
    vistos.add(codigo)
    const nombre = actual.opcion ? `${actual.producto} · ${actual.opcion}` : actual.producto

    const forma = leerForma(fila[iForma])
    if (forma == null) {
      errores.push(`Fila ${nFila} (${nombre}): "Forma de costo" debe ser A mano, Sin costo propio o Receta.`)
      continue
    }
    const vacio = (v: unknown) => String(v ?? '').trim() === ''
    const num = (v: unknown) => (vacio(v) ? null : leerMonto(v))
    const invalido = [fila[iCosto], fila[iMO], fila[iOtros]].some((v) => !vacio(v) && num(v) == null)
    const costo = num(fila[iCosto])
    const mo = num(fila[iMO]) ?? 0
    const otros = num(fila[iOtros]) ?? 0
    if (invalido || (costo ?? 0) < 0 || mo < 0 || otros < 0) {
      errores.push(`Fila ${nFila} (${nombre}): hay un monto que no es un número válido.`)
      continue
    }

    // Receta: se mantiene como está (se edita en la app)
    if (forma === 'Receta') {
      if (actual.forma !== 'Receta') errores.push(`Fila ${nFila} (${nombre}): para usar una receta, defínela en la app.`)
      else sinCambios++
      continue
    }
    // Vacío: sigue sin costo (o sin cambios)
    const modo: 'manual' | 'cero' | null =
      forma === 'Sin costo propio' ? 'cero' : forma === 'A mano' || costo != null ? 'manual' : null
    if (modo == null) {
      sinCambios++
      continue
    }
    if (modo === 'manual' && costo == null) {
      errores.push(`Fila ${nFila} (${nombre}): falta el costo de ingredientes y packaging.`)
      continue
    }
    const nuevo = { costo: modo === 'cero' ? 0 : costo!, manoObra: mo, otros }
    const mismoModo = (modo === 'manual' && actual.forma === 'A mano') || (modo === 'cero' && actual.forma === 'Sin costo propio')
    if (mismoModo && igual(nuevo.costo, actual.costo ?? 0) && igual(mo, actual.manoObra) && igual(otros, actual.otros)) {
      sinCambios++
      continue
    }
    cambios.push({
      codigo,
      nombre,
      antes: actual.estado === 'Sin costo' ? null : total(actual),
      despues: total(nuevo),
      enviar: {
        producto_id: actual.producto_id,
        opcion_id: actual.opcion_id,
        modo,
        costo: Math.round(nuevo.costo * 100) / 100,
        mano_obra: Math.round(mo * 100) / 100,
        otros: Math.round(otros * 100) / 100,
      },
    })
  }
  return { cambios, errores, sinCambios, filasLeidas }
}

// ---------------------------------------------------------------------
// Excel con formato (exceljs se carga solo al descargar)
// ---------------------------------------------------------------------

const VERDE = 'FF324D4D'
const GRIS = 'FFF1EFEA'

export async function crearPlantillaExcel(filas: FilaPlantilla[], fecha: string): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Broa Pastry'

  // ---- Instrucciones ----
  const ins = libro.addWorksheet('Instrucciones', { properties: { tabColor: { argb: VERDE } } })
  ins.getColumn(1).width = 110
  const lineas: [string, boolean?][] = [
    ['Plantilla de costos · Broa Pastry', true],
    [`Generada el ${fecha}. Contiene costos: no compartir con el personal de caja.`],
    [''],
    ['Cómo usarla', true],
    ['1. Ve a la hoja "Costos". Cada fila es un producto o una opción (sabor, tamaño, leche…) tal como se vende en influye.'],
    ['2. Completa o corrige SOLO las columnas en blanco: Forma de costo, Costo ingredientes y packaging, Mano de obra y gastos, Otros costos.'],
    ['3. Todos los montos van SIN IVA y por UNA unidad vendida.'],
    ['4. Guarda el archivo y súbelo en la app: Productos → Costos en Excel → Subir plantilla. La app te mostrará los cambios antes de aplicarlos.'],
    [''],
    ['Forma de costo', true],
    ['A mano: el costo se escribe en la columna "Costo ingredientes y packaging".'],
    ['Sin costo propio: el producto no tiene costo propio porque el costo está en sus opciones (ej.: Galletas, Cupcakes, Café), o la opción no cambia el costo (ej.: Leche entera).'],
    ['Receta: el costo lo calcula una receta de la app. Estas filas no se modifican desde el Excel (se editan en la app).'],
    ['Si dejas la forma y el costo en blanco, el producto sigue sin costo.'],
    [''],
    ['Cómo se calcula el costo de una venta', true],
    ['Costo del producto + costo de cada opción elegida. Ej.: un Latte chico = "Café de especialidad" (sin costo propio) + opción "Latte" + opción "Leche sin lactosa".'],
    ['Si una venta trae 4 galletas de nuez, se suma 4 veces el costo de la opción "Galleta nuez".'],
    [''],
    ['Importante', true],
    ['No modifiques ni borres la columna "Código": es la que permite reconocer cada fila. Puedes ordenar o filtrar las filas.'],
    ['Las columnas grises son informativas (precio, costo total y margen se calculan solos).'],
    ['Los costos que cambies rigen desde el día en que subes el archivo; las ventas anteriores conservan su costo.'],
    ['Si un producto recibe costo por primera vez, ese costo se aplica también a sus ventas anteriores.'],
    ['Para productos nuevos que aún no aparecen aquí: primero se importan las ventas de influye y luego se descarga una plantilla nueva.'],
  ]
  for (const [texto, titulo] of lineas) {
    const fila = ins.addRow([texto])
    fila.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    if (titulo) fila.getCell(1).font = { bold: true, size: 13, color: { argb: VERDE } }
  }

  // ---- Costos ----
  const hoja = libro.addWorksheet('Costos', { views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }] })
  hoja.columns = [
    { header: 'Código', key: 'codigo', width: 9 },
    { header: 'Categoría', key: 'categoria', width: 14 },
    { header: 'Producto', key: 'producto', width: 32 },
    { header: 'Opción', key: 'opcion', width: 30 },
    { header: 'Precio de venta (con IVA)', key: 'precio', width: 14 },
    { header: 'Forma de costo', key: 'forma', width: 17 },
    { header: 'Costo ingredientes y packaging (sin IVA)', key: 'costo', width: 18 },
    { header: 'Mano de obra y gastos (sin IVA)', key: 'manoObra', width: 16 },
    { header: 'Otros costos (sin IVA)', key: 'otros', width: 13 },
    { header: 'Costo total por unidad', key: 'total', width: 14 },
    { header: 'Margen', key: 'margen', width: 10 },
    { header: 'Estado actual', key: 'estado', width: 13 },
    { header: 'Notas (no se cargan)', key: 'notas', width: 30 },
  ]
  const encabezado = hoja.getRow(1)
  encabezado.height = 46
  encabezado.eachCell((c, i) => {
    const editable = i >= 6 && i <= 9
    c.font = { bold: true, color: { argb: editable ? 'FF2A3327' : 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: editable ? 'FFF2D7C3' : VERDE } }
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
  })

  const filaDe = new Map<string, number>()
  filas.forEach((f, i) => filaDe.set(f.codigo, i + 2))
  filas.forEach((f, i) => {
    const n = i + 2
    const row = hoja.addRow({
      codigo: f.codigo,
      categoria: f.categoria,
      producto: f.producto,
      opcion: f.opcion,
      precio: f.precio,
      forma: f.forma,
      costo: f.costo,
      manoObra: f.manoObra || null,
      otros: f.otros || null,
      estado: f.estado,
    })
    row.getCell('total').value = { formula: `IF(COUNT(G${n}:I${n})=0,"",SUM(G${n}:I${n}))` }
    // Margen: para una opción se suma el costo del producto (fila padre)
    const padre = f.codigoPadre ? filaDe.get(f.codigoPadre) : undefined
    const costoTotal = padre ? `(J${n}+N(J${padre}))` : `J${n}`
    row.getCell('margen').value = {
      formula: `IF(OR(E${n}="",J${n}=""),"",(E${n}/1.19-${costoTotal})/(E${n}/1.19))`,
    }
    row.eachCell({ includeEmpty: true }, (c, col) => {
      const editable = col >= 6 && col <= 9
      if (!editable && col <= 12) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }
      if (col === 13) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFD9D2C4' } } }
    })
    if (!f.opcion) row.getCell('producto').font = { bold: true }
    else row.getCell('opcion').alignment = { indent: 1 }
    if (f.estado === 'Sin costo') row.getCell('estado').font = { color: { argb: 'FFB4472F' }, bold: true }
    row.getCell('forma').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"A mano,Sin costo propio,Receta"'],
      showErrorMessage: true,
      errorTitle: 'Forma de costo',
      error: 'Elige A mano, Sin costo propio o Receta.',
    }
    for (const k of ['costo', 'manoObra', 'otros'] as const) {
      row.getCell(k).dataValidation = {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        error: 'Escribe un monto en pesos, sin IVA (0 o más).',
      }
    }
  })
  for (const k of ['precio', 'costo', 'manoObra', 'otros', 'total']) hoja.getColumn(k).numFmt = '"$"#,##0'
  hoja.getColumn('margen').numFmt = '0%'
  hoja.autoFilter = { from: 'A1', to: 'M1' }
  hoja.getRow(1).getCell(1).note = 'No modificar: identifica cada producto u opción.'

  const datos = await libro.xlsx.writeBuffer()
  return new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
