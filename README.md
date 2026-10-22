# Broa Pastry by Sofía · App de gestión

App privada (solo dueños y administración) para controlar ventas, costos, mermas, pedidos de
tortas y ganancia de la pastelería. Se usa desde el iPhone como una app más, sin App Store.

**Link de la app:** https://broa-pastry.pages.dev

| Pieza | Servicio | Costo |
|---|---|---|
| La app (pantallas) | Cloudflare Pages, conectado a GitHub `renatoloyolam/broa-pastry` | $0 |
| Base de datos y usuarios | Supabase, proyecto `broa-pastry` (São Paulo) | $0 |

---

## 1. Uso diario

### Subir las ventas (cada día o cuando quieras)
1. En influye.app exporta **Transacciones** a Excel (un día, una semana o el mes).
2. En la app: **Ventas → Importar Excel de influye** y elige el archivo.
3. Revisa la vista previa y toca **Importar**.
   - Lo que ya estaba importado se ignora: no hay duplicados.
   - Productos nuevos: créalos o vincúlalos con uno existente (la app lo recuerda).
   - Textos raros en las opciones ("sin crema") se marcan como comentario de caja y se ignoran.
   - Si te equivocaste de archivo: **Ventas → Importaciones → Deshacer**.

### Ver resultados (Inicio)
- Día, semana, mes o rango, con flechas para moverte y comparación con el período anterior.
- Ganancia = ventas sin IVA − costo − mermas. Las ventas de productos **sin costo** se muestran
  aparte y no entran en la ganancia (para no inflarla).
- Arriba aparecen las **alertas** (costos faltantes, márgenes bajos, mermas altas, días sin
  ventas, cambios de costo, respaldo pendiente) y los **pedidos** de hoy y mañana.

### Mermas (al cierre del día, en 20 segundos)
**Mermas →** producto, cuántos, motivo, ¿evitable? → **Guardar merma**. Se valorizan al costo del
día y se descuentan de la ganancia. El **Reporte** las muestra por motivo y por producto.

### Pedidos de tortas
**Más → Pedidos de tortas →** cliente, fecha de entrega, descripción, precio y abonos. Muestra el
saldo por cobrar y la ganancia esperada. El abono y el saldo se cobran en influye, por eso los
pedidos **no** se suman otra vez a las ventas.

### Costos
- **Productos**: costo de cada producto y de cada opción (sabor, tamaño, leche…).
  Se puede escribir a mano o calcular con **Recetas** e **Ingredientes**.
- Cuando cambias un costo, el nuevo rige **desde hoy**; las ventas pasadas conservan el costo que
  tenían. Si fue un error, al guardar aparece **Corregir desde una fecha**.
- Los costos iniciales se cargaron desde la planilla de costos (ver sección 6).
- **Muchos costos a la vez: Productos → "Costos en Excel".** Descarga la plantilla (todos los
  productos y opciones con su costo actual), completa las columnas de color durazno **sin IVA** y
  súbela. La app muestra qué cambia antes de guardar. Las filas "Receta" se editan en la app.

### Finanzas del mes (Más → Finanzas del mes)
- **Gastos del mes:** arriendo, sueldos, luz, contador… con su día de pago. Los que "se repiten"
  se copian solos al mes siguiente; solo ajustas los que cambian. Marca "Pagar" cuando los pagues.
- **Meta:** cuánto hay que vender (con IVA, como en la caja) para cubrir todos los gastos, cuánto
  falta y cuánto vender por día abierto (descuenta los días cerrados de Alertas).
- **Resultado real:** ventas sin IVA − costo de productos − mermas − comisiones de tarjeta − gastos.
  Lo vendido sin costo cargado se estima con el promedio del mes.
- Comisiones de tarjeta: se configuran al final de la pantalla (% débito y crédito).
- La ve el Dueño; la Administradora solo si se activa "Finanzas del mes" en Permisos (incluye sueldos).

### Exportar (Más → Exportar reportes)
Excel completo, resumen en PDF o CSV para el contador. Quien no ve costos exporta sin costos.

---

## 2. Usuarios y permisos

| Rol | Puede |
|---|---|
| **Dueño** | Todo: costos, usuarios, permisos, alertas, respaldo |
| **Administradora** | Casi todo; el Dueño ajusta sus permisos en **Más → Permisos** |
| **Encargada de ventas** | Solo ventas, ranking por cantidad y turnos. **Nunca** costos ni ganancia |

- Los usuarios se crean en **Más → Usuarios** (la app da una contraseña temporal para entregar).
- Las reglas viven **en la base de datos**: aunque alguien revise lo que la app recibe por
  internet, la base no le entrega lo que su rol no permite. Hay pruebas en `supabase/tests/`.
- La sesión se cierra sola tras un tiempo sin uso (**Más → Configuración**).

---

## 3. Entrar con Face ID

### Activarlo en Supabase (una sola vez, lo hace un dueño)
1. Entra a https://supabase.com/dashboard → proyecto **broa-pastry**.
2. **Authentication → Passkeys** (o "Sign In / Providers → Passkeys").
3. Activa **Enable Passkey authentication** y completa:
   - **Relying Party Display Name:** `Broa Pastry`
   - **Relying Party ID:** `broa-pastry.pages.dev`
   - **Relying Party Origins:** `https://broa-pastry.pages.dev`
4. Guarda. ⚠️ No cambies el "Relying Party ID" después: las passkeys guardadas dejarían de funcionar.

### Activarlo en cada iPhone
1. Entra a la app con tu contraseña.
2. **Más → Mi cuenta → Activar Face ID en este dispositivo** y confirma con Face ID.
3. Desde ahí, en la pantalla de entrada toca **Entrar con Face ID**.
La contraseña sigue funcionando siempre.

---

## 4. Respaldos

El plan gratis de Supabase no guarda copias descargables. Por eso:
- **Más → Respaldo → Descargar respaldo** (solo dueños) baja un Excel con **toda** la información
  (una hoja por tabla: productos, costos e historial, recetas, ventas, mermas, pedidos…).
- Hazlo **una vez por semana** y guarda el archivo fuera del celular (Drive, iCloud o computador).
  La app te lo recuerda en Inicio si pasan 7 días. El archivo contiene costos: no lo compartas.

---

## 5. Instalar en el iPhone
1. Abre el link en **Safari** (en otro navegador no se puede instalar).
2. **Compartir** (cuadrado con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre **Broa** desde el ícono. Si una actualización no aparece, cierra la app y ábrela de nuevo.

---

## 6. Sincronizar costos con la planilla
La planilla `PLANILLA COSTOS (1).xlsx` se cargó así:
- **Costo** = ingredientes + packaging por unidad (TOTAL ÷ rinde de la receta).
- **Costo adicional "Mano de obra y gastos (planilla)"** = (mano de obra + G.I.F.) ÷ rinde.
- Sin el 5% de "imprevistos y merma" (las mermas se registran aparte).

Para volver a sincronizar cuando cambie la planilla, ver
[`herramientas/planilla-costos/README.md`](herramientas/planilla-costos/README.md).

---

## 7. Publicar cambios (para quien programe)
Cada `git push` a la rama `main` publica sola la nueva versión en Cloudflare Pages (1–2 minutos).

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # pruebas automáticas (cálculos, formato, importador, exportación…)
npm run build    # compila en dist/
```

**Base de datos:** los cambios están en `supabase/migrations/` (en orden). Las pruebas de
seguridad y cálculos de cada fase están en `supabase/tests/`: se pegan en
**Supabase → SQL Editor**, crean datos ficticios, verifican y **deshacen todo**; si todo está
bien terminan con el mensaje `TODAS LAS PRUEBAS OK (cambios deshechos)`.

---

## 8. Límites del plan gratis y mantenimiento

| Servicio | Límite gratis | Uso de Broa |
|---|---|---|
| Supabase base de datos | 500 MB | ~30 MB por año de ventas |
| Supabase usuarios | 50.000 activos/mes | 4 o 5 |
| Supabase funciones | 500.000 llamadas/mes | unas pocas (crear usuarios) |
| Cloudflare Pages | visitas ilimitadas, 500 publicaciones/mes | unas pocas |

- **Supabase pausa el proyecto si pasan 7 días sin uso.** Con uso diario no pasa. Si ocurre:
  https://supabase.com/dashboard → proyecto → **Restore project**. No se pierde nada.
- Revisa de vez en cuando **Supabase → Advisors → Security**: las advertencias sobre funciones
  "SECURITY DEFINER" son intencionales (cada una revisa permisos por dentro).

---

## Estructura del proyecto
```
src/
  lib/            cálculos, formato chileno, importador, costeo, períodos, exportación, respaldo
  sesion/         sesión, permisos, cierre por inactividad
  componentes/    piezas visuales, navegación, gráfico, confirmaciones, Face ID
  paginas/        pantallas (inicio, ventas, productos, mermas, pedidos, alertas, exportar…)
supabase/
  migrations/     estructura y seguridad de la base de datos
  functions/      función de servidor para crear usuarios
  tests/          pruebas de seguridad y cálculos por fase
herramientas/
  planilla-costos/  sincronización de costos desde la planilla
```
