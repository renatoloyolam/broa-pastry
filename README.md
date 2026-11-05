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
Primero eliges **dónde se perdió**:
- **Producto terminado:** producto, cuántos, motivo, ¿evitable? Se valoriza al costo del día.
- **En producción:** receta y cuánto (tandas completas, g, kg o unidades). Vale lo que cuesta esa
  cantidad de receta. Para un cupcake sin crema, crea una **receta base** del cupcake sin terminar.
- **Materia prima:** ingrediente y cuánto. Por ejemplo, 2 kg de frutillas a $4.453 = $8.906.
- **No tiene receta / No está en la lista:** describes lo que se perdió y un monto estimado, que
  queda marcado como estimado.

Todo se descuenta de la ganancia y el **Reporte** lo muestra por etapa, motivo y lo más perdido.
Algunas reglas:
- **El valor queda fijo** al registrar: si después sube un ingrediente, no cambia.
- **Ingredientes y mano de obra van separados.** Inicio descuenta ambos; Finanzas resta solo los
  ingredientes, porque los sueldos ya están en Gastos. En Insumos cuenta como "lo que se usó".
- **La encargada anota cantidades y no ve pesos.** Si anota algo sin receta queda **por valorizar**:
  avisa la campana, se le pone monto arriba de la pantalla Mermas y no se descuenta hasta entonces.
- La pérdida normal del proceso (recortes, lo que queda en el bol) va en el **rendimiento de la
  receta**, no como merma. Producción sugerida solo considera las mermas de producto terminado.

### Pedidos de tortas
**Más → Pedidos de tortas →** cliente, fecha de entrega, descripción, precio y abonos. Muestra el
saldo por cobrar y la ganancia esperada. El abono y el saldo se cobran en influye, por eso los
pedidos **no** se suman otra vez a las ventas.

### Mano de obra en recetas
En cada receta se escriben las **horas de mano de obra y de G.I.F.**: el total de la tanda, sumando todas
las etapas, sin importar cuántas personas participen. La app multiplica por el valor hora y divide por
lo que rinde. El valor hora es uno solo: **Productos → Recetas → Valor hora** (al cambiarlo se recalcula todo).
Se puede escribir a mano o **calcular con trabajadores y gastos**, como la hoja "MDO Y GIF" de la planilla:
- Sueldo por hora de cada persona = costo mensual ÷ (horas al día × días al mes).
- **Mano de obra** = promedio del sueldo por hora de los trabajadores incluidos.
- **G.I.F.** = gastos del mes ÷ días abiertos ÷ horas al día ÷ trabajadores incluidos.
- La planilla divide siempre por 13; la app divide por las personas incluidas en la lista. Apaga
  "Incluir" a quien no quieras que cuente. Con el cálculo activo, cualquier cambio en la lista
  recalcula las recetas solo. Sueldos y gastos solo los ve quien gestiona las finanzas.
Si conectas un producto que traía "Mano de obra y gastos (planilla)", la app avisa para quitarla y no
contarla dos veces. En Finanzas, el Resultado real no resta esa parte: resta los sueldos y gastos reales.

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
- **Pestaña IVA:** IVA estimado del F29 = IVA de lo cobrado en influye (ventas y abonos) − IVA de
  las facturas de compra − remanente del mes anterior, más el PPM. Las facturas se suben con el CSV
  del Registro de Compras del SII (sii.cl → Registro de compras y ventas → Compras → Descargar
  detalles) o se agregan a mano. Subirlo dos veces no duplica. Es una estimación: declara el contador.
- **Pestaña Insumos:** compara lo comprado en Insumos y Packaging (facturas del SII + boletas
  anotadas a mano) con lo que se usó según los costos (ventas y mermas, sin mano de obra). Si
  compras mucho más de lo usado: stock, mermas sin anotar, pérdidas o recetas con costo bajo.
  Los proveedores nuevos del SII quedan "Por clasificar"; al clasificarlos se recuerda para siempre.

### Mapa de productos (Productos → Mapa)
Clasifica cada producto contra los de su categoría (últimos 30/90 días, este mes o el pasado):
⭐ **Estrellas** (se venden mucho y dejan buen margen), 🐴 **populares de bajo margen** (subir
precio o bajar costo; la app sugiere un precio), 🧩 **rentables poco vendidos** (promocionarlos) y
🐶 **débiles** (evaluar sacarlos). "Margen" es el % que queda del precio sin IVA después del costo,
comparado con el de su categoría. Arriba avisa en rojo los productos que se venden **bajo el costo**
y el precio mínimo para no perder. También lista los productos sin costo completo y los activos que
no se vendieron.

### Resumen semanal (Inicio → Ver todo → Resumen, o la notificación)
Ventas de la semana contra la anterior, clientes, ticket, ganancia, margen y mermas (según permisos),
día a día, lo más vendido, y la meta del mes con los pagos de la semana. **Notificación cada lunes**
(16:00 UTC: 13:00 en verano / 12:00 en invierno) para quien la active en Más → Mi cuenta → Resumen
semanal ("Enviarme uno ahora" sirve para probar). En iPhone requiere la app instalada en la
pantalla de inicio. Partes: tabla `push_suscripciones`, llaves en `private.push_config`, Edge
Function `resumen-semanal` y la tarea `resumen-semanal` de pg_cron.

### Comparar meses (Inicio → Ver todo → Comparar)
Pone dos meses lado a lado (por defecto este y el anterior): ventas, venta promedio por día, clientes,
ticket promedio, unidades y, si se ven costos, ganancia, margen y mermas; con "Meses completos" y
gastos cargados, también la ganancia real. "A la misma fecha" compara los mismos días (si el mes
va en el día 20, del 1 al 20 de ambos). Muestra los cambios por categoría, los productos que más
crecieron y bajaron, los nuevos y los que dejaron de venderse.

### Ventas por mes (Ventas)
Las ventas se agrupan por mes (total, días, clientes, promedio por día y ▲▼ contra el mes anterior).
Tocando un mes se abre su detalle: **Días** (cada día con su barra; tocando uno se abre ese día),
**Productos** (con buscador; los que tienen opciones muestran cuáles se eligieron) y **Turnos y
pagos** (AM/PM, medio de pago, categoría y quién vendió). El detalle de un día agrega **Boletas**:
cada venta con su hora, medio de pago y sus ítems. Lo ven todos (no muestra costos).

### Horarios de venta (Ventas → Horarios)
Mapa de calor con el promedio de ventas (en $, clientes o unidades) por día de la semana y hora,
de las últimas 4, 8 o 12 semanas, para todo o una categoría. Más oscuro = se vende más. Resume la
hora más fuerte, el mejor y el peor día, cuánto se vende antes y después de las 15:00, y las horas
flojas. Tocando un cuadro se ve su promedio. Lo ven todos los usuarios (no muestra costos).

### Simulador de precios (Productos → Simulador, o "Simular" en cada producto)
Prueba un precio nuevo (o un costo nuevo) y ve cómo cambia la ganancia del mes, usando lo vendido en
los últimos 90 días. Indica cuánto podrían bajar las ventas sin perder ("aunque vendas 25% menos,
ganas lo mismo") y ofrece precios para llegar a un margen de 50, 60 o 70%. En modo categoría
simula subir todos sus precios en 3, 5, 10 o 15%. No cambia precios: eso se hace en influye.

### Producción sugerida (Más → Producción sugerida, o Mermas → Producción)
Para mañana (o la fecha que elijas) sugiere cuántas unidades hacer de cada producto, mirando lo
vendido y botado los mismos días de la semana de las últimas semanas, repartido en AM y PM. Si casi
no se bota, alcanza para un día bueno; si se bota más del 10%, baja a un día normal. La lista se
puede compartir por WhatsApp o imprimir. Las categorías "Al momento" (café, bebidas) no aparecen:
se cambia en Productos → Categorías. La encargada también la ve (sin costos). No considera feriados
ni encargos de tortas.

### Exportar (Más → Exportar reportes)
Excel completo, resumen en PDF o CSV para el contador. Quien no ve costos exporta sin costos.

---

## 2. Usuarios y permisos

| Rol | Puede |
|---|---|
| **Dueño** | Todo: costos, usuarios, permisos, alertas, respaldo |
| **Administradora** | Casi todo; el Dueño ajusta sus permisos en **Más → Permisos** |
| **Encargada de ventas** | Ventas, ranking por cantidad, turnos y anotar mermas. **Nunca** costos ni ganancia |

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
                  (iconos.ts: un icono por función; agrega ahí antes de usar uno nuevo)
  paginas/        pantallas (inicio, ventas, productos, mermas, pedidos, alertas, exportar…)
supabase/
  migrations/     estructura y seguridad de la base de datos
  functions/      función de servidor para crear usuarios
  tests/          pruebas de seguridad y cálculos por fase
herramientas/
  planilla-costos/  sincronización de costos desde la planilla
```
