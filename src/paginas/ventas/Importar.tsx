import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fechaDia, numero, pesos } from '../../lib/formato'
import {
  agruparTransacciones,
  armarLotes,
  buscarDesconocidos,
  CAMPOS_ITEM,
  leerLibro,
  normalizar,
  sugerirProducto,
  type CampoItem,
  type CatalogoImport,
  type ErrorFila,
  type Hojas,
  type MapeoGuardado,
  type OpcionDesconocida,
  type ProductoDesconocido,
  type TransaccionLeida,
} from '../../lib/importador'
import { mensajeError, supabase } from '../../lib/supabase'
import { Aviso, Boton, Encabezado, Selector, Tarjeta } from '../../componentes/ui'

interface Categoria {
  id: number
  nombre: string
}

interface Preparado {
  archivo: string
  transacciones: TransaccionLeida[]
  existentes: Set<number>
  errores: ErrorFila[]
  descartadas: number
  canceladas: number
  desconocidos: { productos: ProductoDesconocido[]; opciones: OpcionDesconocida[] }
  catalogo: CatalogoImport
  categorias: Categoria[]
}

type DecisionProducto = { accion: 'crear'; categoria: string; tipo: 'producto' | 'ajuste' | 'abono' } | { accion: 'vincular'; productoId: number | '' }
type DecisionOpcion = { accion: 'crear' } | { accion: 'ignorar' } | { accion: 'vincular'; opcionId: number | '' }

type Paso =
  | { paso: 'elegir' }
  | { paso: 'leyendo' }
  | { paso: 'mapear'; hojas: Hojas; archivo: string; titulos: string[]; faltantes: CampoItem[]; mensaje: string }
  | { paso: 'revisar'; datos: Preparado }
  | { paso: 'importando'; hecho: number; total: number }
  | { paso: 'listo'; nuevas: number; repetidas: number; lineas: number; errores: number; desde: string; hasta: string }

async function cargarCatalogo(): Promise<{ catalogo: CatalogoImport; categorias: Categoria[] }> {
  const [p, o, ap, ao, c] = await Promise.all([
    supabase.from('productos').select('id, nombre, tipo'),
    supabase.from('opciones').select('id, producto_id, nombre'),
    supabase.from('alias_productos').select('alias, producto_id'),
    supabase.from('alias_opciones').select('producto_id, alias, opcion_id'),
    supabase.from('categorias').select('id, nombre').eq('activa', true).order('orden'),
  ])
  const err = [p, o, ap, ao, c].find((x) => x.error)?.error
  if (err) throw err
  return {
    catalogo: { productos: p.data!, opciones: o.data!, aliasProductos: ap.data!, aliasOpciones: ao.data! },
    categorias: c.data!,
  }
}

async function buscarExistentes(numeros: number[]): Promise<Set<number>> {
  const set = new Set<number>()
  for (let i = 0; i < numeros.length; i += 1000) {
    const { data, error } = await supabase.rpc('numeros_existentes', { p_numeros: numeros.slice(i, i + 1000) })
    if (error) throw error
    for (const n of data as number[]) set.add(Number(n))
  }
  return set
}

export function Importar() {
  const [estado, setEstado] = useState<Paso>({ paso: 'elegir' })
  const [error, setError] = useState('')
  const [decProductos, setDecProductos] = useState<Record<string, DecisionProducto>>({})
  const [decOpciones, setDecOpciones] = useState<Record<string, DecisionOpcion>>({})
  const [mapeoManual, setMapeoManual] = useState<MapeoGuardado>({})
  const entrada = useRef<HTMLInputElement>(null)

  async function procesar(hojas: Hojas, archivo: string, mapeo: MapeoGuardado) {
    const lectura = leerLibro(hojas, mapeo)
    if (!lectura.ok) {
      setMapeoManual(mapeo)
      setEstado({ paso: 'mapear', hojas, archivo, titulos: lectura.titulos, faltantes: lectura.faltantes, mensaje: lectura.mensaje })
      return
    }
    const g = agruparTransacciones(lectura)
    if (g.transacciones.length === 0) {
      setEstado({ paso: 'elegir' })
      setError('El archivo no tiene ventas válidas. Revisa que sea el Excel de Transacciones de influye.app.')
      return
    }
    // Recordar el mapeo que funcionó
    await supabase.from('mapeo_importacion').update({ columnas: lectura.mapeo, actualizado_en: new Date().toISOString() }).eq('id', true)
    const [{ catalogo, categorias }, existentes] = await Promise.all([
      cargarCatalogo(),
      buscarExistentes(g.transacciones.map((t) => t.numero)),
    ])
    const nuevas = g.transacciones.filter((t) => !existentes.has(t.numero))
    const desconocidos = buscarDesconocidos(nuevas, catalogo)
    const dp: Record<string, DecisionProducto> = {}
    for (const p of desconocidos.productos) dp[p.clave] = { accion: 'crear', ...sugerirProducto(p.nombre, p.seccion) }
    const dop: Record<string, DecisionOpcion> = {}
    // En productos que ya existen, lo desconocido suele ser un comentario de la cajera ("sin crema")
    for (const o of desconocidos.opciones) dop[o.clave] = o.productoId ? { accion: 'ignorar' } : { accion: 'crear' }
    setDecProductos(dp)
    setDecOpciones(dop)
    setEstado({
      paso: 'revisar',
      datos: {
        archivo,
        transacciones: g.transacciones,
        existentes,
        errores: lectura.errores,
        descartadas: g.descartadas.length,
        canceladas: g.canceladas,
        desconocidos,
        catalogo,
        categorias,
      },
    })
  }

  async function alElegir(archivo: File) {
    setError('')
    if (!/\.(xlsx|xls)$/i.test(archivo.name)) {
      setError('Ese archivo no es un Excel. Exporta desde influye.app en formato Excel (.xlsx).')
      return
    }
    setEstado({ paso: 'leyendo' })
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await archivo.arrayBuffer())
      const hojas: Hojas = {}
      for (const n of libro.SheetNames) {
        hojas[n] = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: '' })
      }
      const { data } = await supabase.from('mapeo_importacion').select('columnas').maybeSingle()
      await procesar(hojas, archivo.name, (data?.columnas as MapeoGuardado) ?? {})
    } catch (e) {
      setEstado({ paso: 'elegir' })
      setError(
        /zip|corrupt|unsupported|signature/i.test(String((e as Error)?.message))
          ? 'No pudimos abrir el archivo. Puede estar dañado; vuelve a exportarlo desde influye.app.'
          : mensajeError(e),
      )
    } finally {
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function confirmar(datos: Preparado) {
    setError('')
    // Validar decisiones de vincular
    for (const p of datos.desconocidos.productos) {
      const d = decProductos[p.clave]
      if (d.accion === 'vincular' && !d.productoId) return setError(`Elige con qué producto vincular "${p.nombre}".`)
    }
    for (const o of datos.desconocidos.opciones) {
      const d = decOpciones[o.clave]
      if (d.accion === 'vincular' && !d.opcionId) return setError(`Elige con qué opción vincular "${o.nombre}".`)
    }
    const nuevas = datos.transacciones.filter((t) => !datos.existentes.has(t.numero))
    setEstado({ paso: 'importando', hecho: 0, total: nuevas.length })
    let importacionId: number | null = null
    try {
      // 1. Productos nuevos y alias
      for (const p of datos.desconocidos.productos) {
        const d = decProductos[p.clave]
        if (d.accion === 'crear') {
          const cat = datos.categorias.find((c) => c.nombre === d.categoria)
          const { error } = await supabase
            .from('productos')
            .insert({ nombre: p.nombre, categoria_id: cat?.id ?? null, tipo: d.tipo })
          if (error && error.code !== '23505') throw error
        } else {
          const { error } = await supabase.from('alias_productos').insert({ alias: p.clave, producto_id: d.productoId })
          if (error && error.code !== '23505') throw error
        }
      }
      // 2. Opciones nuevas y alias (con los productos ya creados)
      let { catalogo } = await cargarCatalogo()
      const prodPorClave = new Map<string, number>()
      for (const p of catalogo.productos) prodPorClave.set(normalizar(p.nombre), p.id)
      for (const a of catalogo.aliasProductos) prodPorClave.set(a.alias, a.producto_id)
      for (const o of datos.desconocidos.opciones) {
        const pid = o.productoId ?? prodPorClave.get(o.productoClave)
        if (!pid) continue
        const d = decOpciones[o.clave]
        if (d.accion === 'crear') {
          const { error } = await supabase.from('opciones').insert({ producto_id: pid, nombre: o.nombre })
          if (error && error.code !== '23505') throw error
        } else {
          const { error } = await supabase.from('alias_opciones').insert({
            producto_id: pid,
            alias: normalizar(o.nombre),
            opcion_id: d.accion === 'vincular' ? d.opcionId : null,
          })
          if (error && error.code !== '23505') throw error
        }
      }
      catalogo = (await cargarCatalogo()).catalogo

      // 3. Armar lotes y subir
      const { lotes, sinResolver } = armarLotes(nuevas, catalogo)
      if (sinResolver.length) {
        throw new Error(`Quedaron productos sin vincular: ${sinResolver.slice(0, 5).join(', ')}`)
      }
      const fechas = datos.transacciones.map((t) => t.fechaHora.slice(0, 10)).sort()
      const { data: imp, error: errImp } = await supabase
        .from('importaciones')
        .insert({
          archivo: datos.archivo,
          desde: fechas[0],
          hasta: fechas[fechas.length - 1],
          filas_con_error: datos.errores.length,
          detalle_errores: datos.errores.slice(0, 200),
          transacciones_repetidas: datos.existentes.size,
        })
        .select('id')
        .single()
      if (errImp) throw errImp
      importacionId = imp.id

      let hecho = 0
      let lineas = 0
      let nuevasOk = 0
      let repetidas = datos.existentes.size
      for (const lote of lotes) {
        const { data, error } = await supabase.rpc('importar_lote', { p_importacion: importacionId, p_ventas: lote })
        if (error) throw error
        const r = data as { nuevas: number; repetidas: number; lineas: number }
        nuevasOk += r.nuevas
        repetidas += r.repetidas
        lineas += r.lineas
        hecho += lote.length
        setEstado({ paso: 'importando', hecho, total: nuevas.length })
      }
      const { error: errFin } = await supabase.from('importaciones').update({ estado: 'completa' }).eq('id', importacionId)
      if (errFin) throw errFin
      setEstado({
        paso: 'listo',
        nuevas: nuevasOk,
        repetidas,
        lineas,
        errores: datos.errores.length,
        desde: fechas[0],
        hasta: fechas[fechas.length - 1],
      })
    } catch (e) {
      // Si algo falló a medias, deshacemos lo que alcanzó a entrar
      if (importacionId) await supabase.rpc('deshacer_importacion', { p_id: importacionId })
      setEstado({ paso: 'revisar', datos })
      setError(`No se pudo terminar la importación; no se guardó ninguna venta. Intenta de nuevo. ${mensajeError(e)}`)
    }
  }

  return (
    <>
      <Encabezado titulo="Importar ventas" volver="/ventas" />
      {error && (
        <div className="mb-4">
          <Aviso>{error}</Aviso>
        </div>
      )}

      {estado.paso === 'elegir' && (
        <div className="space-y-4">
          <Tarjeta className="space-y-2 text-sm text-suave">
            <p className="font-semibold text-texto">Cómo sacar el Excel de influye.app</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>En influye.app, entra a Transacciones.</li>
              <li>Elige el día o el rango de fechas.</li>
              <li>Exporta a Excel y guarda el archivo.</li>
            </ol>
            <p>Puedes subir un día, una semana o el mes completo. Si subes ventas que ya estaban, no se duplican.</p>
          </Tarjeta>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && alElegir(e.target.files[0])}
          />
          <Boton onClick={() => entrada.current?.click()} className="min-h-16 text-lg">
            Elegir archivo Excel
          </Boton>
        </div>
      )}

      {estado.paso === 'leyendo' && <Aviso tipo="info">Leyendo el archivo…</Aviso>}

      {estado.paso === 'mapear' && (
        <div className="space-y-4">
          <Aviso tipo="info">{estado.mensaje}</Aviso>
          {estado.titulos.length === 0 ? (
            <Boton variante="secundario" onClick={() => setEstado({ paso: 'elegir' })}>
              Elegir otro archivo
            </Boton>
          ) : (
            <Tarjeta className="space-y-3">
              {CAMPOS_ITEM.map((c) => (
                <Selector
                  key={c.campo}
                  etiqueta={`${c.texto}${c.requerido ? ' *' : ' (opcional)'}`}
                  value={mapeoManual[c.campo] ?? ''}
                  onChange={(e) => setMapeoManual({ ...mapeoManual, [c.campo]: e.target.value || undefined })}
                >
                  <option value="">—</option>
                  {estado.titulos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Selector>
              ))}
              <p className="text-xs text-suave">Este mapeo se recuerda para las próximas importaciones.</p>
              <Boton
                onClick={() => {
                  setError('')
                  setEstado({ paso: 'leyendo' })
                  void procesar(estado.hojas, estado.archivo, mapeoManual)
                }}
              >
                Usar estas columnas
              </Boton>
              <Boton variante="texto" onClick={() => setEstado({ paso: 'elegir' })}>
                Elegir otro archivo
              </Boton>
            </Tarjeta>
          )}
        </div>
      )}

      {estado.paso === 'revisar' && (
        <Revision
          datos={estado.datos}
          decProductos={decProductos}
          setDecProductos={setDecProductos}
          decOpciones={decOpciones}
          setDecOpciones={setDecOpciones}
          onConfirmar={() => confirmar(estado.datos)}
          onCancelar={() => setEstado({ paso: 'elegir' })}
        />
      )}

      {estado.paso === 'importando' && (
        <Tarjeta className="space-y-3">
          <p className="font-semibold">Guardando ventas…</p>
          <div className="h-3 overflow-hidden rounded-full bg-superficie-2">
            <div
              className="h-full bg-acento transition-all"
              style={{ width: `${estado.total ? Math.round((estado.hecho / estado.total) * 100) : 5}%` }}
            />
          </div>
          <p className="text-sm text-suave">
            {numero(estado.hecho)} de {numero(estado.total)} transacciones. No cierres la app.
          </p>
        </Tarjeta>
      )}

      {estado.paso === 'listo' && (
        <div className="space-y-4">
          <Aviso tipo="ok">
            Importación lista: {fechaDia(estado.desde)}
            {estado.hasta !== estado.desde && ` al ${fechaDia(estado.hasta)}`}.
          </Aviso>
          <Tarjeta>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-suave">Transacciones nuevas</dt>
              <dd className="cifra text-right font-semibold">{numero(estado.nuevas)}</dd>
              <dt className="text-suave">Ya estaban (ignoradas)</dt>
              <dd className="cifra text-right font-semibold">{numero(estado.repetidas)}</dd>
              <dt className="text-suave">Productos vendidos</dt>
              <dd className="cifra text-right font-semibold">{numero(estado.lineas)}</dd>
              <dt className="text-suave">Filas con error</dt>
              <dd className="cifra text-right font-semibold">{numero(estado.errores)}</dd>
            </dl>
          </Tarjeta>
          <Link
            to="/ventas"
            className="flex min-h-12 items-center justify-center rounded-2xl bg-primario font-semibold text-primario-texto"
          >
            Ver ventas
          </Link>
          <Boton variante="secundario" onClick={() => setEstado({ paso: 'elegir' })}>
            Importar otro archivo
          </Boton>
        </div>
      )}
    </>
  )
}

function Revision({
  datos,
  decProductos,
  setDecProductos,
  decOpciones,
  setDecOpciones,
  onConfirmar,
  onCancelar,
}: {
  datos: Preparado
  decProductos: Record<string, DecisionProducto>
  setDecProductos: (d: Record<string, DecisionProducto>) => void
  decOpciones: Record<string, DecisionOpcion>
  setDecOpciones: (d: Record<string, DecisionOpcion>) => void
  onConfirmar: () => void
  onCancelar: () => void
}) {
  const nuevas = datos.transacciones.filter((t) => !datos.existentes.has(t.numero))
  const fechas = datos.transacciones.map((t) => t.fechaHora.slice(0, 10)).sort()
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]
  const totalNuevas = nuevas.reduce((s, t) => s + t.total, 0)
  const unidades = nuevas.reduce((s, t) => s + t.lineas.length, 0)
  const productosOrdenados = datos.catalogo.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const muestra = nuevas.slice(0, 5)
  const { productos: dProd, opciones: dOp } = datos.desconocidos

  return (
    <div className="space-y-4 pb-4">
      <Tarjeta>
        <p className="text-sm text-suave">{datos.archivo}</p>
        <p className="mt-1 font-semibold">
          {desde === hasta ? `Ventas del ${fechaDia(desde)}` : `Ventas del ${fechaDia(desde)} al ${fechaDia(hasta)}`}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-suave">Transacciones nuevas</dt>
          <dd className="cifra text-right font-semibold">{numero(nuevas.length)}</dd>
          <dt className="text-suave">Ya importadas antes</dt>
          <dd className="cifra text-right">{numero(datos.existentes.size)}</dd>
          <dt className="text-suave">Productos vendidos</dt>
          <dd className="cifra text-right">{numero(unidades)}</dd>
          <dt className="text-suave">Total de lo nuevo</dt>
          <dd className="cifra text-right font-semibold">{pesos(totalNuevas)}</dd>
          {datos.canceladas > 0 && (
            <>
              <dt className="text-suave">Anuladas (se ignoran)</dt>
              <dd className="cifra text-right">{numero(datos.canceladas)}</dd>
            </>
          )}
        </dl>
      </Tarjeta>

      {nuevas.length === 0 && (
        <Aviso tipo="info">Todas las ventas de este archivo ya estaban importadas. No hay nada nuevo que guardar.</Aviso>
      )}

      {datos.errores.length > 0 && (
        <details className="rounded-2xl border border-aviso/40 bg-superficie p-4">
          <summary className="cursor-pointer font-semibold text-aviso">
            {datos.errores.length} fila(s) con problemas
            {datos.descartadas > 0 && ` · ${datos.descartadas} transacción(es) no se importarán`}
          </summary>
          <ul className="mt-3 space-y-1 text-sm">
            {datos.errores.slice(0, 50).map((e) => (
              <li key={`${e.hoja}-${e.fila}`}>
                Hoja {e.hoja}, fila {e.fila}: {e.motivo}
              </li>
            ))}
            {datos.errores.length > 50 && <li>…y {datos.errores.length - 50} más</li>}
          </ul>
        </details>
      )}

      {dProd.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Productos nuevos ({dProd.length})</h2>
          <p className="mb-3 text-sm text-suave">
            No están en la app. Créalos, o si es un producto que ya existe con otro nombre, vincúlalo. La app lo
            recordará para la próxima vez.
          </p>
          <div className="space-y-2">
            {dProd.map((p) => {
              const d = decProductos[p.clave]
              return (
                <Tarjeta key={p.clave} className="space-y-2 p-3">
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-xs text-suave">
                    {p.seccion || 'Sin sección'} · vendido {numero(p.veces)} veces · {pesos(p.monto)}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDecProductos({ ...decProductos, [p.clave]: { accion: 'crear', ...sugerirProducto(p.nombre, p.seccion) } })}
                      className={`min-h-11 rounded-xl border text-sm ${d.accion === 'crear' ? 'border-primario bg-superficie-2 font-semibold' : 'border-borde'}`}
                    >
                      Crear nuevo
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecProductos({ ...decProductos, [p.clave]: { accion: 'vincular', productoId: '' } })}
                      className={`min-h-11 rounded-xl border text-sm ${d.accion === 'vincular' ? 'border-primario bg-superficie-2 font-semibold' : 'border-borde'}`}
                    >
                      Es uno que ya existe
                    </button>
                  </div>
                  {d.accion === 'crear' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Selector
                        aria-label="Categoría"
                        value={d.categoria}
                        onChange={(e) => setDecProductos({ ...decProductos, [p.clave]: { ...d, categoria: e.target.value } })}
                      >
                        <option value="">Sin categoría</option>
                        {datos.categorias.map((c) => (
                          <option key={c.id} value={c.nombre}>
                            {c.nombre}
                          </option>
                        ))}
                      </Selector>
                      <Selector
                        aria-label="Tipo"
                        value={d.tipo}
                        onChange={(e) =>
                          setDecProductos({ ...decProductos, [p.clave]: { ...d, tipo: e.target.value as 'producto' | 'ajuste' | 'abono' } })
                        }
                      >
                        <option value="producto">Producto</option>
                        <option value="abono">Abono de torta</option>
                        <option value="ajuste">Ajuste</option>
                      </Selector>
                    </div>
                  ) : (
                    <Selector
                      aria-label="Producto existente"
                      value={d.productoId}
                      onChange={(e) =>
                        setDecProductos({ ...decProductos, [p.clave]: { accion: 'vincular', productoId: e.target.value ? Number(e.target.value) : '' } })
                      }
                    >
                      <option value="">Elige el producto…</option>
                      {productosOrdenados.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre}
                        </option>
                      ))}
                    </Selector>
                  )}
                </Tarjeta>
              )
            })}
          </div>
        </section>
      )}

      {dOp.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Opciones o comentarios nuevos ({dOp.length})</h2>
          <p className="mb-3 text-sm text-suave">
            Textos que no estaban en la app. Si es un comentario escrito en caja (ej.: "sin crema"), déjalo en
            "Ignorar". Si es un sabor o extra real, créalo. La app recordará tu decisión.
          </p>
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
            {dOp.map((o) => {
              const d = decOpciones[o.clave]
              const existentes = o.productoId ? datos.catalogo.opciones.filter((x) => x.producto_id === o.productoId) : []
              return (
                <li key={o.clave} className="space-y-2 px-4 py-3">
                  <p className="text-sm">
                    <span className="text-suave">{o.productoNombre} · </span>
                    <span className="font-medium">{o.nombre}</span>
                    <span className="text-xs text-suave"> ({numero(o.veces)})</span>
                  </p>
                  {o.productoId && (
                    <Selector
                      aria-label="Qué hacer con este texto"
                      value={d.accion === 'vincular' ? String(d.opcionId) : d.accion}
                      onChange={(e) => {
                        const v = e.target.value
                        setDecOpciones({
                          ...decOpciones,
                          [o.clave]: v === 'crear' || v === 'ignorar' ? { accion: v } : { accion: 'vincular', opcionId: Number(v) },
                        })
                      }}
                    >
                      <option value="ignorar">Ignorar (comentario de caja)</option>
                      <option value="crear">Crear como opción nueva</option>
                      {existentes.map((x) => (
                        <option key={x.id} value={x.id}>
                          Es igual a: {x.nombre}
                        </option>
                      ))}
                    </Selector>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {muestra.length > 0 && (
        <details className="rounded-2xl border border-borde bg-superficie p-4">
          <summary className="cursor-pointer font-semibold">Vista previa de las primeras ventas</summary>
          <ul className="mt-3 space-y-3 text-sm">
            {muestra.map((t) => (
              <li key={t.numero}>
                <p className="font-medium">
                  #{t.numero} · {fechaDia(t.fechaHora)} {t.fechaHora.slice(11)} · {pesos(t.total)}
                  {t.metodo && <span className="text-suave"> · {t.metodo}</span>}
                </p>
                <ul className="text-suave">
                  {t.lineas.map((l, i) => (
                    <li key={i}>
                      {l.item}
                      {l.opciones && ` (${l.opciones})`} · {pesos(l.monto)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      {nuevas.length > 0 && (
        <Boton onClick={onConfirmar} className="min-h-14">
          Importar {numero(nuevas.length)} transacciones
        </Boton>
      )}
      <Boton variante="secundario" onClick={onCancelar}>
        {nuevas.length > 0 ? 'Cancelar' : 'Elegir otro archivo'}
      </Boton>
    </div>
  )
}
