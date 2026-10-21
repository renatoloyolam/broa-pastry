// Armado de reportes para exportar (Excel, CSV y PDF).
// Las tablas se arman aquí como datos simples; las librerías pesadas
// (xlsx, jspdf) se cargan solo al momento de exportar.
// Si el usuario no ve costos, los datos llegan sin costos desde la base de
// datos y las columnas de costo simplemente no se incluyen.

import { fechaDia } from './formato'
import { ganancia, margen, type DatosPanel } from './panel'
import type { Periodo } from './periodos'

export type Celda = string | number | null
export interface Hoja {
  nombre: string
  columnas: string[]
  filas: Celda[][]
}

export interface VentaExportada {
  numero: number
  fecha: string
  hora: string
  turno: string
  vendedor: string | null
  metodo_pago: string | null
  boleta: boolean | null
  total: number
  descuento: number
  neto: number
  iva: number
  productos: string | null
}

export interface ReporteMermasExport {
  ver_costos: boolean
  por_motivo: { motivo: string; unidades: number; valor: number | null }[]
  por_producto: { nombre: string; unidades: number; valor: number | null }[]
  total: { unidades: number; valor: number | null; valor_evitable: number | null; unidades_evitables: number }
}

const r = (v: number | null | undefined) => (v == null ? null : Math.round(v))
const pct = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 10) // 40,5

export function hojasReporte(
  periodo: Pick<Periodo, 'desde' | 'hasta' | 'etiqueta'>,
  panel: DatosPanel,
  mermas: ReporteMermasExport | null,
  ventas: VentaExportada[] | null,
): Hoja[] {
  const c = panel.ver_costos
  const res = panel.resumen
  const hojas: Hoja[] = []

  const resumen: Celda[][] = [
    ['Período', periodo.desde === periodo.hasta ? fechaDia(periodo.desde) : `${fechaDia(periodo.desde)} al ${fechaDia(periodo.hasta)}`],
    ['Ventas (con IVA)', r(res.ventas)],
    ['Transacciones', res.transacciones],
    ['Productos vendidos', res.unidades],
    ['Ticket promedio', res.transacciones ? r(res.ventas / res.transacciones) : null],
    ['Abonos de tortas recibidos', r(res.abonos)],
  ]
  if (c) {
    const g = ganancia(res)
    resumen.push(
      ['Ventas netas con costo (sin IVA)', r(res.ventas_netas_costeadas)],
      ['Costo de lo vendido', r(res.costo)],
      ['Mermas', r(res.mermas)],
      ['Ganancia', r(g)],
      ['Margen %', pct(margen(res))],
      ['Ventas sin costo definido (no incluidas en la ganancia)', r(res.ventas_sin_costo)],
    )
  }
  hojas.push({ nombre: 'Resumen', columnas: ['Indicador', 'Valor'], filas: resumen })

  hojas.push({
    nombre: 'Por día',
    columnas: ['Fecha', 'Transacciones', 'Ventas con IVA', ...(c ? ['Ventas netas con costo', 'Costo', 'Mermas', 'Ganancia'] : [])],
    filas: panel.dias.map((d) => [
      fechaDia(d.fecha),
      d.transacciones,
      r(d.ventas),
      ...(c ? [r(d.ventas_netas_costeadas), r(d.costo), r(d.mermas), r(ganancia(d))] : []),
    ]),
  })

  hojas.push({
    nombre: 'Productos',
    columnas: ['Producto', 'Unidades', 'Ventas con IVA', ...(c ? ['Ventas netas con costo', 'Costo', 'Ganancia', 'Margen %', 'Unidades sin costo'] : [])],
    filas: panel.productos.map((p) => [
      p.nombre,
      p.unidades,
      r(p.ventas),
      ...(c ? [r(p.ventas_netas_costeadas), r(p.costo), r(ganancia(p)), pct(margen(p)), p.unidades_sin_costo] : []),
    ]),
  })

  hojas.push({
    nombre: 'Categorías',
    columnas: ['Categoría', 'Unidades', 'Ventas con IVA', ...(c ? ['Costo', 'Ganancia'] : [])],
    filas: panel.categorias.map((x) => [x.categoria, x.unidades, r(x.ventas), ...(c ? [r(x.costo), r(ganancia(x))] : [])]),
  })

  hojas.push({
    nombre: 'Turnos',
    columnas: ['Turno', 'Vendedor', 'Transacciones', 'Ventas con IVA', ...(c ? ['Ganancia'] : [])],
    filas: panel.turnos.map((t) => [t.turno, t.vendedor, t.transacciones, r(t.ventas), ...(c ? [r(ganancia(t))] : [])]),
  })

  if (mermas) {
    const mc = mermas.ver_costos
    hojas.push({
      nombre: 'Mermas',
      columnas: ['Producto', 'Unidades', ...(mc ? ['Costo'] : [])],
      filas: [
        ...mermas.por_producto.map((m) => [m.nombre, m.unidades, ...(mc ? [r(m.valor)] : [])]),
        [],
        ['Por motivo'],
        ...mermas.por_motivo.map((m) => [m.motivo, m.unidades, ...(mc ? [r(m.valor)] : [])]),
      ],
    })
  }

  if (ventas) hojas.push(hojaVentas(ventas))
  return hojas
}

export function hojaVentas(ventas: VentaExportada[]): Hoja {
  return {
    nombre: 'Ventas detalle',
    columnas: ['N°', 'Fecha', 'Hora', 'Turno', 'Vendedor', 'Medio de pago', 'Boleta', 'Total', 'Neto', 'IVA', 'Descuento', 'Productos'],
    filas: ventas.map((v) => [
      v.numero,
      fechaDia(v.fecha),
      v.hora,
      v.turno,
      v.vendedor,
      v.metodo_pago,
      v.boleta == null ? '' : v.boleta ? 'Sí' : 'No',
      v.total,
      v.neto,
      v.iva,
      v.descuento,
      v.productos,
    ]),
  }
}

/** CSV para Excel en español: separador ";" y BOM para que respete tildes. */
export function aCsv(hoja: Hoja): string {
  const esc = (v: Celda) => {
    if (v == null) return ''
    const s = String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lineas = [hoja.columnas, ...hoja.filas].map((f) => f.map(esc).join(';'))
  return '﻿' + lineas.join('\r\n')
}

export function nombreArchivo(base: string, periodo: Pick<Periodo, 'desde' | 'hasta'>, extension: string) {
  const rango = periodo.desde === periodo.hasta ? periodo.desde : `${periodo.desde}_a_${periodo.hasta}`
  return `broa-${base}-${rango}.${extension}`
}

/**
 * Entrega un archivo al usuario. En el iPhone usa "Compartir" (guardar en
 * Archivos, enviar por WhatsApp o correo); en el computador lo descarga.
 */
export async function entregarArchivo(contenido: Blob, nombre: string) {
  const archivo = new File([contenido], nombre, { type: contenido.type })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  if (nav.canShare?.({ files: [archivo] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [archivo], title: nombre })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // la persona canceló
    }
  }
  const url = URL.createObjectURL(contenido)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function crearExcel(hojas: Hoja[]): Promise<Blob> {
  const XLSX = await import('xlsx')
  const libro = XLSX.utils.book_new()
  for (const h of hojas) {
    const hoja = XLSX.utils.aoa_to_sheet([h.columnas, ...h.filas])
    // Formato de pesos chilenos en las columnas de montos (y en el Resumen, por fila)
    h.filas.forEach((f, i) => {
      f.forEach((v, c) => {
        const monto = h.nombre === 'Resumen' ? c === 1 && typeof f[0] === 'string' && esMonto(f[0]) : esMonto(h.columnas[c] ?? '')
        const celda = hoja[XLSX.utils.encode_cell({ r: i + 1, c })]
        if (monto && typeof v === 'number' && celda) celda.z = '"$"#,##0'
      })
    })
    hoja['!cols'] = h.columnas.map((c, i) => ({
      wch: Math.min(50, Math.max(c.length, ...h.filas.slice(0, 200).map((f) => String(f[i] ?? '').length)) + 2),
    }))
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31))
  }
  const datos = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** ¿La columna es un monto en pesos? (para darle formato $) */
const esMonto = (col: string) =>
  /venta|costo|ganancia|merma|total|neto|iva|ticket|abono|valor|descuento/i.test(col) && !/%|unidades|transacciones/i.test(col)

const pesosPdf = (v: Celda) =>
  typeof v === 'number' ? (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : v ?? ''

export async function crearPdf(titulo: string, subtitulo: string, hojas: Hoja[]): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const verde: [number, number, number] = [70, 89, 65]
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...verde)
  doc.text(titulo, 40, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110, 101, 88)
  doc.text(subtitulo, 40, 68)

  let y = 85
  for (const h of hojas) {
    const montoFila = (indicador: Celda) => typeof indicador === 'string' && esMonto(indicador)
    const filas = h.filas
      .filter((f) => f.length)
      .slice(0, 60)
      .map((f) =>
        f.map((v, i) =>
          typeof v === 'number' && (esMonto(h.columnas[i] ?? '') || (h.nombre === 'Resumen' && i === 1 && montoFila(f[0])))
            ? pesosPdf(v)
            : typeof v === 'number'
              ? v.toString().replace('.', ',')
              : (v ?? ''),
        ),
      )
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(42, 51, 39)
    if (y > 740) {
      doc.addPage()
      y = 50
    }
    doc.text(h.nombre + (h.filas.length > 60 ? ' (primeras 60 filas)' : ''), 40, y)
    autoTable(doc, {
      startY: y + 6,
      head: [h.columnas],
      body: filas as string[][],
      margin: { left: 40, right: 40 },
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: verde, textColor: [244, 241, 234] },
      alternateRowStyles: { fillColor: [244, 241, 234] },
      columnStyles: Object.fromEntries(h.columnas.map((col, i) => [i, { halign: i === 0 ? 'left' : esMonto(col) || /unidades|transacciones|%/i.test(col) ? 'right' : 'left' }])),
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24
  }
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`Broa Pastry by Sofía · página ${i} de ${total}`, 40, 820)
  }
  return doc.output('blob')
}
