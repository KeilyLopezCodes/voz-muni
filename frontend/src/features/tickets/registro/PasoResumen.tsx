import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { type CampoExtra, CLAVES_REGISTRO, listarCategorias, listarZonas, type ValorExtra } from '../api/registro-api'
import type { EstadoRegistro, Paso } from './estado-registro'
import { estaAusente, ordenarCampos } from './validar-datos-extra'

interface PasoResumenProps {
  pasos: Paso[]
  irAPaso: (paso: Paso) => void
}

interface Dato {
  etiqueta: string
  valor: ReactNode
}

// Todo lo que se enviará, en solo lectura, con un "Editar" por sección que vuelve a su paso.
export function PasoResumen({ pasos, irAPaso }: PasoResumenProps) {
  const { t } = useTranslation('tickets')
  const { getValues } = useFormContext<EstadoRegistro>()
  const valores = getValues()
  const categorias = useQuery({ queryKey: CLAVES_REGISTRO.categorias, queryFn: listarCategorias })
  const categoria = categorias.data?.find((elegida) => elegida.id === valores.categoriaId)
  const zonas = useQuery({ queryKey: CLAVES_REGISTRO.zonas, queryFn: listarZonas })
  const zona = zonas.data?.find((elegida) => elegida.id === valores.zonaId)

  // Valor legible de un campo adicional: la etiqueta de la opción, Sí/No o el texto recortado.
  const valorExtra = (campo: CampoExtra, valor: ValorExtra): string => {
    if (campo.tipo === 'si_no') {
      return t(valor ? 'nuevo.camposExtra.si' : 'nuevo.camposExtra.no')
    }
    if (campo.tipo === 'seleccion') {
      return campo.opciones.find((opcion) => opcion.valor === valor)?.etiqueta ?? String(valor)
    }
    return String(valor).trim()
  }

  const datosPorPaso: Partial<Record<Paso, Dato[]>> = {
    solicitante: [
      { etiqueta: t('nuevo.solicitante.alta.nombre'), valor: valores.solicitante?.nombre ?? '' },
      {
        etiqueta: t('nuevo.solicitante.contacto'),
        valor:
          [valores.solicitante?.email, valores.solicitante?.telefono].filter(Boolean).join(' · ') ||
          t('nuevo.solicitante.sinContacto'),
      },
      {
        etiqueta: t('nuevo.solicitante.canal'),
        valor: valores.canal ? t(`nuevo.solicitante.canales.${valores.canal}`) : '',
      },
    ],
    categoria: [
      { etiqueta: t('nuevo.categoria.etiqueta'), valor: categoria?.nombre ?? '' },
      ...ordenarCampos(categoria?.camposExtra ?? [])
        .filter((campo) => !estaAusente(valores.datosExtra[campo.clave]))
        .map((campo) => ({ etiqueta: campo.etiqueta, valor: valorExtra(campo, valores.datosExtra[campo.clave]) })),
    ],
    descripcion: [
      { etiqueta: t('nuevo.descripcion.titulo'), valor: valores.titulo.trim() },
      { etiqueta: t('nuevo.descripcion.descripcion'), valor: valores.descripcion.trim() },
    ],
    ubicacion: [
      { etiqueta: t('nuevo.ubicacion.zona'), valor: zona?.nombre ?? '' },
      { etiqueta: t('nuevo.ubicacion.direccion'), valor: valores.direccion.trim() },
      {
        etiqueta: t('nuevo.ubicacion.mapa'),
        valor: valores.ubicacion
          ? t('nuevo.ubicacion.puntoMarcado', { latitud: valores.ubicacion.lat, longitud: valores.ubicacion.lng })
          : t('nuevo.ubicacion.sinPunto'),
      },
    ],
  }

  return (
    <Stack spacing={2}>
      {pasos.map((paso) => {
        const datos = datosPorPaso[paso]
        if (!datos) {
          return null
        }
        const nombre = t(`nuevo.pasos.${paso}`)
        return (
          <Paper key={paso} variant="outlined" component="section" aria-label={nombre} sx={{ p: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1" component="h3">
                {nombre}
              </Typography>
              <Button size="small" onClick={() => irAPaso(paso)} aria-label={t('nuevo.acciones.editarPaso', { paso: nombre })}>
                {t('nuevo.acciones.editar')}
              </Button>
            </Stack>
            <Box component="dl" sx={{ m: 0 }}>
              {datos.map(({ etiqueta, valor }) => (
                <Box key={etiqueta} sx={{ mb: 1 }}>
                  <Typography component="dt" variant="body2" color="text.secondary">
                    {etiqueta}
                  </Typography>
                  <Typography component="dd" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {valor}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )
      })}
    </Stack>
  )
}
