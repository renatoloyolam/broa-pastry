// Pantallas que aún no tienen contenido propio; se llenan en las fases siguientes.
import { Encabezado, EstadoVacio } from '../componentes/ui'

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
