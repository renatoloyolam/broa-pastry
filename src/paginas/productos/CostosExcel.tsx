import { useRef, useState } from 'react'
import { useConfirmar } from '../../componentes/Confirmar'
import { Aviso, Boton, Campo, Encabezado, Tarjeta } from '../../componentes/ui'
import { useCatalogo } from '../../lib/catalogo'
import { entregarArchivo } from '../../lib/exportar'
import { fechaDia, hoyIso, numero, pesos } from '../../lib/formato'
import { normalizar } from '../../lib/importador'
import { armarFilas, crearPlantillaExcel, leerPlantilla, type ResultadoPlantilla } from '../../lib/plantillaCostos'
import { sumarDias } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

export function CostosExcel() {
  const catalogo = useCatalogo()
  const { puede } = useSesion()
  const confirmar = useConfirmar()
  const hoy = hoyIso()
  const entrada = useRef<HTMLInputElement>(null)
  const [descargando, setDescargando] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [archivo, setArchivo] = useState('')
  const [resultado, setResultado] = useState<ResultadoPlantilla | null>(null)
  const [aplicados, setAplicados] = useState<number | null>(null)
  const [corregirDesde, setCorregirDesde] = useState('')
  const [corregido, setCorregido] = useState('')
  const [error, setError] = useState('')

  const filas = armarFilas(catalogo)
  const sinCosto = filas.filter((f) => f.estado === 'Sin costo').length

  async function descargar() {
    setError('')
    setDescargando(true)
    try {
      const blob = await crearPlantillaExcel(filas, fechaDia(hoy))
      await entregarArchivo(blob, `broa-plantilla-costos-${hoy}.xlsx`)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setDescargando(false)
    }
  }

  async function alElegir(f: File) {
    setError('')
    setResultado(null)
    setAplicados(null)
    setCorregido('')
    if (!/\.(xlsx|xls)$/i.test(f.name)) return setError('Ese archivo no es un Excel. Sube la plantilla descargada desde aquí.')
    setLeyendo(true)
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await f.arrayBuffer())
      const nombreHoja = libro.SheetNames.find((n) => normalizar(n) === 'costos') ?? libro.SheetNames[0]
      const tabla = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], { header: 1, raw: true, defval: '' }) as unknown[][]
      setArchivo(f.name)
      setResultado(leerPlantilla(tabla, filas))
    } catch {
      setError('No pudimos abrir el archivo. Revisa que sea la plantilla de costos en formato Excel.')
    } finally {
      setLeyendo(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function aplicar() {
    if (!resultado?.cambios.length) return
    if (
      !(await confirmar({
        mensaje: `¿Aplicar ${resultado.cambios.length} cambios de costo? Rigen desde hoy; las ventas anteriores conservan su costo.`,
        accion: 'Aplicar cambios',
      }))
    )
      return
    setAplicando(true)
    setError('')
    const { data, error } = await supabase.rpc('importar_costos', { p_filas: resultado.cambios.map((c) => c.enviar) })
    setAplicando(false)
    if (error) return setError(mensajeError(error))
    setAplicados(data as number)
    setResultado(null)
    await catalogo.recargar()
  }

  async function aplicarDesde() {
    setError('')
    const { error } = await supabase.rpc('aplicar_cambios_desde', { p_desde: corregirDesde })
    if (error) return setError(mensajeError(error))
    setCorregido(corregirDesde)
    await catalogo.recargar()
  }

  if (catalogo.cargando) return null

  return (
    <>
      <Encabezado titulo="Costos en Excel" volver="/productos" />
      <p className="mb-4 text-sm text-suave">
        Actualiza muchos costos a la vez: descarga la plantilla con todos los productos y opciones, complétala en Excel (en el
        computador es más cómodo) y súbela aquí.
      </p>

      <div className="space-y-4">
        <Tarjeta className="space-y-2">
          <p className="font-semibold">1. Descargar plantilla</p>
          <p className="text-sm text-suave">
            {numero(filas.length)} filas (productos y opciones) con sus costos actuales.
            {sinCosto > 0 && ` ${numero(sinCosto)} aún no tienen costo.`} Trae instrucciones en la primera hoja.
          </p>
          <Boton onClick={descargar} cargando={descargando}>
            Descargar plantilla
          </Boton>
        </Tarjeta>

        {puede('editar_catalogo') ? (
          <Tarjeta className="space-y-2">
            <p className="font-semibold">2. Subir plantilla completada</p>
            <p className="text-sm text-suave">Antes de guardar verás qué costos cambian. Nada se modifica hasta que confirmes.</p>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && alElegir(e.target.files[0])}
            />
            <Boton variante="secundario" onClick={() => entrada.current?.click()} cargando={leyendo}>
              Subir plantilla
            </Boton>
          </Tarjeta>
        ) : (
          <Aviso tipo="info">Para subir costos necesitas el permiso "Editar productos y recetas".</Aviso>
        )}

        {error && <Aviso>{error}</Aviso>}

        {resultado && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Revisión de {archivo}</h2>
            <p className="text-sm text-suave">
              {numero(resultado.filasLeidas)} filas leídas · {numero(resultado.cambios.length)} con cambios ·{' '}
              {numero(resultado.sinCambios)} sin cambios
              {resultado.errores.length > 0 && ` · ${numero(resultado.errores.length)} con problemas`}
            </p>

            {resultado.errores.length > 0 && (
              <details open className="rounded-2xl border border-aviso/40 bg-superficie p-4">
                <summary className="cursor-pointer font-semibold text-aviso">
                  Filas con problemas (no se cargarán; corrígelas y vuelve a subir si quieres)
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {resultado.errores.slice(0, 50).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                  {resultado.errores.length > 50 && <li>…y {resultado.errores.length - 50} más</li>}
                </ul>
              </details>
            )}

            {resultado.cambios.length === 0 ? (
              <Aviso tipo="info">No hay costos distintos a los que ya están en la app.</Aviso>
            ) : (
              <>
                <ul className="max-h-[50vh] divide-y divide-borde overflow-y-auto rounded-2xl border border-borde bg-superficie">
                  {resultado.cambios.map((c) => (
                    <li key={c.codigo} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                      <span className="cifra shrink-0 text-suave">{c.antes == null ? 'sin costo' : pesos(c.antes)}</span>
                      <span aria-hidden>→</span>
                      <span className="cifra shrink-0 font-semibold">{pesos(c.despues)}</span>
                    </li>
                  ))}
                </ul>
                <Boton onClick={aplicar} cargando={aplicando} className="min-h-14">
                  Aplicar {numero(resultado.cambios.length)} cambios
                </Boton>
              </>
            )}
          </section>
        )}

        {aplicados != null && (
          <Aviso tipo="ok">
            <p>Listo: se actualizaron {numero(aplicados)} costos. Rigen desde hoy; los que no tenían costo se aplican también a ventas anteriores.</p>
            {!corregido && (
              <details className="mt-2 text-texto">
                <summary className="cursor-pointer font-semibold text-primario">¿Corregían errores? Aplicar desde una fecha anterior</summary>
                <div className="mt-3 space-y-2">
                  <Campo
                    etiqueta="Los costos correctos rigen desde"
                    type="date"
                    value={corregirDesde}
                    max={sumarDias(hoy, -1)}
                    onChange={(e) => setCorregirDesde(e.target.value)}
                    ayuda="Se aplica a todos los costos que cambiaron hoy."
                  />
                  <Boton variante="secundario" disabled={!corregirDesde} onClick={aplicarDesde}>
                    Aplicar desde esa fecha
                  </Boton>
                </div>
              </details>
            )}
            {corregido && <p className="mt-2">Los costos rigen desde el {fechaDia(corregido)}.</p>}
          </Aviso>
        )}
      </div>
    </>
  )
}
