import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

export type Rol = 'dueno' | 'admin' | 'encargada'
export type Permiso =
  | 'ver_ventas'
  | 'ver_costos'
  | 'editar_catalogo'
  | 'importar_ventas'
  | 'registrar_mermas'
  | 'gestionar_pedidos'
  | 'exportar'
  | 'editar_configuracion'
  | 'gestionar_usuarios'
  | 'gestionar_finanzas'

export interface Perfil {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  debe_cambiar_clave: boolean
}

export interface Configuracion {
  precios_incluyen_iva: boolean
  tasa_iva: number
  margen_sobre_neto: boolean
  minutos_inactividad: number
  hora_corte_turno: string
  ultimo_respaldo: string | null
}

interface InfoSesion {
  perfil: Perfil | null
  existe_dueno: boolean
  permisos: Permiso[]
}

interface ContextoSesion {
  cargando: boolean
  sesion: Session | null
  info: InfoSesion | null
  config: Configuracion | null
  cerradaPorInactividad: boolean
  puede: (p: Permiso) => boolean
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

const Contexto = createContext<ContextoSesion | null>(null)
const CLAVE_ACTIVIDAD = 'broa.ultimaActividad'

function leerActividad(): number {
  try {
    return Number(localStorage.getItem(CLAVE_ACTIVIDAD)) || Date.now()
  } catch {
    return Date.now()
  }
}

function marcarActividad() {
  try {
    localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()))
  } catch {
    /* sin almacenamiento: el control sigue funcionando mientras la app esté abierta */
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState<Session | null>(null)
  const [info, setInfo] = useState<InfoSesion | null>(null)
  const [config, setConfig] = useState<Configuracion | null>(null)
  const [cerradaPorInactividad, setCerradaPorInactividad] = useState(false)

  const cargarInfo = useCallback(async (s: Session | null) => {
    if (!s) {
      setInfo(null)
      setConfig(null)
      return
    }
    const [{ data: datos }, { data: conf }] = await Promise.all([
      supabase.rpc('mi_sesion'),
      supabase.from('configuracion').select('*').maybeSingle(),
    ])
    setInfo((datos as InfoSesion) ?? null)
    setConfig((conf as Configuracion) ?? null)
  }, [])

  useEffect(() => {
    let vivo = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return
      setSesion(data.session)
      await cargarInfo(data.session)
      if (vivo) setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s)
      if (evento === 'SIGNED_IN') {
        marcarActividad()
        setCerradaPorInactividad(false)
      }
      // Diferido para no llamar a Supabase dentro del propio aviso de cambio.
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        setTimeout(() => void cargarInfo(s), 0)
      }
    })
    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [cargarInfo])

  const salir = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Cierre automático por inactividad. Cuenta también el tiempo con la app
  // cerrada o en segundo plano (se guarda la hora del último toque).
  const minutos = config?.minutos_inactividad ?? 30
  useEffect(() => {
    if (!sesion) return
    const revisar = () => {
      if (Date.now() - leerActividad() > minutos * 60_000) {
        setCerradaPorInactividad(true)
        void supabase.auth.signOut()
      }
    }
    revisar()
    const alActuar = () => marcarActividad()
    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar()
    }
    window.addEventListener('pointerdown', alActuar, { passive: true })
    window.addEventListener('keydown', alActuar)
    document.addEventListener('visibilitychange', alVolver)
    const intervalo = window.setInterval(revisar, 30_000)
    return () => {
      window.removeEventListener('pointerdown', alActuar)
      window.removeEventListener('keydown', alActuar)
      document.removeEventListener('visibilitychange', alVolver)
      window.clearInterval(intervalo)
    }
  }, [sesion, minutos])

  const valor: ContextoSesion = {
    cargando,
    sesion,
    info,
    config,
    cerradaPorInactividad,
    puede: (p) => info?.permisos.includes(p) ?? false,
    recargar: () => cargarInfo(sesion),
    salir,
  }
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSesion debe usarse dentro de SesionProvider')
  return c
}

export const NOMBRE_ROL: Record<Rol, string> = {
  dueno: 'Dueño',
  admin: 'Administradora',
  encargada: 'Encargada de ventas',
}
