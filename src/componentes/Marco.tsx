import type { LucideIcon } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSesion, type Permiso } from '../sesion/SesionProvider'
import { ICONOS } from './iconos'

interface Seccion {
  a: string
  texto: string
  icono: LucideIcon
  permiso?: Permiso
}

const SECCIONES: Seccion[] = [
  { a: '/', texto: 'Inicio', icono: ICONOS.inicio },
  { a: '/ventas', texto: 'Ventas', permiso: 'ver_ventas', icono: ICONOS.ventas },
  { a: '/productos', texto: 'Productos', permiso: 'ver_costos', icono: ICONOS.productos },
  { a: '/mermas', texto: 'Mermas', permiso: 'registrar_mermas', icono: ICONOS.mermas },
  { a: '/mas', texto: 'Más', icono: ICONOS.mas },
]

export function Marco() {
  const { puede } = useSesion()
  const secciones = SECCIONES.filter((s) => !s.permiso || puede(s.permiso))
  return (
    <div className="min-h-dvh bg-fondo">
      <main className="mx-auto max-w-xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <Suspense fallback={<p className="py-16 text-center text-suave">Cargando…</p>}>
          <Outlet />
        </Suspense>
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
                <s.icono className="h-6 w-6" strokeWidth={1.9} aria-hidden />
                {s.texto}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
