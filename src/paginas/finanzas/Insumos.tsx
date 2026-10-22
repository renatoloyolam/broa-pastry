import { useCallback, useEffect, useState } from 'react'
import { Aviso, Boton, Encabezado, Pestanas, Selector, Tarjeta } from '../../componentes/ui'
import { moverMes, nombreMes } from '../../lib/finanzas'
import { fechaDia, hoyIso, numero, pesos, porcentaje } from '../../lib/formato'
import { calcularInsumos, type DatosInsumos } from '../../lib/insumos'
import { CATEGORIAS_COMPRA } from '../../lib/iva'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { FormCompra } from './Iva'
import { PESTANAS_FINANZAS, SelectorMes } from './SelectorMes'

const primeroDelMes = (iso: string) => `${iso.slice(0, 7)}-01`

export function Insumos() {
  const hoy = hoyIso()
  const mesActual = primeroDelMes(hoy)
  const [mes, setMes] = useState(mesActual)
  const [meses, setMeses] = useState<1 | 3>(1)
  const [d, setD] = useState<DatosInsumos | null>(null)
  const [error, setError] = useState('')

  const desde = moverMes(mes, 1 - meses)
  const hasta = sumarDias(moverMes(mes, 1), -1)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('insumos_periodo', { p_desde: desde, p_hasta: hasta })
    if (error) return setError(mensajeError(error))
    setError('')
    setD(data as DatosInsumos)
  }, [desde, hasta])

  useEffect(() => {
    setD(null)
    cargar()
  }, [cargar])

  return (
    <>
      <Encabezado titulo="Finanzas" volver="/mas" />
      <Pestanas opciones={PESTANAS_FINANZAS} />
      <SelectorMes mes={mes} mesActual={mesActual} onCambio={setMes} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        {([1, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMeses(n)}
            className={`min-h-11 rounded-xl border text-sm font-semibold ${meses === n ? 'border-primario bg-primario text-primario-texto' : 'border-borde text-suave'}`}
          >
            {n === 1 ? 'Solo este mes' : 'Últimos 3 meses'}
          </button>
        ))}
      </div>
      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && <Contenido d={d} mes={mes} meses={meses} recargar={cargar} />}
    </>
  )
}

function Contenido({ d, mes, meses, recargar }: { d: DatosInsumos; mes: string; meses: 1 | 3; recargar: () => Promise<void> }) {
  const f = calcularInsumos(d)
  const [agregando, setAgregando] = useState(false)
  const periodo = meses === 1 ? nombreMes(mes).split(' ')[0] : `${nombreMes(d.desde).split(' ')[0]} a ${nombreMes(mes).split(' ')[0]}`
  const tope = Math.max(f.comprado, f.usado, 1)
  const totalCategorias = f.usoPorCategoria.reduce((t, c) => t + c.monto, 0)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-semibold">🥚 Compras vs. lo que se usó</h2>
        <Tarjeta className="space-y-4">
          <Barra etiqueta="Compraste (insumos y packaging)" valor={f.comprado} tope={tope} clase="bg-topo" />
          <Barra etiqueta="Se usó según los costos" valor={f.usado} tope={tope} clase="bg-acento" />
          <Veredicto f={f} periodo={periodo} />
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-primario">¿De dónde sale "lo que se usó"?</summary>
            <div className="mt-2 space-y-1">
              <Linea etiqueta="Productos vendidos" valor={f.usoVentas} />
              <Linea etiqueta="Mermas" valor={f.usoMermas} />
              {f.usoEstimado > 0 && <Linea etiqueta="Estimado de lo vendido sin costo cargado" valor={f.usoEstimado} suave />}
              <p className="pt-1 text-xs text-suave">
                Es el costo de ingredientes y packaging de cada unidad vendida o botada, sin la mano de obra.
                {f.pesoEnVentas != null && ` Equivale al ${porcentaje(f.pesoEnVentas, 0)} de lo vendido sin IVA.`}
              </p>
            </div>
          </details>
        </Tarjeta>
        <p className="mt-2 text-xs text-suave">
          {d.ultimo_dia && `Ventas cargadas hasta el ${fechaDia(d.ultimo_dia)}. `}
          {meses === 1 && 'Mirar 3 meses juntos es más confiable: lo que sobra un mes se usa el siguiente.'}
        </p>
      </section>

      {f.porClasificar.length > 0 && <PorClasificar f={f} recargar={recargar} />}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">🧺 A quién le compras</h2>
          <span className="cifra text-sm font-semibold">{pesos(f.comprado)}</span>
        </div>
        {f.proveedores.length === 0 ? (
          <Aviso tipo="info">
            Sin compras de insumos en {periodo}. Sube el registro de compras del SII en la pestaña IVA y anota aquí las compras con
            boleta.
          </Aviso>
        ) : (
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie text-sm">
            {f.proveedores.map((p) => (
              <li key={`${p.categoria}-${p.rut}-${p.proveedor}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.proveedor}</span>
                  <span className="block text-xs text-suave">
                    {p.categoria} · {numero(p.documentos)} documento{p.documentos === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="cifra block font-semibold">{pesos(p.monto)}</span>
                  <span className="cifra block text-xs text-suave">{porcentaje(f.comprado ? p.monto / f.comprado : null, 0)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          {agregando ? (
            <Tarjeta>
              <FormCompra
                mes={mes}
                tipoInicial="Boleta"
                alTerminar={async () => {
                  setAgregando(false)
                  await recargar()
                }}
              />
            </Tarjeta>
          ) : (
            <Boton variante="secundario" onClick={() => setAgregando(true)}>
              + Anotar compra con boleta
            </Boton>
          )}
        </div>
        <p className="mt-2 text-xs text-suave">Feria, supermercado y otras compras sin factura se anotan por el total pagado. Los demás montos son sin IVA.</p>
      </section>

      {f.usoPorCategoria.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">🍰 En qué se usaron</h2>
          <Tarjeta className="space-y-1 text-sm">
            {f.usoPorCategoria.map((c) => (
              <Linea key={c.categoria} etiqueta={c.categoria} valor={c.monto} extra={porcentaje(totalCategorias ? c.monto / totalCategorias : null, 0)} />
            ))}
          </Tarjeta>
        </section>
      )}
    </div>
  )
}

function Barra({ etiqueta, valor, tope, clase }: { etiqueta: string; valor: number; tope: number; clase: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span>{etiqueta}</span>
        <span className="cifra font-semibold">{pesos(valor)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-superficie-2">
        <div className={`h-full rounded-full ${clase}`} style={{ width: `${Math.max(0, (valor / tope) * 100)}%` }} />
      </div>
    </div>
  )
}

function Veredicto({ f, periodo }: { f: ReturnType<typeof calcularInsumos>; periodo: string }) {
  const dif = pesos(Math.abs(f.diferencia))
  const pct = porcentaje(f.relativa != null ? Math.abs(f.relativa) : null, 0)
  if (f.veredicto === 'sin_compras')
    return <Aviso tipo="info">Aún no hay compras de insumos en {periodo} para comparar.</Aviso>
  if (f.veredicto === 'calza')
    return (
      <Aviso tipo="ok">
        ✅ Compras y uso calzan: la diferencia es de {dif} ({pct}). Tus costos reflejan bien lo que gastas.
      </Aviso>
    )
  if (f.veredicto === 'sobra')
    return (
      <div className="rounded-xl border border-aviso/40 px-4 py-3 text-sm">
        <p className="font-semibold text-aviso">
          ⚠️ Compraste {dif} más de lo que se usó ({pct} más)
        </p>
        <p className="mt-1">Puede ser:</p>
        <ul className="ml-5 list-disc text-suave">
          <li>stock que quedó guardado para el próximo mes,</li>
          <li>mermas que no se anotaron,</li>
          <li>pérdidas, porciones más grandes o robo,</li>
          <li>recetas con costos más bajos que la realidad (revisa precios de ingredientes).</li>
        </ul>
      </div>
    )
  return (
    <div className="rounded-xl border border-borde px-4 py-3 text-sm">
      <p className="font-semibold">
        🔎 Compraste {dif} menos de lo que se usó ({pct} menos)
      </p>
      <p className="mt-1">Puede ser:</p>
      <ul className="ml-5 list-disc text-suave">
        <li>usaste stock comprado el mes anterior,</li>
        <li>faltan facturas o boletas por anotar,</li>
        <li>proveedores aún "por clasificar",</li>
        <li>recetas con costos más altos que la realidad.</li>
      </ul>
    </div>
  )
}

function Linea({ etiqueta, valor, suave, extra }: { etiqueta: string; valor: number; suave?: boolean; extra?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${suave ? 'text-suave' : ''}`}>
      <span>
        {etiqueta}
        {extra && <span className="ml-1 text-xs text-suave">({extra})</span>}
      </span>
      <span className="cifra shrink-0">{pesos(valor)}</span>
    </div>
  )
}

function PorClasificar({ f, recargar }: { f: ReturnType<typeof calcularInsumos>; recargar: () => Promise<void> }) {
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState('')

  async function clasificar(rut: string, nombre: string, categoria: string) {
    if (!categoria) return
    setError('')
    setGuardando(rut)
    const { error } = await supabase.rpc('clasificar_proveedor', { p_rut: rut, p_nombre: nombre, p_categoria: categoria })
    setGuardando('')
    if (error) return setError(mensajeError(error))
    await recargar()
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">🏷️ Proveedores por clasificar</h2>
      <p className="mb-2 text-sm text-suave">
        {pesos(f.montoPorClasificar)} en compras del SII sin categoría. Dinos qué le compras a cada uno: se recuerda para los
        próximos meses.
      </p>
      {error && <div className="mb-2"><Aviso>{error}</Aviso></div>}
      <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-aviso/40 bg-superficie text-sm">
        {f.porClasificar.map((p) => (
          <li key={`${p.rut}-${p.proveedor}`} className="space-y-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{p.proveedor}</span>
              <span className="cifra shrink-0">{pesos(p.monto)}</span>
            </div>
            <Selector
              aria-label={`Categoría de ${p.proveedor}`}
              value=""
              disabled={!p.rut || guardando === p.rut}
              onChange={(e) => clasificar(p.rut, p.proveedor, e.target.value)}
            >
              <option value="">{guardando === p.rut ? 'Guardando…' : 'Elegir categoría…'}</option>
              {CATEGORIAS_COMPRA.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Selector>
          </li>
        ))}
      </ul>
    </section>
  )
}
