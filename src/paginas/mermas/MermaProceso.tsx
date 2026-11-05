import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Boton, Campo, Insignia } from '../../componentes/ui'
import { ICONOS } from '../../componentes/iconos'
import { fechaDia, leerNumero, pesos } from '../../lib/formato'
import { normalizar } from '../../lib/importador'
import {
  FORM_VACIO,
  NOMBRE_ETAPA,
  nombreUnidad,
  textoCantidad,
  unidadesItem,
  type EtapaProceso,
  type FormProceso,
  type ItemProceso,
  type OpcionesProceso,
} from '../../lib/mermasProceso'
import type { Unidad } from '../../lib/costeo'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

/** Botón tipo "chip" grande, fácil de tocar con el pulgar. */
export function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
        activo ? 'border-primario bg-primario text-primario-texto' : 'border-borde bg-superficie text-texto active:bg-superficie-2'
      }`}
    >
      {children}
    </button>
  )
}

const TEXTOS = {
  produccion: { pregunta: '¿Qué preparación se perdió?', buscar: 'Buscar receta…', sin: 'No tiene receta', vacio: 'Todavía no hay recetas.', ejemplo: 'Ej: bandeja de cupcakes sin crema' },
  materia_prima: { pregunta: '¿Qué ingrediente se perdió?', buscar: 'Buscar ingrediente…', sin: 'No está en la lista', vacio: 'Todavía no hay ingredientes.', ejemplo: 'Ej: bandeja de arándanos' },
}

/** Qué y cuánto se perdió, para producción y materia prima. */
export function SeccionProceso({
  etapa,
  opciones,
  form,
  onChange,
}: {
  etapa: EtapaProceso
  opciones: OpcionesProceso | null
  form: FormProceso
  onChange: (f: FormProceso) => void
}) {
  const { puede } = useSesion()
  const [busqueda, setBusqueda] = useState('')
  const t = TEXTOS[etapa]
  const lista: ItemProceso[] = useMemo(() => (etapa === 'produccion' ? opciones?.recetas : opciones?.ingredientes) ?? [], [etapa, opciones])
  const resultados = useMemo(() => {
    const q = normalizar(busqueda)
    return (q ? lista.filter((i) => normalizar(i.nombre).includes(q)) : lista).slice(0, 8)
  }, [busqueda, lista])

  function elegir(item: ItemProceso) {
    setBusqueda('')
    onChange({ ...FORM_VACIO, item, unidad: unidadesItem(item)[0] })
  }

  if (form.sinItem) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-suave">¿Qué se perdió?</p>
          <button type="button" onClick={() => onChange(FORM_VACIO)} className="min-h-11 px-3 text-sm font-semibold whitespace-nowrap text-primario">
            Elegir de la lista
          </button>
        </div>
        <Campo etiqueta="Descripción" maxLength={120} placeholder={t.ejemplo} value={form.descripcion} onChange={(e) => onChange({ ...form, descripcion: e.target.value })} />
        {puede('ver_costos') ? (
          <Campo
            etiqueta="Monto estimado (sin IVA)"
            inputMode="numeric"
            placeholder="$"
            value={form.monto}
            onChange={(e) => onChange({ ...form, monto: e.target.value })}
            ayuda="Quedará marcado como estimado. Si lo dejas vacío, queda por valorizar."
          />
        ) : (
          <p className="text-sm text-suave">Quien ve los costos le pondrá el monto después.</p>
        )}
      </div>
    )
  }

  return (
    <>
      <div>
        <p className="mb-2 text-sm font-medium text-suave">{t.pregunta}</p>
        {form.item ? (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 rounded-xl bg-superficie-2 px-4 py-3 font-semibold">{form.item.nombre}</span>
            <button type="button" onClick={() => onChange(FORM_VACIO)} className="min-h-11 px-3 text-sm font-semibold text-primario">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            {lista.length > 0 && (
              <>
                <input
                  type="search"
                  placeholder={t.buscar}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="mb-2 min-h-12 w-full rounded-xl border border-borde bg-superficie px-4"
                />
                {resultados.length > 0 && (
                  <ul className="mb-2 divide-y divide-borde overflow-hidden rounded-xl border border-borde">
                    {resultados.map((i) => (
                      <li key={i.id}>
                        <button type="button" onClick={() => elegir(i)} className="min-h-12 w-full px-4 text-left active:bg-superficie-2">
                          {i.nombre}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {busqueda && resultados.length === 0 && <p className="mb-2 text-sm text-suave">No hay nada con ese nombre.</p>}
              </>
            )}
            {opciones && lista.length === 0 && (
              <p className="mb-2 text-sm text-suave">
                {t.vacio}
                {puede('editar_catalogo') && puede('ver_costos') && (
                  <>
                    {' '}
                    <Link to={etapa === 'produccion' ? '/productos/recetas' : '/productos/ingredientes'} className="font-semibold text-primario">
                      Crear
                    </Link>
                  </>
                )}
              </p>
            )}
            <Chip activo={false} onClick={() => onChange({ ...FORM_VACIO, sinItem: true })}>
              {t.sin}
            </Chip>
          </>
        )}
      </div>

      {form.item && (
        <div>
          <p className="mb-2 text-sm font-medium text-suave">¿Cuánto?</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Cantidad"
              inputMode="decimal"
              value={form.cantidad}
              onChange={(e) => onChange({ ...form, cantidad: e.target.value })}
              className="cifra h-14 w-24 rounded-2xl border border-borde bg-superficie text-center text-2xl font-bold"
            />
            {unidadesItem(form.item).map((u) => (
              <Chip key={u} activo={form.unidad === u} onClick={() => onChange({ ...form, unidad: u })}>
                {nombreUnidad(u, leerNumero(form.cantidad) ?? 2)}
              </Chip>
            ))}
          </div>
          {form.unidad === 'tanda' && form.item.rendimiento != null && (
            <p className="mt-2 text-xs text-suave">
              Una tanda completa rinde {textoCantidad(form.item.rendimiento, form.item.unidad)}.
            </p>
          )}
        </div>
      )}
    </>
  )
}

interface Pendiente {
  id: number
  fecha: string
  etapa: EtapaProceso
  nombre: string
  cantidad: number | null
  unidad: Unidad | null
  motivo: string
  nota: string | null
}

/** Lo que espera un monto, de cualquier día. Solo para quien ve costos. */
export function PorValorizar({ version, alCambiar }: { version: number; alCambiar: () => void }) {
  const [lista, setLista] = useState<Pendiente[]>([])
  const [montos, setMontos] = useState<Record<number, string>>({})
  const [guardando, setGuardando] = useState<number | null>(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('mermas_por_valorizar')
    if (error) setError(mensajeError(error))
    else setLista((data as Pendiente[]) ?? [])
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar, version])

  async function guardar(p: Pendiente) {
    const monto = leerNumero(montos[p.id] ?? '')
    if (!(monto != null && monto > 0)) return setError(`Escribe el monto de ${p.nombre}.`)
    setError('')
    setGuardando(p.id)
    const { error } = await supabase.rpc('valorizar_merma_proceso', { p_id: p.id, p_monto: monto })
    setGuardando(null)
    if (error) return setError(mensajeError(error))
    await cargar()
    alCambiar()
  }

  if (lista.length === 0) return null
  return (
    <section className="mb-4 rounded-2xl border border-aviso/40 bg-superficie p-4" aria-label="Mermas por valorizar">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <ICONOS.costo className="h-5 w-5 shrink-0 text-aviso" aria-hidden />
        Por valorizar ({lista.length})
      </h2>
      <p className="mb-3 text-sm text-suave">No se descuentan de la ganancia hasta que tengan un monto sin IVA.</p>
      {error && <Aviso>{error}</Aviso>}
      <ul className="space-y-3">
        {lista.map((p) => (
          <li key={p.id} className="border-t border-borde pt-3">
            <p className="font-medium">{p.nombre}</p>
            <p className="mb-2 text-xs text-suave">
              {fechaDia(p.fecha)} · {NOMBRE_ETAPA[p.etapa]} · {p.motivo}
              {p.cantidad != null && ` · ${textoCantidad(p.cantidad, p.unidad)}`}
              {p.nota && ` · ${p.nota}`}
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                aria-label={`Monto de ${p.nombre}`}
                inputMode="numeric"
                placeholder="$"
                value={montos[p.id] ?? ''}
                onChange={(e) => setMontos({ ...montos, [p.id]: e.target.value })}
                className="cifra min-h-11 min-w-0 rounded-xl border border-borde bg-superficie px-3"
              />
              <Boton icono={ICONOS.guardar} variante="secundario" cargando={guardando === p.id} onClick={() => guardar(p)} className="w-auto">
                Guardar
              </Boton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export interface MermaProcesoDia {
  id: number
  etapa: EtapaProceso
  nombre: string
  cantidad: number | null
  unidad: Unidad | null
  motivo: string
  evitable: boolean
  nota: string | null
  valor: number | null
  mano_obra: number | null
  estimado: boolean | null
  por_valorizar: boolean | null
}

/** Una fila de la lista del día. */
export function FilaProceso({ m, verCostos, onBorrar }: { m: MermaProcesoDia; verCostos: boolean; onBorrar: () => void }) {
  const cantidad = textoCantidad(m.cantidad, m.unidad)
  const Icono = m.etapa === 'produccion' ? ICONOS.mermaProduccion : ICONOS.mermaMateriaPrima
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icono className="h-5 w-5 shrink-0 text-suave" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{m.nombre}</span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-suave">
          <span>
            {cantidad && `${cantidad} · `}
            {NOMBRE_ETAPA[m.etapa]} · {m.motivo}
          </span>
          {m.evitable ? <Insignia clase="bg-aviso/15 text-aviso">evitable</Insignia> : <Insignia clase="bg-superficie-2 text-suave">no evitable</Insignia>}
        </span>
      </span>
      {verCostos && (
        <span className="cifra shrink-0 text-right text-sm">
          {m.por_valorizar ? (
            <span className="text-xs text-aviso">por valorizar</span>
          ) : (
            <>
              {pesos(m.valor)}
              {m.estimado && <span className="block text-xs text-suave">estimado</span>}
            </>
          )}
        </span>
      )}
      <button type="button" aria-label={`Borrar ${m.nombre}`} onClick={onBorrar} className="h-11 w-9 shrink-0 rounded-xl text-xl text-suave active:bg-superficie-2">
        ×
      </button>
    </li>
  )
}
