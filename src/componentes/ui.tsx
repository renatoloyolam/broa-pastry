import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { ICONOS } from './iconos'

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
  icono: Icono,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean; icono?: LucideIcon }) {
  return (
    <button
      {...resto}
      disabled={disabled || cargando}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition disabled:opacity-50 ${estilosBoton[variante]} ${className}`}
    >
      {cargando ? (
        <>
          <LoaderCircle className="h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden />
          <span>Un momento…</span>
        </>
      ) : (
        <>
          {Icono && <Icono className="h-5 w-5 shrink-0" aria-hidden />}
          <span className="min-w-0">{children}</span>
        </>
      )}
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

export function Pestanas({ opciones }: { opciones: { a: string; texto: string; fin?: boolean; icono?: LucideIcon }[] }) {
  return (
    <nav className="mb-4 flex gap-1 rounded-2xl bg-superficie-2 p-1">
      {opciones.map(({ a, texto, fin, icono: Icono }) => (
        <NavLink
          key={a}
          to={a}
          end={fin}
          className={({ isActive }) =>
            `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold ${
              isActive ? 'bg-superficie text-primario shadow-sm' : 'text-suave'
            }`
          }
        >
          {Icono && <Icono className="h-5 w-5 shrink-0" aria-hidden />}
          {texto}
        </NavLink>
      ))}
    </nav>
  )
}

/** Icono dentro de un círculo suave: la "cara" de cada función en tarjetas y accesos. */
export function IconoCirculo({ icono: Icono, grande = false, className = '' }: { icono: LucideIcon; grande?: boolean; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-primario/10 text-primario ${grande ? 'h-20 w-20' : 'h-10 w-10'} ${className}`}
      aria-hidden
    >
      <Icono className={grande ? 'h-10 w-10' : 'h-5 w-5'} />
    </span>
  )
}

/** Botón de una función: icono y nombre, con descripción opcional. Va dentro de una grilla. */
export function Acceso({ a, icono, titulo, detalle }: { a: string; icono: LucideIcon; titulo: string; detalle?: string }) {
  if (detalle) {
    return (
      <Link to={a} className="flex min-h-28 flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3 active:bg-superficie-2">
        <IconoCirculo icono={icono} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">{titulo}</span>
          <span className="mt-0.5 block text-xs leading-snug text-suave">{detalle}</span>
        </span>
      </Link>
    )
  }
  return (
    <Link
      to={a}
      className="flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-borde bg-superficie px-1 py-2 text-center text-xs font-semibold leading-tight active:bg-superficie-2"
    >
      <IconoCirculo icono={icono} />
      {titulo}
    </Link>
  )
}

/** Botón chico con icono para acciones de un encabezado o una fila. */
export function AccionEnlace({ a, icono: Icono, children, className = '' }: { a: string; icono: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <Link
      to={a}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-borde bg-superficie px-3 text-sm font-semibold text-primario active:bg-superficie-2 ${className}`}
    >
      <Icono className="h-4 w-4 shrink-0" aria-hidden />
      {children}
    </Link>
  )
}

/** Título de sección con su icono. */
export function Titulo({ icono: Icono, children, className = 'mb-2' }: { icono: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2 text-lg font-semibold ${className}`}>
      <Icono className="h-5 w-5 shrink-0 text-primario" aria-hidden />
      <span className="min-w-0">{children}</span>
    </h2>
  )
}

/** Icono chico dentro de una línea de texto. */
export function IconoLinea({ icono: Icono, className = 'text-primario' }: { icono: LucideIcon; className?: string }) {
  return <Icono className={`mr-1 inline-block h-4 w-4 align-[-0.15em] ${className}`} aria-hidden />
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
          <ICONOS.anterior className="h-6 w-6" aria-hidden />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 font-serif text-3xl font-bold tracking-tight">{titulo}</h1>
      {children}
    </header>
  )
}

export function EstadoVacio({ icono, titulo, children }: { icono: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <IconoCirculo icono={icono} grande className="mb-4" />
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
