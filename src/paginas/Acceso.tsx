import { useState, type FormEvent, type ReactNode } from 'react'
import { mensajeError, supabase } from '../lib/supabase'
import { useSesion } from '../sesion/SesionProvider'
import { Aviso, Boton, Campo } from '../componentes/ui'
import { entrarConFaceId, faceIdDisponible, mensajeFaceId } from '../lib/faceid'
import { AyudaInstalar } from '../componentes/AyudaInstalar'

function PantallaMarca({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fondo px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.png" alt="Broa by Sofía" className="mb-4 h-28 w-28 rounded-full shadow-md" />
          <h1 className="font-serif text-3xl font-bold">Broa Pastry</h1>
          <p className="text-sm text-topo">by Sofía · Gestión</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const { cerradaPorInactividad } = useSesion()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const [conFaceId, setConFaceId] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    setEnviando(false)
    if (error) setError(mensajeError(error))
  }

  async function entrarFaceId() {
    setError('')
    setConFaceId(true)
    try {
      await entrarConFaceId()
    } catch (err) {
      const m = mensajeFaceId(err)
      if (m) setError(m)
    } finally {
      setConFaceId(false)
    }
  }

  return (
    <PantallaMarca>
      {/* autocomplete correcto = el iPhone ofrece guardar la clave y entrar con Face ID */}
      <form onSubmit={entrar} className="space-y-4" method="post" action="#">
        {cerradaPorInactividad && <Aviso tipo="info">Cerramos tu sesión por inactividad. Vuelve a entrar.</Aviso>}
        {faceIdDisponible() && (
          <>
            <Boton type="button" onClick={entrarFaceId} cargando={conFaceId} className="min-h-14 text-lg">
              Entrar con Face ID
            </Boton>
            <p className="text-center text-xs text-suave">o con tu correo y contraseña</p>
          </>
        )}
        <Campo
          etiqueta="Correo"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          etiqueta="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" variante={faceIdDisponible() ? 'secundario' : 'primario'} cargando={enviando}>
          Entrar
        </Boton>
        <p className="pt-2 text-center text-xs text-suave">
          ¿Olvidaste tu contraseña? Pídele a un dueño que te la restablezca.
        </p>
      </form>
      <AyudaInstalar />
    </PantallaMarca>
  )
}

export function ReclamarDueno() {
  const { recargar, salir, sesion } = useSesion()
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function reclamar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const { error } = await supabase.rpc('reclamar_dueno', { nombre: nombre.trim() })
    if (error) {
      setError(mensajeError(error))
      setEnviando(false)
      return
    }
    await recargar()
  }

  return (
    <PantallaMarca>
      <form onSubmit={reclamar} className="space-y-4">
        <Aviso tipo="info">
          ¡Bienvenido! Esta es la primera vez que se usa la app. La cuenta <b>{sesion?.user.email}</b> quedará como{' '}
          <b>Dueño</b> y podrá crear las demás cuentas.
        </Aviso>
        <Campo
          etiqueta="¿Cómo te llamas?"
          autoComplete="name"
          required
          maxLength={80}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" cargando={enviando}>
          Ser el dueño de la app
        </Boton>
        <Boton type="button" variante="texto" onClick={salir}>
          Salir
        </Boton>
      </form>
    </PantallaMarca>
  )
}

export function SinAcceso() {
  const { salir, info } = useSesion()
  const desactivada = info?.perfil && !info.perfil.activo
  return (
    <PantallaMarca>
      <div className="space-y-4">
        <Aviso tipo="info">
          {desactivada
            ? 'Tu cuenta está desactivada. Si crees que es un error, habla con Sofía.'
            : 'Tu cuenta todavía no tiene acceso. Pídele a un dueño que te cree un usuario desde la app.'}
        </Aviso>
        <Boton variante="secundario" onClick={salir}>
          Salir
        </Boton>
      </div>
    </PantallaMarca>
  )
}

export function FormCambiarClave({ alTerminar }: { alTerminar: () => void | Promise<void> }) {
  const { sesion } = useSesion()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave !== repetir) return setError('Las dos contraseñas no coinciden.')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    if (!error) await supabase.rpc('marcar_clave_cambiada')
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    await alTerminar()
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      {/* Campo oculto para que el Llavero del iPhone asocie la clave al correo correcto */}
      <input type="email" name="email" autoComplete="username" value={sesion?.user.email ?? ''} readOnly hidden />
      <Campo
        etiqueta="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        ayuda="Mínimo 8 caracteres. El iPhone puede sugerirte una segura."
      />
      <Campo
        etiqueta="Repite la contraseña"
        type="password"
        autoComplete="new-password"
        required
        value={repetir}
        onChange={(e) => setRepetir(e.target.value)}
      />
      {error && <Aviso>{error}</Aviso>}
      <Boton type="submit" cargando={enviando}>
        Guardar contraseña
      </Boton>
    </form>
  )
}

export function CambiarClaveObligatorio() {
  const { recargar, salir, info } = useSesion()
  return (
    <PantallaMarca>
      <div className="space-y-4">
        <Aviso tipo="info">
          Hola {info?.perfil?.nombre}. Entraste con una contraseña temporal; crea una propia para continuar.
        </Aviso>
        <FormCambiarClave alTerminar={recargar} />
        <Boton variante="texto" onClick={salir}>
          Salir
        </Boton>
      </div>
    </PantallaMarca>
  )
}
