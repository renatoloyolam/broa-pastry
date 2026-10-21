import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fechaDia, nombreDia, pesos, porcentaje } from '../../lib/formato'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

type Alerta =
  | { codigo: 'dias_sin_ventas'; nivel: string; fechas: string[] }
  | { codigo: 'sin_costo'; nivel: string; dias: number; total: number; productos: { producto_id: number; nombre: string; unidades: number; ventas: number }[] }
  | { codigo: 'margen_bajo'; nivel: string; dias: number; minimo: number; productos: { producto_id: number; nombre: string; unidades: number; margen: number }[] }
  | { codigo: 'mermas_altas'; nivel: string; casos: { periodo: 'dia' | 'semana'; fecha: string; valor: number; umbral: number }[] }
  | { codigo: 'variacion_costo'; nivel: string; umbral: number; cambios: { nombre: string; desde: string; antes: number; ahora: number; variacion: number }[] }

function Tarjeta({ icono, titulo, children, enlace }: { icono: string; titulo: ReactNode; children?: ReactNode; enlace?: { a: string; texto: string } }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <li className="px-4 py-3">
      <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta} className="flex w-full items-start gap-3 text-left">
        <span className="text-xl" aria-hidden>
          {icono}
        </span>
        <span className="flex-1 text-sm leading-snug">{titulo}</span>
        {children && <span className="text-suave" aria-hidden>{abierta ? '▴' : '▾'}</span>}
      </button>
      {abierta && children && <div className="mt-2 pl-9 text-sm">{children}</div>}
      {enlace && (
        <Link to={enlace.a} className="mt-1 inline-block pl-9 text-sm font-semibold text-primario">
          {enlace.texto} →
        </Link>
      )}
    </li>
  )
}

/** Alertas que se muestran arriba en Inicio. */
export function AlertasInicio() {
  const { puede } = useSesion()
  const [alertas, setAlertas] = useState<Alerta[] | null>(null)

  useEffect(() => {
    supabase.rpc('alertas').then(({ data }) => setAlertas((data as Alerta[]) ?? []))
  }, [])

  if (!alertas || alertas.length === 0) return null

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-aviso/40 bg-superficie" aria-label="Alertas">
      <div className="flex items-center justify-between border-b border-borde px-4 py-2">
        <p className="text-sm font-semibold text-aviso">
          {alertas.length === 1 ? '1 alerta' : `${alertas.length} alertas`}
        </p>
        {puede('ver_costos') && (
          <Link to="/mas/alertas" className="text-xs font-semibold text-primario">
            Configurar
          </Link>
        )}
      </div>
      <ul className="divide-y divide-borde">
        {alertas.map((a) => {
          switch (a.codigo) {
            case 'dias_sin_ventas':
              return (
                <Tarjeta
                  key={a.codigo}
                  icono="📅"
                  titulo={
                    a.fechas.length === 1 ? (
                      <>Falta subir las ventas del <b>{fechaDia(a.fechas[0])}</b>.</>
                    ) : (
                      <>Faltan las ventas de <b>{a.fechas.length} días</b>.</>
                    )
                  }
                  enlace={puede('importar_ventas') ? { a: '/ventas/importar', texto: 'Importar Excel' } : undefined}
                >
                  {a.fechas.length > 1 && (
                    <ul className="text-suave">
                      {a.fechas.map((f) => (
                        <li key={f} className="capitalize">
                          {nombreDia(f)} {fechaDia(f)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              )
            case 'sin_costo':
              return (
                <Tarjeta
                  key={a.codigo}
                  icono="🏷️"
                  titulo={
                    <>
                      <b>{a.productos.length} productos</b> vendidos en los últimos {a.dias} días no tienen costo ({pesos(a.total)} en ventas
                      fuera de la ganancia).
                    </>
                  }
                  enlace={{ a: '/productos', texto: 'Completar costos' }}
                >
                  <ul className="space-y-1">
                    {a.productos.slice(0, 10).map((p) => (
                      <li key={p.producto_id} className="flex justify-between gap-2">
                        <Link to={`/productos/p/${p.producto_id}`} className="truncate text-primario">
                          {p.nombre}
                        </Link>
                        <span className="cifra shrink-0 text-suave">{pesos(p.ventas)}</span>
                      </li>
                    ))}
                    {a.productos.length > 10 && <li className="text-suave">…y {a.productos.length - 10} más</li>}
                  </ul>
                </Tarjeta>
              )
            case 'margen_bajo':
              return (
                <Tarjeta
                  key={a.codigo}
                  icono="📉"
                  titulo={
                    <>
                      <b>{a.productos.length} productos</b> con margen bajo el {porcentaje(a.minimo, 0)} (últimos {a.dias} días).
                    </>
                  }
                >
                  <ul className="space-y-1">
                    {a.productos.map((p) => (
                      <li key={p.producto_id} className="flex justify-between gap-2">
                        <Link to={`/productos/p/${p.producto_id}`} className="truncate text-primario">
                          {p.nombre}
                        </Link>
                        <span className="cifra shrink-0 text-peligro">{porcentaje(p.margen)}</span>
                      </li>
                    ))}
                  </ul>
                </Tarjeta>
              )
            case 'mermas_altas':
              return (
                <Tarjeta
                  key={a.codigo}
                  icono="🗑️"
                  titulo={
                    <>
                      Mermas sobre el límite:{' '}
                      {a.casos
                        .map((c) =>
                          c.periodo === 'semana' ? `últimos 7 días ${pesos(c.valor)}` : `${fechaDia(c.fecha).slice(0, 5)} ${pesos(c.valor)}`,
                        )
                        .join(' · ')}
                    </>
                  }
                  enlace={{ a: '/mermas/reporte', texto: 'Ver reporte' }}
                >
                  <p className="text-suave">
                    Límites: {a.casos.map((c) => `${c.periodo === 'dia' ? 'por día' : 'por semana'} ${pesos(c.umbral)}`).filter((v, i, x) => x.indexOf(v) === i).join(' · ')}
                  </p>
                </Tarjeta>
              )
            case 'variacion_costo':
              return (
                <Tarjeta
                  key={a.codigo}
                  icono="⚖️"
                  titulo={
                    <>
                      Cambió fuerte el costo de <b>{a.cambios.length === 1 ? a.cambios[0].nombre : `${a.cambios.length} productos`}</b> (más de{' '}
                      {porcentaje(a.umbral, 0)}).
                    </>
                  }
                >
                  <ul className="space-y-1">
                    {a.cambios.map((c, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{c.nombre}</span>
                        <span className="cifra shrink-0 text-suave">
                          {pesos(c.antes)} → {pesos(c.ahora)} ({c.variacion > 0 ? '+' : ''}
                          {porcentaje(c.variacion, 0)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </Tarjeta>
              )
            default:
              return null
          }
        })}
      </ul>
    </section>
  )
}
