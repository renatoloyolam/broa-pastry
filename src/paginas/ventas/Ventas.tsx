import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fechaDia, fechaHora, nombreDia, numero, pesos } from '../../lib/formato'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'
import { Aviso, Encabezado, EstadoVacio, Insignia, Tarjeta } from '../../componentes/ui'
import { useConfirmar } from '../../componentes/Confirmar'

interface Dia {
  fecha: string
  transacciones: number
  ventas: number
  abonos: number
  unidades: number
}

interface Importacion {
  id: number
  archivo: string
  subido_en: string
  desde: string | null
  hasta: string | null
  transacciones_nuevas: number
  transacciones_repetidas: number
  lineas: number
  filas_con_error: number
  estado: 'en_proceso' | 'completa' | 'deshecha'
}

export function Ventas() {
  const { puede } = useSesion()
  const confirmar = useConfirmar()
  const [dias, setDias] = useState<Dia[]>([])
  const [importaciones, setImportaciones] = useState<Importacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const [d, i] = await Promise.all([
      supabase.from('v_ventas_dia').select('*').order('fecha', { ascending: false }).limit(62),
      supabase.from('importaciones').select('*').order('subido_en', { ascending: false }).limit(20),
    ])
    if (d.error || i.error) setError(mensajeError(d.error ?? i.error))
    else {
      setDias((d.data as Dia[]).map((x) => ({ ...x, ventas: Number(x.ventas), abonos: Number(x.abonos) })))
      setImportaciones(i.data as Importacion[])
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function deshacer(imp: Importacion) {
    const periodo = imp.desde ? `${fechaDia(imp.desde)}${imp.hasta !== imp.desde ? ` al ${fechaDia(imp.hasta!)}` : ''}` : ''
    if (!(await confirmar({ mensaje: `¿Deshacer "${imp.archivo}" (${periodo})? Se borrarán las ${numero(imp.transacciones_nuevas)} transacciones que trajo. Luego puedes volver a importarlo.`, accion: 'Deshacer importación', peligro: true }))) return
    setError('')
    const { data, error } = await supabase.rpc('deshacer_importacion', { p_id: imp.id })
    if (error) return setError(mensajeError(error))
    setAviso(`Listo: se borraron ${numero(data as number)} transacciones.`)
    await cargar()
  }

  const ultimaFecha = dias[0]?.fecha

  return (
    <>
      <Encabezado titulo="Ventas" />

      {puede('importar_ventas') && (
        <Link
          to="/ventas/importar"
          className="mb-4 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primario text-lg font-semibold text-primario-texto"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
          </svg>
          Importar Excel de influye
        </Link>
      )}

      {error && <Aviso>{error}</Aviso>}
      {aviso && (
        <div className="mb-4">
          <Aviso tipo="ok">{aviso}</Aviso>
        </div>
      )}

      {!cargando && dias.length === 0 && (
        <EstadoVacio icono="📄" titulo="Aún no hay ventas importadas">
          {puede('importar_ventas')
            ? 'Exporta el Excel de Transacciones desde influye.app y súbelo con el botón de arriba.'
            : 'Cuando un dueño o la administradora suba el Excel de influye.app, verás aquí las ventas.'}
        </EstadoVacio>
      )}

      {dias.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Por día</h2>
          {ultimaFecha && <p className="mb-2 text-sm text-suave">Último día importado: {fechaDia(ultimaFecha)}</p>}
          <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">
            {dias.map((d) => (
              <li key={d.fecha} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <span className="flex-1">
                  <span className="block font-medium capitalize">
                    {nombreDia(d.fecha)} {fechaDia(d.fecha)}
                  </span>
                  <span className="block text-xs text-suave">
                    {numero(d.transacciones)} transacciones · {numero(d.unidades)} productos
                    {d.abonos > 0 && ` · abonos ${pesos(d.abonos)}`}
                  </span>
                </span>
                <span className="cifra text-lg font-semibold">{pesos(d.ventas)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {importaciones.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Importaciones</h2>
          <div className="space-y-2">
            {importaciones.map((imp) => (
              <Tarjeta key={imp.id} className={`p-3 ${imp.estado === 'deshecha' ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{imp.archivo}</p>
                    <p className="text-xs text-suave">
                      Subido {fechaHora(imp.subido_en)}
                      {imp.desde && ` · ventas ${fechaDia(imp.desde)}${imp.hasta !== imp.desde ? ` al ${fechaDia(imp.hasta!)}` : ''}`}
                    </p>
                    <p className="text-xs text-suave">
                      {numero(imp.transacciones_nuevas)} nuevas · {numero(imp.transacciones_repetidas)} repetidas
                      {imp.filas_con_error > 0 && ` · ${numero(imp.filas_con_error)} con error`}
                    </p>
                  </div>
                  {imp.estado === 'deshecha' && <Insignia clase="bg-superficie-2 text-suave">Deshecha</Insignia>}
                  {imp.estado === 'en_proceso' && <Insignia clase="bg-aviso/15 text-aviso">Incompleta</Insignia>}
                </div>
                {puede('importar_ventas') && imp.estado !== 'deshecha' && (
                  <button
                    type="button"
                    onClick={() => deshacer(imp)}
                    className="mt-2 min-h-10 text-sm font-semibold text-peligro"
                  >
                    Deshacer esta importación
                  </button>
                )}
              </Tarjeta>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
