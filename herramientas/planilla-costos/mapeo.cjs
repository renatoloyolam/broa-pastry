// Mapeo influye (producto / opción) → planilla de costos.
// b(hoja, nombre, rinde?) = bloque de receta (materia prima y MO+GIF por unidad)
// f(valor, fuente)        = valor fijo (productos de compra y venta, sin mano de obra)
// cero                    = sin costo propio (el costo está en las opciones)
// d(bloque, base)         = opción que suma la diferencia contra el costo base
const fs = require('fs')
const bloques = JSON.parse(fs.readFileSync(__dirname + '/bloques.json', 'utf8'))
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function bloque(hoja, nombre, indice = 0) {
  const c = bloques.filter((x) => norm(x.hoja) === norm(hoja) && norm(x.nombre).startsWith(norm(nombre)))
  if (c.length <= indice) throw new Error('No encontré bloque ' + hoja + ' / ' + nombre)
  return c[indice]
}
const b = (hoja, nombre, rinde, indice = 0) => ({ tipo: 'bloque', hoja, nombre, rinde, indice })
const f = (valor, fuente) => ({ tipo: 'fijo', valor, fuente })
const cero = { tipo: 'cero' }
const x = (n, item) => ({ tipo: 'multiplo', n, item })
const suma = (...items) => ({ tipo: 'suma', items })
const d = (item, base) => ({ tipo: 'delta', item, base })

// Diferencia de leche por taza: sin lactosa ($1.169 vs $1.087 el litro) ≈ 200-250 ml
const SIN_LACTOSA_CHICO = f(16, 'Leche sin lactosa: (1.169−1.087)/L × 200 ml')
const SIN_LACTOSA_GRANDE = f(21, 'Leche sin lactosa: (1.169−1.087)/L × 250 ml')
const SHOT = f(260, 'Shot café de especialidad (11 g × $23.623/kg)')
const SYRUP_PUMP = f(297, 'Syrup 20 ml × $14.834/L')

const FRAPPE_BASE = b('FRIAS', 'FRAPUCCINO OREO')
const CAFE_FRIO_BASE = b('FRIAS', 'CAFÉ HELADO VAINILLA')
const MILKSHAKE_BASE = b('FRIAS', 'MILKSHAKE OREO')

const MAPEO = {
  // ---------- Galletería ----------
  'Alfajor chips': b('GALLETAS, BROWNIES', 'ALFAJOR CHIPS'),
  'Danesas': b('GALLETAS, BROWNIES', 'GALLETAS DANESAS', 90),
  'Danesas manjar': b('GALLETAS, BROWNIES', 'GALLETAS DANESAS CON MANJAR'),
  'Delicias': f(134, 'PRECIOS NETOS: Galleta delicia'),
  'Mendocino': b('GALLETAS, BROWNIES', 'MENDOCINO'),
  'Alfajor maicena': b('GALLETAS, BROWNIES', 'MAICENA GRANDE'),
  'Galletas': cero,
  'Galletas|Craqueladas chocolate': b('GALLETAS, BROWNIES', 'GALLETAS CRAQUELADAS CHOCOLATE'),
  'Galletas|Galleta nuez': b('GALLETAS, BROWNIES', 'GALLETAS NUEZ'),
  'Galletas|Galleta choco vainilla': b('GALLETAS, BROWNIES', 'GALLETAS VAINILLA CHOCOLATE'),
  'Galletones': cero,
  'Galletones|avena ,manzana y pasas': b('GALLETAS, BROWNIES', 'GALLETÓN AVENA'),
  'Galletones|Galleton mashmellow': b('GALLETAS, BROWNIES', 'GALLETÓN MASHMELLOW'),
  'Galletones|M&M': b('GALLETAS, BROWNIES', 'GALLETÓN MYM'),
  'Galletones|Galleton red velvet XL': b('GALLETAS, BROWNIES', 'GALLETÓN RED VELVET'),
  'Galletones|Galleton arandano limon XL': b('GALLETAS, BROWNIES', 'GALLETON ARANDANO LIMÓN'),
  'Galletones|Pistacho XL': b('GALLETAS, BROWNIES', 'GALLETÓN PISTACHO'),
  'Galletones|Chips': b('GALLETAS, BROWNIES', 'GALLETÓN CHIPS'),
  'Galletones|Oreo': f(344, 'PRECIOS NETOS: Galletón oreo'),
  'Brownie': cero,
  'Brownie|Oreo': b('GALLETAS, BROWNIES', 'BROWNIE OREO'),
  'Brownie|Chips': b('GALLETAS, BROWNIES', 'BROWNIE CHIPS'),
  'Brownie|Avellana': b('GALLETAS, BROWNIES', 'BROWNIE AVELLANA'),
  'Brownie manjar bañado': cero,
  'Brownie manjar bañado|Brownie oreo': b('GALLETAS, BROWNIES', 'BROWNIE CON MANJAR'),
  'Brownie manjar bañado|Brownie frambuesa': b('GALLETAS, BROWNIES', 'BROWNIE FRAMBUESA CON MANJAR'),

  // ---------- Bollería ----------
  'Rollitos de canela': cero,
  'Rollitos de canela|Tradicional': b('BOLLERÍA', 'ROLLITO CANELA TRADICIONAL'),
  'Rollitos de canela|Lemond curd': b('BOLLERÍA', 'ROLLITO CANELA LEMON CURD'),
  'Rollitos de canela|DUBAY': b('BOLLERÍA', 'ROLLITO CANELA DUBAY'),
  'Rollitos de canela|Snicker': b('BOLLERÍA', 'ROLLITO DE CANELA SNIKERS'),
  'Rollitos de canela|Nutella': b('BOLLERÍA', 'ROLLITO DE CANELA NUTELLA'),
  'Rollitos de canela|Manzana canela': b('BOLLERÍA', 'ROLLITO CANELA MANZANA'),
  'Rollitos de canela|Tiramisu': b('BOLLERÍA', 'ROLLITO TIRAMISU'),
  'Rollitos de canela|Brownie': b('BOLLERÍA', 'ROLLITO DE CANELA BROWNIE'),
  'Media luna simple': b('BOLLERÍA', 'MEDIA LUNAS'),
  'Factura': b('BOLLERÍA', 'FACTURAS DE MEMBRILLO'),
  'Trenzado chips': b('BOLLERÍA', 'TRENZADO'),
  'Media luna x6': x(6, b('BOLLERÍA', 'MEDIA LUNAS')),
  'Facturas x 6': x(6, b('BOLLERÍA', 'FACTURAS DE MEMBRILLO')),
  'Facturas surtidas x6': x(6, b('BOLLERÍA', 'FACTURAS DE MEMBRILLO')),
  'Trenzado X 6': x(6, b('BOLLERÍA', 'TRENZADO')),
  '3 factura y 3 media luna': suma(x(3, b('BOLLERÍA', 'FACTURAS DE MEMBRILLO')), x(3, b('BOLLERÍA', 'MEDIA LUNAS'))),
  'Media luna rellena': cero,
  'Media luna rellena|Pie de limon': b('BOLLERÍA', 'MEDIA LUNA LIMÓN'),
  'Media luna rellena|Limon frambuesa': b('BOLLERÍA', 'MEDIA LUNA FRAMBUESA Y LIMÓN'),
  'Media luna rellena|Manjar': b('BOLLERÍA', 'MEDIA LUNAS MANJAR'),
  'Pan de miel porción': f(1070, 'PRECIOS NETOS: Porción pan de miel'),
  'Pan de miel 500 gr': f(3300, 'PRECIOS NETOS: Pan de miel queque entero'),

  // ---------- Pastelería ----------
  'Mini pie': cero,
  'Mini pie|Pie Limón': b('PASTELERIA', 'PIE LIMÓN INDIVIDUAL', 8),
  'Mini pie|Pie limón frutos rojos': b('PASTELERIA', 'PIE LIMÓM-FRAMBUESA INDIVIDUAL', 10),
  'Mini pie|Pie Maracuyá': b('PASTELERIA', 'PIE MARACUYÁ INDIVIDUAL', 8),
  'Mini tarta': cero,
  'Mini tarta|Chocolate Frambuesa': b('PASTELERIA', 'TARTA CHOCOLATE FRAMBUESA INDIVIDU', 10),
  'Mini tarta|Kuchen Frutos Rojos': b('PASTELERIA', 'KUCHEN FRUTOS ROJOS INDIVIDUAL', 8),
  'Mini tarta|Kuchen manzana': b('PASTELERIA', 'MINI KUCHEN MANZANA', 6),
  'Cupcakes': cero,
  'Cupcakes|Red velvet': b('PASTELERIA', 'CUPCAKES RED VELVET'),
  'Cupcakes|chocolate': b('PASTELERIA', 'CUPCAKES RED VELVET'),
  'Cupcakes|Oreo': b('PASTELERIA', 'CUPCAKES RED VELVET'),
  'Cupcakes|chocolate blanco fram': b('PASTELERIA', 'CUPCAKES RED VELVET'),
  'Cupcakes|Pie de limón': b('PASTELERIA', 'CUPCAKES RED VELVET'),
  'Cupcakes|Tiramisú': b('PASTELERIA', 'CUPCAKES RED VELVET'),
  'Cannele': b('PASTELERIA', 'CANELLE', 15),
  'Kuchen Sureño porción': b('PASTELERIA', 'KUCHEN SUREÑO'),
  'Kuchen frutos rojos': b('PASTELERIA', 'KUCHEN FRUTOS ROJOS 20 CM'),
  'Cheesecake Porcion': cero,
  'Cheesecake Porcion|Oreo': b('PASTELERIA', 'CHEESECAKE FRIO OREO'),
  'Cheesecake Porcion|Chocolate': b('PASTELERIA', 'CHEESECAKE FRIO CHOCOLATE'),
  'Cheesecake Porcion|Frambuesa': b('PASTELERIA', 'CHEESECAKE FRIO FRAMBUESA'),
  'Cheesecake Porcion|Toffe nuez y cafe': b('PASTELERIA', 'CHEESECAKE FRIO TOFFE'),
  'Cheesecake Porcion|Pistacho': b('PASTELERIA', 'CHEESECAKE FRIO PISTACHO', 24),
  'Macarons': cero,
  'Macarons|Oreo': b('PASTELERIA', 'MACARONS BASE'),
  'Macarons|Frambuesa': b('PASTELERIA', 'MACARONS BASE'),
  'Macarons|Maracuyá': b('PASTELERIA', 'MACARONS BASE'),
  'Macarons|Calafate': b('PASTELERIA', 'MACARONS BASE'),
  'Macarons|Chocolate': b('PASTELERIA', 'MACARONS BASE'),
  'Porción torta': cero,
  'Porción torta|Red velvet': b('TORTAS ', 'TORTA RED VELVET 30 CM', null, 1),
  'Porción torta|zanahoria': b('TORTAS ', 'TORTA ZANAHORIA 30 CM PORCIÓN', 12),
  'Pie 20cm': cero,
  'Pie 20cm|Pie de limón frambuesa': b('PASTELERIA', 'PIE LIMÓN FRAMBUESA 20 CM'),
  'Pie 20cm|pie de limon 20cm': b('PASTELERIA', 'PIE LIMÓN 20 CM'),
  'Torta 15cm': cero,
  'Torta 15cm|Torta 15cm Red Velvet': b('TORTAS ', 'TORTA RED VELVET 15 CM'),
  'Torta 15cm|Torta 15cm zanahoria': b('TORTAS ', 'TORTA ZANAHORIA 15 CM'),
  'Torta 15cm|Torta matilda 15cm': b('TORTAS ', 'TORTA MATILDA 16 CM'),
  'Torta 15cm|Torta 15 cm tres leche': b('TORTAS ', 'TRES LECHES 15 CM'),
  'Torta 15cm|torta amor 15 cm': b('TORTAS ', 'TORTA AMOR 15 CM'),
  'Torta 15cm|Torta oreo 15cm': b('TORTAS ', 'TORTA OREO 15 CM'),
  'Torta 15cm|Torta 15 cm Matilda con manjar': b('TORTAS ', 'TORTA MATILDA CON MANJAR 16 CM'),
  'Torta 15cm|Torta 15 cm Limón': b('TORTAS ', 'TORTA LIMON 15 CM'),
  'Torta 15cm|Torta 15 cm Prestigio': b('TORTAS ', 'TORTA PRESTIGIO 15 CM'),
  'Torta 20 cm': cero,
  'Torta 20 cm|torta amor': b('TORTAS ', 'TORTA AMOR 20 CM'),
  'Torta 20 cm|torta red velvet': b('TORTAS ', 'TORTA RED VELVET 20 CM'),
  'Torta 20 cm|torta tres leches': b('TORTAS ', 'TORTA TRES LECHES 20 CM'),
  'Torta 20 cm|Torta Limón': b('TORTAS ', 'TORTA LIMON 20 CM'),
  'Torta 20 cm|Torta matilda': b('TORTAS ', 'TORTA MATILDA 20 CM'),
  'Torta 20 cm|torta oreo': b('TORTAS ', 'TORTA OREO 20 CM'),
  'Torta 20 cm|torta zanahoria': b('TORTAS ', 'TORTA ZANAHORIA 20 CM'),

  // ---------- Salados y compra-venta (precio de compra, sin mano de obra) ----------
  'Croissant Jamón Queso': f(2800, 'LISTA PRODUCTOS: Fuorno croissant jamón queso'),
  'Croissant Jamón Queso|Frio': cero,
  'Croissant Jamón Queso|Caliente': cero,
  'Croissant queso crema,  jamon serrano y rúcula': f(3700, 'LISTA PRODUCTOS: Fuorno croissant serrano rúcula'),
  'Baguette Pollo': f(3300, 'LISTA PRODUCTOS: Fuorno baguette pollo'),
  'Strachiata veggie': f(3400, 'LISTA PRODUCTOS: Fuorno strachiata veggie'),
  'Empanadas': cero,
  'Empanadas|POLLO QUESO CREMA': f(1200, 'LISTA PRODUCTOS: Lenin empanadas'),
  'Empanadas|CHAPARRITA': f(1200, 'LISTA PRODUCTOS: Lenin empanadas'),
  'Empanadas|NAPOLITANA': f(1200, 'LISTA PRODUCTOS: Lenin empanadas'),
  'Bebidas lata 350cc': cero,
  'Bebidas lata 350cc|Coca Cola Zero': f(905, 'LISTA PRODUCTOS: Coca Cola'),
  'Bebidas lata 350cc|Coca Cola': f(905, 'LISTA PRODUCTOS: Coca Cola'),
  'Bebidas lata 350cc|Fanta': f(905, 'LISTA PRODUCTOS: Fanta'),
  'Bebidas lata 350cc|Sprite': f(905, 'LISTA PRODUCTOS: Sprite'),
  'Monster': cero,
  'Monster|Monster normal': f(1417, 'LISTA PRODUCTOS: Monster energy'),
  'Agua': cero,
  'Agua|Sin Gas': f(596, 'LISTA PRODUCTOS: Agua Benedictino sin gas'),
  'Agua|Con Gas': f(596, 'LISTA PRODUCTOS: Agua Benedictino con gas'),

  // ---------- Bebidas preparadas ----------
  'Limonada': cero,
  'Limonada|Limonada Menta': b('FRIAS', 'LIMONADA MENTA'),
  'Limonada|Limonada Azul': b('FRIAS', 'LIMONADA AZUL'),
  'Limonada|Limonada frambuesa': b('FRIAS', 'LIMONADA FRUTILLA'),
  'Jugos': cero,
  'Jugos|Mango': f(636, 'FRIAS: Jugo pulpa frutilla (mismo costo)'),
  'Jugos|Frutilla': f(636, 'FRIAS: Jugo pulpa frutilla'),
  'Jugos|Frambuesa': f(636, 'FRIAS: Jugo pulpa frutilla (mismo costo)'),
  'Iced Americano': b('FRIAS', 'ICED AMERICANO'),
  'Matcha pulpa fuerte': b('FRIAS', 'MATCHA LATTE CREMOSO FUERTE'),
  'Matcha pulpa suave': b('FRIAS', 'MATCHA LATTE CREMOSO SUAVE'),
  'Matcha pulpa fuerte|Leche vegetal': f(711, 'FRIAS: versión vegetal − normal'),
  'Matcha pulpa suave|Leche vegetal': f(711, 'FRIAS: versión vegetal − normal'),
  'Matcha pulpa fuerte|Sin lactosa': SIN_LACTOSA_GRANDE,
  'Matcha pulpa suave|Sin lactosa': SIN_LACTOSA_GRANDE,
  'Matcha pulpa fuerte|Frutilla': cero,
  'Matcha pulpa fuerte|Mango': cero,
  'Matcha pulpa fuerte|Entera': cero,
  'Matcha pulpa suave|Frutilla': cero,
  'Matcha pulpa suave|Mango': cero,
  'Matcha pulpa suave|Entera': cero,
  'Matcha pulpa suave|Descremada': cero,

  'Café espresso': cero,
  'Café espresso|Espresso': b('CAFETERIA', 'ESPRESSO '),
  'Café espresso|Doppio': b('CAFETERIA', 'ESPRESSO DOBLE'),

  // Café chico (8 oz): sin costo propio; cada bebida trae su costo completo
  'Café de especialidd': cero,
  'Café de especialidd|Latte': b('CAFETERIA', 'CAFÉ LATTE ESPECIALIDAD 8'),
  'Café de especialidd|Americano': b('CAFETERIA', 'CAFÉ AMERICANO ESPECIALIDAD 8'),
  'Café de especialidd|Capuccino': b('CAFETERIA', 'CAFÉ CAPUCCINO ESPECIALIDAD 8'),
  'Café de especialidd|Caramel Macchiato': b('CAFETERIA', 'CAFÉ CARAMEL MACCHIATO ESPECIALIDA'),
  'Café de especialidd|Capuccino vainilla': b('CAFETERIA', 'CAFÉ CAPUCCINO VAINILLA ESPECIALID'),
  'Café de especialidd|Latte vainilla': b('CAFETERIA', 'CAFÉ LATTE VAINILLA ESPECIALIDAD 8'),
  'Café de especialidd|Mocca': b('CAFETERIA', 'CAFÉ MOCCA ESPECIALIDAD 8'),
  'Café de especialidd|Mocca blanco': b('CAFETERIA', 'CAFÉ MOCCA BLANCO 8'),
  'Café de especialidd|Choco avellana': b('CAFETERIA', 'CAFÉ AVELLANA CHOCOLATE ESPECIALID'),
  'Café de especialidd|Leche sin lactosa': SIN_LACTOSA_CHICO,
  'Café de especialidd|Leche entera': cero,
  'Café de especialidd|Leche descremada': cero,
  'Café de especialidd|Sin leche (solo para americano y espressos)': cero,
  'Café de especialidd|Pump de syrup': SYRUP_PUMP,
  'Café de especialidd|Leche vegetal': f(569, 'Leche vegetal ≈ 200 ml (FRIAS: vegetal − normal)'),

  'Café de especialidad grande': cero,
  'Café de especialidad grande|Latte': b('CAFETERIA', 'CAFÉ LATTE ESPECIALIDAD 14'),
  'Café de especialidad grande|Capuccino': b('CAFETERIA', 'CAFÉ CAPUCCINO ESPECIALIDAD 14'),
  'Café de especialidad grande|Capuccino vainilla': b('CAFETERIA', 'CAFÉ CAP. VAINILLA ESPECIALIDAD 14'),
  'Café de especialidad grande|Caramel Macchiato': b('CAFETERIA', 'CAFÉ CARAMEL MACC ESPECIALIDAD GRA'),
  'Café de especialidad grande|Mocca': b('CAFETERIA', 'CAFÉ MOCCA ESPECIALIDAD GRANDE'),
  'Café de especialidad grande|Mocca Blanco': b('CAFETERIA', 'CAFÉ MOCCA BLANCO ESPECIALIDAD 14'),
  'Café de especialidad grande|Latte vainilla': b('CAFETERIA', 'CAFÉ LATTE VAINILLA ESPECIALIDAD 1'),
  'Café de especialidad grande|Chai Latte': b('CAFETERIA', 'TÉ CHAI LATTE ESPECIALIDAD 14'),
  'Café de especialidad grande|Dirty Chai Latte': b('CAFETERIA', 'DIRTY CHAI ESPECIALIDAD 14'),
  'Café de especialidad grande|Matcha': b('CAFETERIA', 'TÉ MATCHA ESPECIALIDAD 14'),
  'Café de especialidad grande|Chocolate caliente': b('CAFETERIA', 'CHOCOLATE CALIENTE ESPECIALIDAD 14'),
  'Café de especialidad grande|Leche sin lactosa': SIN_LACTOSA_GRANDE,
  'Café de especialidad grande|Leche entera': cero,
  'Café de especialidad grande|Leche descremada': cero,
  'Café de especialidad grande|extra espresso': SHOT,
  'Café de especialidad grande|Chocolate Avellana': b('CAFETERIA', 'CAFÉ AVELLANA CHOCOLATE ESPECIALID', 1, 1),
  'Café de especialidad grande|Leche vegetal': f(711, 'Leche vegetal ≈ 250 ml (FRIAS: vegetal − normal)'),

  'Té-chocolate': cero,
  'Té-chocolate|Chai-latte': b('CAFETERIA', 'TÉ CHAI LATTE ESPECIALIDAD 8'),
  'Té-chocolate|Dirty chai': b('CAFETERIA', 'DIRTY CHAI ESPECIALIDAD 8'),
  'Té-chocolate|Chocolate caliente': b('CAFETERIA', 'CHOCOLATE CALIENTE ESPECIALIDAD 8'),
  'Té-chocolate|Matcha': b('CAFETERIA', 'TÉ MATCHA ESPECIALIDAD 8'),
  'Té-chocolate|Leche sin lactosa': SIN_LACTOSA_CHICO,
  'Té-chocolate|Leche entera': cero,
  'Té-chocolate|Leche descremada': cero,
  'Té-chocolate|Sin leche (para el te )': cero,
  'Té-chocolate|Leche vegetal': f(569, 'Leche vegetal ≈ 200 ml (FRIAS: vegetal − normal)'),

  // Bebidas frías: costo base + diferencia por sabor
  'Café Frío': CAFE_FRIO_BASE,
  'Café Frío|Caramelo': d(b('FRIAS', 'CAFÉ HELADO CARAMELO'), CAFE_FRIO_BASE),
  'Café Frío|Vainilla': cero,
  'Café Frío|Mocca': cero,
  'Café Frío|Mocca blanco': cero,
  'Café Frío|Chai': cero,
  'Café Frío|Dirty chai': cero,
  'Café Frío|Matcha': cero,
  'Café Frío|Entera': cero,
  'Café Frío|Descremada': cero,
  'Café Frío|Shot simple': cero,
  'Café Frío|Sin Shot de cafe': cero,
  'Café Frío|Shot doble': SHOT,
  'Café Frío|Sin lactosa': SIN_LACTOSA_GRANDE,
  'Café Frío|Leche vegetal': f(711, 'Leche vegetal ≈ 250 ml (FRIAS: vegetal − normal)'),
  'Frapuccino': FRAPPE_BASE,
  'Frapuccino|Caramelo': d(b('FRIAS', 'FRAPUCCINO CARAMELO'), FRAPPE_BASE),
  'Frapuccino|Vainilla': d(b('FRIAS', 'FRAPUCCINO VAINILLA'), FRAPPE_BASE),
  'Frapuccino|Mocca blanco': d(b('FRIAS', 'FRAPUCCINO CHOCOLATE BLANCO'), FRAPPE_BASE),
  'Frapuccino|Chocolate': cero,
  'Frapuccino|Oreo': cero,
  'Frapuccino|Dulce de leche': cero,
  'Frapuccino|Dirty chai': cero,
  'Frapuccino|Chocolate avellana': cero,
  'Frapuccino|Entera': cero,
  'Frapuccino|Descremada': cero,
  'Frapuccino|Shot': cero,
  'Frapuccino|Shot doble': SHOT,
  'Frapuccino|Sin lactosa': SIN_LACTOSA_GRANDE,
  'Frapuccino|Leche vegetal': f(711, 'Leche vegetal ≈ 250 ml (FRIAS: vegetal − normal)'),
  'Milkshake': MILKSHAKE_BASE,
  'Milkshake|Fresas': d(b('FRIAS', 'MILKSHAKE FRESA'), MILKSHAKE_BASE),
  'Milkshake|Chocolate brownie': d(b('FRIAS', 'MILKSHAKE CHOCOLATE BROWNIE'), MILKSHAKE_BASE),
  'Milkshake|Oreo': cero,
  'Milkshake|Caramelo': cero,
  'Milkshake|Entera': cero,
  'Milkshake|Descremada': cero,
  'Milkshake|Sin lactosa': SIN_LACTOSA_GRANDE,

  // Ajustes y abonos no llevan costo (ya están marcados así en la app)
}

// ---- Cálculo: materia prima (mp) y mano de obra + gastos (mo) por unidad ----
function calcular(item) {
  if (item.tipo === 'cero') return { mp: 0, mo: 0, fuente: 'Sin costo propio' }
  if (item.tipo === 'fijo') return { mp: item.valor, mo: 0, fuente: item.fuente }
  if (item.tipo === 'multiplo') {
    const r = calcular(item.item)
    return { mp: r.mp * item.n, mo: r.mo * item.n, fuente: `${item.n} × ${r.fuente}` }
  }
  if (item.tipo === 'suma') {
    const rs = item.items.map(calcular)
    return { mp: rs.reduce((s, r) => s + r.mp, 0), mo: rs.reduce((s, r) => s + r.mo, 0), fuente: rs.map((r) => r.fuente).join(' + ') }
  }
  if (item.tipo === 'delta') {
    const a = calcular(item.item)
    const base = calcular(item.base)
    return { mp: Math.max(0, a.mp - base.mp), mo: Math.max(0, a.mo - base.mo), fuente: `${a.fuente} − base` }
  }
  const bl = bloque(item.hoja, item.nombre, item.indice)
  const rinde = item.rinde ?? bl.rinde ?? 1
  return {
    mp: bl.mp / rinde,
    mo: ((bl.mod || 0) + (bl.gif || 0)) / rinde,
    fuente: `${bl.hoja.trim()} fila ${bl.fila}: ${bl.nombre.trim()} (rinde ${rinde})`,
  }
}

module.exports = { MAPEO, calcular, norm }
