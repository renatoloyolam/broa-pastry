import { useMemo, useState } from 'react'
import { Aviso, Boton, Campo, Encabezado, Tarjeta } from '../../componentes/ui'
import {
  aCsv,
  crearExcel,
  crearPdf,
  entregarArchivo,
  hojaVentas,
  hojasReporte,
  nombreArchivo,
  type ReporteMermasExport,
  type VentaExportada,
} from '../../lib/exportar'
import { fechaDia, hoyIso, numero } from '../../lib/formato'
import type { DatosPanel } from '../../lib/panel'
import { calcularPeriodo, calcularRango, moverAncla, type TipoPeriodo } from '../../lib/periodos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

type Formato = 'excel' | 'pdf' | 'csv'

export function Exportar() {
  const { puede } = useSesion()
  const hoy = hoyIso()
  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [ancla, setAncla] = useState(hoy)
  const [rango, setRango] = useState({ desde: hoy.slice(0, 8) + '01', hasta: hoy })
  const [trabajando, setTrabajando] = useState<Formato | null>(null)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const periodo = useMemo(
    () => (tipo === 'rango' ? calcularRango(rango.desde, rango.hasta) : calcularPeriodo(tipo, ancla, hoy)),
    [tipo, ancla, rango, hoy],
  )

  async function exportar(formato: Formato) {
    setEstado(null)
    setTrabajando(formato)
    try {
      const pedirMermas = puede('registrar_mermas') || puede('ver_costos')
      const [p, m, v] = await Promise.all([
        supabase.rpc('panel', { p_desde: periodo.desde, p_hasta: periodo.hasta, p_desde_ant: null, p_hasta_ant: null }),
        pedirMermas ? supabase.rpc('reporte_mermas', { p_desde: periodo.desde, p_hasta: periodo.hasta }) : Promise.resolve({ data: null, error: null }),
        formato !== 'pdf' ? supabase.rpc('exportar_ventas', { p_desde: periodo.desde, p_hasta: periodo.hasta }) : Promise.resolve({ data: null, error: null }),
      ])
      const err = p.error ?? m.error ?? v.error
      if (err) throw err
      const panel = p.data as DatosPanel
      const ventas = (v.data as VentaExportada[] | null) ?? null
      if (panel.resumen.transacciones === 0 && !ventas?.length) {
        setEstado({ tipo: 'error', texto: 'No hay ventas importadas en ese período.' })
        return
      }
      const mermas = m.data as ReporteMermasExport | null
      const subtitulo = `${periodo.desde === periodo.hasta ? fechaDia(periodo.desde) : `${fechaDia(periodo.desde)} al ${fechaDia(periodo.hasta)}`} · generado el ${fechaDia(hoy)}`

      if (formato === 'csv') {
        const csv = aCsv(hojaVentas(ventas ?? []))
        await entregarArchivo(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nombreArchivo('ventas', periodo, 'csv'))
      } else if (formato === 'excel') {
        const blob = await crearExcel(hojasReporte(periodo, panel, mermas, ventas))
        await entregarArchivo(blob, nombreArchivo('reporte', periodo, 'xlsx'))
      } else {
        const hojas = hojasReporte(periodo, panel, mermas, null).map((h) =>
          h.nombre === 'Productos' ? { ...h, nombre: 'Productos (más vendidos)' } : h,
        )
        const blob = await crearPdf('Broa Pastry · Resumen', subtitulo, hojas)
        await entregarArchivo(blob, nombreArchivo('resumen', periodo, 'pdf'))
      }
      setEstado({ tipo: 'ok', texto: 'Archivo listo.' })
    } catch (e) {
      setEstado({ tipo: 'error', texto: mensajeError(e) })
    } finally {
      setTrabajando(null)
    }
  }

  return (
    <>
      <Encabezado titulo="Exportar" volver="/mas" />
      <p className="mb-4 text-sm text-suave">
        Descarga reportes para revisar, compartir o enviar al contador. En el iPhone se abre el menú Compartir: puedes guardar en
        Archivos o enviarlo por WhatsApp o correo.
        {!puede('ver_costos') && ' Tus reportes no incluyen costos ni ganancia.'}
      </p>

      <div className="mb-3 flex gap-1 rounded-2xl bg-superficie-2 p-1">
        {(['dia', 'semana', 'mes', 'rango'] as TipoPeriodo[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={tipo === v}
            onClick={() => setTipo(v)}
            className={`min-h-10 flex-1 rounded-xl text-sm font-semibold ${tipo === v ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {{ dia: 'Día', semana: 'Semana', mes: 'Mes', rango: 'Rango' }[v]}
          </button>
        ))}
      </div>
      {tipo === 'rango' ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Campo etiqueta="Desde" type="date" value={rango.desde} max={hoy} onChange={(e) => e.target.value && setRango({ ...rango, desde: e.target.value })} />
          <Campo etiqueta="Hasta" type="date" value={rango.hasta} max={hoy} onChange={(e) => e.target.value && setRango({ ...rango, hasta: e.target.value })} />
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2">
          <button type="button" aria-label="Anterior" onClick={() => setAncla(moverAncla(tipo, ancla, -1))} className="h-11 w-11 rounded-full text-2xl text-primario">
            ‹
          </button>
          <p className="flex-1 text-center font-semibold">{periodo.etiqueta}</p>
          <button
            type="button"
            aria-label="Siguiente"
            disabled={periodo.hasta >= hoy}
            onClick={() => setAncla(moverAncla(tipo, ancla, 1))}
            className="h-11 w-11 rounded-full text-2xl text-primario disabled:opacity-25"
          >
            ›
          </button>
        </div>
      )}

      <div className="space-y-3">
        <Tarjeta className="space-y-2">
          <p className="font-semibold">Excel completo</p>
          <p className="text-sm text-suave">
            Resumen, ventas por día, productos, categorías, turnos{puede('ver_costos') || puede('registrar_mermas') ? ', mermas' : ''} y el
            detalle de cada venta.
          </p>
          <Boton onClick={() => exportar('excel')} cargando={trabajando === 'excel'} disabled={trabajando != null}>
            Descargar Excel
          </Boton>
        </Tarjeta>
        <Tarjeta className="space-y-2">
          <p className="font-semibold">Resumen en PDF</p>
          <p className="text-sm text-suave">Para leer o imprimir: indicadores, días, productos y mermas.</p>
          <Boton variante="secundario" onClick={() => exportar('pdf')} cargando={trabajando === 'pdf'} disabled={trabajando != null}>
            Descargar PDF
          </Boton>
        </Tarjeta>
        <Tarjeta className="space-y-2">
          <p className="font-semibold">Ventas para el contador (CSV)</p>
          <p className="text-sm text-suave">Una fila por boleta: fecha, hora, medio de pago, total, neto e IVA.</p>
          <Boton variante="secundario" onClick={() => exportar('csv')} cargando={trabajando === 'csv'} disabled={trabajando != null}>
            Descargar CSV
          </Boton>
        </Tarjeta>
        {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
        <p className="text-xs text-suave">
          Período: {periodo.desde === periodo.hasta ? fechaDia(periodo.desde) : `${fechaDia(periodo.desde)} al ${fechaDia(periodo.hasta)}`} ·{' '}
          {numero(Math.round((Date.parse(periodo.hasta) - Date.parse(periodo.desde)) / 86400000) + 1)} días
        </p>
      </div>
    </>
  )
}
