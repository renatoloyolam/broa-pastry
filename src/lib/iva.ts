// IVA estimado del mes (para planificar el F29). Los datos vienen de iva_mes().
// Incluye el lector del Registro de Compras del SII (CSV separado por ";").
import { normalizar } from './importador'
import { moverMes } from './finanzas'

export const TIPOS_DOC = ['Factura', 'Factura exenta', 'Factura de compra', 'Nota de crédito', 'Nota de débito', 'Importación', 'Otro'] as const
export type TipoDoc = (typeof TIPOS_DOC)[number]
export const CATEGORIAS_COMPRA = ['Insumos', 'Packaging', 'Gastos del local', 'Equipos', 'Otros'] as const
export type CategoriaCompra = (typeof CATEGORIAS_COMPRA)[number]

export interface Compra {
  id: number
  fecha: string | null
  tipo_doc: TipoDoc
  rut: string | null
  proveedor: string
  folio: string | null
  neto: number
  exento: number
  iva: number
  total: number
  categoria: CategoriaCompra
  nota: string | null
  origen: 'manual' | 'sii'
}

export interface DatosIva {
  mes: string
  hoy: string
  tasa_iva: number
  precios_incluyen_iva: boolean
  tasa_ppm: number
  remanente_anterior: number
  ultimo_dia: string | null
  cobrado: { ventas: number; abonos: number; sin_boleta: number }
  compras: Compra[]
}

/** Las notas de crédito restan; el resto suma. */
export const signo = (t: TipoDoc) => (t === 'Nota de crédito' ? -1 : 1)

export function calcularIva(d: DatosIva) {
  const tasa = Number(d.tasa_iva)
  const ivaDe = (monto: number) => (d.precios_incluyen_iva ? (monto * tasa) / (1 + tasa) : monto * tasa)
  const cobrado = d.cobrado.ventas + d.cobrado.abonos
  const debito = ivaDe(cobrado)
  const debitoSinBoleta = ivaDe(d.cobrado.sin_boleta)
  const credito = d.compras.reduce((s, c) => s + signo(c.tipo_doc) * c.iva, 0)
  const netoCompras = d.compras.reduce((s, c) => s + signo(c.tipo_doc) * (c.neto + c.exento), 0)
  const disponible = credito + d.remanente_anterior
  const ivaPagar = Math.max(0, debito - disponible)
  const remanenteSiguiente = Math.max(0, disponible - debito)
  const ventasNetas = d.precios_incluyen_iva ? cobrado - debito : cobrado
  const ppm = ventasNetas * Number(d.tasa_ppm)
  const total = ivaPagar + ppm
  return {
    cobrado,
    debito,
    debitoSinBoleta,
    credito,
    netoCompras,
    remanenteAnterior: d.remanente_anterior,
    ivaPagar,
    remanenteSiguiente,
    ventasNetas,
    ppm,
    total,
    /** Cuánto apartar por cada $100.000 cobrados */
    apartarPor100mil: cobrado > 0 ? (total / cobrado) * 100_000 : null,
    /** El F29 por internet vence el día 20 del mes siguiente */
    vence: `${moverMes(d.mes, 1).slice(0, 8)}20`,
  }
}

// ---------------------------------------------------------------------
// Registro de Compras del SII
// ---------------------------------------------------------------------

/** Lee el archivo: el SII lo entrega en latin1; si viene en UTF-8 también sirve. */
export function decodificar(bytes: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Separa una línea por ";" (o "," si no hay ";"), respetando comillas. */
function separar(linea: string, sep: string) {
  const celdas: string[] = []
  let actual = ''
  let comillas = false
  for (const ch of linea) {
    if (ch === '"') comillas = !comillas
    else if (ch === sep && !comillas) {
      celdas.push(actual.trim())
      actual = ''
    } else actual += ch
  }
  celdas.push(actual.trim())
  return celdas
}

const TIPO_POR_CODIGO: Record<string, TipoDoc> = {
  '29': 'Factura', '30': 'Factura', '33': 'Factura',
  '32': 'Factura exenta', '34': 'Factura exenta',
  '45': 'Factura de compra', '46': 'Factura de compra',
  '55': 'Nota de débito', '56': 'Nota de débito',
  '60': 'Nota de crédito', '61': 'Nota de crédito',
  '914': 'Importación',
}

/** "1.234" / "1234" / "-1234" → 1234 (el signo lo da el tipo de documento). */
function entero(t: string | undefined) {
  if (!t) return 0
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : NaN
}

/** "05/10/2026" o "2026-10-05" → "2026-10-05" */
function fechaIso(t: string | undefined) {
  if (!t) return null
  const a = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (a) return `${a[3]}-${a[2].padStart(2, '0')}-${a[1].padStart(2, '0')}`
  const b = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return b ? b[0] : null
}

export interface FilaSii {
  fecha: string | null
  tipo_doc: TipoDoc
  rut: string
  proveedor: string
  folio: string
  neto: number
  exento: number
  iva: number
  total: number
}

export function leerRegistroCompras(texto: string): { filas: FilaSii[]; errores: string[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lineas.length === 0) return { filas: [], errores: ['El archivo está vacío.'] }
  const sep = lineas[0].includes(';') ? ';' : ','
  const enc = separar(lineas[0], sep).map(normalizar)
  const col = (...nombres: string[]) => enc.findIndex((e) => nombres.some((n) => e === n))
  const c = {
    tipo: col('tipo doc', 'tipo documento', 'tipo dte'),
    rut: col('rut proveedor', 'rut emisor', 'rut'),
    razon: col('razon social', 'proveedor', 'nombre proveedor'),
    folio: col('folio', 'numero', 'nro documento'),
    fecha: col('fecha docto', 'fecha documento', 'fecha emision', 'fecha'),
    exento: col('monto exento'),
    neto: col('monto neto'),
    iva: col('monto iva recuperable', 'iva recuperable', 'monto iva'),
    ivaActivo: col('iva activo fijo'),
    total: col('monto total', 'total'),
  }
  if (c.tipo < 0 || c.folio < 0 || c.iva < 0) {
    return {
      filas: [],
      errores: ['Este archivo no parece el Registro de Compras del SII (faltan las columnas "Tipo Doc", "Folio" o "Monto IVA Recuperable").'],
    }
  }

  const filas: FilaSii[] = []
  const errores: string[] = []
  lineas.slice(1).forEach((linea, i) => {
    const x = separar(linea, sep)
    const codigo = x[c.tipo]?.replace(/\D/g, '')
    if (!codigo) return // filas de totales o vacías
    const tipo_doc = TIPO_POR_CODIGO[codigo] ?? 'Otro'
    const neto = entero(x[c.neto])
    const exento = entero(x[c.exento])
    const iva = entero(x[c.iva]) + (c.ivaActivo >= 0 ? entero(x[c.ivaActivo]) : 0)
    const total = entero(x[c.total])
    if ([neto, exento, iva, total].some(Number.isNaN)) {
      errores.push(`Fila ${i + 2}: hay un monto que no es un número.`)
      return
    }
    filas.push({
      fecha: fechaIso(x[c.fecha]),
      tipo_doc,
      rut: (x[c.rut] ?? '').toUpperCase().replace(/\./g, ''),
      proveedor: (c.razon >= 0 ? x[c.razon] : '') || 'Sin nombre',
      folio: x[c.folio] ?? '',
      neto,
      exento,
      iva,
      total: total || neto + exento + iva,
    })
  })
  return { filas, errores }
}
