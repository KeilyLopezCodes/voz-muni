import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MuiLink from '@mui/material/Link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError, type RegistroError } from '../../../shared/api/api-error'
import {
  CLAVES_CATALOGOS,
  crearDependencia,
  type DependenciaAdmin,
  editarDependencia,
  listarDependencias,
} from '../api/catalogos-admin-api'
import { CLAVES_POLITICAS_SLA } from '../api/politicas-sla-api'
import { codigoDeError, ConfirmarDesactivar, DialogoCatalogo } from './DialogoCatalogo'
import { type Columna, ListaCatalogo } from './ListaCatalogo'

// /admin/dependencias (SPEC 40): crear, renombrar, activar y desactivar. Desactivar con categorías activas responde
// DEPENDENCIA_EN_USO, y el aviso enlaza a cada una para editarla.
export function DependenciasPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: CLAVES_CATALOGOS.dependencias, queryFn: listarDependencias })
  const [dialogo, setDialogo] = useState<{ editando: DependenciaAdmin | null } | null>(null)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [desactivando, setDesactivando] = useState<DependenciaAdmin | null>(null)
  const [enUso, setEnUso] = useState<RegistroError[]>([])
  const [aviso, setAviso] = useState<string | null>(null)

  const recargar = () => {
    void queryClient.invalidateQueries({ queryKey: CLAVES_CATALOGOS.dependencias })
    void queryClient.invalidateQueries({ queryKey: CLAVES_CATALOGOS.categorias })
    void queryClient.invalidateQueries({ queryKey: CLAVES_POLITICAS_SLA.lista })
  }
  const listo = () => {
    recargar()
    setAviso(t('catalogos.guardado'))
  }

  const guardar = useMutation({
    mutationFn: () => (dialogo?.editando ? editarDependencia(dialogo.editando.id, { nombre }) : crearDependencia(nombre)),
    onMutate: () => setError(null),
    onSuccess: () => {
      setDialogo(null)
      listo()
    },
    onError: (fallo) => setError(codigoDeError(fallo)),
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) => editarDependencia(id, { activa }),
    onMutate: () => {
      setError(null)
      setEnUso([])
    },
    onSuccess: () => {
      setDesactivando(null)
      listo()
    },
    onError: (fallo) => {
      setError(codigoDeError(fallo))
      setEnUso(fallo instanceof ApiError ? fallo.registros : [])
    },
  })

  const abrir = (editando: DependenciaAdmin | null) => {
    setNombre(editando?.nombre ?? '')
    setError(null)
    setDialogo({ editando })
  }

  const columnas: Columna<DependenciaAdmin>[] = [
    { titulo: t('catalogos.dependencias.categoriasActivas'), valor: (d) => d.categoriasActivas },
    { titulo: t('catalogos.dependencias.usuarios'), valor: (d) => d.usuariosActivos },
    { titulo: t('catalogos.dependencias.quejasAbiertas'), valor: (d) => d.quejasAbiertas },
  ]

  return (
    <>
      <ListaCatalogo
        titulo={t('catalogos.dependencias.titulo')}
        descripcion={t('catalogos.dependencias.descripcion')}
        textoNuevo={t('catalogos.dependencias.nueva')}
        onNuevo={() => abrir(null)}
        consulta={consulta}
        columnas={columnas}
        aviso={aviso}
        onCerrarAviso={() => setAviso(null)}
        acciones={(d) => (
          <>
            <Button size="small" onClick={() => abrir(d)} aria-label={`${t('catalogos.editar')} ${d.nombre}`}>
              {t('catalogos.editar')}
            </Button>
            {d.activa ? (
              <Button
                size="small"
                color="error"
                onClick={() => {
                  setError(null)
                  setEnUso([])
                  setDesactivando(d)
                }}
                aria-label={`${t('catalogos.desactivar')} ${d.nombre}`}
              >
                {t('catalogos.desactivar')}
              </Button>
            ) : (
              <Button
                size="small"
                onClick={() => cambiarEstado.mutate({ id: d.id, activa: true })}
                aria-label={`${t('catalogos.activar')} ${d.nombre}`}
              >
                {t('catalogos.activar')}
              </Button>
            )}
          </>
        )}
      />

      <DialogoCatalogo
        abierto={dialogo !== null}
        titulo={t(dialogo?.editando ? 'catalogos.dependencias.editarTitulo' : 'catalogos.dependencias.nueva')}
        nombre={nombre}
        onNombre={setNombre}
        error={error}
        enviando={guardar.isPending}
        onCerrar={() => setDialogo(null)}
        onGuardar={() => guardar.mutate()}
      />

      <ConfirmarDesactivar
        nombre={desactivando?.nombre ?? null}
        enviando={cambiarEstado.isPending}
        error={desactivando ? error : null}
        avisoError={
          enUso.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2 }}>
              {enUso.map((categoria) => (
                <li key={categoria.id}>
                  <MuiLink component={Link} to={`/admin/categorias?editar=${categoria.id}`}>
                    {t('catalogos.dependencias.editarCategoria', { nombre: categoria.nombre })}
                  </MuiLink>
                </li>
              ))}
            </Box>
          )
        }
        onCancelar={() => setDesactivando(null)}
        onConfirmar={() => desactivando && cambiarEstado.mutate({ id: desactivando.id, activa: false })}
      />
    </>
  )
}
