import { describe, expect, it } from 'vitest'
import { calcularIva, decodificar, leerRegistroCompras, type Compra, type DatosIva } from './iva'

const compra = (c: Partial<Compra>): Compra => ({
  id: 1, fecha: '2026-10-05', tipo_doc: 'Factura', rut: null, proveedor: 'Molino', folio: null,
  neto: 0, exento: 0, iva: 0, total: 0, categoria: 'Insumos', nota: null, origen: 'manual', ...c,
})

const base: DatosIva = {
  mes: '2026-10-01', hoy: '2026-10-22', tasa_iva: 0.19, precios_incluyen_iva: true, tasa_ppm: 0.0025,
  remanente_anterior: 0, ultimo_dia: '2026-10-20',
  cobrado: { ventas: 11_305_000, abonos: 595_000, sin_boleta: 119_000 }, // 11.900.000 → IVA 1.900.000
  compras: [
    compra({ neto: 4_000_000, iva: 760_000 }),
    compra({ id: 2, tipo_doc: 'Nota de crédito', neto: 100_000, iva: 19_000 }),
  ],
}

describe('IVA del mes', () => {
  it('débito (incluye abonos) − crédito (notas de crédito restan) + PPM', () => {
    const f = calcularIva(base)
    expect(f.debito).toBeCloseTo(1_900_000)
    expect(f.credito).toBe(741_000)
    expect(f.ivaPagar).toBeCloseTo(1_159_000)
    expect(f.ppm).toBeCloseTo(25_000) // 10.000.000 × 0,25%
    expect(f.total).toBeCloseTo(1_184_000)
    expect(f.debitoSinBoleta).toBeCloseTo(19_000)
    expect(f.apartarPor100mil).toBeCloseTo(9_949.6, 0)
    expect(f.vence).toBe('2026-11-20')
  })

  it('si el crédito supera al débito no se paga IVA y queda remanente', () => {
    const f = calcularIva({ ...base, remanente_anterior: 1_500_000 })
    expect(f.ivaPagar).toBe(0)
    expect(f.remanenteSiguiente).toBeCloseTo(341_000)
    expect(f.total).toBeCloseTo(25_000)
  })

  it('diciembre vence el 20 de enero', () => {
    expect(calcularIva({ ...base, mes: '2026-12-01' }).vence).toBe('2027-01-20')
  })
})

describe('Registro de Compras del SII', () => {
  const csv = [
    'Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total;Monto Neto Activo Fijo;IVA Activo Fijo',
    '1;33;Del Giro;76.123.456-7;MOLINO SAN JOSÉ SPA;1234;05/10/2026;06/10/2026 10:11:12;;0;100000;19000;0;;119000;0;0',
    '2;61;Del Giro;76123456-7;MOLINO SAN JOSÉ SPA;77;09/10/2026;09/10/2026;;0;10000;1900;0;;11900;;',
    '3;34;Del Giro;77111222-3;"FERIA, SPA";55;10/10/2026;;;5000;0;0;0;;5000;;',
    ';;;;;;;;;5000;110000;20900;;;135900;;',
  ].join('\r\n')

  it('lee facturas, notas de crédito y exentas; ignora la fila de totales', () => {
    const r = leerRegistroCompras(csv)
    expect(r.errores).toEqual([])
    expect(r.filas).toHaveLength(3)
    expect(r.filas[0]).toEqual({
      fecha: '2026-10-05', tipo_doc: 'Factura', rut: '76123456-7', proveedor: 'MOLINO SAN JOSÉ SPA', folio: '1234',
      neto: 100000, exento: 0, iva: 19000, total: 119000,
    })
    expect(r.filas[1].tipo_doc).toBe('Nota de crédito')
    expect(r.filas[2]).toMatchObject({ tipo_doc: 'Factura exenta', proveedor: 'FERIA, SPA', exento: 5000, iva: 0 })
  })

  it('decodifica latin1 (como lo entrega el SII)', () => {
    const bytes = new Uint8Array([0x4a, 0x4f, 0x53, 0xc9]) // "JOSÉ" en latin1
    expect(decodificar(bytes.buffer)).toBe('JOSÉ')
    expect(decodificar(new TextEncoder().encode('JOSÉ').buffer as ArrayBuffer)).toBe('JOSÉ')
  })

  it('rechaza un archivo que no es el registro de compras', () => {
    expect(leerRegistroCompras('Fecha;Producto;Total\n01/10/2026;Pan;1000').errores[0]).toMatch(/Registro de Compras/)
  })
})
