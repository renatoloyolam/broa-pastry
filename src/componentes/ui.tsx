import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Link, NavLink } from 'react-router-dom'

type Variante = 'primario' | 'secundario' | 'peligro' | 'texto'

const estilosBoton: Record<Variante, string> = {
  primario: 'bg-primario text-primario-texto active:opacity-80',
  secundario: 'bg-superficie text-texto border border-borde active:bg-superficie-2',
  peligro: 'bg-superficie text-peligro border border-peligro/40 active:bg-superficie-2',
  texto: 'text-primario underline-offset-4 active:underline',
}

export function Boton({
  variante = 'primario',
  cargando = false,
  className = '',
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      {...resto}
      disabled={disabled || cargando}
      className={`min-h-12 w-full rounded-2xl px-5 text-base font-semibold transition disabled:opacity-50 ${estilosBoton[variante]} ${className}`}
    >
      {cargando ? 'Un momento…' : children}
    </button>
  )
}

export function Campo({
  etiqueta,
  ayuda,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-suave">{etiqueta}</span>
      <input
        {...resto}
        className="min-h-12 w-full rounded-xl border border-borde bg-superficie px-4 text-texto outline-none placeholder:text-suave/60 focus:border-primario focus:ring-2 focus:ring-primario/20"
      />
      {ayuda && <span className="mt-1 block text-xs text-suave">{ayuda}</span>}
    </label>
  )
}

export function Selector({
  etiqueta,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta?: string; children: ReactNode }) {
  const select = (
    <select
      {...resto}
      className={`min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 text-texto outline-none focus:border-primario disabled:opacity-60 ${resto.className ?? ''}`}
    >
      {children}
    </select>
  )
  if (!etiqueta) return select
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-suave">{etiqueta}</span>
      {select}
    </label>
  )
}

/** Etiqueta pequeña de estado (ej.: "Sin costo"). */
export function Insignia({ clase, children }: { clase: string; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${clase}`}>{children}</span>
}

export function Pestanas({ opciones }: { opciones: { a: string; texto: string; fin?: boolean }[] }) {
  return (
    <nav className="mb-4 flex gap-1 rounded-2xl bg-superficie-2 p-1">
      {opciones.map((o) => (
        <NavLink
          key={o.a}
          to={o.a}
          end={o.fin}
          className={({ isActive }) =>
            `flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold ${
              isActive ? 'bg-superficie text-primario shadow-sm' : 'text-suave'
            }`
          }
        >
          {o.texto}
        </NavLink>
      ))}
    </nav>
  )
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-borde bg-superficie p-4 ${className}`}>{children}</div>
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const color = {
    error: 'border-peligro/40 text-peligro',
    ok: 'border-exito/40 text-exito',
    info: 'border-borde text-suave',
  }[tipo]
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl border bg-superficie px-4 py-3 text-sm ${color}`}>
      {children}
    </div>
  )
}

export function Encabezado({ titulo, volver, children }: { titulo: string; volver?: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex items-center gap-3">
      {volver && (
        <Link
          to={volver}
          aria-label="Volver"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-primario active:bg-superficie-2"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <h1 className="flex-1 font-serif text-3xl font-bold tracking-tight">{titulo}</h1>
      {children}
    </header>
  )
}

export function EstadoVacio({ icono, titulo, children }: { icono: string; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 text-5xl" aria-hidden>
        {icono}
      </div>
      <h2 className="mb-2 text-lg font-semibold">{titulo}</h2>
      <div className="max-w-xs text-sm leading-relaxed text-suave">{children}</div>
    </div>
  )
}

export function Interruptor({
  etiqueta,
  ayuda,
  activo,
  onCambio,
  deshabilitado,
}: {
  etiqueta: string
  ayuda?: string
  activo: boolean
  onCambio: (v: boolean) => void
  deshabilitado?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className="flex min-h-14 w-full items-center gap-4 py-2 text-left disabled:opacity-50"
    >
      <span className="flex-1">
        <span className="block font-medium">{etiqueta}</span>
        {ayuda && <span className="block text-xs text-suave">{ayuda}</span>}
      </span>
      <span className={`relative h-8 w-13 shrink-0 rounded-full transition ${activo ? 'bg-acento' : 'bg-borde'}`}>
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${activo ? 'left-6' : 'left-1'}`}
        />
      </span>
    </button>
  )
}

export function Cargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#324D4D]">
      <img src="/logo.png" alt="Broa Pastry" className="h-32 w-32 animate-pulse rounded-full" />
    </div>
  )
}
