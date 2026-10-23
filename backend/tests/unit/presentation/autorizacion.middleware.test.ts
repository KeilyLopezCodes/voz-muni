import express, { type Express } from 'express';
import request from 'supertest';
import { AutorizacionService } from '../../../src/application/services/autorizacion.service';
import type { PayloadAcceso } from '../../../src/domain/auth/token-service';
import type { UsuarioActivo, UsuarioRepository } from '../../../src/domain/repositories/usuario-repository';
import { JwtTokenService } from '../../../src/infrastructure/auth/jwt-token-service';
import { autenticar } from '../../../src/presentation/middlewares/autenticar';
import { manejadorErrores } from '../../../src/presentation/middlewares/manejador-errores';
import { requierePermiso } from '../../../src/presentation/middlewares/requiere-permiso';

const SECRETO = 'secreto-de-prueba-de-al-menos-32-caracteres';

const USUARIOS: UsuarioActivo[] = [
  {
    id: 1,
    nombre: 'Vecino',
    rol: 'vecino',
    dependenciaId: null,
    permisos: { 'tickets.crear': 'propia', 'tickets.ver': 'propia' },
  },
  {
    id: 6,
    nombre: 'Administrador',
    rol: 'administrador',
    dependenciaId: null,
    permisos: { 'tickets.ver': 'todas', 'admin.catalogos': 'si' },
  },
];

const usuarios: UsuarioRepository = {
  buscarPorEmail: async () => null,
  guardarBloqueo: async () => {},
  buscarActivo: async (id) => USUARIOS.find((u) => u.id === id) ?? null,
};

const tokens = new JwtTokenService(SECRETO);

function tokenDe(usuario: UsuarioActivo, emitidoEn: Date = new Date()): string {
  const payload: PayloadAcceso = { sub: String(usuario.id), rol: usuario.rol, dep: usuario.dependenciaId };
  return tokens.emitirAcceso(payload, emitidoEn).token;
}

// App de prueba con una ruta protegida por requierePermiso('admin.catalogos').
function appDePrueba(): Express {
  const app = express();
  const autorizacion = new AutorizacionService(usuarios, tokens, { now: () => new Date() });
  app.get('/protegida', autenticar(autorizacion), requierePermiso('admin.catalogos'), (req, res) => {
    res.json({ usuarioId: req.usuario!.id, alcance: req.alcance });
  });
  app.use(manejadorErrores);
  return app;
}

describe('autenticar + requierePermiso', () => {
  const app = appDePrueba();
  const [vecino, administrador] = USUARIOS;

  it('sin token responde 401 NO_AUTENTICADO', async () => {
    const res = await request(app).get('/protegida');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'NO_AUTENTICADO', mensaje: expect.any(String) });
  });

  it('con otro esquema de Authorization responde 401 NO_AUTENTICADO', async () => {
    const res = await request(app).get('/protegida').set('Authorization', `Basic ${tokenDe(administrador)}`);

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('NO_AUTENTICADO');
  });

  it('con un token vencido responde 401 TOKEN_INVALIDO', async () => {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
    const res = await request(app)
      .get('/protegida')
      .set('Authorization', `Bearer ${tokenDe(administrador, haceUnaHora)}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ codigo: 'TOKEN_INVALIDO', mensaje: expect.any(String) });
  });

  it('con un token mal firmado responde 401 TOKEN_INVALIDO', async () => {
    const ajeno = new JwtTokenService('otro-secreto-distinto-de-al-menos-32-chars').emitirAcceso(
      { sub: '6', rol: 'administrador', dep: null },
      new Date(),
    ).token;
    const res = await request(app).get('/protegida').set('Authorization', `Bearer ${ajeno}`);

    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('TOKEN_INVALIDO');
  });

  it('al vecino le responde 403 PERMISO_DENEGADO', async () => {
    const res = await request(app).get('/protegida').set('Authorization', `Bearer ${tokenDe(vecino)}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'PERMISO_DENEGADO', mensaje: expect.any(String) });
  });

  it('deja pasar al administrador con alcance = si', async () => {
    const res = await request(app).get('/protegida').set('Authorization', `Bearer ${tokenDe(administrador)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ usuarioId: 6, alcance: 'si' });
  });
});
