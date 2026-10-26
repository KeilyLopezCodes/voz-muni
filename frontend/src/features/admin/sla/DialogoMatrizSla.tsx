import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../shared/api/api-error'
import {
  type CategoriaSla,
  PRIORIDADES,
  type Prioridad,
  reemplazarPoliticasSla,
} from '../api/politicas-sla-api'
import {
  aPlazos,
  CAMPOS_HORAS,
  type CampoHoras,
  tieneErrores,
  validarMatriz,
  type ValoresMatriz,
  valoresIniciales,
} from './validar-matriz'

interface DialogoMatrizSlaProps {
  categoria: CategoriaSla
  onCancelar: () => void
  onGuardado: (actualizada: CategoriaSla) => void
}

const ETIQUETA_CAMPO: Record<CampoHoras, string> = {
  horasRespuesta: 'sla.dialogo.respuesta',
  horasResolucion: 'sla.dialogo.resolucion',
}

// Edición de la matriz de SLA de una categoría (SPEC 29): las 4 prioridades juntas, con las reglas copiadas del
// servidor. Un 400 MATRIZ_SLA_INVALIDA se muestra en el campo de cada detalle.
export function DialogoMatrizSla({ categoria, onCancelar, onGuardado }: DialogoMatrizSlaProps) {
  const { t } = useTranslation(['admin', 'comun'])
  const idTitulo = useId()
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<ValoresMatriz>({ defaultValues: valoresIniciales(categoria.plazos) })

  const guardado = useMutation({
    mutationFn: (valores: ValoresMatriz) => reemplazarPoliticasSla(categoria.categoria.id, aPlazos(valores)),
    onMutate: () => setErrorGeneral(null),
    onSuccess: onGuardado,
    onError: (fallo) => {
      if (fallo instanceof ApiError && fallo.codigo === 'MATRIZ_SLA_INVALIDA') {
        let ubicados = 0
        for (const detalle of fallo.detalles as { prioridad?: string; campo: string; problema: string }[]) {
          const prioridad = detalle.prioridad as Prioridad | undefined
          if (prioridad && PRIORIDADES.includes(prioridad) && (CAMPOS_HORAS as readonly string[]).includes(detalle.campo)) {
            setError(`${prioridad}.${detalle.campo as CampoHoras}`, {
              type: 'servidor',
              message: t(`admin:sla.dialogo.errores.${detalle.problema}`),
            })
            ubicados++
          }
        }
        if (ubicados === 0) setErrorGeneral(t('admin:sla.dialogo.errorGuardar'))
        return
      }
      setErrorGeneral(
        t(fallo instanceof ApiError && fallo.status === 404 ? 'admin:sla.dialogo.noEncontrada' : 'admin:sla.dialogo.errorGuardar'),
      )
    },
  })

  const enviar = handleSubmit((valores) => {
    clearErrors()
    const problemas = validarMatriz(valores)
    if (tieneErrores(problemas)) {
      for (const prioridad of PRIORIDADES) {
        for (const campo of CAMPOS_HORAS) {
          const problema = problemas[prioridad]?.[campo]
          if (problema) {
            setError(`${prioridad}.${campo}`, { type: 'cliente', message: t(`admin:sla.dialogo.errores.${problema}`) })
          }
        }
      }
      return
    }
    guardado.mutate(valores)
  })

  return (
    <Dialog open onClose={onCancelar} fullWidth maxWidth="sm" aria-labelledby={idTitulo}>
      <DialogTitle id={idTitulo} sx={{ overflowWrap: 'anywhere' }}>
        {t('admin:sla.dialogo.titulo', { categoria: categoria.categoria.nombre })}
      </DialogTitle>
      <Box component="form" noValidate onSubmit={(evento) => void enviar(evento)}>
        <DialogContent sx={{ pt: 0 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('admin:sla.dialogo.aviso')}
          </Alert>
          {errorGeneral && (
            <Alert severity="error" role="alert" sx={{ mb: 2 }}>
              {errorGeneral}
            </Alert>
          )}
          {/* De urgente a baja, como se piensan los plazos; el envío va en el orden de PRIORIDADES. */}
          {[...PRIORIDADES].reverse().map((prioridad) => (
            <Box component="fieldset" key={prioridad} sx={{ border: 0, p: 0, m: 0, mb: 2, minWidth: 0 }}>
              <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
                {t(`comun:prioridades.${prioridad}`)}
              </Typography>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {CAMPOS_HORAS.map((campo) => {
                  const error = errors[prioridad]?.[campo]
                  return (
                    <TextField
                      key={campo}
                      {...register(`${prioridad}.${campo}`)}
                      label={t(`admin:${ETIQUETA_CAMPO[campo]}`)}
                      type="number"
                      size="small"
                      required
                      slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
                      error={Boolean(error)}
                      helperText={error?.message}
                    />
                  )
                })}
              </Box>
            </Box>
          ))}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={onCancelar}>{t('admin:sla.dialogo.cancelar')}</Button>
          <Button type="submit" variant="contained" disabled={guardado.isPending}>
            {guardado.isPending ? t('admin:sla.dialogo.guardando') : t('admin:sla.dialogo.guardar')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
