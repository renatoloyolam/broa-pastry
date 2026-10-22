import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useConfirmar } from '../../componentes/Confirmar'
import { Aviso, Boton, Campo, Encabezado, Interruptor, Pestanas, Selector, Tarjeta } from '../../componentes/ui'
import {
  calcularFinanzas,
  CATEGORIAS_GASTO,
  gastosPorCategoria,
  nombreMes,
  proximosPagos,
  type CategoriaGasto,
  type DatosFinanzas,
  type Gasto,
} from '../../lib/finanzas'
import { decimal, fechaDia, hoyIso, leerNumero, numero, pesos, porcentaje } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { BarraMeta } from './BarraMeta'
import { PESTANAS_FINANZAS, SelectorMes } from './SelectorMes'

const primeroDelMes = (iso: string) => `${iso.slice(0, 7)}-01`

export function Finanzas() {
  const hoy = hoyIso()
  const mesActual = primeroDelMes(hoy)
  const [mes, setMes] = useState(mesActual)
  const [d, setD] = useState<DatosFinanzas | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    // El mes en curso y los siguientes copian solos los gastos fijos la primera vez
    if (mes >= mesActual) await supabase.rpc('preparar_mes_gastos', { p_mes: mes })
    const { data, error } = await supabase.rpc('finanzas_mes', { p_mes: mes })
    if (error) return setError(mensajeError(error))
    setError('')
    setD(data as DatosFinanzas)
  }, [mes, mesActual])

  useEffect(() => {
    setD(null)
    cargar()
  }, [cargar])

  return (
    <>
      <Encabezado titulo="Finanzas" volver="/mas" />
      <Pestanas opciones={PESTANAS_FINANZAS} />
      <SelectorMes mes={mes} mesActual={mesActual} onCambio={setMes} />

      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && <Contenido d={d} recargar={cargar} />}
    </>
  )
}

function Contenido({ d, recargar }: { d: DatosFinanzas; recargar: () => Promise<void> }) {
  const f = calcularFinanzas(d)
  const mesCorto = nombreMes(d.mes).split(' ')[0]

  return (
    <div className="space-y-6">
      {/* 1. Meta */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">🎯 Meta del mes</h2>
        <Tarjeta className="space-y-3">
          {d.gastos.length === 0 ? (
            <p className="text-sm text-suave">
              Agrega abajo los gastos fijos de {mesCorto} (arriendo, sueldos, luz…) y la app te dirá cuánto necesitas vender para
              cubrirlos.
            </p>
          ) : f.meta == null ? (
            <p className="text-sm text-suave">Todavía no hay ventas de {mesCorto} para calcular la meta.</p>
          ) : (
            <>
              <div>
                <p className="text-sm text-suave">Para cubrir {pesos(f.gastos)} de gastos necesitas vender</p>
                <p className="cifra text-3xl font-bold">{pesos(f.meta)}</p>
                <p className="text-xs text-suave">con IVA, como aparece en la caja</p>
              </div>
              <BarraMeta avance={f.avance ?? 0} alta />
              <p className="text-sm">
                Llevas <b className="cifra">{pesos(f.ventas)}</b> ({porcentaje(f.avance, 0)})
                {d.ultimo_dia && <span className="text-suave"> · ventas cargadas hasta el {fechaDia(d.ultimo_dia)}</span>}
              </p>
              {f.faltante === 0 ? (
                <Aviso tipo="ok">
                  ¡Gastos del mes cubiertos! Desde aquí, lo que vendas es ganancia (después de costos de productos).
                </Aviso>
              ) : f.mesTerminado ? (
                <Aviso>Faltaron {pesos(f.faltante)} para cubrir los gastos de {mesCorto}.</Aviso>
              ) : (
                <div className="rounded-xl bg-superficie-2 px-4 py-3">
                  <p className="text-sm">
                    Faltan <b className="cifra">{pesos(f.faltante)}</b>
                  </p>
                  {f.porDia != null && (
                    <p className="text-sm">
                      Necesitas vender <b className="cifra">{pesos(f.porDia)}</b> por día ({numero(f.diasRestantes)} días abiertos)
                    </p>
                  )}
                  {f.ritmo != null && (
                    <p className="mt-1 text-xs text-suave">
                      Este mes vendes en promedio {pesos(f.ritmo)} por día abierto.
                    </p>
                  )}
                </div>
              )}
              {!f.mesTerminado && f.ventasProyectadas != null && f.diasRestantes > 0 && (
                <p className="text-sm text-suave">
                  A este ritmo cerrarías {mesCorto} con ventas de <b className="cifra text-texto">{pesos(f.ventasProyectadas)}</b> y una
                  ganancia real de{' '}
                  <b className={`cifra ${f.gananciaProyectada! < 0 ? 'text-peligro' : 'text-exito'}`}>{pesos(f.gananciaProyectada)}</b>.
                </p>
              )}
            </>
          )}
        </Tarjeta>
      </section>

      {/* 2. Resultado real */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">📊 Resultado real</h2>
        <Tarjeta className="space-y-1.5 text-sm">
          <Fila etiqueta="Ventas (con IVA)" valor={f.ventas} />
          <Fila etiqueta="IVA de las ventas" valor={-f.iva} suave />
          <Fila etiqueta="Ventas sin IVA" valor={f.ventasNetas} fuerte linea />
          <Fila etiqueta="Costo de los productos" valor={-f.costoCargado} />
          {f.costoEstimado > 0 && (
            <Fila etiqueta="Costo estimado (productos sin costo cargado)" valor={-f.costoEstimado} suave />
          )}
          <Fila etiqueta="Mermas" valor={-f.mermas} />
          <Fila etiqueta="Comisiones de tarjeta" valor={-f.comisiones} />
          <Fila etiqueta="Queda para pagar gastos" valor={f.contribucion} fuerte linea extra={porcentaje(f.tasaContribucion, 0)} />
          <Fila etiqueta="Gastos fijos del mes" valor={-f.gastos} />
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-texto/20 pt-2">
            <span className="text-base font-semibold">Ganancia real</span>
            <span className={`cifra text-2xl font-bold ${f.ganancia < 0 ? 'text-peligro' : 'text-exito'}`}>
              {pesos(f.ganancia)}
            </span>
          </div>
          {f.margenReal != null && (
            <p className="text-right text-xs text-suave">{porcentaje(f.margenReal)} de las ventas sin IVA</p>
          )}
        </Tarjeta>
        <div className="mt-2 space-y-1 text-xs text-suave">
          {f.ventasSinCosto > 0 && (
            <p>
              {pesos(f.ventasSinCosto)} se vendieron en productos sin costo cargado: su costo se estimó con el promedio del mes.
              Cárgalos en Productos para que el resultado sea exacto.
            </p>
          )}
          {d.comision_debito === 0 && d.comision_credito === 0 && (
            <p>Las comisiones de tarjeta están en 0%. Configúralas abajo, en "Comisiones de tarjeta".</p>
          )}
          <p>Los costos y gastos se ingresan sin IVA. Los abonos de tortas no cuentan como venta.</p>
        </div>
      </section>

      {/* 3. Gastos */}
      <Gastos d={d} f={f} recargar={recargar} />

      {/* Comisiones */}
      <Comisiones d={d} recargar={recargar} />
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  suave,
  fuerte,
  linea,
  extra,
}: {
  etiqueta: string
  valor: number
  suave?: boolean
  fuerte?: boolean
  linea?: boolean
  extra?: string
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 ${linea ? 'border-t border-borde pt-1.5' : ''} ${suave ? 'text-suave' : ''} ${
        fuerte ? 'font-semibold' : ''
      }`}
    >
      <span>
        {etiqueta}
        {extra && <span className="ml-1 text-xs font-normal text-suave">({extra})</span>}
      </span>
      <span className="cifra shrink-0">{pesos(valor)}</span>
    </div>
  )
}

function Gastos({ d, f, recargar }: { d: DatosFinanzas; f: ReturnType<typeof calcularFinanzas>; recargar: () => Promise<void> }) {
  const confirmar = useConfirmar()
  const [editando, setEditando] = useState<Gasto | 'nuevo' | null>(null)
  const [error, setError] = useState('')
  const [copiando, setCopiando] = useState(false)
  const pagos = proximosPagos(d.gastos, d.mes, d.hoy)
  const vencidos = new Set(pagos.filter((p) => p.dias < 0).map((p) => p.id))
  const categorias = gastosPorCategoria(d.gastos)

  async function marcarPagado(g: Gasto) {
    setError('')
    const { error } = await supabase
      .from('gastos')
      .update({ pagado: !g.pagado, pagado_en: g.pagado ? null : d.hoy })
      .eq('id', g.id)
    if (error) return setError(mensajeError(error))
    await recargar()
  }

  async function copiarAnterior() {
    setCopiando(true)
    setError('')
    const { data, error } = await supabase.rpc('preparar_mes_gastos', { p_mes: d.mes, p_forzar: true })
    setCopiando(false)
    if (error) return setError(mensajeError(error))
    if (!data) setError('No hay gastos fijos en meses anteriores para copiar.')
    await recargar()
  }

  async function borrar(g: Gasto) {
    if (!(await confirmar({ mensaje: `¿Borrar "${g.nombre}" de este mes?`, accion: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('gastos').delete().eq('id', g.id)
    if (error) return setError(mensajeError(error))
    setEditando(null)
    await recargar()
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">💳 Gastos del mes</h2>
        <span className="cifra font-semibold">{pesos(f.gastos)}</span>
      </div>
      {d.gastos.length > 0 && (
        <p className="mb-2 text-sm text-suave">
          Pagado {pesos(f.pagado)} · Por pagar <b className={f.pendiente > 0 ? 'text-texto' : ''}>{pesos(f.pendiente)}</b>
        </p>
      )}
      {error && <div className="mb-2"><Aviso>{error}</Aviso></div>}

      {d.gastos.length > 0 && (
        <ul className="mb-3 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
          {d.gastos.map((g) =>
            editando !== 'nuevo' && editando?.id === g.id ? (
              <li key={g.id} className="p-4">
                <FormGasto mes={d.mes} gasto={g} alTerminar={async () => { setEditando(null); await recargar() }} alBorrar={() => borrar(g)} />
              </li>
            ) : (
              <li key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditando(g)}>
                  <span className="block truncate font-medium">{g.nombre}</span>
                  <span className={`block text-xs ${vencidos.has(g.id) ? 'text-peligro' : 'text-suave'}`}>
                    {g.categoria}
                    {g.dia_pago != null && ` · día ${g.dia_pago}`}
                    {vencidos.has(g.id) && ' · vencido'}
                    {!g.se_repite && ' · solo este mes'}
                  </span>
                </button>
                <span className="cifra shrink-0 text-sm font-semibold">{pesos(g.monto)}</span>
                <button
                  type="button"
                  onClick={() => marcarPagado(g)}
                  aria-pressed={g.pagado}
                  className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-semibold ${
                    g.pagado ? 'border-exito bg-exito/10 text-exito' : 'border-borde text-suave'
                  }`}
                >
                  {g.pagado ? 'Pagado ✓' : 'Pagar'}
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {editando === 'nuevo' ? (
        <Tarjeta>
          <FormGasto mes={d.mes} alTerminar={async () => { setEditando(null); await recargar() }} />
        </Tarjeta>
      ) : (
        <div className="space-y-2">
          <Boton variante="secundario" onClick={() => setEditando('nuevo')}>
            + Agregar gasto
          </Boton>
          {d.gastos.length === 0 && (
            <Boton variante="texto" onClick={copiarAnterior} cargando={copiando}>
              Copiar los gastos fijos del mes anterior
            </Boton>
          )}
        </div>
      )}

      {categorias.length > 1 && (
        <details className="mt-3 rounded-2xl border border-borde bg-superficie px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Por categoría</summary>
          <ul className="mt-2 space-y-1">
            {categorias.map((c) => (
              <li key={c.categoria} className="flex justify-between gap-3">
                <span>{c.categoria}</span>
                <span className="cifra">
                  {pesos(c.monto)} <span className="text-suave">({porcentaje(c.monto / f.gastos, 0)})</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-2 text-xs text-suave">
        Los gastos que "se repiten" pasan solos al mes siguiente; ahí solo ajustas los montos que cambien (luz, agua…).
      </p>
    </section>
  )
}

function FormGasto({
  mes,
  gasto,
  alTerminar,
  alBorrar,
}: {
  mes: string
  gasto?: Gasto
  alTerminar: () => Promise<void>
  alBorrar?: () => void
}) {
  const [nombre, setNombre] = useState(gasto?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaGasto>(gasto?.categoria ?? 'Otros')
  const [monto, setMonto] = useState(gasto ? numero(gasto.monto) : '')
  const [dia, setDia] = useState(gasto?.dia_pago?.toString() ?? '')
  const [seRepite, setSeRepite] = useState(gasto?.se_repite ?? true)
  const [nota, setNota] = useState(gasto?.nota ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setError('')
    const valor = leerNumero(monto)
    const diaPago = dia.trim() ? Number(dia) : null
    if (!nombre.trim()) return setError('Escribe el nombre del gasto.')
    if (valor == null || valor < 0) return setError('Escribe el monto, por ejemplo 450.000.')
    if (diaPago != null && (!Number.isInteger(diaPago) || diaPago < 1 || diaPago > 31)) return setError('El día de pago va del 1 al 31.')
    const fila = { nombre: nombre.trim(), categoria, monto: Math.round(valor), dia_pago: diaPago, se_repite: seRepite, nota: nota.trim() || null }
    setGuardando(true)
    const { error } = gasto
      ? await supabase.from('gastos').update(fila).eq('id', gasto.id)
      : await supabase.from('gastos').insert({ ...fila, mes })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    await alTerminar()
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Arriendo local" autoFocus={!gasto} />
      <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
        {CATEGORIAS_GASTO.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Selector>
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Monto del mes" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$" />
        <Campo etiqueta="Día de pago" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="Ej.: 5" />
      </div>
      <p className="-mt-1 text-xs text-suave">Si el gasto tiene factura con IVA, ingresa el monto neto (sin IVA).</p>
      <Interruptor
        etiqueta="Se repite todos los meses"
        ayuda="Se copiará solo al mes siguiente"
        activo={seRepite}
        onCambio={setSeRepite}
      />
      <Campo etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
      {error && <Aviso>{error}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Boton variante="secundario" onClick={() => alTerminar()}>
          Cancelar
        </Boton>
        <Boton onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </div>
      {alBorrar && (
        <Boton variante="texto" className="text-peligro" onClick={alBorrar}>
          Borrar gasto
        </Boton>
      )}
    </div>
  )
}

function Comisiones({ d, recargar }: { d: DatosFinanzas; recargar: () => Promise<void> }) {
  const [debito, setDebito] = useState(decimal(d.comision_debito * 100, 3))
  const [credito, setCredito] = useState(decimal(d.comision_credito * 100, 3))
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setEstado(null)
    const deb = leerNumero(debito)
    const cre = leerNumero(credito)
    if (deb == null || cre == null || deb < 0 || cre < 0 || deb > 20 || cre > 20)
      return setEstado({ tipo: 'error', texto: 'Escribe porcentajes entre 0 y 20, por ejemplo 1,49.' })
    setGuardando(true)
    const { error } = await supabase.rpc('guardar_comisiones', { p_debito: deb / 100, p_credito: cre / 100 })
    setGuardando(false)
    if (error) return setEstado({ tipo: 'error', texto: mensajeError(error) })
    setEstado({ tipo: 'ok', texto: 'Comisiones guardadas.' })
    await recargar()
  }

  return (
    <details className="rounded-2xl border border-borde bg-superficie px-4 py-3">
      <summary className="cursor-pointer font-semibold">Comisiones de tarjeta</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-suave">
          El % que te descuenta la máquina (Transbank, Getnet, etc.) en cada venta. Míralo en tu contrato o en la liquidación
          mensual. Si la comisión tiene IVA que no recuperas, súmaselo.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Débito (%)" inputMode="decimal" value={debito} onChange={(e) => setDebito(e.target.value)} />
          <Campo etiqueta="Crédito (%)" inputMode="decimal" value={credito} onChange={(e) => setCredito(e.target.value)} />
        </div>
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        <Boton variante="secundario" onClick={guardar} cargando={guardando}>
          Guardar comisiones
        </Boton>
        {d.por_medio.length > 0 && (
          <Tabla>
            {d.por_medio.map((m) => (
              <li key={m.medio} className="flex justify-between gap-3">
                <span>{m.medio}</span>
                <span className="cifra">
                  {pesos(m.monto)}
                  {m.comision > 0 && <span className="text-suave"> · comisión {pesos(m.comision)}</span>}
                </span>
              </li>
            ))}
          </Tabla>
        )}
      </div>
    </details>
  )
}

function Tabla({ children }: { children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 font-semibold">Ventas del mes por medio de pago</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}
