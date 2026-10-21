// Formato chileno: pesos sin decimales con punto de miles, fechas dd/mm/aaaa,
// hora de Santiago.

export const ZONA = 'America/Santiago'

function miles(n: number): string {
  return Math.abs(n)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** 1250 → "$1.250" · -1250 → "-$1.250" */
export function pesos(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return '—'
  const redondeado = Math.round(valor)
  return (redondeado < 0 ? '-$' : '$') + miles(redondeado)
}

/** 0.405 → "40,5%" (sin decimal si es entero) */
export function porcentaje(fraccion: number | null | undefined, decimales = 1): string {
  if (fraccion == null || !Number.isFinite(fraccion)) return '—'
  const v = Math.round(fraccion * 100 * 10 ** decimales) / 10 ** decimales
  const [ent, dec] = Math.abs(v).toFixed(decimales).split('.')
  const texto = dec && Number(dec) !== 0 ? `${miles(Number(ent))},${dec}` : miles(Number(ent))
  return (v < 0 ? '-' : '') + texto + '%'
}

/** Número entero con punto de miles: 12345 → "12.345" */
export function numero(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return '—'
  return (valor < 0 ? '-' : '') + miles(valor)
}

function partes(valor: Date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(valor)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return { d: v('day'), m: v('month'), a: v('year'), h: v('hour') === '24' ? '00' : v('hour'), min: v('minute') }
}

/** Fecha en hora de Santiago: "21/10/2026" */
export function fecha(valor: Date | string | number): string {
  const { d, m, a } = partes(new Date(valor))
  return `${d}/${m}/${a}`
}

/** Fecha y hora en hora de Santiago: "21/10/2026 14:05" */
export function fechaHora(valor: Date | string | number): string {
  const { d, m, a, h, min } = partes(new Date(valor))
  return `${d}/${m}/${a} ${h}:${min}`
}
