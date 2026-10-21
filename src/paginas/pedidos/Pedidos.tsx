import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Encabezado, EstadoVacio, Insignia, Tarjeta } from '../../componentes/ui'
import { hoyIso, numero, pesos } from '../../lib/formato'
import { cuandoEntrega, estadoPago, type PedidoLista } from '../../lib/pedidos'
import { mensajeError, supabase } from '../../lib/supabase'
import { useSesion } from '../../sesion/SesionProvider'

type Filtro = 'proximos' | 'saldo' | 'entregados' | 'cancelados'
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'proximos', texto: 'Por entregar' },
  { valor: 'saldo', texto: 'Con saldo' },
  { valor: 'entregados', texto: 'Entregados' },
  { valor: 'cancelados', texto: 'Cancelados' },
]

export function Pedidos() {
  const { puede } = useSesion()
  const hoy = hoyIso()
  const [filtro, setFiltro] = useState<Filtro>('proximos')
  const [pedidos, setPedidos] = useState<PedidoLista[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setPedidos(null)
    supabase.rpc('lista_pedidos', { p_filtro: filtro }).then(({ data, error }) => {
      if (!vivo) return
      if (error) setError(mensajeError(error))
      else setPedidos(data as PedidoLista[])
    })
    return () => {
      vivo = false
    }
  }, [filtro])

  const saldoTotal = (pedidos ?? []).reduce((s, p) => s + Math.max(0, p.saldo), 0)

  return (
    <>
      <Encabezado titulo="Pedidos" volver="/mas" />
      <Link
        to="/pedidos/nuevo"
        className="mb-4 flex min-h-14 items-center justify-center rounded-2xl bg-primario text-lg font-semibold text-primario-texto"
      >
        + Nuevo pedido
      </Link>

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-superficie-2 p-1">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            aria-pressed={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`min-h-10 rounded-xl text-xs font-semibold ${filtro === f.valor ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {error && <Aviso>{error}</Aviso>}

      {pedidos && pedidos.length > 0 && (filtro === 'proximos' || filtro === 'saldo') && (
        <p className="mb-3 text-sm text-suave">
          {numero(pedidos.length)} pedidos · saldo por cobrar <b className="cifra text-texto">{pesos(saldoTotal)}</b>
        </p>
      )}

      {pedidos && pedidos.length === 0 && (
        <EstadoVacio icono="🎂" titulo={filtro === 'proximos' ? 'No hay pedidos por entregar' : 'No hay pedidos aquí'}>
          {filtro === 'proximos' ? 'Cuando alguien encargue una torta, anótala con "Nuevo pedido" para no olvidar la fecha ni el saldo.' : ''}
        </EstadoVacio>
      )}

      <div className="space-y-2">
        {(pedidos ?? []).map((p) => {
          const cuando = cuandoEntrega(p.fecha_entrega, hoy)
          const pago = estadoPago(p)
          return (
            <Link key={p.id} to={`/pedidos/${p.id}`} className="block">
              <Tarjeta className={`active:bg-superficie-2 ${cuando.atrasado && p.estado === 'pendiente' ? 'border-peligro/50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold capitalize ${
                        p.estado !== 'pendiente' ? 'text-suave' : cuando.atrasado ? 'text-peligro' : cuando.urgente ? 'text-aviso' : 'text-suave'
                      }`}
                    >
                      {cuando.texto}
                      {p.hora_entrega && ` · ${p.hora_entrega}`}
                    </p>
                    <p className="truncate text-lg font-semibold">{p.cliente}</p>
                    <p className="line-clamp-2 text-sm text-suave">{p.descripcion}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="cifra font-semibold">{pesos(p.precio_total)}</p>
                    {pago === 'pagado' ? (
                      <Insignia clase="bg-exito/15 text-exito">Pagado</Insignia>
                    ) : (
                      <p className="cifra text-xs text-suave">
                        saldo <b className={p.estado === 'pendiente' ? 'text-texto' : ''}>{pesos(p.saldo)}</b>
                      </p>
                    )}
                    {puede('ver_costos') && p.ganancia_esperada != null && (
                      <p className="cifra text-xs text-suave">gana {pesos(p.ganancia_esperada)}</p>
                    )}
                  </div>
                </div>
              </Tarjeta>
            </Link>
          )
        })}
      </div>
      <p className="mt-4 text-xs text-suave">
        Los abonos y saldos se cobran en influye, así que estos pedidos no se suman otra vez a las ventas del panel.
      </p>
    </>
  )
}
