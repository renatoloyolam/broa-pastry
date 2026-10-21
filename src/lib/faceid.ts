// Entrar con Face ID / Touch ID usando passkeys de Supabase.
// La passkey queda guardada en el Llavero de iCloud del iPhone; Supabase solo
// guarda la llave pública. La contraseña sigue funcionando siempre.
import { supabase } from './supabase'

export function faceIdDisponible(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && window.isSecureContext
}

/** Mensaje entendible para los errores de passkeys. null = la persona canceló. */
export function mensajeFaceId(error: unknown): string | null {
  const e = error as { name?: string; code?: string; message?: string }
  const texto = `${e?.code ?? ''} ${e?.name ?? ''} ${e?.message ?? ''}`
  if (/NotAllowedError|ABORTED|cancel/i.test(texto)) return null
  if (/passkey_disabled/i.test(texto)) return 'El ingreso con Face ID todavía no está activado. Por ahora entra con tu contraseña.'
  if (/credential_not_found/i.test(texto))
    return 'Este dispositivo aún no tiene Face ID activado para Broa. Entra con tu contraseña y actívalo en Más → Mi cuenta.'
  if (/credential_exists|InvalidStateError/i.test(texto)) return 'Face ID ya estaba activado en este dispositivo.'
  if (/too_many_passkeys/i.test(texto)) return 'Llegaste al máximo de dispositivos con Face ID. Borra uno antiguo en Mi cuenta.'
  if (/challenge_expired/i.test(texto)) return 'Se demoró demasiado. Intenta de nuevo.'
  if (/failed to fetch|network/i.test(texto)) return 'No hay conexión a internet. Revisa tu señal e intenta de nuevo.'
  return 'No se pudo usar Face ID. Intenta de nuevo o entra con tu contraseña.'
}

export async function entrarConFaceId() {
  const { error } = await supabase.auth.signInWithPasskey()
  if (error) throw error
}

export async function activarFaceId() {
  const { error } = await supabase.auth.registerPasskey()
  if (error) throw error
}

export interface Passkey {
  id: string
  friendly_name?: string
  created_at: string
  last_used_at?: string
}

export async function listarPasskeys(): Promise<Passkey[]> {
  const { data, error } = await supabase.auth.passkey.list()
  if (error) throw error
  return (data ?? []) as Passkey[]
}

export async function borrarPasskey(id: string) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id })
  if (error) throw error
}
