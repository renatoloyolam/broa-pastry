import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const llave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(url, llave, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Convierte errores técnicos en mensajes entendibles. */
export function mensajeError(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? String(error ?? '')
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/failed to fetch|network/i.test(msg)) return 'No hay conexión a internet. Revisa tu señal e intenta de nuevo.'
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/same.*password|different from the old/i.test(msg)) return 'La nueva contraseña debe ser distinta a la anterior.'
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espera un minuto e intenta de nuevo.'
  if (/jwt|session/i.test(msg)) return 'Tu sesión expiró. Vuelve a entrar.'
  // Los mensajes propios de la base de datos ya vienen en español.
  if (msg && /[áéíóúñ¿¡]|debe|puedes|existe/i.test(msg)) return msg
  return 'Algo salió mal. Intenta de nuevo y, si se repite, avísale al dueño.'
}
