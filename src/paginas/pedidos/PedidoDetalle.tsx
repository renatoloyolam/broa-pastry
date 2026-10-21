import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfirmar } from '../../componentes/Confirmar'
import { Aviso, Boton, Campo, Encabezado, Insignia, Selector, Tarjeta } from '../../componentes/ui'
import { decimal, fechaDia, hoyIso, leerNumero, pesos } from '../../lib/formato'
import { linkWhatsapp, type Abono, type EstadoPedido } from '../../lib/pedidos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

const MEDIOS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia']

interface Form {
  cliente: string
  telefono: string
  descripcion: string
  producto_id: number | ''
  opcion_id: number | ''
  fecha_entrega: string
  hora_entrega: string
  precio_total: string
  notas: string
  costo_manual: string
}

export function PedidoDetalle() {
  const { id } = useParams()
  const esNuevo = id === 'nuevo'
  const navegar = useNavigate()
  const confirmar = useConfirmar()
  const { puede, config } = useSesion()
  const verCostos = puede('ver_costos')
  const divisor = config?.precios_incluyen_iva && config?.margen_sobre_neto ? 1 + Number(config.tasa_iva) : 1
  const hoy = hoyIso()

  const [form, setForm] = useState<Form>({
    cliente: '',
    telefono: '',
    descripcion: '',
    producto_id: '',
    opcion_id: '',
    fecha_entrega: hoy,
    hora_entrega: '',
    precio_total: '',
    notas: '',
    costo_manual: '',
  })
  const [estado, setEstado] = useState<EstadoPedido>('pendiente')
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [productos, setProductos] = useState<{ id: number; nombre: string }[]>([])
  const [opciones, setOpciones] = useState<{ id: number; producto_id: number; nombre: string; precio_referencia: number | null }[]>([])
  const [costos, setCostos] = useState<{ producto_id: number | null; opcion_id: number | null; costo_vigente: number | null }[]>([])
  const [nuevoAbono, setNuevoAbono] = useState({ monto: '', medio: 'Transferencia', fecha: hoy })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [cargado, setCargado] = useState(esNuevo)

  const cargar = useCallback(async () => {
    const consultas = [
      supabase.from('productos').select('id, nombre').eq('activo', true).eq('tipo', 'producto').order('nombre'),
      supabase.from('opciones').select('id, producto_id, nombre, precio_referencia').eq('activa', true).order('nombre'),
      verCostos ? supabase.from('v_costos').select('producto_id, opcion_id, costo_vigente') : Promise.resolve({ data: [], error: null }),
    ] as const
    const [p, o, c] = await Promise.all(consultas)
    setProductos((p.data ?? []) as { id: number; nombre: string }[])
    setOpciones((o.data ?? []) as typeof opciones)
    setCostos(((c.data ?? []) as typeof costos).map((x) => ({ ...x, costo_vigente: x.costo_vigente == null ? null : Number(x.costo_vigente) })))

    if (!esNuevo) {
      const [ped, ab, pc] = await Promise.all([
        supabase.from('pedidos').select('*').eq('id', Number(id)).maybeSingle(),
        supabase.from('pedido_abonos').select('*').eq('pedido_id', Number(id)).order('fecha').order('id'),
        verCostos ? supabase.from('pedido_costos').select('costo_neto').eq('pedido_id', Number(id)).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ])
      if (ped.error || !ped.data) {
        setError(ped.error ? mensajeError(ped.error) : 'No encontramos ese pedido.')
        return
      }
      const d = ped.data
      setForm({
        cliente: d.cliente,
        telefono: d.telefono ?? '',
        descripcion: d.descripcion,
        producto_id: d.producto_id ?? '',
        opcion_id: d.opcion_id ?? '',
        fecha_entrega: d.fecha_entrega,
        hora_entrega: d.hora_entrega ? String(d.hora_entrega).slice(0, 5) : '',
        precio_total: decimal(d.precio_total),
        notas: d.notas ?? '',
        costo_manual: pc.data ? decimal(Number((pc.data as { costo_neto: number }).costo_neto)) : '',
      })
      setEstado(d.estado)
      setAbonos((ab.data ?? []) as Abono[])
      setCargado(true)
    }
  }, [esNuevo, id, verCostos])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const opcionesProducto = opciones.filter((o) => o.producto_id === form.producto_id)
  const costoCatalogo = useMemo(() => {
    if (!form.producto_id) return null
    const base = costos.find((c) => c.producto_id === form.producto_id)?.costo_vigente
    if (base == null) return null
    if (!form.opcion_id) return base
    const op = costos.find((c) => c.opcion_id === form.opcion_id)?.costo_vigente
    return op == null ? null : base + op
  }, [form.producto_id, form.opcion_id, costos])

  const precio = leerNumero(form.precio_total) ?? 0
  const abonado = abonos.reduce((s, a) => s + a.monto, 0)
  const saldo = precio - abonado
  const costo = form.costo_manual.trim() ? leerNumero(form.costo_manual) : costoCatalogo
  const ganancia = costo != null && precio > 0 ? precio / divisor - costo : null
  const wa = linkWhatsapp(form.telefono)

  function elegirOpcion(opId: number | '') {
    const op = opciones.find((o) => o.id === opId)
    const prod = productos.find((p) => p.id === form.producto_id)
    setForm({
      ...form,
      opcion_id: opId,
      // Sugerencias si están vacíos
      descripcion: form.descripcion || (op && prod ? `${prod.nombre} ${op.nombre}` : form.descripcion),
      precio_total: form.precio_total || (op?.precio_referencia ? decimal(op.precio_referencia) : ''),
    })
  }

  async function guardar() {
    setError('')
    setOk('')
    if (!form.cliente.trim()) return setError('Escribe el nombre del cliente.')
    if (!form.descripcion.trim()) return setError('Describe el pedido (sabor, tamaño, mensaje…).')
    if (!form.fecha_entrega) return setError('Elige la fecha de entrega.')
    if (!(precio > 0)) return setError('Escribe el precio total.')
    const costoManual = form.costo_manual.trim() ? leerNumero(form.costo_manual) : null
    if (form.costo_manual.trim() && (costoManual == null || costoManual < 0)) return setError('Revisa el costo estimado.')
    setGuardando(true)
    const fila = {
      cliente: form.cliente.trim(),
      telefono: form.telefono.trim() || null,
      descripcion: form.descripcion.trim(),
      producto_id: form.producto_id || null,
      opcion_id: form.opcion_id || null,
      fecha_entrega: form.fecha_entrega,
      hora_entrega: form.hora_entrega || null,
      precio_total: Math.round(precio),
      notas: form.notas.trim() || null,
    }
    const res = esNuevo
      ? await supabase.from('pedidos').insert(fila).select('id').single()
      : await supabase.from('pedidos').update(fila).eq('id', Number(id)).select('id').single()
    if (res.error) {
      setGuardando(false)
      return setError(mensajeError(res.error))
    }
    const pedidoId = res.data.id as number
    if (verCostos) {
      const r =
        costoManual != null
          ? await supabase.from('pedido_costos').upsert({ pedido_id: pedidoId, costo_neto: costoManual })
          : await supabase.from('pedido_costos').delete().eq('pedido_id', pedidoId)
      if (r.error) setError(mensajeError(r.error))
    }
    setGuardando(false)
    if (esNuevo) navegar(`/pedidos/${pedidoId}`, { replace: true })
    else setOk('Pedido guardado.')
  }

  async function agregarAbono() {
    setError('')
    const monto = leerNumero(nuevoAbono.monto)
    if (!(monto && monto > 0)) return setError('Escribe el monto del abono.')
    if (monto > saldo && !(await confirmar({ mensaje: `El abono (${pesos(monto)}) es mayor que el saldo (${pesos(saldo)}). ¿Registrarlo igual?`, accion: 'Registrar' })))
      return
    const { error } = await supabase
      .from('pedido_abonos')
      .insert({ pedido_id: Number(id), monto: Math.round(monto), medio_pago: nuevoAbono.medio, fecha: nuevoAbono.fecha })
    if (error) return setError(mensajeError(error))
    setNuevoAbono({ ...nuevoAbono, monto: '' })
    await cargar()
  }

  async function borrarAbono(a: Abono) {
    if (!(await confirmar({ mensaje: `¿Borrar el abono de ${pesos(a.monto)} del ${fechaDia(a.fecha)}?`, accion: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('pedido_abonos').delete().eq('id', a.id)
    if (error) return setError(mensajeError(error))
    await cargar()
  }

  async function cambiarEstado(nuevo: EstadoPedido) {
    const textos: Record<EstadoPedido, string> = {
      entregado: saldo > 0 ? `¿Marcar como entregado? Aún tiene saldo de ${pesos(saldo)} por cobrar.` : '¿Marcar como entregado?',
      cancelado: '¿Cancelar este pedido? Los abonos quedan registrados.',
      pendiente: '¿Volver a dejarlo pendiente?',
    }
    if (!(await confirmar({ mensaje: textos[nuevo], accion: 'Sí', peligro: nuevo === 'cancelado' }))) return
    const { error } = await supabase
      .from('pedidos')
      .update({ estado: nuevo, entregado_en: nuevo === 'entregado' ? new Date().toISOString() : null })
      .eq('id', Number(id))
    if (error) return setError(mensajeError(error))
    setEstado(nuevo)
    setOk(nuevo === 'entregado' ? 'Pedido entregado.' : nuevo === 'cancelado' ? 'Pedido cancelado.' : 'Pedido pendiente.')
  }

  async function eliminar() {
    if (!(await confirmar({ mensaje: '¿Eliminar este pedido y sus abonos? Úsalo solo si se anotó por error.', accion: 'Eliminar', peligro: true }))) return
    const { error } = await supabase.from('pedidos').delete().eq('id', Number(id))
    if (error) return setError(mensajeError(error))
    navegar('/pedidos', { replace: true })
  }

  if (!cargado) return error ? <Aviso>{error}</Aviso> : null

  return (
    <>
      <Encabezado titulo={esNuevo ? 'Nuevo pedido' : 'Pedido'} volver="/pedidos">
        {!esNuevo && (
          <Insignia
            clase={
              estado === 'entregado' ? 'bg-exito/15 text-exito' : estado === 'cancelado' ? 'bg-superficie-2 text-suave' : 'bg-aviso/15 text-aviso'
            }
          >
            {{ pendiente: 'Pendiente', entregado: 'Entregado', cancelado: 'Cancelado' }[estado]}
          </Insignia>
        )}
      </Encabezado>

      <div className="space-y-4">
        <Tarjeta className="space-y-4">
          <Campo etiqueta="Cliente" autoComplete="off" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Campo
                etiqueta="Teléfono"
                type="tel"
                inputMode="tel"
                placeholder="+56 9 …"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center rounded-xl border border-borde px-3 text-sm font-semibold text-primario"
              >
                WhatsApp
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              etiqueta="Fecha de entrega"
              type="date"
              value={form.fecha_entrega}
              onChange={(e) => setForm({ ...form, fecha_entrega: e.target.value })}
            />
            <Campo etiqueta="Hora (opcional)" type="time" value={form.hora_entrega} onChange={(e) => setForm({ ...form, hora_entrega: e.target.value })} />
          </div>
        </Tarjeta>

        <Tarjeta className="space-y-4">
          <p className="text-sm font-medium text-suave">¿Qué torta? (opcional: sirve para estimar el costo)</p>
          <Selector
            aria-label="Producto"
            value={form.producto_id}
            onChange={(e) => setForm({ ...form, producto_id: e.target.value ? Number(e.target.value) : '', opcion_id: '' })}
          >
            <option value="">Otro / personalizado</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
          {opcionesProducto.length > 0 && (
            <Selector aria-label="Sabor" value={form.opcion_id} onChange={(e) => elegirOpcion(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Elige el sabor…</option>
              {opcionesProducto.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Selector>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-suave">Descripción (sabor, tamaño, mensaje, decoración)</span>
            <textarea
              rows={3}
              maxLength={300}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full rounded-xl border border-borde bg-superficie px-4 py-3"
            />
          </label>
          <Campo
            etiqueta="Precio total (con IVA)"
            inputMode="numeric"
            value={form.precio_total}
            onChange={(e) => setForm({ ...form, precio_total: e.target.value })}
          />
          {verCostos && (
            <Campo
              etiqueta="Costo estimado (sin IVA, opcional)"
              inputMode="numeric"
              placeholder={costoCatalogo != null ? `Del catálogo: ${pesos(costoCatalogo)}` : 'Ej.: 12.000'}
              value={form.costo_manual}
              onChange={(e) => setForm({ ...form, costo_manual: e.target.value })}
              ayuda={costoCatalogo != null ? 'Si lo dejas vacío se usa el costo del catálogo.' : 'Sin producto del catálogo, escríbelo para ver la ganancia esperada.'}
            />
          )}
          <Campo etiqueta="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </Tarjeta>

        {precio > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Tarjeta>
              <p className="text-xs font-medium text-suave uppercase">Saldo por cobrar</p>
              <p className={`cifra text-2xl font-bold ${saldo > 0 ? 'text-texto' : 'text-exito'}`}>{saldo > 0 ? pesos(saldo) : 'Pagado'}</p>
              <p className="text-xs text-suave">abonado {pesos(abonado)}</p>
            </Tarjeta>
            {verCostos && (
              <Tarjeta>
                <p className="text-xs font-medium text-suave uppercase">Ganancia esperada</p>
                <p className="cifra text-2xl font-bold">{pesos(ganancia)}</p>
                <p className="text-xs text-suave">{costo != null ? `costo ${pesos(costo)}` : 'falta el costo'}</p>
              </Tarjeta>
            )}
          </div>
        )}

        {error && <Aviso>{error}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}
        <Boton onClick={guardar} cargando={guardando}>
          {esNuevo ? 'Crear pedido' : 'Guardar cambios'}
        </Boton>

        {!esNuevo && (
          <>
            <section>
              <h2 className="mb-2 text-lg font-semibold">Abonos</h2>
              {abonos.length === 0 ? (
                <p className="mb-2 text-sm text-suave">Sin abonos todavía.</p>
              ) : (
                <ul className="mb-3 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                  {abonos.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex-1">
                        <span className="cifra block font-semibold">{pesos(a.monto)}</span>
                        <span className="block text-xs text-suave">
                          {fechaDia(a.fecha)}
                          {a.medio_pago && ` · ${a.medio_pago}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label="Borrar abono"
                        onClick={() => borrarAbono(a)}
                        className="h-11 w-9 rounded-xl text-xl text-suave active:bg-superficie-2"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {estado !== 'cancelado' && saldo > 0 && (
                <Tarjeta className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Campo
                      etiqueta="Monto"
                      inputMode="numeric"
                      placeholder={decimal(saldo)}
                      value={nuevoAbono.monto}
                      onChange={(e) => setNuevoAbono({ ...nuevoAbono, monto: e.target.value })}
                    />
                    <Campo etiqueta="Fecha" type="date" value={nuevoAbono.fecha} max={hoy} onChange={(e) => setNuevoAbono({ ...nuevoAbono, fecha: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MEDIOS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={nuevoAbono.medio === m}
                        onClick={() => setNuevoAbono({ ...nuevoAbono, medio: m })}
                        className={`min-h-10 rounded-full border px-3 text-sm ${
                          nuevoAbono.medio === m ? 'border-primario bg-primario text-primario-texto' : 'border-borde'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Boton variante="secundario" onClick={() => setNuevoAbono({ ...nuevoAbono, monto: decimal(saldo) })}>
                      Pagar todo
                    </Boton>
                    <Boton onClick={agregarAbono}>Registrar abono</Boton>
                  </div>
                </Tarjeta>
              )}
            </section>

            <section className="space-y-2">
              {estado === 'pendiente' && (
                <Boton onClick={() => cambiarEstado('entregado')} className="min-h-14">
                  Marcar como entregado
                </Boton>
              )}
              {estado !== 'pendiente' && (
                <Boton variante="secundario" onClick={() => cambiarEstado('pendiente')}>
                  Volver a pendiente
                </Boton>
              )}
              {estado === 'pendiente' && (
                <Boton variante="peligro" onClick={() => cambiarEstado('cancelado')}>
                  Cancelar pedido
                </Boton>
              )}
              <Boton variante="texto" onClick={eliminar}>
                Eliminar (anotado por error)
              </Boton>
            </section>
          </>
        )}
      </div>
    </>
  )
}
