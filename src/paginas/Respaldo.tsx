import { useState } from 'react'
import { Aviso, Boton, Encabezado, Tarjeta } from '../componentes/ui'
import { entregarArchivo } from '../lib/exportar'
import { fechaHora, hoyIso, numero } from '../lib/formato'
import { crearRespaldo, diasDesdeRespaldo } from '../lib/respaldo'
import { mensajeError, supabase } from '../lib/supabase'
import { useSesion } from '../sesion/SesionProvider'

export function Respaldo() {
  const { config, recargar } = useSesion()
  const [progreso, setProgreso] = useState<{ texto: string; fraccion: number } | null>(null)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const dias = diasDesdeRespaldo(config?.ultimo_respaldo)

  async function descargar() {
    setEstado(null)
    setProgreso({ texto: 'Empezando…', fraccion: 0 })
    try {
      const { blob, filas } = await crearRespaldo((texto, fraccion) => setProgreso({ texto, fraccion }))
      await entregarArchivo(blob, `broa-respaldo-${hoyIso()}.xlsx`)
      await supabase.rpc('marcar_respaldo')
      await recargar()
      setEstado({ tipo: 'ok', texto: `Respaldo listo: ${numero(filas)} filas. Guárdalo en un lugar seguro (Archivos, Google Drive o tu computador).` })
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeError(e) })
    } finally {
      setProgreso(null)
    }
  }

  return (
    <>
      <Encabezado titulo="Respaldo" volver="/mas" />
      <div className="space-y-4">
        <Tarjeta className="space-y-2 text-sm">
          <p>
            Descarga una copia de <b>toda</b> la información de la app en un Excel: productos, costos y su historial, recetas, ventas
            importadas, mermas, pedidos y configuración.
          </p>
          <p className="text-suave">
            El plan gratis de Supabase no guarda copias descargables, así que conviene hacerlo <b>una vez por semana</b> y guardar el archivo
            fuera del celular (Google Drive, iCloud o el computador). Contiene costos: no lo compartas.
          </p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs font-medium tracking-wide text-suave uppercase">Último respaldo</p>
          <p className="mt-1 text-lg font-semibold">
            {config?.ultimo_respaldo ? fechaHora(config.ultimo_respaldo) : 'Nunca'}
            {dias != null && dias >= 7 && <span className="ml-2 text-sm text-aviso">(hace {dias} días)</span>}
          </p>
        </Tarjeta>
        {progreso && (
          <Tarjeta className="space-y-2">
            <div className="h-3 overflow-hidden rounded-full bg-superficie-2">
              <div className="h-full bg-acento transition-all" style={{ width: `${Math.round(progreso.fraccion * 100)}%` }} />
            </div>
            <p className="text-sm text-suave">{progreso.texto} · no cierres la app</p>
          </Tarjeta>
        )}
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        <Boton onClick={descargar} cargando={progreso != null} className="min-h-14 text-lg">
          Descargar respaldo
        </Boton>
      </div>
    </>
  )
}
