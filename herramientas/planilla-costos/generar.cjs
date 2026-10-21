// Genera el SQL para sincronizar costos desde la planilla.
// Uso (desde la carpeta del proyecto):
//   node herramientas/planilla-costos/extraer.cjs "PLANILLA COSTOS (1).xlsx"
//   node herramientas/planilla-costos/generar.cjs > herramientas/planilla-costos/sincronizar.sql
// Luego se ejecuta sincronizar.sql en Supabase (SQL Editor).
//
// Qué hace el SQL:
//   * Productos/opciones sin costo: los crea ("rige desde siempre").
//   * Con costo: actualiza el valor de ingredientes y la línea
//     "Mano de obra y gastos (planilla)". Si cambió, el nuevo costo rige
//     desde hoy y las ventas pasadas conservan el anterior.
//   * No toca costos que se hayan definido por receta dentro de la app.
const { MAPEO, calcular } = require('./mapeo.cjs')

const filas = Object.entries(MAPEO).map(([clave, item]) => {
  const [producto, opcion] = clave.split('|')
  const r = calcular(item)
  return [producto, opcion ?? null, item.tipo === 'cero' ? 0 : 1, Math.round(r.mp * 100) / 100, Math.round(r.mo * 100) / 100]
})
const json = JSON.stringify(filas).replace(/'/g, "''")

process.stdout.write(`-- Sincronización de costos desde la planilla (${new Date().toISOString().slice(0, 10)})
do $$
declare
  datos jsonb := '${json}';
  c record;
  v_def bigint;
  omitidos text[] := '{}';
begin
  for c in
    select x->>0 as producto, x->>1 as opcion, (x->>2)::int = 0 as es_cero, (x->>3)::numeric as mp, (x->>4)::numeric as mo,
           p.id as producto_id, o.id as opcion_id
    from jsonb_array_elements(datos) x
    left join public.productos p on p.nombre = x->>0
    left join public.opciones o on o.producto_id = p.id and o.nombre = x->>1
  loop
    if c.producto_id is null or (c.opcion is not null and c.opcion_id is null) then
      omitidos := omitidos || (c.producto || coalesce(' · ' || c.opcion, ''));
      continue;
    end if;
    select id into v_def from public.costo_definiciones
    where (c.opcion is null and producto_id = c.producto_id) or (c.opcion_id is not null and opcion_id = c.opcion_id);
    if v_def is null then
      insert into public.costo_definiciones (producto_id, opcion_id, modo, costo_manual_neto)
      values (case when c.opcion is null then c.producto_id end, c.opcion_id,
              case when c.es_cero then 'cero'::public.modo_costo else 'manual' end,
              case when c.es_cero then null else c.mp end)
      returning id into v_def;
    elsif (select modo from public.costo_definiciones where id = v_def) = 'receta' then
      omitidos := omitidos || (c.producto || coalesce(' · ' || c.opcion, '') || ' (usa receta en la app)');
      continue;
    else
      update public.costo_definiciones
      set modo = case when c.es_cero then 'cero'::public.modo_costo else 'manual' end,
          costo_manual_neto = case when c.es_cero then null else c.mp end
      where id = v_def;
    end if;
    delete from public.costo_adicionales where definicion_id = v_def and concepto = 'Mano de obra y gastos (planilla)';
    if c.mo > 0 then
      insert into public.costo_adicionales (definicion_id, concepto, monto_neto)
      values (v_def, 'Mano de obra y gastos (planilla)', c.mo);
    end if;
  end loop;
  raise notice 'Sincronización lista. Omitidos: %', omitidos;
end $$;
`)
