import CancelRounded from '@mui/icons-material/CancelRounded'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { CLAVES_BITACORA, consultarBitacora, type FiltrosBitacora, listarAcciones } from '../api/bitacora-api'
import { DIAS_POR_DEFECTO, esFechaValida, fechaLocalGuatemala, problemaDelRango, RANGO_MAXIMO_DIAS, sumarDias } from './fechas'
import { RegistroBitacora } from './RegistroBitacora'

const FORMATO_NUMERO = /^Q-\d{4}-\d{6}$/

// Bitácora de auditoría (RF-42, SPEC 41), de solo lectura. El backend aplica el alcance de bitacora.ver: el
// coordinador ve su dependencia y el supervisor y el administrador, todo. Los filtros van en la URL
// (?desde=&hasta=&accion=&numero=&usuarioId=); sin fechas, los últimos 7 días de Guatemala, que no se escriben.
export function BitacoraPage() {
  const { t } = useTranslation('reportes')
  const [parametros, setParametros] = useSearchParams()
  const hoy = fechaLocalGuatemala(new Date())
  const hasta = esFechaValida(parametros.get('hasta')) ? parametros.get('hasta')! : hoy
  const desde = esFechaValida(parametros.get('desde')) ? parametros.get('desde')! : sumarDias(hasta, -(DIAS_POR_DEFECTO - 1))
  // La clave de la consulta es el contenido, no el arreglo nuevo de cada render.
  const accionesUrl = parametros.getAll('accion').join(',')
  const acciones = useMemo(() => (accionesUrl === '' ? [] : accionesUrl.split(',')), [accionesUrl])
  const numeroUrl = parametros.get('numero')
  const numero = numeroUrl !== null && FORMATO_NUMERO.test(numeroUrl) ? numeroUrl : null
  const usuarioId = Number.parseInt(parametros.get('usuarioId') ?? '', 10) || null
  const problema = problemaDelRango(desde, hasta)

  const filtros: FiltrosBitacora = useMemo(
    () => ({ desde, hasta, acciones, numero, usuarioId }),
    [desde, hasta, acciones, numero, usuarioId],
  )
  const catalogo = useQuery({ queryKey: CLAVES_BITACORA.acciones, queryFn: listarAcciones })
  const lista = useInfiniteQuery({
    queryKey: CLAVES_BITACORA.lista(filtros),
    queryFn: ({ pageParam }) => consultarBitacora(filtros, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (pagina) => pagina.siguienteCursor,
    enabled: problema === null,
  })
  const registros = lista.data?.pages.flatMap((pagina) => pagina.datos) ?? []
  const [usuarioNombre, setUsuarioNombre] = useState<string | null>(null)
  const nombreDelUsuario = usuarioNombre ?? registros.find((r) => r.usuario?.id === usuarioId)?.usuario?.nombre ?? null

  const [numeroTexto, setNumeroTexto] = useState(numeroUrl ?? '')
  const numeroInvalido = numeroTexto.trim() !== '' && !FORMATO_NUMERO.test(numeroTexto.trim().toUpperCase())

  // Cada cambio reemplaza solo su parámetro; los valores por defecto no se escriben.
  const fijar = useCallback(
    (cambios: Record<string, string | string[] | null>, reemplazar = false) => {
      setParametros(
        (actuales) => {
          const siguientes = new URLSearchParams(actuales)
          for (const [clave, valor] of Object.entries(cambios)) {
            siguientes.delete(clave)
            for (const v of Array.isArray(valor) ? valor : valor === null ? [] : [valor]) {
              siguientes.append(clave, v)
            }
          }
          return siguientes
        },
        { replace: reemplazar },
      )
    },
    [setParametros],
  )

  const cambiarNumero = (texto: string) => {
    setNumeroTexto(texto)
    const limpio = texto.trim().toUpperCase()
    if (limpio === '') fijar({ numero: null }, true)
    else if (FORMATO_NUMERO.test(limpio)) fijar({ numero: limpio }, true)
  }

  const etiquetaAccion = (accion: string) => t(`bitacora.acciones.${accion}`, { defaultValue: accion })

  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('bitacora.titulo')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t('bitacora.descripcion')}
      </Typography>

      <Stack component="section" aria-label={t('bitacora.filtros.titulo')} spacing={2} sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            type="date"
            size="small"
            label={t('bitacora.filtros.desde')}
            value={desde}
            onChange={(evento) => fijar({ desde: esFechaValida(evento.target.value) ? evento.target.value : null })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            size="small"
            label={t('bitacora.filtros.hasta')}
            value={hasta}
            onChange={(evento) => fijar({ hasta: esFechaValida(evento.target.value) ? evento.target.value : null })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        {problema !== null && (
          <Alert severity="warning" role="alert">
            {t(`bitacora.filtros.${problema}`, { dias: RANGO_MAXIMO_DIAS })}
          </Alert>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            size="small"
            label={t('bitacora.filtros.acciones')}
            value={acciones}
            onChange={(evento) => {
              const valor = evento.target.value as unknown as string[] | string
              fijar({ accion: Array.isArray(valor) ? valor : valor.split(',') })
            }}
            slotProps={{
              select: {
                multiple: true,
                displayEmpty: true,
                renderValue: (elegidas) => {
                  const lista = elegidas as string[]
                  if (lista.length === 0) return t('bitacora.filtros.todasLasAcciones')
                  return lista.length === 1 ? etiquetaAccion(lista[0]) : t('bitacora.filtros.accionesElegidas', { count: lista.length })
                },
              },
              inputLabel: { shrink: true },
            }}
            sx={{ minWidth: 0, flex: 1 }}
          >
            {(catalogo.data ?? []).map(({ accion }) => (
              <MenuItem key={accion} value={accion}>
                <ListItemText primary={etiquetaAccion(accion)} />
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={t('bitacora.filtros.numero')}
            value={numeroTexto}
            onChange={(evento) => cambiarNumero(evento.target.value)}
            error={numeroInvalido}
            helperText={numeroInvalido ? t('bitacora.filtros.numeroInvalido') : t('bitacora.filtros.numeroAyuda')}
            sx={{ minWidth: 0, flex: 1 }}
          />
        </Stack>
        {usuarioId !== null && (
          <Stack direction="row">
            <Chip
              label={
                nombreDelUsuario === null
                  ? t('bitacora.filtros.usuarioSinNombre', { id: usuarioId })
                  : t('bitacora.filtros.usuario', { nombre: nombreDelUsuario })
              }
              onDelete={() => {
                setUsuarioNombre(null)
                fijar({ usuarioId: null })
              }}
              deleteIcon={<CancelRounded aria-label={t('bitacora.filtros.quitarUsuario')} aria-hidden={false} />}
              sx={{ maxWidth: '100%' }}
            />
          </Stack>
        )}
      </Stack>

      <Stack spacing={1.5}>
        {lista.isPending && problema === null && <CircularProgress aria-label={t('bitacora.cargando')} />}
        {lista.isError && (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={() => void lista.refetch()}>
                {t('bitacora.reintentar')}
              </Button>
            }
          >
            {t('bitacora.errorCarga')}
          </Alert>
        )}
        {lista.isSuccess && registros.length === 0 && <Typography color="text.secondary">{t('bitacora.vacia')}</Typography>}

        {registros.map((registro) => (
          <RegistroBitacora
            key={registro.id}
            registro={registro}
            onFiltrarUsuario={(usuario) => {
              setUsuarioNombre(usuario.nombre)
              fijar({ usuarioId: String(usuario.id) })
            }}
          />
        ))}

        {lista.hasNextPage && (
          <Button
            variant="outlined"
            onClick={() => void lista.fetchNextPage()}
            loading={lista.isFetchingNextPage}
            sx={{ alignSelf: 'center' }}
          >
            {t('bitacora.verMas')}
          </Button>
        )}
      </Stack>
    </>
  )
}
