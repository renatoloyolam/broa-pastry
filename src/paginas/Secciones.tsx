// Pantallas principales. En la Fase 1 muestran guías de qué viene;
// se llenan con datos en las fases siguientes.
import { fecha } from '../lib/formato'
import { useSesion } from '../sesion/SesionProvider'
import { Encabezado, EstadoVacio, Tarjeta } from '../componentes/ui'

function Indicador({ titulo, destacado = false }: { titulo: string; destacado?: boolean }) {
  return (
    <Tarjeta className={destacado ? 'col-span-2 border-primario/30' : ''}>
      <p className="text-xs font-medium tracking-wide text-suave uppercase">{titulo}</p>
      <p className={`cifra mt-1 font-bold ${destacado ? 'text-4xl text-primario' : 'text-2xl'}`}>—</p>
    </Tarjeta>
  )
}

export function Inicio() {
  const { info, puede } = useSesion()
  const primerNombre = info?.perfil?.nombre.split(' ')[0]
  return (
    <>
      <Encabezado titulo={`Hola, ${primerNombre}`} />
      <p className="-mt-3 mb-5 text-sm text-suave">Hoy · {fecha(new Date())}</p>
      <div className="grid grid-cols-2 gap-3">
        {puede('ver_costos') ? (
          <>
            <Indicador titulo="Ganancia" destacado />
            <Indicador titulo="Ventas" />
            <Indicador titulo="Margen" />
            <Indicador titulo="Costo de lo vendido" />
            <Indicador titulo="Mermas" />
          </>
        ) : (
          <>
            <Indicador titulo="Ventas" destacado />
            <Indicador titulo="Transacciones" />
            <Indicador titulo="Más vendido" />
          </>
        )}
      </div>
      <EstadoVacio icono="🥐" titulo="Todavía no hay ventas">
        Cuando se importe el Excel de influye.app, aquí verás las cifras del día. El importador llega en la Fase 3.
      </EstadoVacio>
    </>
  )
}

export function Ventas() {
  return (
    <>
      <Encabezado titulo="Ventas" />
      <EstadoVacio icono="📄" titulo="Aún no hay ventas importadas">
        Pronto podrás subir aquí el Excel que exportas desde influye.app, desde el celular o el computador.
      </EstadoVacio>
    </>
  )
}

export function Mermas() {
  return (
    <>
      <Encabezado titulo="Mermas" />
      <EstadoVacio icono="🗑️" titulo="Sin mermas registradas">
        Aquí registrarás en segundos lo que se botó, regaló o venció al final del día.
      </EstadoVacio>
    </>
  )
}
