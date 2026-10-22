import { useCallback, useEffect, useState } from 'react'
import {
  activarNotificaciones,
  desactivarNotificaciones,
  enviarPrueba,
  estadoNotificaciones,
  type EstadoNotificaciones,
} from '../lib/notificaciones'
import { Aviso, Boton, Tarjeta } from './ui'

/** Activar el resumen semanal como notificación en este teléfono (Mi cuenta). */
export function SeccionNotificaciones() {
  const [estado, setEstado] = useState<EstadoNotificaciones | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const revisar = useCallback(async () => setEstado(await estadoNotificaciones()), [])
  useEffect(() => {
    void revisar()
  }, [revisar])

  async function hacer(accion: () => Promise<unknown>, ok: string) {
    setMensaje(null)
    setTrabajando(true)
    try {
      await accion()
      setMensaje({ tipo: 'ok', texto: ok })
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo completar.' })
    } finally {
      setTrabajando(false)
      await revisar()
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">Resumen semanal</h2>
      <Tarjeta className="space-y-3">
        <p className="text-sm text-suave">
          Cada lunes a mediodía te llega una notificación con las ventas de la semana pasada (y la ganancia, si puedes verla). Al
          tocarla se abre el resumen completo.
        </p>
        {estado === 'instalar' && (
          <Aviso tipo="info">
            En iPhone las notificaciones funcionan solo con la app instalada: en Safari toca Compartir → "Agregar a inicio", abre Broa
            desde ese ícono y vuelve aquí.
          </Aviso>
        )}
        {estado === 'no_soportado' && <Aviso tipo="info">Este navegador no permite notificaciones.</Aviso>}
        {estado === 'bloqueadas' && (
          <Aviso tipo="info">
            Las notificaciones están bloqueadas para Broa. Actívalas en Ajustes del teléfono → Notificaciones → Broa, y vuelve aquí.
          </Aviso>
        )}
        {estado === 'inactivas' && (
          <Boton onClick={() => hacer(activarNotificaciones, 'Listo: este teléfono recibirá el resumen cada lunes.')} cargando={trabajando}>
            Activar en este teléfono
          </Boton>
        )}
        {estado === 'activas' && (
          <>
            <p className="text-sm font-semibold text-exito">✓ Activas en este teléfono</p>
            <div className="grid grid-cols-2 gap-2">
              <Boton
                variante="secundario"
                onClick={() => hacer(enviarPrueba, 'Enviado: debería llegarte en unos segundos.')}
                cargando={trabajando}
              >
                Enviarme uno ahora
              </Boton>
              <Boton variante="peligro" onClick={() => hacer(desactivarNotificaciones, 'Desactivadas en este teléfono.')} disabled={trabajando}>
                Desactivar
              </Boton>
            </div>
          </>
        )}
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      </Tarjeta>
    </section>
  )
}
