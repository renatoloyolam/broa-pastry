import { useCallback, useEffect, useState } from 'react'
import { Aviso, Boton, Campo, Encabezado, IconoCirculo, Insignia, Interruptor, Tarjeta, Titulo } from '../../componentes/ui'
import { ICONOS } from '../../componentes/iconos'
import { useConfirmar } from '../../componentes/Confirmar'
import { useCatalogo } from '../../lib/catalogo'
import { decimal, leerNumero, pesos } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { calcularValorHora, sueldoPorHora, type GastoGif, type Trabajador } from '../../lib/valorHora'
import { useSesion } from '../../sesion/SesionProvider'

interface Valores {
  mano_obra: number
  gif: number
  calcular: boolean
  dias_mes: number
  horas_dia: number
}

const AVISO_RECALCULO = 'Se recalculan todas las recetas que usan horas y los productos conectados a ellas. El nuevo costo rige desde hoy. ¿Continuar?'

/** Pantalla del valor hora: a mano, o calculado con trabajadores y gastos como en la hoja "MDO Y GIF". */
export function ValorHora() {
  const { puede } = useSesion()
  const { recargar } = useCatalogo()
  const confirmar = useConfirmar()
  const verDetalle = puede('gestionar_finanzas')
  const editable = puede('editar_catalogo')
  const [v, setV] = useState<Valores | null>(null)
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([])
  const [gastos, setGastos] = useState<GastoGif[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    const [vh, t, g] = await Promise.all([
      supabase.from('valores_hora').select('mano_obra, gif, calcular, dias_mes, horas_dia').maybeSingle(),
      verDetalle ? supabase.from('costo_trabajadores').select('*').order('area').order('nombre') : Promise.resolve({ data: [], error: null }),
      verDetalle ? supabase.from('costo_gif').select('*').order('tipo').order('monto_mensual', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ])
    const e = vh.error ?? t.error ?? g.error
    if (e) return setError(mensajeError(e))
    const d = vh.data as Valores | null
    if (d) setV({ mano_obra: Number(d.mano_obra), gif: Number(d.gif), calcular: d.calcular, dias_mes: Number(d.dias_mes), horas_dia: Number(d.horas_dia) })
    setTrabajadores(((t.data ?? []) as Trabajador[]).map((x) => ({ ...x, horas_dia: Number(x.horas_dia), dias_mes: Number(x.dias_mes), costo_mensual: Number(x.costo_mensual) })))
    setGastos(((g.data ?? []) as GastoGif[]).map((x) => ({ ...x, monto_mensual: Number(x.monto_mensual) })))
  }, [verDetalle])

  useEffect(() => {
    void cargar()
  }, [cargar])

  /** Tras cualquier cambio: lo guardado manda, y las recetas se recargan con el valor nuevo. */
  async function trasCambio(mensaje: string) {
    await cargar()
    await recargar()
    setOk(mensaje)
  }

  async function cambiarModo(calcular: boolean) {
    setError('')
    setOk('')
    if (!(await confirmar({ mensaje: AVISO_RECALCULO, accion: calcular ? 'Calcular' : 'Escribir a mano' }))) return
    const { error } = await supabase.from('valores_hora').update({ calcular }).eq('id', true)
    if (error) return setError(mensajeError(error))
    await trasCambio(calcular ? 'Listo: el valor hora ahora se calcula solo.' : 'Listo: el valor hora queda fijo y lo puedes escribir a mano.')
  }

  if (!v) return (
    <>
      <Encabezado titulo="Valor hora" volver="/productos/recetas" />
      {error && <Aviso>{error}</Aviso>}
    </>
  )

  const calculo = calcularValorHora(trabajadores, gastos, v.dias_mes, v.horas_dia)

  return (
    <>
      <Encabezado titulo="Valor hora" volver="/productos/recetas" />

      <Tarjeta className="mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-suave uppercase">Mano de obra</p>
            <p className="cifra text-2xl font-bold text-primario">{pesos(v.mano_obra)}</p>
            <p className="text-xs text-suave">por hora</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-suave uppercase">G.I.F.</p>
            <p className="cifra text-2xl font-bold text-primario">{pesos(v.gif)}</p>
            <p className="text-xs text-suave">por hora</p>
          </div>
        </div>
        <p className="text-sm text-suave">
          {v.calcular ? 'Se calcula solo con los trabajadores y gastos de abajo.' : 'Escrito a mano.'} En cada receta: horas × valor hora ÷ lo que rinde.
        </p>
        {verDetalle && editable && (
          <Interruptor
            etiqueta="Calcular con trabajadores y gastos"
            ayuda={calculo.incluidos === 0 ? 'Primero agrega al menos un trabajador.' : 'Si lo apagas, el último valor queda fijo.'}
            activo={v.calcular}
            deshabilitado={!v.calcular && calculo.incluidos === 0}
            onCambio={cambiarModo}
          />
        )}
        {!v.calcular && editable && <EditarAMano v={v} alGuardar={() => trasCambio('Valor hora actualizado. Las recetas se recalcularon.')} />}
      </Tarjeta>

      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {!verDetalle ? (
        <Aviso tipo="info">Los sueldos y gastos con que se calcula solo los ve quien gestiona las finanzas.</Aviso>
      ) : (
        <div className="mt-4 space-y-6">
          <ComoSeCalcula calculo={calculo} v={v} />
          <Trabajadores lista={trabajadores} calcular={v.calcular} alCambiar={trasCambio} setError={setError} />
          <Gastos lista={gastos} v={v} editable={editable} calcular={v.calcular} alCambiar={trasCambio} setError={setError} />
        </div>
      )}
    </>
  )
}

function EditarAMano({ v, alGuardar }: { v: Valores; alGuardar: () => Promise<void> }) {
  const confirmar = useConfirmar()
  const [abierta, setAbierta] = useState(false)
  const [mo, setMo] = useState('')
  const [gif, setGif] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  if (!abierta)
    return (
      <Boton
        icono={ICONOS.costo}
        variante="secundario"
        onClick={() => {
          setMo(decimal(v.mano_obra))
          setGif(decimal(v.gif))
          setError('')
          setAbierta(true)
        }}
      >
        Escribir valores
      </Boton>
    )

  async function guardar() {
    const m = leerNumero(mo)
    const g = leerNumero(gif)
    if (m == null || m < 0 || g == null || g < 0) return setError('Escribe los valores en pesos, por ejemplo 4.439.')
    if (!(await confirmar({ mensaje: AVISO_RECALCULO, accion: 'Cambiar valor hora' }))) return
    setGuardando(true)
    const { error } = await supabase.from('valores_hora').update({ mano_obra: m, gif: g }).eq('id', true)
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setAbierta(false)
    await alGuardar()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Mano de obra, por hora" inputMode="decimal" value={mo} onChange={(e) => setMo(e.target.value)} />
        <Campo etiqueta="G.I.F., por hora" inputMode="decimal" value={gif} onChange={(e) => setGif(e.target.value)} />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div className="grid grid-cols-2 gap-2">
        <Boton icono={ICONOS.cancelar} variante="secundario" onClick={() => setAbierta(false)}>
          Cancelar
        </Boton>
        <Boton icono={ICONOS.guardar} onClick={guardar} cargando={guardando}>
          Guardar
        </Boton>
      </div>
    </div>
  )
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'font-semibold' : 'text-suave'}`}>
      <span>{etiqueta}</span>
      <span className="cifra shrink-0">{valor}</span>
    </div>
  )
}

function ComoSeCalcula({ calculo: c, v }: { calculo: ReturnType<typeof calcularValorHora>; v: Valores }) {
  const n = c.incluidos
  return (
    <section>
      <Titulo icono={ICONOS.simulador}>Cómo se calcula</Titulo>
      <Tarjeta className="space-y-4 text-sm">
        {n === 0 ? (
          <p className="text-suave">Agrega a los trabajadores con su costo mensual para ver el cálculo.</p>
        ) : (
          <>
            <div className="space-y-1">
              <p className="font-semibold">Mano de obra</p>
              <Linea etiqueta={`Suma del sueldo por hora (${n} ${n === 1 ? 'persona' : 'personas'})`} valor={pesos(c.sueldosPorHora)} />
              <Linea etiqueta={`÷ ${n} ${n === 1 ? 'persona' : 'personas'}`} valor={`= ${pesos(c.manoObra)} por hora`} fuerte />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">G.I.F.</p>
              <Linea etiqueta="Gastos del mes" valor={pesos(c.totalGastos)} />
              <Linea etiqueta={`÷ ${decimal(v.dias_mes)} días ÷ ${decimal(v.horas_dia)} horas`} valor={`= ${pesos(c.gastosPorHora)} por hora`} />
              <Linea etiqueta={`÷ ${n} ${n === 1 ? 'persona' : 'personas'}`} valor={`= ${pesos(c.gif)} por hora`} fuerte />
            </div>
            <p className="text-xs text-suave">
              Es la misma fórmula de la hoja "MDO Y GIF" de la planilla, pero en vez de dividir siempre por 13, divide por las personas
              incluidas en la lista.
            </p>
          </>
        )}
      </Tarjeta>
    </section>
  )
}

interface FormTrabajador {
  id: number | null
  nombre: string
  area: string
  horas_dia: string
  dias_mes: string
  costo_mensual: string
  incluir: boolean
}

const TRABAJADOR_NUEVO: FormTrabajador = { id: null, nombre: '', area: '', horas_dia: '8', dias_mes: '22', costo_mensual: '', incluir: true }

function Trabajadores({
  lista,
  calcular,
  alCambiar,
  setError,
}: {
  lista: Trabajador[]
  calcular: boolean
  alCambiar: (m: string) => Promise<void>
  setError: (e: string) => void
}) {
  const confirmar = useConfirmar()
  const [form, setForm] = useState<FormTrabajador | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const total = lista.filter((t) => t.incluir).reduce((s, t) => s + t.costo_mensual, 0)

  function abrir(t?: Trabajador) {
    setErrorForm('')
    setError('')
    setForm(
      t
        ? { id: t.id, nombre: t.nombre, area: t.area ?? '', horas_dia: decimal(t.horas_dia), dias_mes: decimal(t.dias_mes), costo_mensual: decimal(t.costo_mensual), incluir: t.incluir }
        : TRABAJADOR_NUEVO,
    )
  }

  async function guardar() {
    if (!form) return
    const horas = leerNumero(form.horas_dia)
    const dias = leerNumero(form.dias_mes)
    const costo = leerNumero(form.costo_mensual)
    if (!form.nombre.trim()) return setErrorForm('Escribe el nombre.')
    if (!(horas != null && horas > 0 && horas <= 24)) return setErrorForm('Revisa las horas al día.')
    if (!(dias != null && dias > 0 && dias <= 31)) return setErrorForm('Revisa los días al mes.')
    if (!(costo != null && costo >= 0)) return setErrorForm('Escribe el costo mensual en pesos.')
    const fila = { nombre: form.nombre.trim(), area: form.area.trim() || null, horas_dia: horas, dias_mes: dias, costo_mensual: costo, incluir: form.incluir }
    setGuardando(true)
    const { error } = form.id ? await supabase.from('costo_trabajadores').update(fila).eq('id', form.id) : await supabase.from('costo_trabajadores').insert(fila)
    setGuardando(false)
    if (error) return setErrorForm(mensajeError(error))
    setForm(null)
    await alCambiar(calcular ? 'Guardado. El valor hora y las recetas se recalcularon.' : 'Guardado.')
  }

  async function borrar() {
    if (!form?.id) return
    if (!(await confirmar({ mensaje: `¿Quitar a ${form.nombre} de la lista?`, accion: 'Quitar', peligro: true }))) return
    const { error } = await supabase.from('costo_trabajadores').delete().eq('id', form.id)
    if (error) return setErrorForm(mensajeError(error))
    setForm(null)
    await alCambiar(calcular ? 'Quitado. El valor hora y las recetas se recalcularon.' : 'Quitado.')
  }

  return (
    <section>
      <Titulo icono={ICONOS.usuarios}>Trabajadores</Titulo>
      <p className="mb-2 text-sm text-suave">
        Costo mensual de cada persona (sueldo y lo que pagas por ella). Apaga "Incluir" a quien no quieras que cuente, por ejemplo si no
        trabaja en producción.
      </p>
      {lista.length > 0 && (
        <ul className="mb-2 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
          {lista.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => abrir(t)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-superficie-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {t.nombre}
                    {t.area && <span className="font-normal text-suave"> · {t.area}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-suave">
                    <span className="cifra">
                      {decimal(t.horas_dia)} h × {decimal(t.dias_mes)} días · {pesos(t.costo_mensual)}
                    </span>
                    {!t.incluir && <Insignia clase="bg-superficie-2 text-suave">no se incluye</Insignia>}
                  </span>
                </span>
                <span className={`cifra shrink-0 text-right text-sm ${t.incluir ? 'font-semibold' : 'text-suave line-through'}`}>{pesos(sueldoPorHora(t))}/h</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <p className="mb-3 text-xs text-suave">
          {lista.filter((t) => t.incluir).length} incluidos · {pesos(total)} al mes
        </p>
      )}

      {form ? (
        <Tarjeta className="space-y-3">
          <p className="font-semibold">{form.id ? 'Editar trabajador' : 'Nuevo trabajador'}</p>
          <div className="grid grid-cols-2 gap-2">
            <Campo etiqueta="Nombre" maxLength={80} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <Campo etiqueta="Área (opcional)" maxLength={60} placeholder="Pastelería" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            <Campo etiqueta="Horas al día" inputMode="decimal" value={form.horas_dia} onChange={(e) => setForm({ ...form, horas_dia: e.target.value })} />
            <Campo etiqueta="Días al mes" inputMode="decimal" value={form.dias_mes} onChange={(e) => setForm({ ...form, dias_mes: e.target.value })} />
          </div>
          <Campo etiqueta="Costo mensual" inputMode="numeric" placeholder="$" value={form.costo_mensual} onChange={(e) => setForm({ ...form, costo_mensual: e.target.value })} />
          <Interruptor etiqueta="Incluir en el cálculo" activo={form.incluir} onCambio={(incluir) => setForm({ ...form, incluir })} />
          {errorForm && <Aviso>{errorForm}</Aviso>}
          <div className="grid grid-cols-2 gap-2">
            <Boton icono={ICONOS.cancelar} variante="secundario" onClick={() => setForm(null)}>
              Cancelar
            </Boton>
            <Boton icono={ICONOS.guardar} onClick={guardar} cargando={guardando}>
              Guardar
            </Boton>
          </div>
          {form.id && (
            <Boton icono={ICONOS.borrar} variante="texto" onClick={borrar}>
              Quitar de la lista
            </Boton>
          )}
        </Tarjeta>
      ) : (
        <Boton icono={ICONOS.agregar} variante="secundario" onClick={() => abrir()}>
          Agregar trabajador
        </Boton>
      )}
    </section>
  )
}

interface FormGasto {
  id: number | null
  concepto: string
  tipo: 'fijo' | 'variable'
  monto: string
}

function Gastos({
  lista,
  v,
  editable,
  calcular,
  alCambiar,
  setError,
}: {
  lista: GastoGif[]
  v: Valores
  editable: boolean
  calcular: boolean
  alCambiar: (m: string) => Promise<void>
  setError: (e: string) => void
}) {
  const confirmar = useConfirmar()
  const [form, setForm] = useState<FormGasto | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState('')
  const [jornada, setJornada] = useState<{ dias: string; horas: string } | null>(null)
  const recalculo = calcular ? 'Guardado. El valor hora y las recetas se recalcularon.' : 'Guardado.'

  function abrir(g?: GastoGif) {
    setErrorForm('')
    setError('')
    setForm(g ? { id: g.id, concepto: g.concepto, tipo: g.tipo, monto: decimal(g.monto_mensual) } : { id: null, concepto: '', tipo: 'fijo', monto: '' })
  }

  async function guardar() {
    if (!form) return
    const monto = leerNumero(form.monto)
    if (!form.concepto.trim()) return setErrorForm('Escribe el concepto.')
    if (!(monto != null && monto >= 0)) return setErrorForm('Escribe el monto mensual en pesos.')
    const fila = { concepto: form.concepto.trim(), tipo: form.tipo, monto_mensual: monto }
    setGuardando(true)
    const { error } = form.id ? await supabase.from('costo_gif').update(fila).eq('id', form.id) : await supabase.from('costo_gif').insert(fila)
    setGuardando(false)
    if (error) return setErrorForm(mensajeError(error))
    setForm(null)
    await alCambiar(recalculo)
  }

  async function borrar() {
    if (!form?.id) return
    if (!(await confirmar({ mensaje: `¿Quitar "${form.concepto}"?`, accion: 'Quitar', peligro: true }))) return
    const { error } = await supabase.from('costo_gif').delete().eq('id', form.id)
    if (error) return setErrorForm(mensajeError(error))
    setForm(null)
    await alCambiar(calcular ? 'Quitado. El valor hora y las recetas se recalcularon.' : 'Quitado.')
  }

  async function guardarJornada() {
    if (!jornada) return
    const dias = leerNumero(jornada.dias)
    const horas = leerNumero(jornada.horas)
    if (!(dias != null && dias > 0 && dias <= 31 && horas != null && horas > 0 && horas <= 24)) return setError('Revisa los días y horas del local.')
    if (calcular && !(await confirmar({ mensaje: AVISO_RECALCULO, accion: 'Guardar' }))) return
    const { error } = await supabase.from('valores_hora').update({ dias_mes: dias, horas_dia: horas }).eq('id', true)
    if (error) return setError(mensajeError(error))
    setJornada(null)
    await alCambiar(recalculo)
  }

  const grupos = (['fijo', 'variable'] as const).map((tipo) => ({
    tipo,
    items: lista.filter((g) => g.tipo === tipo),
    total: lista.filter((g) => g.tipo === tipo).reduce((s, g) => s + g.monto_mensual, 0),
  }))

  return (
    <section>
      <Titulo icono={ICONOS.gastos}>Gastos del G.I.F.</Titulo>
      <p className="mb-2 text-sm text-suave">Lo que cuesta mantener el negocio cada mes: arriendos, luz, contador, etc. No incluyas sueldos: van arriba.</p>

      <Tarjeta className="mb-3">
        {jornada ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Días abiertos al mes" inputMode="decimal" value={jornada.dias} onChange={(e) => setJornada({ ...jornada, dias: e.target.value })} />
              <Campo etiqueta="Horas al día" inputMode="decimal" value={jornada.horas} onChange={(e) => setJornada({ ...jornada, horas: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Boton icono={ICONOS.cancelar} variante="secundario" onClick={() => setJornada(null)}>
                Cancelar
              </Boton>
              <Boton icono={ICONOS.guardar} onClick={guardarJornada}>
                Guardar
              </Boton>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <IconoCirculo icono={ICONOS.calendario} />
            <p className="min-w-0 flex-1 text-sm">
              El local trabaja <b className="cifra">{decimal(v.dias_mes)} días</b> al mes, <b className="cifra">{decimal(v.horas_dia)} horas</b> al día
            </p>
            {editable && (
              <button
                type="button"
                onClick={() => setJornada({ dias: decimal(v.dias_mes), horas: decimal(v.horas_dia) })}
                className="min-h-11 shrink-0 px-2 text-sm font-semibold text-primario"
              >
                Cambiar
              </button>
            )}
          </div>
        )}
      </Tarjeta>

      {grupos.map(
        (gr) =>
          gr.items.length > 0 && (
            <div key={gr.tipo} className="mb-3">
              <div className="mb-1 flex items-baseline justify-between px-1 text-sm">
                <span className="font-semibold">{gr.tipo === 'fijo' ? 'Gastos fijos' : 'Gastos variables'}</span>
                <span className="cifra text-suave">{pesos(gr.total)}</span>
              </div>
              <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
                {gr.items.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => abrir(g)} className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left active:bg-superficie-2">
                      <span className="min-w-0 flex-1 truncate">{g.concepto}</span>
                      <span className="cifra shrink-0 text-sm">{pesos(g.monto_mensual)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}

      {form ? (
        <Tarjeta className="space-y-3">
          <p className="font-semibold">{form.id ? 'Editar gasto' : 'Nuevo gasto'}</p>
          <Campo etiqueta="Concepto" maxLength={80} value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            {(['fijo', 'variable'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={form.tipo === t}
                onClick={() => setForm({ ...form, tipo: t })}
                className={`min-h-11 rounded-full border text-sm font-medium ${form.tipo === t ? 'border-primario bg-primario text-primario-texto' : 'border-borde bg-superficie'}`}
              >
                {t === 'fijo' ? 'Fijo' : 'Variable'}
              </button>
            ))}
          </div>
          <Campo etiqueta="Monto mensual" inputMode="numeric" placeholder="$" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          {errorForm && <Aviso>{errorForm}</Aviso>}
          <div className="grid grid-cols-2 gap-2">
            <Boton icono={ICONOS.cancelar} variante="secundario" onClick={() => setForm(null)}>
              Cancelar
            </Boton>
            <Boton icono={ICONOS.guardar} onClick={guardar} cargando={guardando}>
              Guardar
            </Boton>
          </div>
          {form.id && (
            <Boton icono={ICONOS.borrar} variante="texto" onClick={borrar}>
              Quitar de la lista
            </Boton>
          )}
        </Tarjeta>
      ) : (
        <Boton icono={ICONOS.agregar} variante="secundario" onClick={() => abrir()}>
          Agregar gasto
        </Boton>
      )}
    </section>
  )
}
