import { useState } from 'react'
import { fechaDia, nombreDia, pesos } from '../lib/formato'
import { pesosCompacto } from '../lib/panel'

/** Redondea hacia arriba a 1, 2, 2,5 o 5 × 10ⁿ para que el eje muestre cifras limpias. */
function redondearArriba(v: number) {
  if (v <= 0) return 0
  const potencia = 10 ** Math.floor(Math.log10(v))
  const paso = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= v)!
  return paso * potencia
}

interface Punto {
  fecha: string
  valor: number | null
}

/**
 * Columnas por día, una sola serie (el título dice qué se grafica).
 * Columnas de máx. 24px, punta redondeada, crecen desde la línea base (0);
 * los valores negativos bajan. Tocar una columna muestra su valor arriba.
 * Siempre hay una vista de tabla.
 */
export function GraficoDias({ titulo, puntos }: { titulo: string; puntos: Punto[] }) {
  const [elegido, setElegido] = useState<number | null>(null)
  const ancho = 340
  const alto = 150
  const margenIzq = 52
  const margenAbajo = 22
  const areaAncho = ancho - margenIzq - 4
  const areaAlto = alto - margenAbajo - 8

  const valores = puntos.map((p) => p.valor ?? 0)
  const max = redondearArriba(Math.max(0, ...valores))
  const min = -redondearArriba(-Math.min(0, ...valores))
  const rango = max - min || 1
  const y = (v: number) => 8 + ((max - v) / rango) * areaAlto
  const base = y(0)
  const banda = areaAncho / Math.max(puntos.length, 1)
  const grosor = Math.min(24, Math.max(3, banda - 2))
  // Marcas limpias; se omite la negativa si queda pegada a la del cero
  const ticks = [max, max / 2, 0, ...(min < 0 && y(min) - base > 14 ? [min] : [])].filter((v, i, a) => a.indexOf(v) === i)
  const cadaEtiqueta = Math.ceil(puntos.length / 6)

  const seleccionado = elegido != null ? puntos[elegido] : null

  return (
    <figure className="rounded-2xl border border-borde bg-superficie p-4">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-semibold">{titulo}</span>
        <span className="cifra text-right text-sm text-suave" aria-live="polite">
          {seleccionado
            ? `${nombreDia(seleccionado.fecha).slice(0, 3)} ${fechaDia(seleccionado.fecha).slice(0, 5)}: ${seleccionado.valor == null ? 'sin dato' : pesos(seleccionado.valor)}`
            : 'Toca una columna'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full" role="img" aria-label={titulo}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={margenIzq} x2={ancho} y1={y(t)} y2={y(t)} stroke="var(--borde)" strokeWidth="1" />
            <text x={margenIzq - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--texto-suave)">
              {pesosCompacto(t)}
            </text>
          </g>
        ))}
        {puntos.map((p, i) => {
          const v = p.valor ?? 0
          const cx = margenIzq + banda * i + banda / 2
          const top = Math.min(y(v), base)
          const h = Math.max(Math.abs(base - y(v)), v === 0 ? 0 : 1)
          const r = Math.min(4, h, grosor / 2)
          const x0 = cx - grosor / 2
          // Punta redondeada en el extremo del dato, cuadrada en la base
          const d =
            v >= 0
              ? `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + grosor - r} Q${x0 + grosor},${top} ${x0 + grosor},${top + r} V${base} Z`
              : `M${x0},${base} V${base + h - r} Q${x0},${base + h} ${x0 + r},${base + h} H${x0 + grosor - r} Q${x0 + grosor},${base + h} ${x0 + grosor},${base + h - r} V${base} Z`
          return (
            <g key={p.fecha}>
              {h > 0 && (
                <path
                  d={d}
                  fill="var(--grafico)"
                  opacity={elegido == null || elegido === i ? 1 : 0.45}
                />
              )}
              {/* Zona de toque más grande que la columna */}
              <rect
                x={margenIzq + banda * i}
                y={0}
                width={banda}
                height={alto - margenAbajo}
                fill="transparent"
                onClick={() => setElegido(i)}
                onMouseEnter={() => setElegido(i)}
                style={{ cursor: 'pointer' }}
              />
              {(i % cadaEtiqueta === 0 || i === puntos.length - 1) && (
                <text
                  x={i === puntos.length - 1 ? Math.min(cx, ancho - 2) : cx}
                  y={alto - 6}
                  textAnchor={i === puntos.length - 1 && cx + 14 > ancho ? 'end' : 'middle'}
                  fontSize="10"
                  fill="var(--texto-suave)"
                >
                  {p.fecha.slice(8, 10)}/{p.fecha.slice(5, 7)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-suave">Ver como tabla</summary>
        <table className="mt-2 w-full">
          <tbody>
            {puntos.map((p) => (
              <tr key={p.fecha} className="border-t border-borde">
                <td className="py-1 capitalize">
                  {nombreDia(p.fecha).slice(0, 3)} {fechaDia(p.fecha)}
                </td>
                <td className="cifra py-1 text-right">{p.valor == null ? '—' : pesos(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
