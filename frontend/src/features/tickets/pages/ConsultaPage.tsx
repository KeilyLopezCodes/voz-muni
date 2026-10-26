import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ApiError } from '../../../shared/api/api-error'
import { PantallaPublica } from '../../../shared/layout/PantallaPublica'
import { type ConsultaPublica, consultarQueja } from '../api/consulta-publica-api'
import { type DatosConsulta, FormularioConsulta } from '../consulta/FormularioConsulta'
import { ResultadoConsulta } from '../consulta/ResultadoConsulta'

const ERRORES_CONOCIDOS = new Set(['CONSULTA_NO_ENCONTRADA', 'DEMASIADAS_PETICIONES', 'VALIDACION'])

// Consulta pública del estado de una queja, sin sesión (RF-35, SPEC 37). La URL solo lleva ?numero=: el contacto
// vive en el formulario. El resultado queda en memoria: recargar vuelve al formulario y nada se guarda en el
// navegador.
export function ConsultaPage() {
  const { t } = useTranslation('tickets')
  const [parametros] = useSearchParams()
  const [resultado, setResultado] = useState<ConsultaPublica | null>(null)
  const [error, setError] = useState<string | null>(null)

  const consultar = async ({ numero, contacto }: DatosConsulta) => {
    setError(null)
    setResultado(null)
    try {
      setResultado(await consultarQueja(numero, contacto))
    } catch (e) {
      const codigo = e instanceof ApiError ? e.codigo : ''
      setError(ERRORES_CONOCIDOS.has(codigo) ? codigo : 'GENERICO')
    }
  }

  return (
    <PantallaPublica titulo={t('consulta.titulo')}>
      <Stack spacing={3}>
        <Typography>{t('consulta.instrucciones')}</Typography>
        <FormularioConsulta numeroInicial={(parametros.get('numero') ?? '').trim().toUpperCase()} onConsultar={consultar} />
        <Box aria-live="polite">
          {error && (
            <Alert severity={error === 'DEMASIADAS_PETICIONES' ? 'warning' : 'error'} role="alert">
              {t(`consulta.errores.${error}`)}
            </Alert>
          )}
          {resultado && <ResultadoConsulta consulta={resultado} />}
        </Box>
      </Stack>
    </PantallaPublica>
  )
}
