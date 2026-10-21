import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { mensajeError, supabase } from '../lib/supabase'
import { NOMBRE_ROL, useSesion, type Perfil, type Rol } from '../sesion/SesionProvider'
import { Aviso, Boton, Campo, Encabezado, Tarjeta } from '../componentes/ui'

async function llamarFuncion(cuerpo: Record<string, unknown>): Promise<{ clave_temporal: string }> {
  const { data, error } = await supabase.functions.invoke('gestionar-usuarios', { body: cuerpo })
  if (error) {
    // La función responde con { error: "mensaje en español" }
    const detalle = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(detalle?.error ?? 'No se pudo completar. Revisa tu conexión.')
  }
  return data
}

function ClaveEntregada({ email, clave, alCerrar }: { email: string; clave: string; alCerrar: () => void }) {
  const [copiada, setCopiada] = useState(false)
  return (
    <Tarjeta className="space-y-3 border-acento">
      <p className="font-semibold">Listo. Entrégale estos datos en persona o por WhatsApp:</p>
      <div className="rounded-xl bg-superficie-2 p-3 text-sm">
        <p>
          Correo: <b>{email}</b>
        </p>
        <p>
          Contraseña temporal: <b className="font-mono text-base select-all">{clave}</b>
        </p>
      </div>
      <p className="text-xs text-suave">
        Al entrar por primera vez, la app le pedirá crear su propia contraseña. Esta contraseña no se volverá a mostrar.
      </p>
      <Boton
        variante="secundario"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`App Broa\nCorreo: ${email}\nContraseña temporal: ${clave}`)
            setCopiada(true)
          } catch {
            setCopiada(false)
          }
        }}
      >
        {copiada ? 'Copiado ✓' : 'Copiar datos'}
      </Boton>
      <Boton variante="texto" onClick={alCerrar}>
        Cerrar
      </Boton>
    </Tarjeta>
  )
}

export function Usuarios() {
  const { info } = useSesion()
  const [usuarios, setUsuarios] = useState<Perfil[]>([])
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', rol: 'encargada' as Rol })
  const [enviando, setEnviando] = useState(false)
  const [entregar, setEntregar] = useState<{ email: string; clave: string } | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('perfiles').select('*').order('creado_en')
    if (error) setError(mensajeError(error))
    else setUsuarios(data as Perfil[])
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function crear(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      const r = await llamarFuncion({ accion: 'crear', ...nuevo })
      setEntregar({ email: nuevo.email.trim().toLowerCase(), clave: r.clave_temporal })
      setNuevo({ nombre: '', email: '', rol: 'encargada' })
      setCreando(false)
      await cargar()
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setEnviando(false)
    }
  }

  async function actualizar(u: Perfil, cambios: Partial<Perfil>) {
    setError('')
    const { error } = await supabase.from('perfiles').update(cambios).eq('id', u.id)
    if (error) setError(mensajeError(error))
    await cargar()
  }

  async function restablecer(u: Perfil) {
    if (!confirm(`¿Crear una contraseña temporal nueva para ${u.nombre}? La actual dejará de funcionar.`)) return
    setError('')
    try {
      const r = await llamarFuncion({ accion: 'restablecer_clave', id: u.id })
      setEntregar({ email: u.email, clave: r.clave_temporal })
    } catch (err) {
      setError(mensajeError(err))
    }
  }

  return (
    <>
      <Encabezado titulo="Usuarios" volver="/mas" />
      <div className="space-y-4">
        {error && <Aviso>{error}</Aviso>}
        {entregar && <ClaveEntregada {...entregar} alCerrar={() => setEntregar(null)} />}

        {creando ? (
          <Tarjeta>
            <form onSubmit={crear} className="space-y-4">
              <h2 className="text-lg font-semibold">Nuevo usuario</h2>
              <Campo
                etiqueta="Nombre"
                required
                maxLength={80}
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              />
              <Campo
                etiqueta="Correo"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="off"
                required
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              />
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-suave">Rol</legend>
                <div className="grid gap-2">
                  {(['encargada', 'admin', 'dueno'] as Rol[]).map((r) => (
                    <label
                      key={r}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 ${
                        nuevo.rol === r ? 'border-primario bg-superficie-2' : 'border-borde'
                      }`}
                    >
                      <input
                        type="radio"
                        name="rol"
                        checked={nuevo.rol === r}
                        onChange={() => setNuevo({ ...nuevo, rol: r })}
                        className="accent-[var(--primario)]"
                      />
                      <span>
                        <span className="block font-medium">{NOMBRE_ROL[r]}</span>
                        <span className="block text-xs text-suave">
                          {r === 'encargada' && 'Solo ve ventas. Nunca costos ni ganancia.'}
                          {r === 'admin' && 'Casi todo; tú decides sus permisos.'}
                          {r === 'dueno' && 'Acceso total, incluido crear usuarios.'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Boton type="submit" cargando={enviando}>
                Crear usuario
              </Boton>
              <Boton type="button" variante="texto" onClick={() => setCreando(false)}>
                Cancelar
              </Boton>
            </form>
          </Tarjeta>
        ) : (
          <Boton onClick={() => setCreando(true)}>+ Nuevo usuario</Boton>
        )}

        {usuarios.map((u) => {
          const soyYo = u.id === info?.perfil?.id
          return (
            <Tarjeta key={u.id} className={u.activo ? '' : 'opacity-60'}>
              <div className="mb-3">
                <p className="font-semibold">
                  {u.nombre} {soyYo && <span className="text-xs font-normal text-suave">(tú)</span>}
                </p>
                <p className="text-sm break-all text-suave">{u.email}</p>
                {!u.activo && <p className="text-xs font-medium text-peligro">Desactivado</p>}
                {u.activo && u.debe_cambiar_clave && (
                  <p className="text-xs text-aviso">Aún no crea su contraseña propia</p>
                )}
              </div>
              <select
                aria-label={`Rol de ${u.nombre}`}
                value={u.rol}
                disabled={soyYo}
                onChange={(e) => actualizar(u, { rol: e.target.value as Rol })}
                className="mb-2 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 disabled:opacity-60"
              >
                {(['dueno', 'admin', 'encargada'] as Rol[]).map((r) => (
                  <option key={r} value={r}>
                    {NOMBRE_ROL[r]}
                  </option>
                ))}
              </select>
              {!soyYo && (
                <div className="grid grid-cols-2 gap-2">
                  <Boton variante="secundario" className="text-sm" onClick={() => restablecer(u)}>
                    Nueva contraseña
                  </Boton>
                  <Boton
                    variante={u.activo ? 'peligro' : 'secundario'}
                    className="text-sm"
                    onClick={() => actualizar(u, { activo: !u.activo })}
                  >
                    {u.activo ? 'Desactivar' : 'Reactivar'}
                  </Boton>
                </div>
              )}
            </Tarjeta>
          )
        })}
      </div>
    </>
  )
}
