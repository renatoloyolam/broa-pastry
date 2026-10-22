// Notificaciones del resumen semanal (Web Push).
// En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más nuevo).
import { mensajeError, supabase } from './supabase'

export type EstadoNotificaciones = 'no_soportado' | 'instalar' | 'bloqueadas' | 'activas' | 'inactivas'

const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Llave pública VAPID en base64url → bytes, como la pide pushManager.subscribe. */
export function llaveABytes(base64url: string) {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4)
  const b64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registro() {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function estadoNotificaciones(): Promise<EstadoNotificaciones> {
  const soporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!soporta) return esIos() && !instalada() ? 'instalar' : 'no_soportado'
  if (Notification.permission === 'denied') return 'bloqueadas'
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'activas' : 'inactivas'
}

export async function activarNotificaciones() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones.')
  const reg = (await registro()) ?? (await navigator.serviceWorker.ready)
  const { data: llave, error } = await supabase.rpc('vapid_publica')
  if (error || !llave) throw new Error(error ? mensajeError(error) : 'Las notificaciones no están configuradas.')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llaveABytes(llave as string) }))
  const json = sub.toJSON()
  const { error: errGuardar } = await supabase.rpc('registrar_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_dispositivo: navigator.userAgent.slice(0, 200),
  })
  if (errGuardar) throw new Error(mensajeError(errGuardar))
}

export async function desactivarNotificaciones() {
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_suscripciones').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Manda el resumen de la semana pasada ahora, a mis teléfonos. */
export async function enviarPrueba() {
  const { data, error } = await supabase.functions.invoke('resumen-semanal', { body: { tipo: 'prueba' } })
  if (error) throw new Error(mensajeError(error))
  if (data?.error) throw new Error(data.error)
  return data as { enviados: number }
}
