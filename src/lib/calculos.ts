// Cálculos financieros centrales. Todo en pesos chilenos.
// Regla: ganancia del período = ventas − costo de lo vendido − mermas.

export interface Totales {
  ventas: number
  costo: number
  mermas?: number
}

export interface Resultado {
  ventas: number
  costo: number
  mermas: number
  ganancia: number
  /** Fracción (0.5 = 50%). null si no hubo ventas. */
  margen: number | null
}

/** Monto sin IVA. Con IVA 19%: $1.190 → $1.000 */
export function sinIva(montoConIva: number, tasaIva: number): number {
  if (tasaIva < 0 || tasaIva >= 1) throw new Error('Tasa de IVA inválida')
  return montoConIva / (1 + tasaIva)
}

export function calcularResultado({ ventas, costo, mermas = 0 }: Totales): Resultado {
  for (const [nombre, v] of Object.entries({ ventas, costo, mermas })) {
    if (!Number.isFinite(v)) throw new Error(`Valor inválido en ${nombre}`)
  }
  const ganancia = ventas - costo - mermas
  return { ventas, costo, mermas, ganancia, margen: ventas > 0 ? ganancia / ventas : null }
}

/**
 * Resultado según la configuración de IVA.
 * - Si los precios de venta incluyen IVA y el margen se calcula sobre neto,
 *   las ventas se pasan a neto antes de calcular.
 * - Costos y mermas se guardan netos (sin IVA), porque Broa recupera el IVA
 *   de sus compras.
 */
export function calcularResultadoConIva(
  totales: Totales,
  config: { preciosIncluyenIva: boolean; margenSobreNeto: boolean; tasaIva: number },
): Resultado {
  const ventas =
    config.preciosIncluyenIva && config.margenSobreNeto ? sinIva(totales.ventas, config.tasaIva) : totales.ventas
  return calcularResultado({ ...totales, ventas })
}
