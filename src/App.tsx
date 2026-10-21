import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Marco } from './componentes/Marco'
import { Cargando } from './componentes/ui'
import { CambiarClaveObligatorio, Login, ReclamarDueno, SinAcceso } from './paginas/Acceso'
import { ConfiguracionPagina, Mas, MiCuenta, PermisosAdmin } from './paginas/Mas'
import { Inicio } from './paginas/inicio/Inicio'
import { Mermas } from './paginas/Secciones'
import { Importar } from './paginas/ventas/Importar'
import { Ventas } from './paginas/ventas/Ventas'
import { CatalogoProvider } from './lib/catalogo'
import { Categorias } from './paginas/productos/Categorias'
import { IngredienteEditor, IngredientesLista } from './paginas/productos/Ingredientes'
import { ProductoDetalle } from './paginas/productos/ProductoDetalle'
import { ProductosLista } from './paginas/productos/Productos'
import { RecetaEditor, RecetasLista } from './paginas/productos/Recetas'
import { Usuarios } from './paginas/Usuarios'
import { SesionProvider, useSesion, type Permiso } from './sesion/SesionProvider'

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
          <Route path="recetas" element={<RecetasLista />} />
          <Route path="recetas/:id" element={<RecetaEditor />} />
          <Route path="ingredientes" element={<IngredientesLista />} />
          <Route path="ingredientes/:id" element={<IngredienteEditor />} />
        </Route>
        <Route path="mermas" element={<Con permiso="registrar_mermas"><Mermas /></Con>} />
        <Route path="mas" element={<Mas />} />
        <Route path="mas/cuenta" element={<MiCuenta />} />
        <Route path="mas/usuarios" element={<Con permiso="gestionar_usuarios"><Usuarios /></Con>} />
        <Route path="mas/permisos" element={<SoloDueno><PermisosAdmin /></SoloDueno>} />
        <Route path="mas/configuracion" element={<ConfiguracionPagina />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Rutas />
      </BrowserRouter>
    </SesionProvider>
  )
}
