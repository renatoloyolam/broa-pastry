import { describe, expect, it } from 'vitest'
import { calcularFinanzas, diasAbiertos, moverMes, nombreMes, proximosPagos, type DatosFinanzas, type Gasto } from './finanzas'

const gasto = (g: Partial<Gasto>): Gasto => ({
  id: 1, nombre: 'Arriendo', categoria: 'Arriendo y local', monto: 0, dia_pago: null, se_repite: true,
  pagado: false, pagado_en: null, nota: null, ...g,
})

// Octubre 2026 con ventas cargadas hasta el 10 (miércoles 1 → sábado 10), Broa cierra los domingos.
const base: DatosFinanzas = {
  mes: '2026-10-01',
  hasta: '2026-10-31',
  hoy: '2026-10-11',
  divisor: 1.19,
  resumen: {
    transacciones: 1000, unidades: 3000, abonos: 0,
    ventas: 11_900_000,              // neto 10.000.000
    ventas_netas_costeadas: 9_000_000,
    costo: 4_500_000,                // 50% de lo costeado
    ventas_sin_costo: 1_190_000,     // neto 1.000.000 → costo estimado 500.000
    unidades_sin_costo: 100,
    mermas: 100_000,
  },
  ultimo_dia: '2026-10-10',
  dias_con_venta: 9,
  dias_cerrado: [7],
  comisiones: 400_000,
  por_medio: [],
  comision_debito: 0.015,
  comision_credito: 0.03,
  gastos: [
    gasto({ id: 1, monto: 2_000_000, dia_pago: 5, pagado: true }),
    gasto({ id: 2, nombre: 'Sueldos', categoria: 'Sueldos y honorarios', monto: 2_000_000, dia_pago: 30 }),
  ],
}

describe('finanzas del mes', () => {
  it('resultado real: ventas netas − costos (con estimación) − mermas − comisiones − gastos', () => {
    const f = calcularFinanzas(base)
    expect(f.ventasNetas).toBeCloseTo(10_000_000)
    expect(f.costoEstimado).toBeCloseTo(500_000)
    // 10.000.000 − 4.500.000 − 500.000 − 100.000 − 400.000 = 4.500.000
    expect(f.contribucion).toBeCloseTo(4_500_000)
    expect(f.ganancia).toBeCloseTo(500_000)
    expect(f.pagado).toBe(2_000_000)
    expect(f.pendiente).toBe(2_000_000)
  })

  it('meta = gastos ÷ % que queda, expresada con IVA; faltante por día abierto', () => {
    const f = calcularFinanzas(base)
    // 4.000.000 / 0,45 = 8.888.889 neto → 10.577.778 con IVA, ya superada
    expect(f.meta).toBeCloseTo(10_577_777.8, 0)
    expect(f.avance! > 1).toBe(true)
    expect(f.faltante).toBe(0)
    // 1–10 oct: 9 días abiertos (domingo 4 cerrado); 11–31: 18 abiertos (domingos 11, 18, 25)
    expect(f.diasTranscurridos).toBe(9)
    expect(f.diasRestantes).toBe(18)
    expect(f.ventasProyectadas).toBeCloseTo(11_900_000 + (11_900_000 / 9) * 18)
  })

  it('sin gastos no hay meta; sin ventas no hay tasa', () => {
    expect(calcularFinanzas({ ...base, gastos: [] }).meta).toBeNull()
    const vacio = calcularFinanzas({
      ...base, ultimo_dia: null,
      resumen: { ...base.resumen, ventas: 0, ventas_netas_costeadas: 0, costo: 0, ventas_sin_costo: 0, mermas: 0 }, comisiones: 0,
    })
    expect(vacio.meta).toBeNull()
    expect(vacio.ganancia).toBe(-4_000_000)
    expect(vacio.diasRestantes).toBe(diasAbiertos('2026-10-01', '2026-10-31', [7]))
  })

  it('con meta pendiente calcula cuánto vender por día', () => {
    const f = calcularFinanzas({ ...base, gastos: [gasto({ monto: 9_000_000 })] })
    // meta neta 20.000.000 → 23.800.000 con IVA; faltan 11.900.000 en 18 días
    expect(f.meta).toBeCloseTo(23_800_000)
    expect(f.porDia).toBeCloseTo(11_900_000 / 18)
  })

  it('mes terminado: sin días restantes ni venta diaria', () => {
    const f = calcularFinanzas({ ...base, hoy: '2026-11-03', ultimo_dia: '2026-10-31', gastos: [gasto({ monto: 9_000_000 })] })
    expect(f.mesTerminado).toBe(true)
    expect(f.diasRestantes).toBe(0)
    expect(f.porDia).toBeNull()
  })

  it('próximos pagos: solo los pendientes, en orden y con días que faltan', () => {
    const p = proximosPagos(
      [gasto({ id: 1, dia_pago: 30 }), gasto({ id: 2, dia_pago: 5 }), gasto({ id: 3, dia_pago: 1, pagado: true }), gasto({ id: 4 })],
      '2026-10-01', '2026-10-11')
    expect(p.map((g) => g.id)).toEqual([2, 1])
    expect(p[0].dias).toBe(-6)
    expect(p[1].dias).toBe(19)
    // Día 31 en noviembre se paga el 30
    expect(proximosPagos([gasto({ dia_pago: 31 })], '2026-11-01', '2026-11-01')[0].fecha).toBe('2026-11-30')
  })

  it('nombres y movimiento de meses', () => {
    expect(nombreMes('2026-10-01')).toBe('octubre 2026')
    expect(moverMes('2026-12-01', 1)).toBe('2027-01-01')
    expect(moverMes('2026-01-15', -1)).toBe('2025-12-01')
  })
})
