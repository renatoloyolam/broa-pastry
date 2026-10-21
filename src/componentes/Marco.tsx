import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSesion, type Permiso } from '../sesion/SesionProvider'

interface Seccion {
  a: string
  texto: string
  icono: ReactNode
  permiso?: Permiso
}

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const SECCIONES: Seccion[] = [
  {
    a: '/',
    texto: 'Inicio',
    icono: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    a: '/ventas',
    texto: 'Ventas',
    permiso: 'ver_ventas',
    icono: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6" />
      </svg>
    ),
  },
  {
    a: '/productos',
    texto: 'Productos',
    permiso: 'ver_costos',
    icono: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
        <path d="M4 12h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <path d="M4 12c0-2 1.5-3 3-3h10c1.5 0 3 1 3 3" />
        <path d="M12 9V5M12 5c-1-1-1-2 0-3 1 1 1 2 0 3" />
      </svg>
    ),
  },
  {
    a: '/mermas',
    texto: 'Mermas',
    permiso: 'registrar_mermas',
    icono: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      </svg>
    ),
  },
  {
    a: '/mas',
    texto: 'Más',
    icono: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
        <circle cx="5" cy="12" r="1.3" />
        <circle cx="12" cy="12" r="1.3" />
        <circle cx="19" cy="12" r="1.3" />
      </svg>
    ),
  },
]

export function Marco() {
  const { puede } = useSesion()
  const secciones = SECCIONES.filter((s) => !s.permiso || puede(s.permiso))
  return (
    <div className="min-h-dvh bg-fondo">
      <main className="mx-auto max-w-xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-xl">
          {secciones.map((s) => (
            <li key={s.a} className="flex-1">
              <NavLink
                to={s.a}
                end={s.a === '/'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                    isActive ? 'text-primario' : 'text-suave'
                  }`
                }
              >
                {s.icono}
                {s.texto}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
