import { useState, type ReactNode } from 'react'
import { Tarjeta } from '../../componentes/ui'
import { numero, pesos, porcentaje } from '../../lib/formato'
import type { DetalleVentas } from '../../lib/ventas'
import { normalizar } from '../../lib/importador'

/** Resumen de arriba: ventas, clientes, ticket, unidades… */
export function ResumenVentas({ d, extra }: { d: DetalleVentas; extra?: ReactNode }) {
  const r = d.resumen
  const ticket = r.transacciones ? r.ventas / r.transacciones : null
  return (
    <Tarjeta className="mb-4">
      <p className="text-sm text-suave">Ventas</p>
      <p className="cifra text-3xl font-bold">{pesos(r.ventas)}</p>
      {extra}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Dato titulo="Clientes" valor={numero(r.transacciones)} />
        <Dato titulo="Ticket" valor={pesos(ticket)} />
        <Dato titulo="Productos" valor={numero(r.unidades)} />
      </div>
      {(r.abonos > 0 || r.descuentos > 0) && (
        <p className="mt-3 text-xs text-suave">
          {r.abonos > 0 && `Abonos de tortas: ${pesos(r.abonos)} (aparte de las ventas). `}
          {r.descuentos > 0 && `Descuentos: ${pesos(r.descuentos)}.`}
        </p>
      )}
    </Tarjeta>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-superficie-2 px-2 py-2">
      <p className="text-[11px] text-suave">{titulo}</p>
      <p className="cifra text-sm font-semibold">{valor}</p>
    </div>
  )
}

export type Pestana = 'dias' | 'productos' | 'detalle' | 'boletas'
const TEXTO: Record<Pestana, string> = { dias: 'Días', productos: 'Productos', detalle: 'Turnos y pagos', boletas: 'Boletas' }

export function PestanasDesglose({ opciones, activa, onCambio }: { opciones: Pestana[]; activa: Pestana; onCambio: (p: Pestana) => void }) {
  return (
    <div className="mb-3 flex gap-1 rounded-2xl bg-superficie-2 p-1" role="tablist">
      {opciones.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={activa === p}
          onClick={() => onCambio(p)}
          className={`min-h-10 flex-1 rounded-xl text-sm font-semibold ${activa === p ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
        >
          {TEXTO[p]}
        </button>
      ))}
    </div>
  )
}

export function ListaProductos({ d }: { d: DetalleVentas }) {
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)
  const q = normalizar(busqueda)
  const lista = d.productos.filter((p) => !q || normalizar(p.nombre).includes(q) || normalizar(p.categoria).includes(q))
  return (
    <>
      <input
        type="search"
        placeholder="Buscar producto o categoría…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="mb-3 min-h-12 w-full rounded-xl border border-borde bg-superficie px-4"
      />
      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
        {lista.map((p) => {
          const tieneOpciones = p.opciones.length > 0
          const abiertoEste = abierto === p.id
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={!tieneOpciones}
                aria-expanded={tieneOpciones ? abiertoEste : undefined}
                onClick={() => setAbierto(abiertoEste ? null : p.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left enabled:active:bg-superficie-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="block text-xs text-suave">
                    {p.categoria} · {numero(p.unidades)} vendidos
                    {tieneOpciones && (abiertoEste ? ' · ocultar opciones' : ' · ver opciones ›')}
                  </span>
                </span>
                <span className="cifra shrink-0 font-semibold">{pesos(p.ventas)}</span>
              </button>
              {abiertoEste && (
                <div className="bg-superficie-2/60 px-4 pb-3 pt-1 text-sm">
                  <p className="mb-1 text-xs text-suave">Opciones elegidas (una venta puede llevar varias):</p>
                  <ul className="space-y-0.5">
                    {p.opciones.map((o) => (
                      <li key={o.nombre} className="flex justify-between gap-3">
                        <span className="truncate">{o.nombre}</span>
                        <span className="cifra shrink-0">× {numero(o.unidades)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
        {lista.length === 0 && <li className="px-4 py-6 text-center text-sm text-suave">Sin resultados.</li>}
      </ul>
    </>
  )
}

function Barras({ titulo, filas, total }: { titulo: string; filas: { nombre: string; valor: number; detalle?: string }[]; total: number }) {
  if (filas.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 font-semibold">{titulo}</h3>
      <Tarjeta className="space-y-2.5 text-sm">
        {filas.map((f) => (
          <div key={f.nombre}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{f.nombre}</span>
              <span className="cifra shrink-0">
                {pesos(f.valor)} <span className="text-xs text-suave">({porcentaje(total ? f.valor / total : null, 0)})</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-superficie-2">
              <div className="h-full rounded-full bg-acento" style={{ width: `${total ? (f.valor / total) * 100 : 0}%` }} />
            </div>
            {f.detalle && <p className="mt-0.5 text-xs text-suave">{f.detalle}</p>}
          </div>
        ))}
      </Tarjeta>
    </section>
  )
}

export function DetalleTurnos({ d }: { d: DetalleVentas }) {
  const total = d.resumen.ventas
  const clientes = (n: number) => `${numero(n)} cliente${n === 1 ? '' : 's'}`
  return (
    <div className="space-y-5">
      <Barras
        titulo="Por turno"
        total={total}
        filas={d.por_turno.map((t) => ({
          nombre: t.turno === 'AM' ? 'AM (antes de las 15:00)' : 'PM (desde las 15:00)',
          valor: Number(t.ventas),
          detalle: clientes(t.transacciones),
        }))}
      />
      <Barras
        titulo="Por medio de pago"
        total={total}
        filas={d.por_medio.map((m) => ({ nombre: m.medio, valor: Number(m.ventas), detalle: clientes(m.transacciones) }))}
      />
      <Barras titulo="Por categoría" total={total} filas={d.por_categoria.map((c) => ({ nombre: c.categoria, valor: Number(c.ventas), detalle: `${numero(c.unidades)} productos` }))} />
      <Barras
        titulo="Por quién vendió"
        total={total}
        filas={d.por_vendedor.map((v) => ({ nombre: v.vendedor, valor: Number(v.ventas), detalle: clientes(v.transacciones) }))}
      />
    </div>
  )
}

export function ListaBoletas({ d }: { d: DetalleVentas }) {
  const [abierta, setAbierta] = useState<number | null>(null)
  const boletas = d.boletas ?? []
  if (boletas.length === 0) return <p className="py-6 text-center text-sm text-suave">No hay boletas este día.</p>
  return (
    <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
      {boletas.map((b) => {
        const abiertaEsta = abierta === b.numero
        return (
          <li key={b.numero}>
            <button
              type="button"
              aria-expanded={abiertaEsta}
              onClick={() => setAbierta(abiertaEsta ? null : b.numero)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-superficie-2"
            >
              <span className="cifra w-12 shrink-0 text-sm font-semibold">{b.hora}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {b.items.length === 1 ? b.items[0].texto : `${b.items.length} ítems`}
                </span>
                <span className="block truncate text-xs text-suave">
                  N° {b.numero} · {b.medio || 'Sin medio'} · {b.vendedor}
                  {b.con_boleta === false && ' · sin boleta'}
                </span>
              </span>
              <span className="cifra shrink-0 font-semibold">{pesos(b.total)}</span>
            </button>
            {abiertaEsta && (
              <div className="bg-superficie-2/60 px-4 pb-3 pt-1 text-sm">
                <ul className="space-y-1">
                  {b.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block">{it.texto}</span>
                        {it.opciones && <span className="block text-xs text-suave">{it.opciones}</span>}
                      </span>
                      <span className="cifra shrink-0">{pesos(it.monto)}</span>
                    </li>
                  ))}
                </ul>
                {b.descuento > 0 && <p className="mt-1 text-xs text-suave">Descuento aplicado: {pesos(b.descuento)}</p>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
