import express, { type Express } from 'express';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import type { AuthService } from '../../../src/application/services/auth.service';
import type { AutorizacionService } from '../../../src/application/services/autorizacion.service';
import type { RecuperacionService } from '../../../src/application/services/recuperacion.service';
import type { RegistroVecinosService } from '../../../src/application/services/registro-vecinos.service';
import type { UsuariosService } from '../../../src/application/services/usuarios.service';
import type { RegistroTicketsService } from '../../../src/application/services/registro-tickets.service';
import type { VecinosService } from '../../../src/application/services/vecinos.service';
import type { CatalogosService } from '../../../src/application/services/catalogos.service';
import type { CamposExtraService } from '../../../src/application/services/campos-extra.service';
import type { CatalogosAdminService } from '../../../src/application/services/catalogos-admin.service';
import type { ParametrosService } from '../../../src/application/services/parametros.service';
import type { TriageService } from '../../../src/application/services/triage.service';
import type { AsignacionService } from '../../../src/application/services/asignacion.service';
import type { TrasladosService } from '../../../src/application/services/traslados.service';
import type { AtencionService } from '../../../src/application/services/atencion.service';
import type { ConfirmacionService } from '../../../src/application/services/confirmacion.service';
import type { ComentariosService } from '../../../src/application/services/comentarios.service';
import type { AdjuntosService } from '../../../src/application/services/adjuntos.service';
import type { AlertasSlaService } from '../../../src/application/services/alertas-sla.service';
import type { AvisosComentariosService } from '../../../src/application/services/avisos-comentarios.service';
import type { CierreAutomaticoService } from '../../../src/application/services/cierre-automatico.service';
import type { DespachoCorreosService } from '../../../src/application/services/despacho-correos.service';
import type { EncuestasService } from '../../../src/application/services/encuestas.service';
import type { EscaladasService } from '../../../src/application/services/escaladas.service';
import type { EscalamientoService } from '../../../src/application/services/escalamiento.service';
import type { LineaTiempoService } from '../../../src/application/services/linea-tiempo.service';
import type { NotificadorCorreo } from '../../../src/application/services/notificador-correo.service';
import type { NotificacionesService } from '../../../src/application/services/notificaciones.service';
import type { PoliticasSlaService } from '../../../src/application/services/politicas-sla.service';
import type { ConsultaPublicaService } from '../../../src/application/services/consulta-publica.service';
import type { ConsultaTicketsService } from '../../../src/application/services/consulta-tickets.service';
import type { BitacoraLecturaRepository } from '../../../src/domain/repositories/bitacora-lectura-repository';
import type { ReporteLecturaRepository } from '../../../src/domain/repositories/reporte-lectura-repository';
import { HealthService } from '../../../src/application/services/health.service';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { Container } from '../../../src/container';
import { manejadorErrores } from '../../../src/presentation/middlewares/manejador-errores';

// Container armado a mano: las pruebas no tocan Postgres.
function buildTestContainer(): Container {
  return {
    port: 0,
    loginLimitePorVentana: 10,
    recuperacionLimitePorVentana: 5,
    consultaLimitePorVentana: 10,
    consultaPublicaService: {} as ConsultaPublicaService,
    encuestasService: {} as EncuestasService,
    catalogosAdminService: {} as CatalogosAdminService,
    healthService: new HealthService({ now: () => new Date() }, { isUp: async () => true }),
    // Estas pruebas fallan antes de llegar a los servicios de auth.
    authService: {} as AuthService,
    autorizacionService: {} as AutorizacionService,
    recuperacionService: {} as RecuperacionService,
    registroVecinosService: {} as RegistroVecinosService,
    usuariosService: {} as UsuariosService,
    consultaTicketsService: {} as ConsultaTicketsService,
    reportesLectura: {} as ReporteLecturaRepository,
    bitacoraLectura: {} as BitacoraLecturaRepository,
    registroTicketsService: {} as RegistroTicketsService,
    vecinosService: {} as VecinosService,
    catalogosService: {} as CatalogosService,
    camposExtraService: {} as CamposExtraService,
    parametrosService: {} as ParametrosService,
    triageService: {} as TriageService,
    asignacionService: {} as AsignacionService,
    trasladosService: {} as TrasladosService,
    atencionService: {} as AtencionService,
    confirmacionService: {} as ConfirmacionService,
    comentariosService: {} as ComentariosService,
    adjuntosService: {} as AdjuntosService,
    lineaTiempoService: {} as LineaTiempoService,
    politicasSlaService: {} as PoliticasSlaService,
    alertasSlaService: {} as AlertasSlaService,
    notificacionesService: {} as NotificacionesService,
    escalamientoService: {} as EscalamientoService,
    escaladasService: {} as EscaladasService,
    cierreAutomaticoService: {} as CierreAutomaticoService,
    notificadorCorreo: {} as NotificadorCorreo,
    despachoCorreosService: {} as DespachoCorreosService,
    avisosComentariosService: {} as AvisosComentariosService,
    slaJobActivo: false,
    iniciarJobSla: () => () => {},
    correosJobActivo: false,
    iniciarJobCorreos: () => () => {},
    prepararAlmacen: async () => {},
    dispose: async () => {},
  };
}

// App mínima con rutas que lanzan errores, para probar solo el manejador.
function appQueLanza(error: unknown): Express {
  const app = express();
  app.get('/falla', () => {
    throw error;
  });
  app.use(manejadorErrores);
  return app;
}

describe('manejadorErrores', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responde 404 NO_ENCONTRADO a una ruta desconocida de /api/v1', async () => {
    const res = await request(createApp(buildTestContainer())).get('/api/v1/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: expect.any(String) });
  });

  it('responde 400 VALIDACION a un JSON mal formado', async () => {
    const res = await request(createApp(buildTestContainer()))
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'VALIDACION', mensaje: expect.any(String) });
  });

  it('traduce ErrorDeAplicacion por su codigo', async () => {
    const res = await request(appQueLanza(new ErrorDeAplicacion('PERMISO_DENEGADO', 'Sin permiso'))).get('/falla');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ codigo: 'PERMISO_DENEGADO', mensaje: 'Sin permiso' });
  });

  it('traduce InvalidTransitionError del dominio a 409 TRANSICION_INVALIDA (SPEC 19)', async () => {
    const res = await request(appQueLanza(new InvalidTransitionError('nueva', 'asignada'))).get('/falla');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ codigo: 'TRANSICION_INVALIDA', mensaje: 'No se permite pasar de nueva a asignada' });
  });

  it('traduce ReglaDeNegocioError del dominio a 400 con su codigo (SPEC 19)', async () => {
    const res = await request(appQueLanza(new ReglaDeNegocioError('MOTIVO_REQUERIDO', 'El motivo es obligatorio'))).get(
      '/falla',
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'MOTIVO_REQUERIDO', mensaje: 'El motivo es obligatorio' });
  });

  it('una ReglaDeNegocioError con detalles los incluye', async () => {
    const detalles = [{ campo: 'x', problema: 'REQUERIDO' }];
    const res = await request(appQueLanza(new ReglaDeNegocioError('DATOS_EXTRA_INVALIDOS', 'Datos', detalles))).get(
      '/falla',
    );

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ codigo: 'DATOS_EXTRA_INVALIDOS', mensaje: 'Datos', detalles });
  });

  it('responde 500 ERROR_INTERNO sin la traza a un error inesperado', async () => {
    const res = await request(appQueLanza(new Error('fallo de la base en la línea 42'))).get('/falla');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno' });
    expect(JSON.stringify(res.body)).not.toContain('stack');
    expect(JSON.stringify(res.body)).not.toContain('línea 42');
  });

  it('en /api/v1/public el log de un error interno no lleva el mensaje ni la query (SPEC 37)', async () => {
    const app = express();
    app.get('/api/v1/public/tickets/:numero', () => {
      throw new Error('select … where email = ana@correo.gt');
    });
    app.use(manejadorErrores);

    const res = await request(app).get('/api/v1/public/tickets/Q-2026-000001?contacto=ana@correo.gt');

    expect(res.status).toBe(500);
    const logs = jest.mocked(console.error).mock.calls.map((llamada) => llamada.map(String).join(' ')).join('\n');
    expect(logs).toBe('Error interno en GET /api/v1/public/tickets/Q-2026-000001: Error');
  });

  it('una ruta pública desconocida responde 404 sin la query en el mensaje (SPEC 37)', async () => {
    const res = await request(createApp(buildTestContainer())).get('/api/v1/public/otra?contacto=ana@correo.gt');

    expect(res.status).toBe(404);
    expect(res.body.mensaje).toBe('No existe GET /api/v1/public/otra');
  });

  it('/health no cambia', async () => {
    const res = await request(createApp(buildTestContainer())).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', timestamp: expect.any(String) });
  });
});
