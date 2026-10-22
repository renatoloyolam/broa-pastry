import { useEffect, useMemo, useState } from 'react'
import { Aviso, Boton, Encabezado, Selector, Tarjeta } from '../../componentes/ui'
import { fechaDia, hoyIso, nombreDia, numero, pesos, porcentaje } from '../../lib/formato'
import { sumarDias } from '../../lib/periodos'
import { calcularProduccion, textoParaCompartir, type DatosProduccion, type Sugerencia } from '../../lib/produccion'
import { mensajeError, supabase } from '../../lib/supabase'

export function Produccion() {
  const hoy = hoyIso()
  const [fecha, setFecha] = useState(sumarDias(hoy, 1))
  const [semanas, setSemanas] = useState(6)
  const [categoria, setCategoria] = useState('')
  const [d, setD] = useState<DatosProduccion | null>(null)
  const [error, setError] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vivo = true
    setD(null)
    supabase.rpc('produccion_sugerida', { p_fecha: fecha, p_semanas: semanas }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setError(mensajeError(error))
      else {
        setError('')
        setD(data as DatosProduccion)
      }
    })
    return () => {
      vivo = false
    }
  }, [fecha, semanas])

  const r = useMemo(() => (d ? calcularProduccion(d) : null), [d])
  const grupos = r ? r.porCategoria.filter(([c]) => !categoria || c === categoria) : []
  const dia = nombreDia(fecha)
  // lunes…viernes no cambian en plural; sábado y domingo agregan "s"
  const dias = dia.endsWith('s') ? dia : `${dia}s`

  async function compartir() {
    if (!d || !r) return
    const texto = textoParaCompartir(d, { ...r, porCategoria: grupos })
    try {
      if (navigator.share) await navigator.share({ text: texto })
      else {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2500)
      }
    } catch {
      // Compartir cancelado: no hay nada que hacer
    }
  }

  const atajos: [string, string][] = [
    [hoy, 'Hoy'],
    [sumarDias(hoy, 1), 'Mañana'],
    [sumarDias(hoy, 2), nombreDia(sumarDias(hoy, 2))],
  ]

  return (
    <>
      <Encabezado titulo="Producción" volver="/mas" />
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-superficie-2 p-1">
        {atajos.map(([f, texto]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFecha(f)}
            className={`min-h-10 rounded-xl text-xs font-semibold first-letter:uppercase ${fecha === f ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {texto}
          </button>
        ))}
        <label className="relative flex min-h-10 items-center justify-center rounded-xl text-xs font-semibold text-suave">
          Otra fecha
          <input
            type="date"
            aria-label="Otra fecha"
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className="absolute inset-0 opacity-0"
          />
        </label>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Selector aria-label="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {r?.porCategoria.map(([c]) => (
            <option key={c}>{c}</option>
          ))}
        </Selector>
        <Selector aria-label="Semanas a comparar" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
          {[4, 6, 8, 12].map((n) => (
            <option key={n} value={n}>
              Últimas {n} semanas
            </option>
          ))}
        </Selector>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}

      {d && r && (
        <div className="space-y-5">
          <Tarjeta>
            <p className="text-sm text-suave">Producción sugerida para el</p>
            <p className="font-serif text-2xl font-bold first-letter:uppercase">
              {dia} {fechaDia(fecha)}
            </p>
            {d.dias.length > 0 && (
              <p className="mt-1 text-xs text-suave">
                Según {d.dias.length} {dias} anteriores ({d.dias.map((x) => x.slice(8, 10) + '/' + x.slice(5, 7)).join(', ')}).
              </p>
            )}
            {r.regulares.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Boton onClick={compartir}>{copiado ? 'Copiado ✓' : 'Compartir lista'}</Boton>
                <Boton variante="secundario" onClick={() => window.print()}>
                  Imprimir
                </Boton>
              </div>
            )}
          </Tarjeta>

          {r.cerrado && <Aviso tipo="info">Ese día Broa está marcado como cerrado (Más → Alertas).</Aviso>}
          {r.pocosDatos && (
            <Aviso tipo="info">
              Hay pocos {dias} con ventas para comparar. La sugerencia mejora con más semanas de datos.
            </Aviso>
          )}
          {!r.hayMermas && d.dias.length > 0 && (
            <Aviso tipo="info">
              💡 Registra las mermas al cierre de cada día: así la app sabe cuánto sobra y ajusta la sugerencia para botar menos.
            </Aviso>
          )}
          {d.ver_costos && r.ahorroDia > 0 && (
            <Aviso tipo="ok">
              Siguiendo la sugerencia, botarías unos <b>{pesos(r.ahorroDia)}</b> menos ese día (a costo).
            </Aviso>
          )}

          {grupos.map(([cat, lista]) => (
            <section key={cat}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{cat}</h2>
                <span className="text-sm text-suave">{numero(lista.reduce((s, p) => s + p.sugerido, 0))} unidades</span>
              </div>
              <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                {lista.map((p) => (
                  <Fila key={p.id} p={p} dias={dias} />
                ))}
              </ul>
            </section>
          ))}

          {r.ocasionales.filter((p) => !categoria || p.categoria === categoria).length > 0 && (
            <details className="rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                Se venden solo algunos {dias} ({r.ocasionales.filter((p) => !categoria || p.categoria === categoria).length})
              </summary>
              <p className="mt-2 text-xs text-suave">Hazlos por encargo o en poca cantidad.</p>
              <ul className="mt-2 space-y-1">
                {r.ocasionales
                  .filter((p) => !categoria || p.categoria === categoria)
                  .map((p) => (
                    <li key={p.id} className="flex justify-between gap-3">
                      <span className="truncate">{p.nombre}</span>
                      <span className="cifra shrink-0 text-suave">
                        {numero(p.vendidos.filter((v) => v > 0).length)} de {d.dias.length} {dias} · máx. {numero(p.max)}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <Tarjeta className="text-xs text-suave">
            <p className="mb-1 font-semibold text-texto">¿Cómo se calcula?</p>
            <p>
              Para cada producto se mira lo vendido los mismos días de la semana. Si casi no se bota, se sugiere lo que se vende en un día
              bueno (alcanza 3 de cada 4 veces). Si se bota más del 10% de lo que se hace, se sugiere lo de un día normal. AM y PM se reparten
              según cuándo se vende (corte 15:00). No considera feriados ni encargos: súmalos aparte. Las categorías que se preparan al momento
              (café, bebidas) se configuran en Productos → Categorías.
            </p>
          </Tarjeta>
        </div>
      )}
    </>
  )
}

function Fila({ p, dias }: { p: Sugerencia; dias: string }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.nombre}</span>
          <span className="block text-xs text-suave">
            Se venden {numero(p.min)}–{numero(p.max)} los {dias} · AM {numero(p.am)} · PM {numero(p.pm)}
          </span>
        </span>
        <span className="cifra shrink-0 text-2xl font-bold">{numero(p.sugerido)}</span>
      </div>
      {p.seBotaMucho && p.deMas >= 1 && (
        <p className="mt-1.5 rounded-lg bg-aviso/10 px-2 py-1 text-xs text-aviso">
          Se bota {porcentaje(p.tasaMerma, 0)} de lo que se hace: hoy se hacen ~{numero(Math.round(p.hechoProm))}, baja a {numero(p.sugerido)}.
        </p>
      )}
    </li>
  )
}
