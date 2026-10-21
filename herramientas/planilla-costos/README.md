# Sincronizar costos desde la planilla

La planilla de costos de Broa (`PLANILLA COSTOS (1).xlsx`) tiene las recetas en bloques
(nombre, ingredientes, TOTAL, TOTAL X RECETA, Mano de obra, G.I.F.). Estas herramientas:

1. **extraer.cjs** lee todos los bloques de receta de todas las hojas.
2. **mapeo.cjs** dice qué bloque corresponde a cada producto u opción de influye.
   Aquí se edita si cambian los nombres o aparecen productos nuevos.
3. **generar.cjs** arma el SQL que carga los costos en la app.

## Cómo se calcula cada costo
- **Costo** (en la app): ingredientes + packaging por unidad = TOTAL ÷ rinde de la receta.
- **Costo adicional "Mano de obra y gastos (planilla)"**: (Mano de obra + G.I.F.) ÷ rinde.
- **No** se incluye el 5% de "imprevistos y merma": las mermas se registran aparte en la app.
- Productos de compra y venta (bebidas, Fuorno, empanadas) usan su precio neto de compra.
- Cafés, tés y bebidas: cada sabor trae su costo completo; las leches y extras suman su diferencia.

## Sincronizar de nuevo (cuando cambie la planilla)
```bash
node herramientas/planilla-costos/extraer.cjs "PLANILLA COSTOS (1).xlsx"
node herramientas/planilla-costos/generar.cjs > herramientas/planilla-costos/sincronizar.sql
```
Luego abrir `sincronizar.sql`, copiarlo en **Supabase → SQL Editor** y ejecutarlo.
Los costos que cambien rigen desde ese día; las ventas pasadas conservan su costo.

`bloques.json` y `sincronizar.sql` contienen costos del negocio y no se suben a GitHub.

## Sin costo en la planilla (octubre 2026)
Panadería (pan de masa madre, marraqueta, hallulla, dobladita, molde, pita, pan chocoso),
empanada de manzana, caja de rollitos, torta moka y avellana 15 cm, té de bolsa, té helado y
productos de temporada (Pumpkin, Halloween, 18 de septiembre). Se completan en la app.
