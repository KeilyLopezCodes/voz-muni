import express, { type Express } from 'express';
import request from 'supertest';
import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ALCANCES_NO_PROPIOS } from '../../../src/domain/auth/permisos';
import { manejadorErrores } from '../../../src/presentation/middlewares/manejador-errores';
import { requiereAlgunPermiso } from '../../../src/presentation/middlewares/requiere-permiso';

// Ruta de prueba como GET /dependencias (SPEC 45): tickets.trasladar, o tickets.ver con un alcance que no es propia.
function appCon(usuario: UsuarioAutenticado | null): Express {
  const app = express();
  app.get(
    '/protegida',
    (req, _res, next) => {
      if (usuario) {
        req.usuario = usuario;
      }
      next();
    },
    requiereAlgunPermiso([{ accion: 'tickets.trasladar' }, { accion: 'tickets.ver', alcances: ALCANCES_NO_PROPIOS }]),
    (req, res) => {
      res.json({ alcance: req.alcance });
    },
  );
  app.use(manejadorErrores);
  return app;
}

const usuario = (rol: UsuarioAutenticado['rol'], permisos: UsuarioAutenticado['permisos']): UsuarioAutenticado => ({
  id: 1,
  nombre: rol,
  rol,
  dependenciaId: null,
  permisos,
});

describe('requiereAlgunPermiso', () => {
  it('pasa con el primer permiso y deja su alcance', async () => {
    const res = await request(appCon(usuario('tecnico', { 'tickets.trasladar': 'solicitar', 'tickets.ver': 'asignadas' }))).get(
      '/protegida',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ alcance: 'solicitar' });
  });

  it('pasa con el segundo permiso si el primero falta', async () => {
    const res = await request(appCon(usuario('administrador', { 'tickets.ver': 'todas' }))).get('/protegida');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ alcance: 'todas' });
  });

  it('el alcance propia de tickets.ver no cuenta → 403', async () => {
    const res = await request(appCon(usuario('vecino', { 'tickets.ver': 'propia', 'tickets.crear': 'propia' }))).get(
      '/protegida',
    );
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('PERMISO_DENEGADO');
  });

  it('sin ninguno de los permisos → 403', async () => {
    const res = await request(appCon(usuario('administrador', { 'admin.catalogos': 'si' }))).get('/protegida');
    expect(res.status).toBe(403);
    expect(res.body.codigo).toBe('PERMISO_DENEGADO');
  });

  it('sin autenticar antes → 401', async () => {
    const res = await request(appCon(null)).get('/protegida');
    expect(res.status).toBe(401);
  });
});
