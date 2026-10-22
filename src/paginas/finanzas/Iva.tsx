import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmar } from '../../componentes/Confirmar'
import { Aviso, Boton, Campo, Encabezado, Pestanas, Selector, Tarjeta } from '../../componentes/ui'
import { moverMes, nombreMes } from '../../lib/finanzas'
import { decimal, fechaDia, hoyIso, leerNumero, numero, pesos } from '../../lib/formato'
import {
  calcularIva,
  CATEGORIAS_COMPRA,
  decodificar,
  leerRegistroCompras,
  signo,
  TIPOS_DOC,
  type CategoriaCompra,
  type Compra,
  type DatosIva,
  type TipoDoc,
} from '../../lib/iva'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { PESTANAS_FINANZAS, SelectorMes } from './SelectorMes'

const primeroDelMes = (iso: string) => `${iso.slice(0, 7)}-01`

export function Iva() {
  const hoy = hoyIso()
  const mesActual = primeroDelMes(hoy)
  const [mes, setMes] = useState(mesActual)
  const [d, setD] = useState<DatosIva | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('iva_mes', { p_mes: mes })
    if (error) return setError(mensajeError(error))
    setError('')
    setD(data as DatosIva)
  }, [mes])

  useEffect(() => {
    setD(null)
    cargar()
  }, [cargar])

  // Hasta el día 20 se está declarando el mes anterior: se ofrece verlo
  const mesAnterior = moverMes(mesActual, -1)
  const declarando = Number(hoy.slice(8, 10)) <= 20 && mes === mesActual

  return (
    <>
      <Encabezado titulo="Finanzas" volver="/mas" />
      <Pestanas opciones={PESTANAS_FINANZAS} />
      <SelectorMes mes={mes} mesActual={mesActual} onCambio={setMes} />
      {declarando && (
        <button
          type="button"
          onClick={() => setMes(mesAnterior)}
          className="mb-4 block w-full rounded-2xl border border-aviso/40 bg-superficie px-4 py-3 text-left text-sm active:bg-superficie-2"
        >
          📅 El IVA de <b>{nombreMes(mesAnterior)}</b> se declara hasta el 20/{hoy.slice(5, 7)}.{' '}
          <span className="font-semibold text-primario">Ver ese mes ›</span>
        </button>
      )}
      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && <Contenido d={d} recargar={cargar} />}
    </>
  )
}

function Contenido({ d, recargar }: { d: DatosIva; recargar: () => Promise<void> }) {
  const f = calcularIva(d)
  const mesCorto = nombreMes(d.mes).split(' ')[0]

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-semibold">🧾 IVA estimado de {mesCorto}</h2>
        <Tarjeta className="space-y-3">
          <div>
            <p className="text-sm text-suave">{f.ivaPagar > 0 ? 'IVA a pagar' : 'IVA a pagar este mes'}</p>
            <p className="cifra text-3xl font-bold">{pesos(f.ivaPagar)}</p>
            {f.ppm > 0 && (
              <p className="text-sm">
                + PPM {pesos(f.ppm)} = <b className="cifra">{pesos(f.total)}</b> en el F29
              </p>
            )}
            <p className="mt-1 text-xs text-suave">Se declara y paga hasta el {fechaDia(f.vence)} (F29 por internet).</p>
          </div>
          {f.remanenteSiguiente > 0 && (
            <Aviso tipo="ok">
              Tus compras tienen más IVA que tus ventas: este mes no pagas IVA y te quedan {pesos(f.remanenteSiguiente)} de
              remanente para el próximo mes.
            </Aviso>
          )}
          <div className="space-y-1.5 border-t border-borde pt-3 text-sm">
            <Linea etiqueta="IVA de lo cobrado (ventas y abonos)" valor={f.debito} />
            <Linea etiqueta={`IVA de facturas de compra (${numero(d.compras.length)})`} valor={-f.credito} />
            {f.remanenteAnterior > 0 && <Linea etiqueta="Remanente del mes anterior" valor={-f.remanenteAnterior} />}
            <Linea etiqueta="IVA a pagar" valor={f.ivaPagar} fuerte />
          </div>
          {f.apartarPor100mil != null && f.total > 0 && (
            <p className="rounded-xl bg-superficie-2 px-4 py-3 text-sm">
              💡 Aparta <b className="cifra">{pesos(f.apartarPor100mil)}</b> por cada $100.000 que cobres, para tener el F29 listo.
            </p>
          )}
        </Tarjeta>
        <div className="mt-2 space-y-1 text-xs text-suave">
          {d.ultimo_dia && <p>Ventas cargadas hasta el {fechaDia(d.ultimo_dia)}.</p>}
          {f.debitoSinBoleta > 0 && (
            <p>
              Incluye {pesos(d.cobrado.sin_boleta)} cobrados sin boleta en influye (IVA {pesos(f.debitoSinBoleta)}). Si no los declaras,
              el IVA sería menor.
            </p>
          )}
          {d.compras.length === 0 && <p>Sin facturas de compra el IVA a pagar sale más alto: agrégalas abajo.</p>}
          <p>Es una estimación para planificar; la declaración final la revisa tu contador.</p>
        </div>
      </section>

      <Compras d={d} recargar={recargar} />
      <Ajustes d={d} recargar={recargar} />
    </div>
  )
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t border-borde pt-1.5 font-semibold' : ''}`}>
      <span>{etiqueta}</span>
      <span className="cifra shrink-0">{pesos(valor)}</span>
    </div>
  )
}

function Compras({ d, recargar }: { d: DatosIva; recargar: () => Promise<void> }) {
  const confirmar = useConfirmar()
  const entrada = useRef<HTMLInputElement>(null)
  const [editando, setEditando] = useState<Compra | 'nueva' | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null)
  const ivaTotal = d.compras.reduce((s, c) => s + signo(c.tipo_doc) * c.iva, 0)
  const mesCorto = nombreMes(d.mes).split(' ')[0]

  async function subir(archivo: File) {
    setEstado(null)
    setSubiendo(true)
    try {
      const { filas, errores } = leerRegistroCompras(decodificar(await archivo.arrayBuffer()))
      if (filas.length === 0) {
        setEstado({ tipo: 'error', texto: errores[0] ?? 'El archivo no tiene documentos.' })
        return
      }
      const fuera = filas.filter((f) => f.fecha && f.fecha.slice(0, 7) !== d.mes.slice(0, 7)).length
      if (
        fuera > filas.length / 2 &&
        !(await confirmar({
          mensaje: `La mayoría de los documentos no son de ${mesCorto}. ¿Seguro que es el registro de este mes? Se cargarán en ${nombreMes(d.mes)}.`,
          accion: 'Cargar igual',
        }))
      )
        return
      const { data, error } = await supabase.rpc('importar_compras_sii', { p_periodo: d.mes, p_filas: filas })
      if (error) {
        setEstado({ tipo: 'error', texto: mensajeError(error) })
        return
      }
      const r = data as { nuevas: number; repetidas: number }
      setEstado({
        tipo: 'ok',
        texto:
          `Listo: ${numero(r.nuevas)} documentos nuevos` +
          (r.repetidas ? `, ${numero(r.repetidas)} ya estaban cargados` : '') +
          (errores.length ? `. ${errores.length} filas no se pudieron leer.` : '.'),
      })
      await recargar()
    } catch {
      setEstado({ tipo: 'error', texto: 'No pudimos leer el archivo. Descárgalo de nuevo desde el SII en formato CSV.' })
    } finally {
      setSubiendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function borrar(c: Compra) {
    if (!(await confirmar({ mensaje: `¿Borrar el documento de ${c.proveedor}?`, accion: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('compras').delete().eq('id', c.id)
    if (error) return setEstado({ tipo: 'error', texto: mensajeError(error) })
    setEditando(null)
    await recargar()
  }

  async function borrarSii() {
    const n = d.compras.filter((c) => c.origen === 'sii').length
    if (!(await confirmar({ mensaje: `¿Borrar los ${n} documentos cargados desde el SII en ${mesCorto}? Podrás subir el archivo de nuevo.`, accion: 'Borrar', peligro: true })))
      return
    const ids = d.compras.filter((c) => c.origen === 'sii').map((c) => c.id)
    const { error } = await supabase.from('compras').delete().in('id', ids)
    if (error) return setEstado({ tipo: 'error', texto: mensajeError(error) })
    await recargar()
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">📥 Facturas de compra</h2>
        <span className="cifra text-sm font-semibold">IVA {pesos(ivaTotal)}</span>
      </div>

      <Tarjeta className="mb-3 space-y-2">
        <p className="text-sm">
          <b>Lo más fácil:</b> en sii.cl → Servicios online → Factura electrónica → <i>Registro de compras y ventas</i>, elige{' '}
          {nombreMes(d.mes)}, pestaña <i>Compras</i> → <i>Descargar detalles</i>, y sube aquí ese archivo CSV.
        </p>
        <input
          ref={entrada}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])}
        />
        <Boton onClick={() => entrada.current?.click()} cargando={subiendo}>
          Subir registro de compras del SII
        </Boton>
        <p className="text-xs text-suave">
          Si lo subes dos veces no se duplica. Las facturas que no estén en el SII (o boletas con IVA) agrégalas a mano.
        </p>
      </Tarjeta>
      {estado && (
        <div className="mb-3">
          <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>
        </div>
      )}

      {d.compras.length > 0 && (
        <ul className="mb-3 max-h-[60vh] divide-y divide-borde overflow-y-auto rounded-2xl border border-borde bg-superficie">
          {d.compras.map((c) =>
            editando !== 'nueva' && editando?.id === c.id ? (
              <li key={c.id} className="p-4">
                <FormCompra mes={d.mes} compra={c} alTerminar={async () => { setEditando(null); await recargar() }} alBorrar={() => borrar(c)} />
              </li>
            ) : (
              <li key={c.id}>
                <button type="button" onClick={() => setEditando(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-superficie-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.proveedor}</span>
                    <span className="block text-xs text-suave">
                      {c.tipo_doc}
                      {c.folio && ` N° ${c.folio}`}
                      {c.fecha && ` · ${fechaDia(c.fecha)}`}
                      {c.origen === 'sii' && ' · SII'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className={`cifra block font-semibold ${signo(c.tipo_doc) < 0 ? 'text-peligro' : ''}`}>
                      {pesos(signo(c.tipo_doc) * c.iva)}
                    </span>
                    <span className="cifra block text-xs text-suave">neto {pesos(c.neto + c.exento)}</span>
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {editando === 'nueva' ? (
        <Tarjeta>
          <FormCompra mes={d.mes} alTerminar={async () => { setEditando(null); await recargar() }} />
        </Tarjeta>
      ) : (
        <Boton variante="secundario" onClick={() => setEditando('nueva')}>
          + Agregar factura a mano
        </Boton>
      )}
      {d.compras.some((c) => c.origen === 'sii') && (
        <Boton variante="texto" className="mt-1 text-sm" onClick={borrarSii}>
          Borrar lo cargado desde el SII este mes
        </Boton>
      )}
      <p className="mt-2 text-xs text-suave">
        Las compras solo se usan para el IVA: no se restan otra vez del resultado del mes, porque los insumos ya están en el costo de
        cada producto.
      </p>
    </section>
  )
}

function FormCompra({
  mes,
  compra,
  alTerminar,
  alBorrar,
}: {
  mes: string
  compra?: Compra
  alTerminar: () => Promise<void>
  alBorrar?: () => void
}) {
  const hoy = hoyIso()
  const fin = sumarDias(moverMes(mes, 1), -1)
  const [fecha, setFecha] = useState(compra?.fecha ?? (hoy.slice(0, 7) === mes.slice(0, 7) ? hoy : mes))
  const [proveedor, setProveedor] = useState(compra?.proveedor ?? '')
  const [tipo, setTipo] = useState<TipoDoc>(compra?.tipo_doc ?? 'Factura')
  const [folio, setFolio] = useState(compra?.folio ?? '')
  const [neto, setNeto] = useState(compra ? numero(compra.neto) : '')
  const [iva, setIva] = useState(compra ? numero(compra.iva) : '')
  const [categoria, setCategoria] = useState<CategoriaCompra>(compra?.categoria ?? 'Insumos')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Al escribir el neto se propone el IVA (19%) si no se ha escrito otro
  function cambiarNeto(t: string) {
    setNeto(t)
    const n = leerNumero(t)
    if (n != null && tipo !== 'Factura exenta') setIva(numero(Math.round(n * 0.19)))
  }

  async function guardar() {
    setError('')
    const n = leerNumero(neto)
    const i = leerNumero(iva || '0')
    if (!proveedor.trim()) return setError('Escribe el proveedor.')
    if (n == null || n < 0) return setError('Escribe el monto neto (sin IVA).')
    if (i == null || i < 0) return setError('Revisa el IVA.')
    const exenta = tipo === 'Factura exenta'
    const fila = {
      fecha: fecha || null,
      proveedor: proveedor.trim(),
      tipo_doc: tipo,
      folio: folio.trim() || null,
      neto: exenta ? 0 : Math.round(n),
      exento: exenta ? Math.round(n) : 0,
      iva: exenta ? 0 : Math.round(i),
      total: Math.round(n + (exenta ? 0 : i)),
      categoria,
    }
    setGuardando(true)
    const { error } = compra
      ? await supabase.from('compras').update(fila).eq('id', compra.id)
      : await supabase.from('compras').insert({ ...fila, periodo: mes })
    setGuardando(false)
    if (error) return setError(error.code === '23505' ? 'Ese documento ya está cargado.' : mensajeError(error))
    await alTerminar()
  }

  return (
    <div className="space-y-3">
      <Campo etiqueta="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} autoFocus={!compra} />
      <div className="grid grid-cols-2 gap-2">
        <Selector etiqueta="Documento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDoc)}>
          {TIPOS_DOC.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Selector>
        <Campo etiqueta="N° (folio)" value={folio} onChange={(e) => setFolio(e.target.value)} inputMode="numeric" />
      </div>
      <Campo etiqueta="Fecha" type="date" value={fecha} min={mes} max={fin} onChange={(e) => setFecha(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Neto (sin IVA)" inputMode="numeric" value={neto} onChange={(e) => cambiarNeto(e.target.value)} placeholder="$" />
        <Campo
          etiqueta="IVA"
          inputMode="numeric"
          value={tipo === 'Factura exenta' ? '0' : iva}
          disabled={tipo === 'Factura exenta'}
          onChange={(e) => setIva(e.target.value)}
          placeholder="$"
        />
      </div>
      <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCompra)}>
        {CATEGORIAS_COMPRA.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Selector>
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
          Borrar documento
        </Boton>
      )}
    </div>
  )
}

function Ajustes({ d, recargar }: { d: DatosIva; recargar: () => Promise<void> }) {
  const [remanente, setRemanente] = useState(d.remanente_anterior ? numero(d.remanente_anterior) : '')
  const [ppm, setPpm] = useState(d.tasa_ppm ? decimal(Number(d.tasa_ppm) * 100, 3) : '')
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setEstado(null)
    const r = leerNumero(remanente || '0')
    const p = leerNumero(ppm || '0')
    if (r == null || r < 0) return setEstado({ tipo: 'error', texto: 'Revisa el remanente.' })
    if (p == null || p < 0 || p > 10) return setEstado({ tipo: 'error', texto: 'El PPM va entre 0 y 10%, por ejemplo 0,25.' })
    setGuardando(true)
    const { error } = await supabase.rpc('guardar_ajustes_iva', { p_mes: d.mes, p_remanente: Math.round(r), p_tasa_ppm: p / 100 })
    setGuardando(false)
    if (error) return setEstado({ tipo: 'error', texto: mensajeError(error) })
    setEstado({ tipo: 'ok', texto: 'Guardado.' })
    await recargar()
  }

  return (
    <details className="rounded-2xl border border-borde bg-superficie px-4 py-3">
      <summary className="cursor-pointer font-semibold">Remanente y PPM</summary>
      <div className="mt-3 space-y-3 text-sm">
        <Campo
          etiqueta={`Remanente de crédito del mes anterior (para ${nombreMes(d.mes).split(' ')[0]})`}
          inputMode="numeric"
          value={remanente}
          onChange={(e) => setRemanente(e.target.value)}
          placeholder="$0"
          ayuda="Si el mes pasado tus compras tuvieron más IVA que tus ventas, el F29 anterior muestra un remanente para el período siguiente. Pide el dato a tu contador."
        />
        <Campo
          etiqueta="Tasa de PPM (%)"
          inputMode="decimal"
          value={ppm}
          onChange={(e) => setPpm(e.target.value)}
          placeholder="Ej.: 0,25"
          ayuda="Pago provisional mensual a cuenta de la renta: un % de las ventas sin IVA. Tu contador sabe qué tasa te corresponde. Se usa para todos los meses."
        />
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        <Boton variante="secundario" onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </div>
    </details>
  )
}
