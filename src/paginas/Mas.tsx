import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mensajeError, supabase } from '../lib/supabase'
import { NOMBRE_ROL, useSesion, type Configuracion } from '../sesion/SesionProvider'
import { Acceso, Aviso, Boton, Campo, Encabezado, IconoCirculo, Interruptor, Tarjeta } from '../componentes/ui'
import { FormCambiarClave } from './Acceso'
import { SeccionFaceId } from '../componentes/SeccionFaceId'
import { SeccionNotificaciones } from '../componentes/SeccionNotificaciones'
import { ICONOS } from '../componentes/iconos'

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-suave">{titulo}</h2>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

export function Mas() {
  const { info, puede, salir } = useSesion()
  const perfil = info?.perfil
  const esDueno = perfil?.rol === 'dueno'
  return (
    <>
      <Encabezado titulo="Más" />
      <Link to="/mas/cuenta" className="mb-5 flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-4 active:bg-superficie-2">
        <IconoCirculo icono={ICONOS.cuenta} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{perfil?.nombre}</span>
          <span className="block truncate text-sm text-suave">
            {perfil?.email} · {perfil && NOMBRE_ROL[perfil.rol]}
          </span>
          <span className="block text-xs text-suave">Mi cuenta: Face ID, notificaciones y contraseña</span>
        </span>
        <ICONOS.siguiente className="h-5 w-5 shrink-0 text-suave" aria-hidden />
      </Link>

      <Grupo titulo="Día a día">
        <Acceso a="/produccion" icono={ICONOS.produccion} titulo="Producción sugerida" detalle="Cuánto hacer cada día" />
        {puede('gestionar_pedidos') && <Acceso a="/pedidos" icono={ICONOS.pedidos} titulo="Pedidos de tortas" detalle="Encargos, abonos y saldos" />}
      </Grupo>

      {(puede('gestionar_finanzas') || puede('exportar') || puede('ver_costos')) && (
        <Grupo titulo="Números">
          {puede('gestionar_finanzas') && <Acceso a="/finanzas" icono={ICONOS.finanzas} titulo="Finanzas del mes" detalle="Gastos, meta, ganancia real, IVA e insumos" />}
          {puede('exportar') && <Acceso a="/mas/exportar" icono={ICONOS.exportar} titulo="Exportar reportes" detalle="Excel, PDF y CSV para el contador" />}
          {puede('ver_costos') && <Acceso a="/mas/alertas" icono={ICONOS.alertas} titulo="Alertas" detalle="Qué avisos ver y sus límites" />}
        </Grupo>
      )}

      {(puede('gestionar_usuarios') || esDueno || puede('editar_configuracion')) && (
        <Grupo titulo="Administración">
          {puede('gestionar_usuarios') && <Acceso a="/mas/usuarios" icono={ICONOS.usuarios} titulo="Usuarios" detalle="Crear cuentas y roles" />}
          {esDueno && <Acceso a="/mas/permisos" icono={ICONOS.permisos} titulo="Permisos" detalle="Qué puede hacer la administradora" />}
          {esDueno && <Acceso a="/mas/respaldo" icono={ICONOS.respaldo} titulo="Respaldo" detalle="Descargar una copia de todo" />}
          {(puede('editar_configuracion') || perfil?.rol === 'admin') && (
            <Acceso a="/mas/configuracion" icono={ICONOS.configuracion} titulo="Configuración" detalle="IVA, turnos y cierre de sesión" />
          )}
        </Grupo>
      )}

      <Boton icono={ICONOS.salir} variante="peligro" onClick={salir}>
        Cerrar sesión
      </Boton>
      <p className="mt-6 text-center text-xs text-suave">Broa Pastry by Sofía · versión {__VERSION__}</p>
    </>
  )
}

export function MiCuenta() {
  const navegar = useNavigate()
  const [listo, setListo] = useState(false)
  return (
    <>
      <Encabezado titulo="Mi cuenta" volver="/mas" />
      <SeccionFaceId />
      <SeccionNotificaciones />
      <h2 className="mt-6 mb-2 text-lg font-semibold">Cambiar contraseña</h2>
      {listo ? (
        <div className="space-y-4">
          <Aviso tipo="ok">Contraseña actualizada.</Aviso>
          <Boton icono={ICONOS.anterior} variante="secundario" onClick={() => navegar('/mas')}>
            Volver
          </Boton>
        </div>
      ) : (
        <FormCambiarClave alTerminar={() => setListo(true)} />
      )}
    </>
  )
}

type Permisos = {
  ver_costos: boolean
  editar_catalogo: boolean
  importar_ventas: boolean
  registrar_mermas: boolean
  gestionar_pedidos: boolean
  exportar: boolean
  editar_configuracion: boolean
  gestionar_finanzas: boolean
}

const TEXTO_PERMISO: Record<keyof Permisos, [string, string]> = {
  ver_costos: ['Ver costos y ganancia', 'Si lo apagas, verá solo ventas, como la encargada'],
  editar_catalogo: ['Editar productos y recetas', 'Crear productos, cambiar costos y precios de ingredientes'],
  importar_ventas: ['Importar ventas', 'Subir el Excel de influye.app y deshacer importaciones'],
  registrar_mermas: ['Registrar mermas', 'Anotar lo que se botó, regaló o venció'],
  gestionar_pedidos: ['Pedidos de tortas', 'Crear pedidos y registrar abonos'],
  exportar: ['Exportar reportes', 'Descargar Excel y PDF'],
  editar_configuracion: ['Cambiar configuración', 'IVA, turnos y tiempo de cierre de sesión'],
  gestionar_finanzas: ['Finanzas del mes', 'Gastos fijos (incluye sueldos), meta de ventas y ganancia real. Requiere ver costos'],
}

export function PermisosAdmin() {
  const [permisos, setPermisos] = useState<Permisos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('permisos_admin')
      .select('ver_costos, editar_catalogo, importar_ventas, registrar_mermas, gestionar_pedidos, exportar, editar_configuracion, gestionar_finanzas')
      .single()
      .then(({ data, error }) => (error ? setError(mensajeError(error)) : setPermisos(data)))
  }, [])

  async function cambiar(clave: keyof Permisos, valor: boolean) {
    if (!permisos) return
    const anterior = permisos
    setPermisos({ ...permisos, [clave]: valor })
    const { error } = await supabase.from('permisos_admin').update({ [clave]: valor }).eq('id', true)
    if (error) {
      setPermisos(anterior)
      setError(mensajeError(error))
    }
  }

  return (
    <>
      <Encabezado titulo="Permisos" volver="/mas" />
      <p className="mb-4 text-sm text-suave">
        Lo que puede hacer la <b>Administradora</b>. Los cambios se aplican de inmediato. Crear usuarios es siempre solo
        del Dueño.
      </p>
      {error && <Aviso>{error}</Aviso>}
      {permisos && (
        <Tarjeta className="divide-y divide-borde py-1">
          {(Object.keys(TEXTO_PERMISO) as (keyof Permisos)[]).map((k) => (
            <Interruptor
              key={k}
              etiqueta={TEXTO_PERMISO[k][0]}
              ayuda={TEXTO_PERMISO[k][1]}
              activo={permisos[k]}
              onCambio={(v) => cambiar(k, v)}
            />
          ))}
        </Tarjeta>
      )}
    </>
  )
}

export function ConfiguracionPagina() {
  const { config, puede, recargar } = useSesion()
  const [form, setForm] = useState<Configuracion | null>(config)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const editable = puede('editar_configuracion')

  useEffect(() => setForm(config), [config])
  if (!form) return null

  async function guardar() {
    if (!form) return
    setGuardando(true)
    setEstado(null)
    const { error } = await supabase
      .from('configuracion')
      .update({
        precios_incluyen_iva: form.precios_incluyen_iva,
        margen_sobre_neto: form.margen_sobre_neto,
        minutos_inactividad: Number(form.minutos_inactividad),
        hora_corte_turno: form.hora_corte_turno,
      })
      .eq('id', true)
    setGuardando(false)
    if (error) return setEstado({ tipo: 'error', texto: mensajeError(error) })
    await recargar()
    setEstado({ tipo: 'ok', texto: 'Configuración guardada.' })
  }

  return (
    <>
      <Encabezado titulo="Configuración" volver="/mas" />
      {!editable && (
        <div className="mb-4">
          <Aviso tipo="info">Solo puedes ver la configuración. Para cambiarla, habla con un dueño.</Aviso>
        </div>
      )}
      <div className="space-y-4">
        <Tarjeta className="divide-y divide-borde py-1">
          <Interruptor
            etiqueta="Los precios de venta incluyen IVA"
            ayuda="Así vienen en el Excel de influye.app"
            activo={form.precios_incluyen_iva}
            onCambio={(v) => setForm({ ...form, precios_incluyen_iva: v })}
            deshabilitado={!editable}
          />
          <Interruptor
            etiqueta="Calcular margen sobre precio neto"
            ayuda="Recomendado: Broa declara IVA, así que la ganancia real es sin IVA"
            activo={form.margen_sobre_neto}
            onCambio={(v) => setForm({ ...form, margen_sobre_neto: v })}
            deshabilitado={!editable || !form.precios_incluyen_iva}
          />
        </Tarjeta>
        <Tarjeta className="space-y-4">
          <Campo
            etiqueta="Hora de cambio de turno (AM → PM)"
            type="time"
            value={form.hora_corte_turno.slice(0, 5)}
            onChange={(e) => setForm({ ...form, hora_corte_turno: e.target.value })}
            disabled={!editable}
            ayuda="Las ventas antes de esta hora son del turno AM y las demás del PM"
          />
          <Campo
            etiqueta="Cerrar sesión tras minutos sin uso"
            type="number"
            inputMode="numeric"
            min={5}
            max={720}
            value={form.minutos_inactividad}
            onChange={(e) => setForm({ ...form, minutos_inactividad: Number(e.target.value) })}
            disabled={!editable}
            ayuda="Entre 5 y 720 minutos"
          />
        </Tarjeta>
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        {editable && (
          <Boton icono={ICONOS.guardar} onClick={guardar} cargando={guardando}>
            Guardar
          </Boton>
        )}
      </div>
    </>
  )
}
