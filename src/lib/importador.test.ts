import { describe, expect, it } from 'vitest'
import {
  agruparTransacciones,
  armarLotes,
  buscarDesconocidos,
  leerFechaHora,
  leerLibro,
  leerMonto,
  repartirDescuento,
  separarOpciones,
  sugerirProducto,
  type CatalogoImport,
  type Hojas,
} from './importador'

// Libro con la misma forma que exporta influye.app (fila 1 = título, fila 2 = encabezados).
// La fila de título viene con celdas vacías, igual que en el archivo real.
const titulo = ['Transacciones 00:00 10/10/2026 - 23:59 10/10/2026', '', '', '', '', '']
const encItems = ['#', 'Fecha ingreso', 'Fecha completado', 'Duración', 'Día', 'Semana', 'Ingresada por', 'Cliente', 'Correo',
  'Teléfono', 'Tipo venta', 'Item', 'Sección', 'Comentario item', 'Precio', 'Descuento al total', 'Comentario pedido']
const fila = (n: number, fecha: string, item: string, seccion: string, coment: string, precio: number | string, desc = 0) =>
  [n, fecha, '', '', '', '', 'Paula Bustos', '', '', '', 'Servir', item, seccion, coment, precio, desc, '']
const encTx = ['#', 'Fecha ingreso', 'Fecha completado', 'Duración', 'Día', 'Semana', 'Ingresada por', 'Cliente', 'Correo',
  'Teléfono', 'Tipo venta', 'Mesa', 'Total', 'Subtotal sin costo de reparto', 'Método de pago', 'Repartidor', 'Dirección',
  'Costo reparto', 'Descuento al total', 'Total propina', 'Método de pago propina', 'Comentario', 'Boleta Electrónica',
  'Total boleta', 'IVA', 'Medio Venta']
const tx = (n: number, total: number, metodo: string, desc: number, boleta: string) => {
  const f: unknown[] = new Array(encTx.length).fill('')
  f[0] = n
  f[12] = total
  f[14] = metodo
  f[18] = desc
  f[22] = boleta
  return f
}

const libro: Hojas = {
  Transacciones: [titulo, encTx, tx(149410, 1170, 'Efectivo', 130, 'Si'), tx(149411, 2000, 'Débito', 0, 'Si'), tx(149500, 5000, 'Crédito', 0, 'No')],
  Items: [
    titulo,
    encItems,
    fila(149410, '09:02 10/10/2026', 'Alfajor chips', 'Galletería', '', 1300, 130),
    fila(149411, '09:31 10/10/2026', 'Danesas', 'Galletería', '', 500),
    fila(149411, '09:31 10/10/2026', 'Danesas', 'Galletería', '', 500),
    fila(149411, '09:31 10/10/2026', 'Galletas', 'Galletería', 'Galleta nuez, Galleta nuez', '1,000.00'),
    fila(149500, '18:10 10/10/2026', 'Producto Nuevo', 'Bollería', 'Sabor raro', 5000),
    fila(149600, 'no es fecha', 'Danesas', 'Galletería', '', 500),
  ],
  Cancelados: [titulo, ['#', 'Fecha ingreso', 'Total']],
}

const catalogo: CatalogoImport = {
  productos: [
    { id: 1, nombre: 'Alfajor chips', tipo: 'producto' },
    { id: 2, nombre: 'Danesas', tipo: 'producto' },
    { id: 3, nombre: 'Galletas', tipo: 'producto' },
  ],
  opciones: [{ id: 30, producto_id: 3, nombre: 'Galleta nuez' }],
  aliasProductos: [],
  aliasOpciones: [],
}

describe('valores del Excel', () => {
  it('montos en formato influye y chileno', () => {
    expect(leerMonto('2,500.00')).toBe(2500)
    expect(leerMonto('1,170')).toBe(1170)
    expect(leerMonto(1300)).toBe(1300)
    expect(leerMonto('2.500')).toBe(2500)
    expect(leerMonto('-4')).toBe(-4)
    expect(leerMonto('')).toBeNull()
    expect(leerMonto('abc')).toBeNull()
  })

  it('fechas de influye y otros formatos', () => {
    expect(leerFechaHora('09:01 10/10/2026')).toBe('2026-10-10 09:01')
    expect(leerFechaHora('10/10/2026 18:05')).toBe('2026-10-10 18:05')
    expect(leerFechaHora('2026-10-10 18:05')).toBe('2026-10-10 18:05')
    expect(leerFechaHora(46305.5)).toBe('2026-10-10 12:00') // número de serie de Excel
    expect(leerFechaHora('31/02/2026')).toBeNull()
    expect(leerFechaHora('hola')).toBeNull()
  })
})

describe('lectura del libro', () => {
  it('detecta columnas y lee filas; reporta la fila con fecha inválida', () => {
    const r = leerLibro(libro)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.lineas.filter((l) => l.item).length).toBe(5)
    expect(r.errores).toEqual([{ hoja: 'Items', fila: 8, motivo: 'fecha no válida' }])
    expect(r.transacciones.get(149410)?.metodo).toBe('Efectivo')
    expect(r.mapeo.item).toBe('Item')
  })

  it('archivo equivocado: explica que no encontró productos', () => {
    const r = leerLibro({ Hoja1: [['Nombre', 'Teléfono', 'Correo'], ['Ana', '123', 'a@b.cl']] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('sin_items')
    expect(r.titulos).toContain('Nombre')
  })

  it('columnas con otros títulos: usa el mapeo guardado', () => {
    const raro: Hojas = {
      Ventas: [
        ['Nro', 'Cuándo', 'Artículo', 'Valor'],
        [1, '10/10/2026 10:00', 'Danesas', 500],
      ],
    }
    const sin = leerLibro(raro)
    expect(sin.ok).toBe(false)
    const con = leerLibro(raro, { numero: 'Nro', fecha: 'Cuándo', item: 'Artículo', precio: 'Valor' })
    expect(con.ok).toBe(true)
    if (con.ok) expect(con.lineas[0]).toMatchObject({ numero: 1, item: 'Danesas', precio: 500 })
  })
})

describe('transacciones', () => {
  it('reparte el descuento y calza con el total pagado', () => {
    expect(repartirDescuento([1300], 130)).toEqual([1170])
    const m = repartirDescuento([1000, 1000, 1000], 100)
    expect(m.reduce((a, b) => a + b, 0)).toBe(2900)
    expect(Math.max(...m) - Math.min(...m)).toBeLessThanOrEqual(1)
    // Ítems de ajuste negativos (Ley Redondeo) no reciben descuento
    expect(repartirDescuento([2000, -2], 200)).toEqual([1800, -2])
  })

  it('agrupa por número, descarta la que tiene errores y usa el total de la hoja Transacciones', () => {
    const r = leerLibro(libro)
    if (!r.ok) throw new Error('debía leer')
    const g = agruparTransacciones(r)
    expect(g.transacciones.map((t) => t.numero)).toEqual([149410, 149411, 149500])
    expect(g.descartadas).toEqual([{ numero: 149600, motivo: 'tiene filas con errores' }])
    const t1 = g.transacciones[0]
    expect(t1).toMatchObject({ total: 1170, descuento: 130, metodo: 'Efectivo', boleta: true })
    expect(t1.lineas[0].monto).toBe(1170)
    for (const t of g.transacciones) expect(t.lineas.reduce((s, l) => s + l.monto, 0)).toBe(t.total)
  })

  it('ignora transacciones canceladas', () => {
    const conCancelada: Hojas = { ...libro, Cancelados: [titulo, ['#', 'Total'], [149500, 5000]] }
    const r = leerLibro(conCancelada)
    if (!r.ok) throw new Error('debía leer')
    const g = agruparTransacciones(r)
    expect(g.canceladas).toBe(1)
    expect(g.transacciones.some((t) => t.numero === 149500)).toBe(false)
  })
})

describe('vinculación con el catálogo', () => {
  it('separa opciones respetando nombres conocidos que contienen coma', () => {
    expect(separarOpciones('Latte, Leche sin lactosa', new Set())).toEqual(['Latte', 'Leche sin lactosa'])
    expect(separarOpciones('Pan, queso, Extra', new Set(['pan, queso']))).toEqual(['Pan, queso', 'Extra'])
    expect(separarOpciones('avena ,manzana y pasas', new Set())).toEqual(['avena ,manzana y pasas'])
    expect(separarOpciones('', new Set())).toEqual([])
  })

  it('encuentra productos y opciones que no existen, sin importar tildes ni mayúsculas', () => {
    const r = leerLibro(libro)
    if (!r.ok) throw new Error('debía leer')
    const { transacciones } = agruparTransacciones(r)
    const conTildes = { ...catalogo, productos: [...catalogo.productos.slice(0, 2), { id: 3, nombre: '  GALLETAS ', tipo: 'producto' }] }
    const d = buscarDesconocidos(transacciones, conTildes)
    expect(d.productos.map((p) => p.nombre)).toEqual(['Producto Nuevo'])
    expect(d.opciones.map((o) => o.nombre)).toEqual(['Sabor raro'])
  })

  it('usa alias aprendidos y arma lotes con ids', () => {
    const r = leerLibro(libro)
    if (!r.ok) throw new Error('debía leer')
    const { transacciones } = agruparTransacciones(r)
    const conAlias: CatalogoImport = {
      ...catalogo,
      opciones: [...catalogo.opciones, { id: 40, producto_id: 1, nombre: 'Sabor raro' }],
      aliasProductos: [{ alias: 'producto nuevo', producto_id: 1 }],
    }
    const d = buscarDesconocidos(transacciones, conAlias)
    expect(d.productos).toEqual([])
    const { lotes, sinResolver } = armarLotes(transacciones, conAlias, 2)
    expect(sinResolver).toEqual([])
    expect(lotes.length).toBe(2)
    const galletas = lotes[0][1].lineas[2]
    expect(galletas).toMatchObject({ producto_id: 3, opcion_ids: [30, 30], monto: 1000 })
  })

  it('comentarios de caja marcados como "ignorar" no se preguntan ni se guardan como opción', () => {
    const conComentario: Hojas = {
      ...libro,
      Items: [titulo, encItems, fila(149411, '09:31 10/10/2026', 'Galletas', 'Galletería', 'Galleta nuez, sin crema', 500)],
    }
    const r = leerLibro(conComentario)
    if (!r.ok) throw new Error('debía leer')
    const { transacciones } = agruparTransacciones(r)
    expect(buscarDesconocidos(transacciones, catalogo).opciones.map((o) => o.nombre)).toEqual(['sin crema'])
    const conIgnorar: CatalogoImport = { ...catalogo, aliasOpciones: [{ producto_id: 3, alias: 'sin crema', opcion_id: null }] }
    expect(buscarDesconocidos(transacciones, conIgnorar).opciones).toEqual([])
    const { lotes, sinResolver } = armarLotes(transacciones, conIgnorar)
    expect(sinResolver).toEqual([])
    expect(lotes[0][0].lineas[0].opcion_ids).toEqual([30])
  })

  it('sugiere categoría y tipo para productos nuevos', () => {
    expect(sugerirProducto('Ley Redondeo', '')).toEqual({ categoria: '', tipo: 'ajuste' })
    expect(sugerirProducto('Tortas de 15 cm', 'ABONOS DE TORTAS')).toEqual({ categoria: 'Pastelería', tipo: 'abono' })
    expect(sugerirProducto('Empanada', 'Sandwich')).toEqual({ categoria: 'Salados', tipo: 'producto' })
    expect(sugerirProducto('Bolsa', 'EXTRAS')).toEqual({ categoria: 'Otras', tipo: 'producto' })
  })
})
