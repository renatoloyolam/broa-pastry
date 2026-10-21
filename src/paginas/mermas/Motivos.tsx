import { useCallback, useEffect, useState } from 'react'
import { Aviso, Boton, Encabezado, Interruptor, Tarjeta } from '../../componentes/ui'
import { mensajeError, supabase } from '../../lib/supabase'

interface Motivo {
  id: number
  nombre: string
  evitable_sugerido: boolean
  orden: number
  activo: boolean
}

function FilaMotivo({ m, alCambiar }: { m: Motivo; alCambiar: () => void }) {
  const [nombre, setNombre] = useState(m.nombre)
  const [error, setError] = useState('')

  async function guardar(cambios: Partial<Motivo>) {
    setError('')
    const { error } = await supabase.from('motivos_merma').update(cambios).eq('id', m.id)
    if (error) setError(error.code === '23505' ? 'Ya existe un motivo con ese nombre.' : mensajeError(error))
    alCambiar()
  }

  return (
    <Tarjeta className={`space-y-1 ${m.activo ? '' : 'opacity-60'}`}>
      <input
        aria-label="Nombre del motivo"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => nombre.trim() && nombre.trim() !== m.nombre && guardar({ nombre: nombre.trim() })}
        className="min-h-11 w-full rounded-lg border border-transparent bg-transparent px-1 font-medium focus:border-borde"
      />
      <Interruptor
        etiqueta="Sugerir como evitable"
        ayuda="Al elegir este motivo, la merma se marca evitable por defecto"
        activo={m.evitable_sugerido}
        onCambio={(v) => guardar({ evitable_sugerido: v })}
      />
      <Interruptor etiqueta="Visible al registrar" activo={m.activo} onCambio={(v) => guardar({ activo: v })} />
      {error && <p className="text-xs text-peligro">{error}</p>}
    </Tarjeta>
  )
}

export function Motivos() {
  const [motivos, setMotivos] = useState<Motivo[]>([])
  const [nuevo, setNuevo] = useState('')
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('motivos_merma').select('*').order('orden').order('nombre')
    if (error) setError(mensajeError(error))
    else setMotivos(data as Motivo[])
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function crear() {
    setError('')
    if (!nuevo.trim()) return
    const { error } = await supabase.from('motivos_merma').insert({ nombre: nuevo.trim(), orden: 80 })
    if (error) return setError(error.code === '23505' ? 'Ese motivo ya existe.' : mensajeError(error))
    setNuevo('')
    await cargar()
  }

  return (
    <>
      <Encabezado titulo="Motivos de merma" volver="/mermas/reporte" />
      <div className="space-y-3">
        {motivos.map((m) => (
          <FilaMotivo key={m.id} m={m} alCambiar={cargar} />
        ))}
        <div className="flex gap-2">
          <input
            placeholder="Nuevo motivo"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-borde bg-superficie px-4"
          />
          <Boton className="!w-auto" onClick={crear}>
            Agregar
          </Boton>
        </div>
        {error && <Aviso>{error}</Aviso>}
        <p className="text-xs text-suave">Los motivos no se borran (las mermas pasadas los usan); se ocultan.</p>
      </div>
    </>
  )
}
