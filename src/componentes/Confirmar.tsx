import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

// Confirmación dentro de la app. Reemplaza window.confirm(), que en el iPhone
// con la app instalada en la pantalla de inicio a veces no aparece.

interface Pregunta {
  mensaje: string
  accion?: string
  peligro?: boolean
}

type Confirmar = (p: Pregunta) => Promise<boolean>

const Contexto = createContext<Confirmar | null>(null)

export function ConfirmarProvider({ children }: { children: ReactNode }) {
  const [pregunta, setPregunta] = useState<Pregunta | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})

  const confirmar = useCallback<Confirmar>((p) => {
    setPregunta(p)
    return new Promise<boolean>((res) => {
      resolver.current = res
    })
  }, [])

  function responder(v: boolean) {
    setPregunta(null)
    resolver.current(v)
  }

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      {pregunta && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
          onClick={() => responder(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmar-mensaje"
            className="w-full max-w-sm rounded-3xl bg-superficie p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="confirmar-mensaje" className="mb-5 text-base leading-relaxed">
              {pregunta.mensaje}
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => responder(true)}
                className={`min-h-12 rounded-2xl font-semibold ${
                  pregunta.peligro ? 'bg-peligro text-white' : 'bg-primario text-primario-texto'
                }`}
              >
                {pregunta.accion ?? 'Sí'}
              </button>
              <button
                type="button"
                onClick={() => responder(false)}
                className="min-h-12 rounded-2xl border border-borde font-semibold active:bg-superficie-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Contexto.Provider>
  )
}

export function useConfirmar() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useConfirmar debe usarse dentro de ConfirmarProvider')
  return c
}
