import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mensajeError, supabase } from '../lib/supabase'
import { NOMBRE_ROL, useSesion, type Configuracion } from '../sesion/SesionProvider'
import { Aviso, Boton, Campo, Encabezado, Interruptor, Tarjeta } from '../componentes/ui'
import { FormCambiarClave } from './Acceso'

function Fila({ a, titulo, detalle }: { a: string; titulo: string; detalle?: string }) {
  return (
    <Link to={a} className="flex min-h-14 items-center gap-3 px-4 py-3 active:bg-superficie-2">
      <span className="flex-1">
        <span className="block font-medium">{titulo}</span>
        {detalle && <span className="block text-xs text-suave">{detalle}</span>}
      </span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-suave" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

function Grupo({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
      {children}
    </div>
  )
}

export function Mas() {
  const { info, puede, salir } = useSesion()
  const perfil = info?.perfil
  return (
    <>
      <Encabezado titulo="Más" />
      <Tarjeta className="mb-4">
        <p className="font-semibold">{perfil?.nombre}</p>
        <p className="text-sm text-suave">
          {perfil?.email} · {perfil && NOMBRE_ROL[perfil.rol]}
        </p>
      </Tarjeta>
      <Grupo>
        <Fila a="/mas/cuenta" titulo="Mi cuenta" detalle="Cambiar contraseña" />
      </Grupo>
      {(puede('gestionar_usuarios') || perfil?.rol === 'dueno' || puede('editar_configuracion')) && (
        <Grupo>
          {puede('gestionar_usuarios') && <Fila a="/mas/usuarios" titulo="Usuarios" detalle="Crear cuentas y roles" />}
          {perfil?.rol === 'dueno' && (
            <Fila a="/mas/permisos" titulo="Permisos de la administradora" detalle="Qué puede ver y hacer" />
          )}
          {(puede('editar_configuracion') || perfil?.rol === 'admin') && (
            <Fila a="/mas/configuracion" titulo="Configuración" detalle="IVA, turnos y cierre de sesión" />
          )}
        </Grupo>
      )}
      <Boton variante="peligro" onClick={salir}>
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
      {listo ? (
        <div className="space-y-4">
          <Aviso tipo="ok">Contraseña actualizada.</Aviso>
          <Boton variante="secundario" onClick={() => navegar('/mas')}>
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
}

const TEXTO_PERMISO: Record<keyof Permisos, [string, string]> = {
  ver_costos: ['Ver costos y ganancia', 'Si lo apagas, verá solo ventas, como la encargada'],
  editar_catalogo: ['Editar productos y recetas', 'Crear productos, cambiar costos y precios de ingredientes'],
  importar_ventas: ['Importar ventas', 'Subir el Excel de influye.app y deshacer importaciones'],
  registrar_mermas: ['Registrar mermas', 'Anotar lo que se botó, regaló o venció'],
  gestionar_pedidos: ['Pedidos de tortas', 'Crear pedidos y registrar abonos'],
  exportar: ['Exportar reportes', 'Descargar Excel y PDF'],
  editar_configuracion: ['Cambiar configuración', 'IVA, turnos y tiempo de cierre de sesión'],
}

export function PermisosAdmin() {
  const [permisos, setPermisos] = useState<Permisos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('permisos_admin')
      .select('ver_costos, editar_catalogo, importar_ventas, registrar_mermas, gestionar_pedidos, exportar, editar_configuracion')
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
          <Boton onClick={guardar} cargando={guardando}>
            Guardar
          </Boton>
        )}
      </div>
    </>
  )
}
