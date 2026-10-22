// Edge Function: manda el resumen semanal como notificación (Web Push).
// * {tipo: 'semanal'}: la llama pg_cron cada lunes, con el header x-secreto.
//   Manda a todos los teléfonos registrados, a cada uno con SUS números
//   (la encargada no recibe ganancia).
// * {tipo: 'prueba'}: la llama un usuario desde la app (con su sesión) para
//   recibir el resumen ahora en sus propios teléfonos.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-secreto',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** Lunes de la semana pasada, en hora de Santiago ("AAAA-MM-DD"). */
function lunesPasado() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  const f = new Date(`${hoy}T12:00:00Z`)
  const dia = f.getUTCDay() || 7
  f.setUTCDate(f.getUTCDate() - (dia - 1) - 7)
  return f.toISOString().slice(0, 10)
}

interface Suscripcion {
  id: number
  usuario: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  let cuerpo: { tipo?: string }
  try {
    cuerpo = await req.json()
  } catch {
    return responder({ error: 'Solicitud inválida.' }, 400)
  }

  const { data: cfg, error: errCfg } = await admin.rpc('config_push')
  if (errCfg || !cfg) return responder({ error: 'Falta configurar las notificaciones.' }, 500)
  webpush.setVapidDetails('https://broa-pastry.pages.dev', cfg.vapid_publica, cfg.vapid_privada)

  // ¿A quién se le manda?
  let consulta = admin.from('push_suscripciones').select('id, usuario, endpoint, p256dh, auth')
  if (cuerpo.tipo === 'semanal') {
    if (req.headers.get('x-secreto') !== cfg.secreto_cron) return responder({ error: 'No autorizado.' }, 403)
  } else if (cuerpo.tipo === 'prueba') {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return responder({ error: 'Inicia sesión de nuevo.' }, 401)
    consulta = consulta.eq('usuario', data.user.id)
  } else {
    return responder({ error: 'Tipo no válido.' }, 400)
  }
  const { data: subs, error: errSubs } = await consulta
  if (errSubs) return responder({ error: errSubs.message }, 500)
  if (!subs?.length) {
    return responder({ error: cuerpo.tipo === 'prueba' ? 'Este teléfono aún no tiene las notificaciones activadas.' : null, enviados: 0 })
  }

  const lunes = lunesPasado()
  const textos = new Map<string, unknown>()
  let enviados = 0
  let eliminados = 0
  const fallidos: string[] = []

  for (const s of subs as Suscripcion[]) {
    if (!textos.has(s.usuario)) {
      const { data } = await admin.rpc('texto_resumen_semanal', { p_usuario: s.usuario, p_lunes: lunes })
      textos.set(s.usuario, data)
    }
    const texto = textos.get(s.usuario)
    if (!texto) continue // usuario desactivado
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(texto), {
        TTL: 60 * 60 * 24,
      })
      enviados++
      await admin.from('push_suscripciones').update({ ultimo_envio: new Date().toISOString() }).eq('id', s.id)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      // El teléfono ya no acepta notificaciones (se desinstaló o se revocó el permiso)
      if (status === 404 || status === 410) {
        await admin.from('push_suscripciones').delete().eq('id', s.id)
        eliminados++
      } else {
        fallidos.push(String(status ?? (e as Error).message))
      }
    }
  }
  return responder({ enviados, eliminados, fallidos })
})
