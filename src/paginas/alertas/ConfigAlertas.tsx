import { useEffect, useState } from 'react'
import { Aviso, Boton, Campo, Encabezado, Interruptor, Tarjeta } from '../../componentes/ui'
import { decimal, leerNumero } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

interface Umbrales {
  margen_minimo: number
  mermas_dia: number
  mermas_semana: number
  variacion_costo: number
  dias_revision: number
  dias_cerrado: number[]
  activas: Record<string, boolean>
}

const ALERTAS: { clave: string; texto: string; ayuda: string }[] = [
  { clave: 'dias_sin_ventas', texto: 'Días sin ventas importadas', ayuda: 'Recordatorio para subir el Excel' },
  { clave: 'sin_costo', texto: 'Productos vendidos sin costo', ayuda: 'Sus ventas no entran en la ganancia' },
  { clave: 'margen_bajo', texto: 'Productos con margen bajo', ayuda: 'Según el mínimo de abajo' },
  { clave: 'mermas_altas', texto: 'Mermas altas', ayuda: 'Del día o de la semana, sobre el límite' },
  { clave: 'variacion_costo', texto: 'Cambios fuertes de costo', ayuda: 'Ej.: subió un ingrediente' },
]
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function ConfigAlertas() {
  const { info } = useSesion()
  const esDueno = info?.perfil?.rol === 'dueno'
  const [u, setU] = useState<Umbrales | null>(null)
  const [form, setForm] = useState({ margen: '', mermasDia: '', mermasSemana: '', variacion: '', dias: '' })
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    supabase
      .from('umbrales_alertas')
      .select('*')
      .single()
      .then(({ data, error }) => {
        if (error) return setEstado({ tipo: 'error', texto: mensajeError(error) })
        const x = data as Umbrales
        setU(x)
        setForm({
          margen: decimal(Number(x.margen_minimo) * 100, 1),
          mermasDia: decimal(x.mermas_dia),
          mermasSemana: decimal(x.mermas_semana),
          variacion: decimal(Number(x.variacion_costo) * 100, 1),
          dias: String(x.dias_revision),
        })
      })
  }, [])

  if (!u) return estado ? <Aviso>{estado.texto}</Aviso> : null

  async function guardar() {
    if (!u) return
    setEstado(null)
    const margen = leerNumero(form.margen)
    const mermasDia = leerNumero(form.mermasDia)
    const mermasSemana = leerNumero(form.mermasSemana)
    const variacion = leerNumero(form.variacion)
    const dias = leerNumero(form.dias)
    if (margen == null || margen < 0 || margen > 100) return setEstado({ tipo: 'error', texto: 'El margen mínimo debe estar entre 0 y 100%.' })
    if (mermasDia == null || mermasSemana == null || mermasDia < 0 || mermasSemana < 0)
      return setEstado({ tipo: 'error', texto: 'Revisa los límites de mermas.' })
    if (variacion == null || variacion < 0) return setEstado({ tipo: 'error', texto: 'Revisa el porcentaje de cambio de costo.' })
    if (dias == null || dias < 7 || dias > 120) return setEstado({ tipo: 'error', texto: 'Los días a revisar deben estar entre 7 y 120.' })
    setGuardando(true)
    const { error } = await supabase
      .from('umbrales_alertas')
      .update({
        margen_minimo: margen / 100,
        mermas_dia: Math.round(mermasDia),
        mermas_semana: Math.round(mermasSemana),
        variacion_costo: variacion / 100,
        dias_revision: Math.round(dias),
        dias_cerrado: u.dias_cerrado,
        activas: u.activas,
      })
      .eq('id', true)
    setGuardando(false)
    setEstado(error ? { tipo: 'error', texto: mensajeError(error) } : { tipo: 'ok', texto: 'Alertas guardadas.' })
  }

  return (
    <>
      <Encabezado titulo="Alertas" volver="/mas" />
      {!esDueno && (
        <div className="mb-4">
          <Aviso tipo="info">Solo el dueño puede cambiar las alertas.</Aviso>
        </div>
      )}
      <div className="space-y-4">
        <Tarjeta className="divide-y divide-borde py-1">
          {ALERTAS.map((a) => (
            <Interruptor
              key={a.clave}
              etiqueta={a.texto}
              ayuda={a.ayuda}
              activo={u.activas[a.clave] !== false}
              deshabilitado={!esDueno}
              onCambio={(v) => setU({ ...u, activas: { ...u.activas, [a.clave]: v } })}
            />
          ))}
        </Tarjeta>

        <Tarjeta className="space-y-4">
          <Campo
            etiqueta="Margen mínimo aceptable (%)"
            inputMode="decimal"
            value={form.margen}
            disabled={!esDueno}
            onChange={(e) => setForm({ ...form, margen: e.target.value })}
            ayuda="Productos bajo este margen aparecen como alerta"
          />
          <Campo
            etiqueta="Límite de mermas por día ($)"
            inputMode="numeric"
            value={form.mermasDia}
            disabled={!esDueno}
            onChange={(e) => setForm({ ...form, mermasDia: e.target.value })}
          />
          <Campo
            etiqueta="Límite de mermas por semana ($)"
            inputMode="numeric"
            value={form.mermasSemana}
            disabled={!esDueno}
            onChange={(e) => setForm({ ...form, mermasSemana: e.target.value })}
          />
          <Campo
            etiqueta="Avisar si un costo cambia más de (%)"
            inputMode="decimal"
            value={form.variacion}
            disabled={!esDueno}
            onChange={(e) => setForm({ ...form, variacion: e.target.value })}
          />
          <Campo
            etiqueta="Días a revisar para márgenes y costos faltantes"
            inputMode="numeric"
            value={form.dias}
            disabled={!esDueno}
            onChange={(e) => setForm({ ...form, dias: e.target.value })}
          />
          <div>
            <p className="mb-2 text-sm font-medium text-suave">Días que Broa no abre (no se pide su Excel)</p>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d, i) => {
                const n = i + 1
                const cerrado = u.dias_cerrado.includes(n)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={cerrado}
                    disabled={!esDueno}
                    onClick={() =>
                      setU({ ...u, dias_cerrado: cerrado ? u.dias_cerrado.filter((x) => x !== n) : [...u.dias_cerrado, n].sort() })
                    }
                    className={`min-h-11 min-w-12 rounded-full border px-3 text-sm font-medium ${
                      cerrado ? 'border-primario bg-primario text-primario-texto' : 'border-borde'
                    }`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
        </Tarjeta>
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        {esDueno && (
          <Boton onClick={guardar} cargando={guardando}>
            Guardar
          </Boton>
        )}
      </div>
    </>
  )
}
