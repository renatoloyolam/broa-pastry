import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, Pestanas, Selector, Tarjeta } from '../../componentes/ui'
import { fechaDia, hoyIso, numero, pesos, porcentaje } from '../../lib/formato'
import { clasificar, CUADRANTES, ordenar, type Cuadrante, type DatosMapa } from '../../lib/mapa'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { PESTANAS_CATALOGO } from './Productos'

type Rango = '30' | '90' | 'mes' | 'mes_ant'

function calcularRango(r: Rango, hoy: string) {
  const inicioMes = `${hoy.slice(0, 7)}-01`
  if (r === '30') return { desde: sumarDias(hoy, -29), hasta: hoy }
  if (r === '90') return { desde: sumarDias(hoy, -89), hasta: hoy }
  if (r === 'mes') return { desde: inicioMes, hasta: hoy }
  const finAnterior = sumarDias(inicioMes, -1)
  return { desde: `${finAnterior.slice(0, 7)}-01`, hasta: finAnterior }
}

const RANGOS: [Rango, string][] = [
  ['30', '30 días'],
  ['90', '90 días'],
  ['mes', 'Este mes'],
  ['mes_ant', 'Mes pasado'],
]

export function MapaProductos() {
  const hoy = hoyIso()
  const [rango, setRango] = useState<Rango>('30')
  const [categoria, setCategoria] = useState('')
  const [cuadrante, setCuadrante] = useState<Cuadrante>('estrella')
  const [d, setD] = useState<DatosMapa | null>(null)
  const [error, setError] = useState('')
  const { desde, hasta } = calcularRango(rango, hoy)

  useEffect(() => {
    let vivo = true
    setD(null)
    supabase.rpc('mapa_productos', { p_desde: desde, p_hasta: hasta }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setError(mensajeError(error))
      else {
        setError('')
        setD(data as DatosMapa)
      }
    })
    return () => {
      vivo = false
    }
  }, [desde, hasta])

  const r = useMemo(() => (d ? clasificar(d) : null), [d])
  const categorias = useMemo(() => [...new Set(d?.productos.map((p) => p.categoria) ?? [])].sort(), [d])
  const filtrar = <T extends { categoria: string }>(lista: T[]) => (categoria ? lista.filter((p) => p.categoria === categoria) : lista)

  const visibles = r ? filtrar(r.productos) : []
  const lista = ordenar(visibles.filter((p) => p.cuadrante === cuadrante), cuadrante)
  const conteo = (c: Cuadrante) => visibles.filter((p) => p.cuadrante === c)
  const gananciaVisible = visibles.reduce((s, p) => s + p.ganancia, 0)
  const info = CUADRANTES[cuadrante]

  return (
    <>
      <Encabezado titulo="Productos" />
      <Pestanas opciones={PESTANAS_CATALOGO} />

      <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-superficie-2 p-1">
        {RANGOS.map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setRango(valor)}
            className={`min-h-10 rounded-xl text-xs font-semibold ${rango === valor ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {texto}
          </button>
        ))}
      </div>
      <div className="mb-4">
        <Selector aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Selector>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}

      {r && (
        <div className="space-y-5">
          <p className="text-sm text-suave">
            Del {fechaDia(desde)} al {fechaDia(d?.ultimo_dia ?? hasta)}. Cada producto se compara con los de su categoría: cuánto se
            vende y qué margen deja.
          </p>

          {filtrar(r.perdidas).length > 0 && (
            <section className="rounded-2xl border border-peligro/40 bg-superficie p-4">
              <h2 className="font-semibold text-peligro">🚨 Se venden bajo el costo</h2>
              <p className="mb-2 text-sm text-suave">Cada venta pierde plata. Revisa el costo o sube el precio.</p>
              <ul className="space-y-2 text-sm">
                {filtrar(r.perdidas).map((p) => (
                  <li key={p.id}>
                    <Link to={`/productos/p/${p.id}`} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium text-primario">{p.nombre}</span>
                      <span className="cifra shrink-0 font-semibold text-peligro">{pesos(p.ganancia)}</span>
                    </Link>
                    <span className="block text-xs text-suave">
                      Precio promedio {pesos(p.precioPromedio)} · para no perder, mínimo {pesos(p.precioMinimo)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {visibles.length === 0 ? (
            <Aviso tipo="info">No hay productos con costo completo vendidos en este período.</Aviso>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CUADRANTES) as Cuadrante[]).map((c) => {
                  const items = conteo(c)
                  const ganancia = items.reduce((s, p) => s + p.ganancia, 0)
                  const activo = c === cuadrante
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCuadrante(c)}
                      aria-pressed={activo}
                      className={`rounded-2xl border p-3 text-left transition ${
                        activo ? 'border-primario bg-superficie shadow-sm ring-2 ring-primario/20' : 'border-borde bg-superficie'
                      }`}
                    >
                      <span className="flex items-baseline justify-between">
                        <span className="text-2xl" aria-hidden>
                          {CUADRANTES[c].icono}
                        </span>
                        <span className="cifra text-2xl font-bold">{items.length}</span>
                      </span>
                      <span className="mt-1 block text-sm font-semibold leading-tight">{CUADRANTES[c].titulo}</span>
                      <span className="mt-0.5 block text-xs text-suave">
                        {porcentaje(gananciaVisible > 0 ? ganancia / gananciaVisible : null, 0)} de la ganancia
                      </span>
                    </button>
                  )
                })}
              </div>

              <section>
                <h2 className="text-lg font-semibold">
                  {info.icono} {info.titulo}
                </h2>
                <p className="text-sm text-suave">{info.resumen}.</p>
                <p className="mt-2 rounded-xl bg-superficie-2 px-4 py-3 text-sm">💡 {info.accion}</p>
                {lista.length === 0 ? (
                  <p className="mt-3 text-sm text-suave">Ningún producto en este grupo.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                    {lista.map((p) => (
                      <li key={p.id}>
                        <Link to={`/productos/p/${p.id}`} className="block px-4 py-3 active:bg-superficie-2">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate font-medium">{p.nombre}</span>
                            <span className="cifra shrink-0 font-semibold">{pesos(p.ganancia)}</span>
                          </span>
                          <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-suave">
                            <span>
                              {p.categoria} · {numero(p.unidades)} vendidos · deja {pesos(p.gananciaUnidad)} c/u
                            </span>
                            <span className="cifra shrink-0">margen {porcentaje(p.margen, 0)}</span>
                          </span>
                          {p.precioSugerido != null && (
                            <span className="mt-1.5 block rounded-lg bg-aviso/10 px-2 py-1 text-xs text-aviso">
                              {p.esPaso
                                ? `Precio promedio ${pesos(p.precioPromedio)} → un primer paso: ${pesos(p.precioSugerido)} (+${porcentaje(p.precioSugerido! / p.precioPromedio - 1, 0)}). Su margen está muy bajo el ${porcentaje(p.margenGrupo, 0)} de ${p.grupo === 'Todos' ? 'los productos' : p.grupo}.`
                                : `Precio promedio ${pesos(p.precioPromedio)} → con ${pesos(p.precioSugerido)} tendría el margen de ${p.grupo === 'Todos' ? 'los productos' : p.grupo} (${porcentaje(p.margenGrupo, 0)}).`}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          {filtrar(r.sinCosto).length > 0 && (
            <details className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                Sin costo completo ({filtrar(r.sinCosto).length}): no se pueden clasificar
              </summary>
              <ul className="mt-2 space-y-1">
                {filtrar(r.sinCosto).map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <Link to={`/productos/p/${p.id}`} className="truncate text-primario">
                      {p.nombre}
                    </Link>
                    <span className="cifra shrink-0 text-suave">{numero(p.unidades)} vendidos</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {filtrar(r.sinVentas).length > 0 && (
            <details className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold">Activos sin ventas en el período ({filtrar(r.sinVentas).length})</summary>
              <p className="mt-2 text-xs text-suave">Si ya no se venden, puedes desactivarlos en su ficha para ordenar la lista.</p>
              <ul className="mt-2 space-y-1">
                {filtrar(r.sinVentas).map((p) => (
                  <li key={p.id}>
                    <Link to={`/productos/p/${p.id}`} className="text-primario">
                      {p.nombre}
                    </Link>
                    <span className="text-suave"> · {p.categoria}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <Tarjeta className="text-xs text-suave">
            <p className="mb-1 font-semibold text-texto">¿Cómo se calcula?</p>
            <p>
              <b>Se vende mucho</b>: vendió al menos el 70% de lo que vende un producto promedio de su categoría. <b>Deja buen margen</b>:
              su margen (lo que queda del precio sin IVA después del costo) es igual o mayor al de su categoría. Las categorías con menos de
              3 productos se comparan con todos. Un producto con opciones cuenta 1 unidad por venta.
            </p>
          </Tarjeta>
        </div>
      )}
    </>
  )
}
