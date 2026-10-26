import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router'
import type { RegistroBitacora as Registro } from '../api/bitacora-api'
import { fechaHoraGuatemala } from './fechas'

interface Props {
  registro: Registro
  onFiltrarUsuario: (usuario: { id: number; nombre: string }) => void
}

// Los valores llegan saneados y enmascarados desde el backend: se muestran tal cual.
function valorLegible(valor: unknown, vacio: string): string {
  if (valor === null || valor === undefined || valor === '') return vacio
  return typeof valor === 'string' ? valor : JSON.stringify(valor)
}

const celda = { overflowWrap: 'anywhere', verticalAlign: 'top' } as const

// Un registro de la bitácora (SPEC 41): fecha en Guatemala, quién (o "VozMuni" para el sistema), la acción traducida,
// la entidad y la dependencia. Al expandirlo, los cambios "Campo · Antes · Después", los datos y la IP.
export function RegistroBitacora({ registro, onFiltrarUsuario }: Props) {
  const { t, i18n } = useTranslation('reportes')
  const [abierto, setAbierto] = useState(false)
  const idDetalle = useId()
  const vacio = t('bitacora.registro.vacio')
  const cambios = Object.entries(registro.detalle.cambios ?? {})
  const datos = Object.entries(registro.detalle.datos ?? {})
  const accion = t(`bitacora.acciones.${registro.accion}`, { defaultValue: registro.accion })
  const entidad = t(`bitacora.entidades.${registro.entidad}`, { defaultValue: registro.entidad })

  return (
    <Card variant="outlined" component="article" aria-label={`${accion} · ${fechaHoraGuatemala(registro.creadoEn, i18n.language)}`}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          <time dateTime={registro.creadoEn}>{fechaHoraGuatemala(registro.creadoEn, i18n.language)}</time>
        </Typography>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
          {accion}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 0.5, alignItems: 'baseline' }}>
          {registro.usuario ? (
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={() => onFiltrarUsuario({ id: registro.usuario!.id, nombre: registro.usuario!.nombre })}
              aria-label={t('bitacora.registro.filtrarPorUsuario', { nombre: registro.usuario.nombre })}
              sx={{ overflowWrap: 'anywhere', textAlign: 'left' }}
            >
              {registro.usuario.nombre}
            </Link>
          ) : (
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {t('bitacora.registro.sistema')}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            ·
          </Typography>
          {registro.ticketNumero !== null && registro.entidadId !== null ? (
            <Link
              component={RouterLink}
              to={`/tickets/${registro.entidadId}`}
              variant="body2"
              aria-label={t('bitacora.registro.verQueja', { numero: registro.ticketNumero })}
            >
              {registro.ticketNumero}
            </Link>
          ) : (
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {registro.entidadId === null ? entidad : t('bitacora.registro.entidadConId', { entidad, id: registro.entidadId })}
            </Typography>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {registro.dependencia?.nombre ?? t('bitacora.registro.sinDependencia')}
        </Typography>

        <Button
          size="small"
          onClick={() => setAbierto((valor) => !valor)}
          aria-expanded={abierto}
          aria-controls={idDetalle}
          endIcon={abierto ? <ExpandLessRounded /> : <ExpandMoreRounded />}
          sx={{ mt: 1, ml: -0.5 }}
        >
          {abierto ? t('bitacora.registro.ocultarDetalle') : t('bitacora.registro.verDetalle')}
        </Button>
        <Collapse in={abierto} unmountOnExit>
          <Box id={idDetalle} sx={{ mt: 1 }}>
            {cambios.length > 0 && (
              <>
                <Typography variant="subtitle2" component="h3">
                  {t('bitacora.registro.cambios')}
                </Typography>
                <Table size="small" aria-label={t('bitacora.registro.cambios')} sx={{ tableLayout: 'fixed', mb: 1 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={celda}>{t('bitacora.registro.campo')}</TableCell>
                      <TableCell sx={celda}>{t('bitacora.registro.antes')}</TableCell>
                      <TableCell sx={celda}>{t('bitacora.registro.despues')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cambios.map(([campo, { antes, despues }]) => (
                      <TableRow key={campo}>
                        <TableCell component="th" scope="row" sx={celda}>
                          {campo}
                        </TableCell>
                        <TableCell sx={celda}>{valorLegible(antes, vacio)}</TableCell>
                        <TableCell sx={celda}>{valorLegible(despues, vacio)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            {datos.length > 0 && (
              <>
                <Typography variant="subtitle2" component="h3">
                  {t('bitacora.registro.datos')}
                </Typography>
                <Box component="dl" sx={{ m: 0, mb: 1 }}>
                  {datos.map(([clave, valor]) => (
                    <Box key={clave} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Typography component="dt" variant="body2" sx={{ fontWeight: 700 }}>
                        {clave}
                      </Typography>
                      <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere', minWidth: 0 }}>
                        {valorLegible(valor, vacio)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
            {cambios.length === 0 && datos.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('bitacora.registro.sinDetalle')}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {registro.ip === null ? t('bitacora.registro.sinIp') : t('bitacora.registro.ip', { ip: registro.ip })}
            </Typography>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  )
}
