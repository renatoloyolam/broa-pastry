# Broa Pastry by Sofía · App de gestión

App privada (solo dueños y administración) para controlar ventas, costos, mermas y ganancia de la pastelería.
Se instala en el iPhone desde Safari, sin App Store.

**Link de la app:** https://broa-pastry.pages.dev

- **Frontend:** React + TypeScript + Tailwind (Vite), instalable como app (PWA).
- **Base de datos y usuarios:** Supabase, plan gratis. Proyecto `broa-pastry`, región São Paulo.
- **Publicación:** Cloudflare Pages, plan gratis.
- **Costo mensual:** $0.

---

## 1. Primera puesta en marcha (una sola vez)

### 1.1 Crear tu usuario de Dueño en Supabase
1. Entra a <https://supabase.com/dashboard> y abre el proyecto **broa-pastry**.
2. Menú izquierdo **Authentication → Users → Add user → Create new user**.
3. Escribe tu correo y una contraseña, marca **Auto Confirm User** y presiona **Create user**.

### 1.2 Cerrar el registro público (seguridad)
1. En el mismo proyecto, ve a **Authentication → Sign In / Providers**.
2. Apaga **Allow new users to sign up** y guarda.

Así nadie puede crearse una cuenta por su cuenta. Los usuarios nuevos los creas tú desde la app,
en **Más → Usuarios**.

### 1.3 Entrar a la app y quedar como Dueño
1. Abre la app y entra con el correo y la contraseña del paso 1.1.
2. La app te dirá que es la primera vez. Escribe tu nombre y toca **Ser el dueño de la app**.
3. Ve a **Más → Usuarios** y crea la cuenta de Sofía con el rol **Dueño**.
   La app te muestra una contraseña temporal para entregarle; al entrar, ella crea la suya.

---

## 2. Instalar en el iPhone
1. Abre el link de la app en **Safari** (en otro navegador no funciona).
2. Toca el botón **Compartir** (el cuadrado con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre la app desde el ícono **Broa**.
4. La primera vez que entres, el iPhone te ofrece **guardar la contraseña**. Acepta: la próxima vez
   la rellena con **Face ID**.

---

## 3. Publicar la app (Cloudflare Pages + GitHub)

### 3.1 Subir el código a GitHub (una vez)
1. En <https://github.com/new> crea un repositorio **privado** llamado `broa-pastry`, sin README.
2. En esta carpeta, ejecuta (cambia `TU_USUARIO`):
   ```bash
   git remote add origin https://github.com/TU_USUARIO/broa-pastry.git
   git push -u origin main
   ```

### 3.2 Conectar Cloudflare Pages (una vez)
1. Crea una cuenta gratis en <https://dash.cloudflare.com/sign-up>.
2. Ve a **Workers & Pages → Create → Pages → Connect to Git** y elige `broa-pastry`.
3. Configuración de compilación:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Presiona **Save and Deploy**. En 1 o 2 minutos tendrás un link tipo `https://broa-pastry.pages.dev`.

Desde ese momento, **cada vez que se sube un cambio a GitHub, Cloudflare publica la nueva versión sola**.
La app instalada en el iPhone se actualiza al abrirla.

---

## 4. Probar en el computador (para desarrollo)
Requisito: Node.js 22 o superior.
```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # pruebas automáticas de cálculos y formato
npm run build    # compila la versión de producción en dist/
```

### Pruebas de seguridad de la base de datos
El archivo `supabase/tests/rls_fase1.sql` se puede pegar en **Supabase → SQL Editor** y ejecutar.
Crea usuarios ficticios, revisa que cada rol vea solo lo que debe y **deshace todo al final**. Si todo
está bien, el resultado es un "error" con el texto `TODAS LAS PRUEBAS OK (cambios deshechos)`.
Solo funciona mientras no existan usuarios reales, así que sirve para revisar la estructura antes de usarla.

---

## 5. Cómo funciona la seguridad
- **Roles:** Dueño (todo), Administradora (casi todo; el Dueño ajusta sus permisos en
  **Más → Permisos**) y Encargada de ventas (solo ventas, nunca costos).
- Las reglas viven **en la base de datos** (Row Level Security). Aunque alguien revise lo que la app
  recibe por internet, la base de datos no le entrega lo que su rol no permite.
- Los usuarios se crean desde la app (función de servidor `gestionar-usuarios`). La llave maestra de
  Supabase nunca llega al teléfono.
- Siempre debe quedar al menos un Dueño activo. Nadie puede cambiar su propio rol.
- La sesión se cierra sola tras un tiempo sin uso (30 minutos por defecto; se cambia en
  **Más → Configuración**).

## 6. Límites del plan gratis
| Servicio | Límite gratis | Uso esperado de Broa |
|---|---|---|
| Supabase base de datos | 500 MB | Unos 75.000 ítems vendidos al año, menos de 30 MB/año |
| Supabase usuarios | 50.000 activos al mes | 4 o 5 |
| Cloudflare Pages | Visitas ilimitadas, 500 publicaciones al mes | Unas pocas al mes |

**Ojo:** Supabase gratis **pausa el proyecto si pasan 7 días sin uso**. Con uso diario no pasa. Si
ocurre, entra a <https://supabase.com/dashboard>, abre el proyecto y presiona **Restore project**.
No se pierde nada.

## 7. Respaldos
El plan gratis no ofrece respaldos descargables. En la Fase 8 se agrega el botón
**Más → Descargar respaldo**, que genera un Excel con todo, y un recordatorio semanal.

## Estructura del proyecto
```
src/
  lib/            cálculos (ganancia, margen, IVA), formato chileno, conexión a Supabase
  sesion/         sesión, permisos y cierre por inactividad
  componentes/    piezas visuales reutilizables y navegación inferior
  paginas/        pantallas
supabase/
  migrations/     estructura y seguridad de la base de datos
  functions/      función de servidor para crear usuarios
  tests/          pruebas de seguridad por rol
```
