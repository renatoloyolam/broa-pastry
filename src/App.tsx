import { lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ConfirmarProvider } from './componentes/Confirmar'
import { Marco } from './componentes/Marco'
import { Cargando } from './componentes/ui'
import { CambiarClaveObligatorio, Login, ReclamarDueno, SinAcceso } from './paginas/Acceso'
import { Inicio } from './paginas/inicio/Inicio'
import { SesionProvider, useSesion, type Permiso } from './sesion/SesionProvider'

// Las pantallas se cargan solo cuando se abren: la app parte más rápido en el iPhone.
const cargar = <T extends Record<string, unknown>, K extends keyof T>(importar: () => Promise<T>, nombre: K) =>
  lazy(() => importar().then((m) => ({ default: m[nombre] as React.ComponentType })))

const Ventas = cargar(() => import('./paginas/ventas/Ventas'), 'Ventas')
const Importar = cargar(() => import('./paginas/ventas/Importar'), 'Importar')
const CatalogoProvider = cargar(() => import('./lib/catalogo'), 'CatalogoProvider')
const ProductosLista = cargar(() => import('./paginas/productos/Productos'), 'ProductosLista')
const ProductoDetalle = cargar(() => import('./paginas/productos/ProductoDetalle'), 'ProductoDetalle')
const Categorias = cargar(() => import('./paginas/productos/Categorias'), 'Categorias')
const CostosExcel = cargar(() => import('./paginas/productos/CostosExcel'), 'CostosExcel')
const MapaProductos = cargar(() => import('./paginas/productos/MapaProductos'), 'MapaProductos')
const RecetasLista = cargar(() => import('./paginas/productos/Recetas'), 'RecetasLista')
const RecetaEditor = cargar(() => import('./paginas/productos/Recetas'), 'RecetaEditor')
const IngredientesLista = cargar(() => import('./paginas/productos/Ingredientes'), 'IngredientesLista')
const IngredienteEditor = cargar(() => import('./paginas/productos/Ingredientes'), 'IngredienteEditor')
const Mermas = cargar(() => import('./paginas/mermas/Mermas'), 'Mermas')
const ReporteMermas = cargar(() => import('./paginas/mermas/ReporteMermas'), 'ReporteMermas')
const Motivos = cargar(() => import('./paginas/mermas/Motivos'), 'Motivos')
const Mas = cargar(() => import('./paginas/Mas'), 'Mas')
const MiCuenta = cargar(() => import('./paginas/Mas'), 'MiCuenta')
const PermisosAdmin = cargar(() => import('./paginas/Mas'), 'PermisosAdmin')
const ConfiguracionPagina = cargar(() => import('./paginas/Mas'), 'ConfiguracionPagina')
const Usuarios = cargar(() => import('./paginas/Usuarios'), 'Usuarios')
const ConfigAlertas = cargar(() => import('./paginas/alertas/ConfigAlertas'), 'ConfigAlertas')
const Exportar = cargar(() => import('./paginas/exportar/Exportar'), 'Exportar')
const Respaldo = cargar(() => import('./paginas/Respaldo'), 'Respaldo')
const Finanzas = cargar(() => import('./paginas/finanzas/Finanzas'), 'Finanzas')
const Iva = cargar(() => import('./paginas/finanzas/Iva'), 'Iva')
const Insumos = cargar(() => import('./paginas/finanzas/Insumos'), 'Insumos')
const Produccion = cargar(() => import('./paginas/produccion/Produccion'), 'Produccion')
const Pedidos = cargar(() => import('./paginas/pedidos/Pedidos'), 'Pedidos')
const PedidoDetalle = cargar(() => import('./paginas/pedidos/PedidoDetalle'), 'PedidoDetalle')

/** Oculta la pantalla si no hay permiso (la base de datos igual lo bloquea). */
function Con({ permiso, children }: { permiso: Permiso; children: ReactNode }) {
  const { puede } = useSesion()
  return puede(permiso) ? children : <Navigate to="/" replace />
}

function SoloDueno({ children }: { children: ReactNode }) {
  const { info } = useSesion()
  return info?.perfil?.rol === 'dueno' ? children : <Navigate to="/" replace />
}

function Rutas() {
  const { cargando, sesion, info } = useSesion()
  if (cargando || (sesion && !info)) return <Cargando />
  if (!sesion) return <Login />
  if (!info?.perfil) return info?.existe_dueno ? <SinAcceso /> : <ReclamarDueno />
  if (!info.perfil.activo) return <SinAcceso />
  if (info.perfil.debe_cambiar_clave) return <CambiarClaveObligatorio />

  return (
    <Routes>
      <Route element={<Marco />}>
        <Route index element={<Inicio />} />
        <Route path="ventas" element={<Con permiso="ver_ventas"><Ventas /></Con>} />
        <Route path="ventas/importar" element={<Con permiso="importar_ventas"><Importar /></Con>} />
        <Route path="productos" element={<Con permiso="ver_costos"><CatalogoProvider /></Con>}>
          <Route index element={<ProductosLista />} />
          <Route path="p/:id" element={<ProductoDetalle />} />
          <Route path="categorias" element={<Categorias />} />
          <Route path="excel" element={<CostosExcel />} />
          <Route path="mapa" element={<MapaProductos />} />
          <Route path="recetas" element={<RecetasLista />} />
          <Route path="recetas/:id" element={<RecetaEditor />} />
          <Route path="ingredientes" element={<IngredientesLista />} />
          <Route path="ingredientes/:id" element={<IngredienteEditor />} />
        </Route>
        <Route path="mermas" element={<Con permiso="registrar_mermas"><Mermas /></Con>} />
        <Route path="mermas/reporte" element={<Con permiso="registrar_mermas"><ReporteMermas /></Con>} />
        <Route path="mermas/motivos" element={<Con permiso="editar_configuracion"><Motivos /></Con>} />
        <Route path="mas" element={<Mas />} />
        <Route path="mas/cuenta" element={<MiCuenta />} />
        <Route path="mas/usuarios" element={<Con permiso="gestionar_usuarios"><Usuarios /></Con>} />
        <Route path="mas/permisos" element={<SoloDueno><PermisosAdmin /></SoloDueno>} />
        <Route path="mas/configuracion" element={<ConfiguracionPagina />} />
        <Route path="mas/alertas" element={<Con permiso="ver_costos"><ConfigAlertas /></Con>} />
        <Route path="mas/exportar" element={<Con permiso="exportar"><Exportar /></Con>} />
        <Route path="mas/respaldo" element={<SoloDueno><Respaldo /></SoloDueno>} />
        <Route path="finanzas" element={<Con permiso="gestionar_finanzas"><Finanzas /></Con>} />
        <Route path="finanzas/iva" element={<Con permiso="gestionar_finanzas"><Iva /></Con>} />
        <Route path="finanzas/insumos" element={<Con permiso="gestionar_finanzas"><Insumos /></Con>} />
        <Route path="produccion" element={<Con permiso="ver_ventas"><Produccion /></Con>} />
        <Route path="pedidos" element={<Con permiso="gestionar_pedidos"><Pedidos /></Con>} />
        <Route path="pedidos/:id" element={<Con permiso="gestionar_pedidos"><PedidoDetalle /></Con>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <SesionProvider>
      <ConfirmarProvider>
        <BrowserRouter>
          <Rutas />
        </BrowserRouter>
      </ConfirmarProvider>
    </SesionProvider>
  )
}
