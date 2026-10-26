import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CLAVES_CATALOGOS, crearZona, editarZona, listarZonas, TIPOS_ZONA, type TipoZona, type ZonaAdmin } from '../api/catalogos-admin-api'
import { codigoDeError, ConfirmarDesactivar, DialogoCatalogo } from './DialogoCatalogo'
import { type Columna, ListaCatalogo } from './ListaCatalogo'

// /admin/zonas (SPEC 40). Los 3 tipos son fijos. Desactivar una zona la quita del registro de quejas; las quejas que
// ya la tienen la siguen mostrando.
export function ZonasPage() {
  const { t } = useTranslation(['admin', 'comun'])
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: CLAVES_CATALOGOS.zonas, queryFn: listarZonas })
  const [dialogo, setDialogo] = useState<{ editando: ZonaAdmin | null } | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoZona>('zona')
  const [error, setError] = useState<string | null>(null)
  const [desactivando, setDesactivando] = useState<ZonaAdmin | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const listo = () => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_CATALOGOS.zonas })
    setAviso(t('admin:catalogos.guardado'))
  }

  const guardar = useMutation({
    mutationFn: () => (dialogo?.editando ? editarZona(dialogo.editando.id, { nombre, tipo }) : crearZona(nombre, tipo)),
    onMutate: () => setError(null),
    onSuccess: () => {
      setDialogo(null)
      listo()
    },
    onError: (fallo) => setError(codigoDeError(fallo)),
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => editarZona(id, { activa }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setDesactivando(null)
      listo()
    },
    onError: (fallo) => setError(codigoDeError(fallo)),
  })

  const abrir = (editando: ZonaAdmin | null) => {
    setNombre(editando?.nombre ?? '')
    setTipo(editando?.tipo ?? 'zona')
    setError(null)
    setDialogo({ editando })
  }

  const columnas: Columna<ZonaAdmin>[] = [{ titulo: t('admin:catalogos.zonas.tipo'), valor: (z) => t(`comun:tiposZona.${z.tipo}`) }]

  return (
    <>
      <ListaCatalogo
        titulo={t('admin:catalogos.zonas.titulo')}
        descripcion={t('admin:catalogos.zonas.descripcion')}
        textoNuevo={t('admin:catalogos.zonas.nueva')}
        onNuevo={() => abrir(null)}
        consulta={consulta}
        columnas={columnas}
        aviso={aviso}
        onCerrarAviso={() => setAviso(null)}
        acciones={(z) => (
          <>
            <Button size="small" onClick={() => abrir(z)} aria-label={`${t('admin:catalogos.editar')} ${z.nombre}`}>
              {t('admin:catalogos.editar')}
            </Button>
            {z.activa ? (
              <Button
                size="small"
                color="error"
                onClick={() => {
                  setError(null)
                  setDesactivando(z)
                }}
                aria-label={`${t('admin:catalogos.desactivar')} ${z.nombre}`}
              >
                {t('admin:catalogos.desactivar')}
              </Button>
            ) : (
              <Button
                size="small"
                onClick={() => cambiarEstado.mutate({ id: z.id, activa: true })}
                aria-label={`${t('admin:catalogos.activar')} ${z.nombre}`}
              >
                {t('admin:catalogos.activar')}
              </Button>
            )}
          </>
        )}
      />

      <DialogoCatalogo
        abierto={dialogo !== null}
        titulo={t(dialogo?.editando ? 'admin:catalogos.zonas.editarTitulo' : 'admin:catalogos.zonas.nueva')}
        nombre={nombre}
        onNombre={setNombre}
        error={error}
        enviando={guardar.isPending}
        onCerrar={() => setDialogo(null)}
        onGuardar={() => guardar.mutate()}
      >
        <TextField select label={t('admin:catalogos.zonas.tipo')} value={tipo} onChange={(evento) => setTipo(evento.target.value as TipoZona)} fullWidth>
          {TIPOS_ZONA.map((valor) => (
            <MenuItem key={valor} value={valor}>
              {t(`comun:tiposZona.${valor}`)}
            </MenuItem>
          ))}
        </TextField>
      </DialogoCatalogo>

      <ConfirmarDesactivar
        nombre={desactivando?.nombre ?? null}
        enviando={cambiarEstado.isPending}
        error={desactivando ? error : null}
        onCancelar={() => setDesactivando(null)}
        onConfirmar={() => desactivando && cambiarEstado.mutate({ id: desactivando.id, activa: false })}
      />
    </>
  )
}
