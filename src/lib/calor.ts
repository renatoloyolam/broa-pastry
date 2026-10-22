// Mapa de calor: promedio de ventas por día de la semana y hora.
// Los datos vienen de mapa_calor() (totales del período + cuántos días de cada tipo).

export type Medida = 'ventas' | 'transacciones' | 'unidades'

export interface DatosCalor {
  desde: string
  hasta: string
  dias: { dia: number; cantidad: number }[]
  celdas: { dia: number; hora: number; ventas: number; transacciones: number; unidades: number }[]
  categorias: { id: number; nombre: string }[]
}

export const NOMBRE_DIA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
export const DIA_CORTO = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
export const NIVELES = 5
const HORA_CORTE = 15

export const rangoHora = (h: number) => `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`

export function calcularCalor(d: DatosCalor, medida: Medida) {
  const veces = new Map(d.dias.map((x) => [x.dia, Number(x.cantidad)]))
  const dias = [1, 2, 3, 4, 5, 6, 7].filter((x) => (veces.get(x) ?? 0) > 0)
  const totalDias = [...veces.values()].reduce((s, n) => s + n, 0)
  // Horas con movimiento real: al menos 1 cliente cada 2 días en promedio (descarta ventas sueltas al cerrar)
  const clientesPorHora = new Map<number, number>()
  for (const c of d.celdas) clientesPorHora.set(c.hora, (clientesPorHora.get(c.hora) ?? 0) + Number(c.transacciones))
  const horasConDatos = [...clientesPorHora].filter(([, n]) => totalDias > 0 && n / totalDias >= 0.5).map(([h]) => h)
  const horas: number[] = []
  if (horasConDatos.length) for (let h = Math.min(...horasConDatos); h <= Math.max(...horasConDatos); h++) horas.push(h)

  // Promedio por celda: total del período ÷ cuántos días de ese tipo hubo
  const valor = new Map<string, number>()
  for (const c of d.celdas) {
    const n = veces.get(c.dia) ?? 0
    if (n > 0) valor.set(`${c.dia}-${c.hora}`, Number(c[medida]) / n)
  }
  const celda = (dia: number, hora: number) => valor.get(`${dia}-${hora}`) ?? 0
  const maximo = Math.max(0, ...valor.values())
  /** 0 = sin ventas; 1..NIVELES = de menos a más */
  const nivel = (v: number) => (v <= 0 || maximo <= 0 ? 0 : Math.max(1, Math.ceil((v / maximo) * NIVELES)))

  // Por día: promedio de un día completo; por hora: promedio de esa hora en cualquier día
  const porDia = dias.map((x) => ({ dia: x, valor: horas.reduce((s, h) => s + celda(x, h), 0) })).sort((a, b) => b.valor - a.valor)
  const porHora = horas
    .map((h) => ({
      hora: h,
      valor: totalDias ? d.celdas.filter((c) => c.hora === h).reduce((s, c) => s + Number(c[medida]), 0) / totalDias : 0,
    }))
    .sort((a, b) => b.valor - a.valor)

  let punta: { dia: number; hora: number; valor: number } | null = null
  for (const [k, v] of valor) if (!punta || v > punta.valor) punta = { dia: Number(k.split('-')[0]), hora: Number(k.split('-')[1]), valor: v }

  const total = d.celdas.reduce((s, c) => s + Number(c[medida]), 0)
  const am = d.celdas.filter((c) => c.hora < HORA_CORTE).reduce((s, c) => s + Number(c[medida]), 0)
  const mejorHora = porHora[0]?.valor ?? 0
  // Horas con menos del 25% de la hora más fuerte (en promedio)
  const flojas = porHora.filter((h) => h.valor < mejorHora * 0.25).map((h) => h.hora).sort((a, b) => a - b)

  return {
    dias,
    horas,
    celda,
    nivel,
    maximo,
    punta,
    porDia,
    porHora,
    mejorDia: porDia[0] ?? null,
    peorDia: porDia.length > 1 ? porDia[porDia.length - 1] : null,
    parteAm: total > 0 ? am / total : null,
    flojas,
    vacio: d.celdas.length === 0,
  }
}
