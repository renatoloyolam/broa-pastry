/** Barra de avance hacia la meta. Sobre 100% se pinta completa en verde. */
export function BarraMeta({ avance, alta = false }: { avance: number; alta?: boolean }) {
  const ancho = Math.max(0, Math.min(1, avance)) * 100
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(avance * 100)}
      className={`block overflow-hidden rounded-full bg-superficie-2 ${alta ? 'h-4' : 'h-2.5'}`}
    >
      <span
        className={`block h-full rounded-full transition-all ${avance >= 1 ? 'bg-exito' : 'bg-acento'}`}
        style={{ width: `${ancho}%` }}
      />
    </span>
  )
}
