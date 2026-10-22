import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Aviso, Campo, Encabezado, Selector, Tarjeta } from '../../componentes/ui'
import { decimal, fechaDia, hoyIso, leerNumero, numero, pesos, porcentaje } from '../../lib/formato'
import { precioRedondo, type DatosMapa, type ProductoMapa } from '../../lib/mapa'
import { diasEntre, sumarDias } from '../../lib/periodos'
import { baseDe, precioParaMargen, simular, simularGrupo, type Base } from '../../lib/simulador'
import { mensajeError, supabase } from '../../lib/supabase'

const DIAS = 90

export function Simulador() {
  const hoy = hoyIso()
  const desde = sumarDias(hoy, -(DIAS - 1))
  const [params] = useSearchParams()
  const [modo, setModo] = useState<'producto' | 'categoria'>(params.get('categoria') ? 'categoria' : 'producto')
  const [d, setD] = useState<DatosMapa | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.rpc('mapa_productos', { p_desde: desde, p_hasta: hoy }).then(({ data, error }) => {
      if (error) setError(mensajeError(error))
      else setD(data as DatosMapa)
    })
  }, [desde, hoy])

  const productos = useMemo(
    () => (d?.productos ?? []).filter((p) => p.completo && p.unidades > 0).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [d],
  )
  const diasPeriodo = d?.ultimo_dia ? diasEntre(desde, d.ultimo_dia) + 1 : DIAS

  return (
    <>
      <Encabezado titulo="Simulador" volver="/productos/mapa" />
      <p className="mb-3 text-sm text-suave">
        Prueba precios antes de cambiarlos en influye. Usa lo vendido en los últimos {DIAS} días
        {d?.ultimo_dia && ` (hasta el ${fechaDia(d.ultimo_dia)})`}, llevado a un mes.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-superficie-2 p-1">
        {(
          [
            ['producto', 'Un producto'],
            ['categoria', 'Una categoría'],
          ] as const
        ).map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setModo(valor)}
            className={`min-h-10 rounded-xl text-sm font-semibold ${modo === valor ? 'bg-superficie text-primario shadow-sm' : 'text-suave'}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {error && <Aviso>{error}</Aviso>}
      {!d && !error && <p className="py-10 text-center text-suave">Cargando…</p>}
      {d && productos.length === 0 && <Aviso tipo="info">No hay productos con costo completo vendidos en este período.</Aviso>}
      {d && productos.length > 0 &&
        (modo === 'producto' ? (
          <UnProducto productos={productos} diasPeriodo={diasPeriodo} divisor={Number(d.divisor)} inicial={Number(params.get('p')) || null} />
        ) : (
          <UnaCategoria productos={productos} diasPeriodo={diasPeriodo} divisor={Number(d.divisor)} inicial={params.get('categoria') ?? ''} />
        ))}
      <p className="mt-4 text-xs text-suave">
        El simulador no cambia ningún precio: si te convence, cámbialo en influye. Los productos sin costo completo no aparecen.
      </p>
    </>
  )
}

function Caida({ valor, onCambio }: { valor: number; onCambio: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-sm font-medium text-suave">
        <span>Si las ventas bajan</span>
        <span className="cifra font-semibold text-texto">{valor}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={30}
        step={5}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        className="w-full accent-[var(--primario)]"
      />
      <span className="flex justify-between text-[11px] text-suave">
        <span>Se venden igual</span>
        <span>30% menos</span>
      </span>
    </label>
  )
}

function Comparacion({ etiqueta, hoy, nuevo, formato = pesos }: { etiqueta: string; hoy: number | null; nuevo: number | null; formato?: (v: number | null) => string }) {
  const sube = hoy != null && nuevo != null && nuevo > hoy + 0.5
  const baja = hoy != null && nuevo != null && nuevo < hoy - 0.5
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-suave">{etiqueta}</span>
      <span className="cifra text-right">
        <span className="text-suave">{formato(hoy)}</span>
        <span aria-hidden> → </span>
        <b className={sube ? 'text-exito' : baja ? 'text-peligro' : ''}>{formato(nuevo)}</b>
      </span>
    </div>
  )
}

function UnProducto({ productos, diasPeriodo, divisor, inicial }: { productos: ProductoMapa[]; diasPeriodo: number; divisor: number; inicial: number | null }) {
  const [id, setId] = useState<number>(productos.some((p) => p.id === inicial) ? inicial! : productos[0].id)
  const producto = productos.find((p) => p.id === id)!
  const base: Base = useMemo(() => baseDe(producto, diasPeriodo, divisor), [producto, diasPeriodo, divisor])
  const [precioTexto, setPrecioTexto] = useState('')
  const [costoTexto, setCostoTexto] = useState('')
  const [caida, setCaida] = useState(0)

  useEffect(() => {
    setPrecioTexto(numero(precioRedondo(base.precio)))
    setCostoTexto(decimal(base.costo, 0))
    setCaida(0)
  }, [base])

  const precio = leerNumero(precioTexto) ?? base.precio
  const costo = leerNumero(costoTexto) ?? base.costo
  const s = simular(base, precio, costo, caida / 100)
  const categorias = [...new Set(productos.map((p) => p.categoria))].sort()

  return (
    <div className="space-y-4">
      <Selector etiqueta="Producto" value={id} onChange={(e) => setId(Number(e.target.value))}>
        {categorias.map((c) => (
          <optgroup key={c} label={c}>
            {productos
              .filter((p) => p.categoria === c)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </optgroup>
        ))}
      </Selector>

      <Tarjeta className="space-y-1 text-sm">
        <p className="mb-1 font-semibold">Hoy</p>
        <Fila etiqueta="Precio promedio cobrado" valor={pesos(base.precio)} />
        <Fila etiqueta="Costo por unidad (sin IVA)" valor={pesos(base.costo)} />
        <Fila etiqueta="Margen" valor={porcentaje(s.hoy.margen, 0)} />
        <Fila etiqueta="Se venden al mes" valor={`~${numero(Math.round(base.unidadesMes))}`} />
        <Fila etiqueta="Ganancia al mes" valor={pesos(s.hoy.gananciaMes)} fuerte />
      </Tarjeta>

      <Tarjeta className="space-y-3">
        <Campo etiqueta="Nuevo precio (con IVA)" inputMode="numeric" value={precioTexto} onChange={(e) => setPrecioTexto(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {[0.05, 0.1, 0.15].map((x) => (
            <Chip key={x} onClick={() => setPrecioTexto(numero(precioRedondo(base.precio * (1 + x))))}>
              +{x * 100}%
            </Chip>
          ))}
          {[0.5, 0.6, 0.7]
            .map((m) => [m, precioParaMargen(costo, m, divisor)] as const)
            .filter(([, p]) => p != null && p > base.precio * 0.9)
            .map(([m, p]) => (
              <Chip key={m} onClick={() => setPrecioTexto(numero(p!))}>
                Margen {m * 100}%: {pesos(p)}
              </Chip>
            ))}
        </div>
        <Campo
          etiqueta="Costo por unidad (sin IVA)"
          inputMode="numeric"
          value={costoTexto}
          onChange={(e) => setCostoTexto(e.target.value)}
          ayuda="Cámbialo para ver qué pasa si sube un ingrediente o si achicas la porción."
        />
        <Caida valor={caida} onCambio={setCaida} />
      </Tarjeta>

      <Tarjeta className="space-y-2">
        <p className="font-semibold">Con el cambio</p>
        <Comparacion etiqueta="Precio" hoy={base.precio} nuevo={precio} />
        <Comparacion etiqueta="Margen" hoy={s.hoy.margen} nuevo={s.nuevo.margen} formato={(v) => porcentaje(v, 0)} />
        <Comparacion etiqueta="Unidades al mes" hoy={Math.round(s.hoy.unidades)} nuevo={Math.round(s.nuevo.unidades)} formato={(v) => numero(v)} />
        <Comparacion etiqueta="Ventas al mes" hoy={s.hoy.ventasMes} nuevo={s.nuevo.ventasMes} />
        <div className="flex items-baseline justify-between border-t border-borde pt-2">
          <span className="font-semibold">Ganancia al mes</span>
          <span className="text-right">
            <span className="cifra block text-xl font-bold">{pesos(s.nuevo.gananciaMes)}</span>
            <span className={`cifra block text-sm font-semibold ${s.diferenciaMes >= 0 ? 'text-exito' : 'text-peligro'}`}>
              {s.diferenciaMes >= 0 ? '+' : ''}
              {pesos(s.diferenciaMes)} al mes
            </span>
          </span>
        </div>
        <Conclusion s={s} />
      </Tarjeta>
    </div>
  )
}

function Conclusion({ s }: { s: ReturnType<typeof simular> }) {
  if (s.nuevo.gananciaUnidad <= 0)
    return <Aviso>Con ese precio y costo, cada unidad pierde plata.</Aviso>
  const t = s.cambioVentasTolerable
  if (t == null || Math.abs(t) < 0.005) return null
  return t < 0 ? (
    <p className="rounded-xl bg-exito/10 px-3 py-2 text-sm text-exito">
      Aunque vendas hasta <b>{porcentaje(-t, 0)} menos</b>, ganas lo mismo que hoy.
    </p>
  ) : (
    <p className="rounded-xl bg-aviso/10 px-3 py-2 text-sm text-aviso">
      Para ganar lo mismo que hoy tendrías que vender <b>{porcentaje(t, 0)} más</b>.
    </p>
  )
}

function UnaCategoria({ productos, diasPeriodo, divisor, inicial }: { productos: ProductoMapa[]; diasPeriodo: number; divisor: number; inicial: string }) {
  const categorias = [...new Set(productos.map((p) => p.categoria))].sort()
  const [categoria, setCategoria] = useState(categorias.includes(inicial) ? inicial : categorias[0])
  const [subida, setSubida] = useState(10)
  const [caida, setCaida] = useState(0)
  const g = simularGrupo(
    productos.filter((p) => p.categoria === categoria),
    diasPeriodo,
    divisor,
    subida / 100,
    caida / 100,
  )
  const diferencia = g.gananciaNueva - g.gananciaHoy

  return (
    <div className="space-y-4">
      <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        {categorias.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Selector>
      <Tarjeta className="space-y-3">
        <div>
          <p className="mb-1.5 text-sm font-medium text-suave">Subir todos los precios</p>
          <div className="grid grid-cols-4 gap-2">
            {[3, 5, 10, 15].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setSubida(x)}
                className={`min-h-11 rounded-xl border text-sm font-semibold ${subida === x ? 'border-primario bg-primario text-primario-texto' : 'border-borde'}`}
              >
                +{x}%
              </button>
            ))}
          </div>
        </div>
        <Caida valor={caida} onCambio={setCaida} />
      </Tarjeta>

      <Tarjeta className="space-y-2">
        <Comparacion etiqueta="Ventas al mes" hoy={g.ventasHoy} nuevo={g.ventasNuevas} />
        <div className="flex items-baseline justify-between border-t border-borde pt-2">
          <span className="font-semibold">Ganancia al mes</span>
          <span className="text-right">
            <span className="cifra block text-xl font-bold">{pesos(g.gananciaNueva)}</span>
            <span className={`cifra block text-sm font-semibold ${diferencia >= 0 ? 'text-exito' : 'text-peligro'}`}>
              {diferencia >= 0 ? '+' : ''}
              {pesos(diferencia)} al mes
            </span>
          </span>
        </div>
      </Tarjeta>

      <section>
        <h2 className="mb-2 font-semibold">Precios nuevos ({g.filas.length})</h2>
        <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie text-sm">
          {g.filas.map((f) => (
            <li key={f.producto.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate">{f.producto.nombre}</span>
              <span className="cifra shrink-0">
                <span className="text-suave">{pesos(f.base.precio)}</span> → <b>{pesos(f.nuevoPrecio)}</b>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-suave">Precios redondeados hacia arriba. El precio de hoy es el promedio cobrado (con descuentos).</p>
      </section>
    </div>
  )
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? 'border-t border-borde pt-1 font-semibold' : ''}`}>
      <span className={fuerte ? '' : 'text-suave'}>{etiqueta}</span>
      <span className="cifra">{valor}</span>
    </div>
  )
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-9 rounded-full border border-borde px-3 text-xs font-semibold text-primario active:bg-superficie-2">
      {children}
    </button>
  )
}
