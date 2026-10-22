// Notificaciones (Web Push). Lo carga el service worker de la app (vite.config.ts → importScripts).
self.addEventListener('push', (evento) => {
  let datos = { titulo: 'Broa Pastry', cuerpo: '', url: '/' }
  try {
    datos = { ...datos, ...evento.data.json() }
  } catch {
    if (evento.data) datos.cuerpo = evento.data.text()
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: datos.url },
      lang: 'es-CL',
    }),
  )
})

// Al tocar la notificación: abre (o enfoca) la app en la pantalla indicada
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const url = new URL(evento.notification.data?.url ?? '/', self.location.origin).href
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          v.navigate(url)
          return v.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
