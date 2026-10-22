import { useEffect, useMemo, useState } from 'react'
import { Aviso, Encabezado, Selector, Tarjeta } from '../../componentes/ui'
import {
  compararCategorias,
  compararProductos,
  diasConVenta,
  indicadores,
  rangos,
  type CambioItem,
  type Indicador,
  type Modo,
} from '../../lib/comparacion'
import { calcularFinanzas, moverMes, nombreMes, type DatosFinanzas } from '../../lib/finanzas'
import { fechaDia, hoyIso, numero, pesos, porcentaje } from '../../lib/formato'
import type { DatosPanel } from '../../lib/panel'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

const primeroDelMes = (iso: string) => `${iso.slice(0, 7)}-01`
const corto = (mes: string) => nombreMes(mes).split(' ')[0]
/** "2026-09-01" → "sep 2026" */
const mesCorto = (mes: string) => `${corto(mes).slice(0, 3)} ${mes.slice(0, 4)}`

/** "▲ 12%" con símbolo y texto, no solo color. En porcentajes muestra puntos. */
function Cambio({ i }: { i: Pick<Indicador, 'cambio' | 'tipo' | 'invertir'> }) {
  if (i.cambio == null) return <span className="text-xs text-suave">—</span>
  const sube = i.cambio > 0.0005
  const baja = i.cambio < -0.0005
  const bueno = i.invertir ? baja : sube
  const malo = i.invertir ? sube : baja
  const texto =
    i.tipo === 'porcentaje'
      ? `${Math.abs(Math.round(i.cambio * 1000) / 10).toString().replace('.', ',')} pts`
      : porcentaje(Math.abs(i.cambio), 0)
  return (
    <span className={`cifra shrink-0 text-xs font-semibold ${bueno ? 'text-exito' : malo ? 'text-peligro' : 'text-suave'}`}>
      {sube ? '▲' : baja ? '▼' : '='} {texto}
    </span>
  )
}

const valor = (v: number | null, tipo: Indicador['tipo']) => (tipo === 'pesos' ? pesos(v) : tipo === 'porcentaje' ? porcentaje(v, 1) : numero(v))

export function Comparar() {
  const { puede } = useSesion()
  const [limites, setLimites] = useState<{ primero: string; ultimo: string } | null>(null)
  const [mesB, setMesB] = useState('')
  const [mesA, setMesA] = useState('')
  const [modo, setModo] = useState<Modo>('misma_fecha')
  const [datos, setDatos] = useState<{ A: DatosPanel; B: DatosPanel; real?: { a: number; b: number } } | null>(null)
  const [error, setError] = useState('')

  // Primer y último día con ventas, para armar la lista de meses
  useEffect(() => {
    Promise.all([
      supabase.from('ventas').select('fecha').order('fecha', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('ventas').select('fecha').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([p, u]) => {
      if (p.error || u.error) return setError(mensajeError(p.error ?? u.error))
      const ultimo = u.data?.fecha ?? sumarDias(hoyIso(), -1)
      setLimites({ primero: p.data?.fecha ?? ultimo, ultimo })
      setMesB(primeroDelMes(ultimo))
      setMesA(moverMes(primeroDelMes(ultimo), -1))
    })
  }, [])

  const meses = useMemo(() => {
    if (!limites) return []
    const lista: string[] = []
    for (let m = primeroDelMes(limites.ultimo); m >= primeroDelMes(limites.primero); m = moverMes(m, -1)) lista.push(m)
    return lista
  }, [limites])

  const r = limites && mesA && mesB ? rangos(mesA, mesB, modo, limites.ultimo) : null
  const mesesCompletos = r?.dia == null

  useEffect(() => {
    if (!r) return
    let vivo = true
    setDatos(null)
    const panel = (x: { desde: string; hasta: string }) =>
      supabase.rpc('panel', { p_desde: x.desde, p_hasta: x.hasta, p_desde_ant: null, p_hasta_ant: null })
    const conFinanzas = mesesCompletos && puede('gestionar_finanzas')
    Promise.all([
      panel(r.a),
      panel(r.b),
      conFinanzas ? supabase.rpc('finanzas_mes', { p_mes: mesA }) : null,
      conFinanzas ? supabase.rpc('finanzas_mes', { p_mes: mesB }) : null,
    ]).then(([a, b, fa, fb]) => {
      if (!vivo) return
      const fallo = a.error ?? b.error
      if (fallo) return setError(mensajeError(fallo))
      setError('')
      const real =
        fa?.data && fb?.data && (fa.data as DatosFinanzas).gastos.length && (fb.data as DatosFinanzas).gastos.length
          ? { a: calcularFinanzas(fa.data as DatosFinanzas).ganancia, b: calcularFinanzas(fb.data as DatosFinanzas).ganancia }
          : undefined
      setDatos({ A: a.data as DatosPanel, B: b.data as DatosPanel, real })
    })
    return () => {
      vivo = false
    }
    // r se recalcula en cada render: se depende de sus partes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.a.desde, r?.a.hasta, r?.b.desde, r?.b.hasta, mesesCompletos])

  const ind = datos ? indicadores(datos.A, datos.B, diasConVenta(datos.A), diasConVenta(datos.B), datos.real) : []
  const prod = datos ? compararProductos(datos.A, datos.B) : null
  const cats = datos ? compararCategorias(datos.A, datos.B) : []

  return (
    <>
      <Encabezado titulo="Comparar meses" volver="/" />
      {error && <Aviso>{error}</Aviso>}
      {!limites && !error && <p className="py-10 text-center text-suave">Cargando…</p>}

      {limites && r && (
        <>
          <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Selector etiqueta="Mes" value={mesA} onChange={(e) => setMesA(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesCorto(m)}
                </option>
              ))}
            </Selector>
            <span className="pb-3 text-suave">vs</span>
            <Selector etiqueta="Contra" value={mesB} onChange={(e) => setMesB(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesCorto(m)}
                </option>
              ))}
            </Selector>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-superficie-2 p-1">
            {(
              [
                ['misma_fecha', 'A la misma fecha'],
                ['completos', 'Meses completos'],
              ] as const
            ).map(([m, texto]) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={`min-h-10 rounded-xl text-sm font-semibold ${modo === m ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
              >
                {texto}
              </button>
            ))}
          </div>
          <p className="mb-4 text-xs text-suave">
            {fechaDia(r.a.desde)}–{fechaDia(r.a.hasta)} contra {fechaDia(r.b.desde)}–{fechaDia(r.b.hasta)}.
            {r.dia != null && ` ${corto(mesB)[0].toUpperCase() + corto(mesB).slice(1)} va en el día ${r.dia}: se comparan los mismos días para que sea parejo.`}
          </p>
        </>
      )}

      {limites && !datos && !error && <p className="py-10 text-center text-suave">Cargando…</p>}

      {datos && r && (
        <div className="space-y-5">
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
            {ind.map((i) => (
              <li key={i.clave} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{i.etiqueta}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="cifra font-semibold">{valor(i.b, i.tipo)}</span>
                    <Cambio i={i} />
                  </span>
                </div>
                <p className="cifra text-right text-xs text-suave">
                  {corto(mesA)}: {valor(i.a, i.tipo)}
                </p>
              </li>
            ))}
          </ul>
          {!mesesCompletos && puede('gestionar_finanzas') && (
            <p className="text-xs text-suave">La ganancia real (después de gastos) se compara con "Meses completos".</p>
          )}

          {cats.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Por categoría</h2>
              <Tarjeta className="space-y-2 text-sm">
                {cats.map((c) => (
                  <div key={c.clave} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{c.nombre}</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="cifra">{pesos(c.b)}</span>
                      <Cambio i={{ cambio: c.cambio, tipo: 'pesos' }} />
                    </span>
                  </div>
                ))}
              </Tarjeta>
            </section>
          )}

          {prod && (
            <>
              <ListaCambios titulo="📈 Lo que más creció" items={prod.suben} mesA={corto(mesA)} />
              <ListaCambios titulo="📉 Lo que más bajó" items={prod.bajan} mesA={corto(mesA)} />
              {(prod.nuevos.length > 0 || prod.dejaron.length > 0) && (
                <details className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-semibold">
                    Nuevos ({prod.nuevos.length}) y que dejaron de venderse ({prod.dejaron.length})
                  </summary>
                  {prod.nuevos.length > 0 && (
                    <>
                      <p className="mt-2 font-semibold">Se vendieron en {corto(mesB)} y no en {corto(mesA)}</p>
                      <ul className="mt-1 space-y-1">
                        {prod.nuevos.map((x) => (
                          <li key={x.clave} className="flex justify-between gap-3">
                            <span className="truncate">{x.nombre}</span>
                            <span className="cifra shrink-0">{pesos(x.b)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {prod.dejaron.length > 0 && (
                    <>
                      <p className="mt-3 font-semibold">Se vendieron en {corto(mesA)} y no en {corto(mesB)}</p>
                      <ul className="mt-1 space-y-1">
                        {prod.dejaron.map((x) => (
                          <li key={x.clave} className="flex justify-between gap-3">
                            <span className="truncate">{x.nombre}</span>
                            <span className="cifra shrink-0 text-suave">{pesos(x.a)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </details>
              )}
            </>
          )}
          <p className="text-xs text-suave">Ventas con IVA, sin abonos de tortas. Ganancia y margen sobre lo que tiene costo cargado.</p>
        </div>
      )}
    </>
  )
}

function ListaCambios({ titulo, items, mesA }: { titulo: string; items: CambioItem[]; mesA: string }) {
  if (items.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{titulo}</h2>
      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie text-sm">
        {items.map((x) => (
          <li key={x.clave} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{x.nombre}</span>
              <span className={`cifra shrink-0 font-semibold ${x.diferencia >= 0 ? 'text-exito' : 'text-peligro'}`}>
                {x.diferencia >= 0 ? '+' : ''}
                {pesos(x.diferencia)}
              </span>
            </div>
            <p className="text-xs text-suave">
              {numero(x.unidadesB)} vendidos (en {mesA}: {numero(x.unidadesA)}) · {pesos(x.b)} {x.cambio != null && `(${x.cambio >= 0 ? '+' : '−'}${porcentaje(Math.abs(x.cambio), 0)})`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
