import { useState } from 'react'
import { useCatalogo, type Costo, type ModoCosto } from '../../lib/catalogo'
import { decimal, fecha, leerNumero, pesos } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Boton, Campo, Selector } from '../../componentes/ui'

const MODOS: { valor: ModoCosto; titulo: string; ayuda: string }[] = [
  { valor: 'manual', titulo: 'Costo a mano', ayuda: 'Escribes cuánto cuesta' },
  { valor: 'receta', titulo: 'Por receta', ayuda: 'Se calcula con ingredientes' },
  { valor: 'cero', titulo: 'Sin costo propio', ayuda: 'Ej.: el costo está en las opciones' },
]

interface Props {
  productoId?: number
  opcionId?: number
  costo?: Costo
  /** Texto que explica qué se está costeando */
  titulo?: string
  alGuardar?: () => void
}

/** Edita cómo se calcula el costo de un producto o de una opción. */
export function EditorCosto({ productoId, opcionId, costo, alGuardar }: Props) {
  const { recetas, adicionales: todosAdicionales, recargar } = useCatalogo()
  const { puede } = useSesion()
  const editable = puede('editar_catalogo')

  const [modo, setModo] = useState<ModoCosto | ''>(costo?.modo ?? '')
  const [manual, setManual] = useState(costo?.costo_manual_neto != null ? decimal(costo.costo_manual_neto) : '')
  const [recetaId, setRecetaId] = useState<number | ''>(costo?.receta_id ?? '')
  const [cantidad, setCantidad] = useState(decimal(costo?.cantidad_receta ?? 1, 3))
  const [adicionales, setAdicionales] = useState(
    todosAdicionales
      .filter((a) => costo && a.definicion_id === costo.definicion_id)
      .map((a) => ({ concepto: a.concepto, monto: decimal(a.monto_neto) })),
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [guardado, setGuardado] = useState<'nuevo' | 'cambio' | null>(null)
  const [corregirDesde, setCorregirDesde] = useState('')
  const [corregido, setCorregido] = useState('')

  const receta = recetas.find((r) => r.id === recetaId)
  const sumaAdicionales = adicionales.reduce((s, a) => s + (leerNumero(a.monto) ?? 0), 0)
  const base =
    modo === 'manual'
      ? leerNumero(manual)
      : modo === 'receta'
        ? receta?.costo_unitario != null
          ? receta.costo_unitario * (leerNumero(cantidad) ?? 0)
          : null
        : modo === 'cero'
          ? 0
          : null
  const vistaPrevia = base == null ? null : base + sumaAdicionales

  async function guardar() {
    setError('')
    if (!modo) return setError('Elige cómo se calcula el costo.')
    const montoManual = leerNumero(manual)
    if (modo === 'manual' && (montoManual == null || montoManual < 0)) return setError('Escribe el costo en pesos.')
    if (modo === 'receta' && !recetaId) return setError('Elige la receta.')
    const cant = leerNumero(cantidad)
    if (modo === 'receta' && !(cant && cant > 0)) return setError('Escribe cuánto de la receta lleva.')
    const adics = adicionales
      .filter((a) => a.concepto.trim())
      .map((a) => ({ concepto: a.concepto.trim(), monto_neto: leerNumero(a.monto) ?? NaN }))
    if (adics.some((a) => !(a.monto_neto >= 0))) return setError('Revisa los montos de los costos adicionales.')

    setGuardando(true)
    const teniaCosto = costo?.costo_vigente != null
    const { error } = await supabase.rpc('guardar_costo', {
      p_producto_id: productoId ?? null,
      p_opcion_id: opcionId ?? null,
      p_modo: modo,
      p_costo_manual_neto: modo === 'manual' ? montoManual : null,
      p_receta_id: modo === 'receta' ? recetaId : null,
      p_cantidad_receta: modo === 'receta' ? cant : 1,
      p_adicionales: adics,
    })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    setGuardado(teniaCosto ? 'cambio' : 'nuevo')
    await recargar()
    alGuardar?.()
  }

  async function aplicarDesde() {
    setError('')
    const { error } = await supabase.rpc('aplicar_cambios_desde', { p_desde: corregirDesde })
    if (error) return setError(mensajeError(error))
    setCorregido(corregirDesde)
    await recargar()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cómo se calcula el costo">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={modo === m.valor}
            disabled={!editable}
            onClick={() => setModo(m.valor)}
            className={`min-h-16 rounded-xl border px-2 py-2 text-left text-sm ${
              modo === m.valor ? 'border-primario bg-superficie-2 font-semibold' : 'border-borde'
            }`}
          >
            <span className="block leading-tight">{m.titulo}</span>
            <span className="block text-[11px] leading-tight font-normal text-suave">{m.ayuda}</span>
          </button>
        ))}
      </div>

      {modo === 'manual' && (
        <Campo
          etiqueta="Costo por unidad (sin IVA)"
          inputMode="decimal"
          placeholder="Ej.: 450"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          disabled={!editable}
        />
      )}

      {modo === 'receta' && (
        <div className="space-y-3">
          {recetas.length === 0 ? (
            <Aviso tipo="info">Aún no hay recetas. Créalas en la pestaña Recetas.</Aviso>
          ) : (
            <Selector
              etiqueta="Receta"
              value={recetaId}
              onChange={(e) => setRecetaId(e.target.value ? Number(e.target.value) : '')}
              disabled={!editable}
            >
              <option value="">Elige una receta…</option>
              {recetas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre} (rinde {decimal(r.rendimiento)} {r.unidad_rendimiento})
                </option>
              ))}
            </Selector>
          )}
          {receta && (
            <Campo
              etiqueta={`¿Cuánto de la receta lleva 1 unidad vendida? (en ${receta.unidad_rendimiento})`}
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              disabled={!editable}
              ayuda={
                receta.costo_unitario == null
                  ? 'Esta receta está incompleta: revísala en Recetas.'
                  : `1 ${receta.unidad_rendimiento} de la receta cuesta ${pesos(receta.costo_unitario)}. Ej.: "Media luna x6" lleva 6.`
              }
            />
          )}
        </div>
      )}

      {modo && (
        <div>
          <p className="mb-2 text-sm font-medium text-suave">Costos adicionales por unidad (packaging, mano de obra…)</p>
          <div className="space-y-2">
            {adicionales.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label="Concepto"
                  placeholder="Concepto"
                  value={a.concepto}
                  disabled={!editable}
                  onChange={(e) => setAdicionales(adicionales.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))}
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-borde bg-superficie px-3"
                />
                <input
                  aria-label="Monto"
                  placeholder="$"
                  inputMode="decimal"
                  value={a.monto}
                  disabled={!editable}
                  onChange={(e) => setAdicionales(adicionales.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))}
                  className="min-h-12 w-24 rounded-xl border border-borde bg-superficie px-3 text-right"
                />
                {editable && (
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setAdicionales(adicionales.filter((_, j) => j !== i))}
                    className="h-12 w-10 shrink-0 rounded-xl text-xl text-suave active:bg-superficie-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {editable && (
              <button
                type="button"
                onClick={() => setAdicionales([...adicionales, { concepto: '', monto: '' }])}
                className="min-h-11 text-sm font-semibold text-primario"
              >
                + Agregar costo adicional
              </button>
            )}
          </div>
        </div>
      )}

      {modo && (
        <div className="flex items-baseline justify-between rounded-xl bg-superficie-2 px-4 py-3">
          <span className="text-sm text-suave">Costo por unidad</span>
          <span className="cifra text-2xl font-bold">{vistaPrevia == null ? '—' : pesos(vistaPrevia)}</span>
        </div>
      )}

      {error && <Aviso>{error}</Aviso>}

      {guardado === 'nuevo' && (
        <Aviso tipo="ok">Guardado. Como es su primer costo, también se usa para las ventas anteriores.</Aviso>
      )}
      {guardado === 'cambio' && !corregido && (
        <Aviso tipo="ok">
          <p>Guardado. El nuevo costo rige desde hoy; las ventas anteriores mantienen el costo que tenían.</p>
          <details className="mt-2 text-texto">
            <summary className="cursor-pointer font-semibold text-primario">¿Era un error? Corregir desde una fecha</summary>
            <div className="mt-3 space-y-2">
              <Campo
                etiqueta="El costo correcto rige desde"
                type="date"
                value={corregirDesde}
                max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)}
                onChange={(e) => setCorregirDesde(e.target.value)}
                ayuda="Se aplica a todos los costos que cambiaste hoy."
              />
              <Boton variante="secundario" disabled={!corregirDesde} onClick={aplicarDesde}>
                Aplicar desde esa fecha
              </Boton>
            </div>
          </details>
        </Aviso>
      )}
      {corregido && <Aviso tipo="ok">Listo: el costo rige desde el {fecha(corregido + 'T12:00:00')}.</Aviso>}

      {editable && (
        <Boton onClick={guardar} cargando={guardando}>
          Guardar costo
        </Boton>
      )}
    </div>
  )
}
