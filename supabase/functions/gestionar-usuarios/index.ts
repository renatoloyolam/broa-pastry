// Edge Function: crear usuarios y restablecer contraseñas.
// Solo la puede usar alguien con el permiso "gestionar_usuarios" (Dueño).
// Usa la llave de servicio, que vive solo en el servidor de Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['dueno', 'admin', 'encargada']

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Contraseña temporal legible, sin caracteres confusos (0/O, 1/l).
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return 'Broa-' + Array.from(bytes, (b) => letras[b % letras.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. ¿Quién llama? Usamos su propia sesión para preguntarle a la base.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: sesion, error: errSesion } = await comoUsuario.rpc('mi_sesion')
  if (errSesion || !sesion?.permisos?.includes('gestionar_usuarios')) {
    return responder({ error: 'No tienes permiso para gestionar usuarios.' }, 403)
  }

  const admin = createClient(url, servicio, { auth: { persistSession: false } })
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = await req.json()
  } catch {
    return responder({ error: 'Solicitud inválida.' }, 400)
  }

  if (cuerpo.accion === 'crear') {
    const email = String(cuerpo.email ?? '').trim().toLowerCase()
    const nombre = String(cuerpo.nombre ?? '').trim()
    const rol = String(cuerpo.rol ?? '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: 'El correo no es válido.' }, 400)
    if (!nombre || nombre.length > 80) return responder({ error: 'Escribe un nombre.' }, 400)
    if (!ROLES.includes(rol)) return responder({ error: 'Rol no válido.' }, 400)

    const clave = claveTemporal()
    const { data: creado, error } = await admin.auth.admin.createUser({
      email,
      password: clave,
      email_confirm: true,
    })
    if (error || !creado.user) {
      const yaExiste = error?.message?.toLowerCase().includes('already')
      return responder(
        { error: yaExiste ? 'Ya existe un usuario con ese correo.' : 'No se pudo crear el usuario.' },
        400,
      )
    }
    const { error: errPerfil } = await admin.from('perfiles').insert({
      id: creado.user.id,
      nombre,
      email,
      rol,
      debe_cambiar_clave: true,
    })
    if (errPerfil) {
      await admin.auth.admin.deleteUser(creado.user.id)
      return responder({ error: 'No se pudo crear el perfil.' }, 500)
    }
    return responder({ ok: true, clave_temporal: clave })
  }

  if (cuerpo.accion === 'restablecer_clave') {
    const id = String(cuerpo.id ?? '')
    const { data: perfil } = await admin.from('perfiles').select('id').eq('id', id).maybeSingle()
    if (!perfil) return responder({ error: 'Usuario no encontrado.' }, 404)
    const clave = claveTemporal()
    const { error } = await admin.auth.admin.updateUserById(id, { password: clave })
    if (error) return responder({ error: 'No se pudo restablecer la contraseña.' }, 500)
    await admin.from('perfiles').update({ debe_cambiar_clave: true }).eq('id', id)
    return responder({ ok: true, clave_temporal: clave })
  }

  return responder({ error: 'Acción desconocida.' }, 400)
})
