import { useCallback, useEffect, useState } from 'react'
import { activarFaceId, borrarPasskey, faceIdDisponible, listarPasskeys, mensajeFaceId, type Passkey } from '../lib/faceid'
import { fechaHora } from '../lib/formato'
import { useConfirmar } from './Confirmar'
import { Aviso, Boton, Tarjeta } from './ui'

/** Activar / quitar el ingreso con Face ID (passkeys) en Mi cuenta. */
export function SeccionFaceId() {
  const confirmar = useConfirmar()
  const [lista, setLista] = useState<Passkey[] | null>(null)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setLista(await listarPasskeys())
    } catch (e) {
      setLista([])
      const m = mensajeFaceId(e)
      if (m && /no está activado/.test(m)) setEstado({ tipo: 'info', texto: m })
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function activar() {
    setEstado(null)
    setTrabajando(true)
    try {
      await activarFaceId()
      setEstado({ tipo: 'ok', texto: 'Listo. La próxima vez toca "Entrar con Face ID".' })
      await cargar()
    } catch (e) {
      const m = mensajeFaceId(e)
      if (m) setEstado({ tipo: 'error', texto: m })
    } finally {
      setTrabajando(false)
    }
  }

  async function quitar(p: Passkey) {
    if (!(await confirmar({ mensaje: `¿Quitar el ingreso con Face ID de "${p.friendly_name ?? 'este dispositivo'}"?`, accion: 'Quitar', peligro: true })))
      return
    try {
      await borrarPasskey(p.id)
      await cargar()
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeFaceId(e) ?? 'No se pudo quitar.' })
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Face ID</h2>
      <Tarjeta className="space-y-3">
        <p className="text-sm text-suave">
          Entra a la app con Face ID en vez de escribir la contraseña. Se activa una vez en cada iPhone o computador. La contraseña sigue
          funcionando siempre.
        </p>
        {lista && lista.length > 0 && (
          <ul className="divide-y divide-borde rounded-xl border border-borde">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 text-sm">
                  <span className="block font-medium">{p.friendly_name ?? 'Dispositivo'}</span>
                  <span className="block text-xs text-suave">
                    {p.last_used_at ? `Usado ${fechaHora(p.last_used_at)}` : `Activado ${fechaHora(p.created_at)}`}
                  </span>
                </span>
                <button type="button" onClick={() => quitar(p)} className="min-h-10 px-2 text-sm font-semibold text-peligro">
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        {faceIdDisponible() ? (
          <Boton onClick={activar} cargando={trabajando}>
            Activar Face ID en este dispositivo
          </Boton>
        ) : (
          <Aviso tipo="info">Este navegador no permite Face ID. Usa Safari en el iPhone.</Aviso>
        )}
      </Tarjeta>
    </section>
  )
}
