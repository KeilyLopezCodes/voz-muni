import request from 'supertest';
import { createApp } from '../../src/app';
import type { AuthService } from '../../src/application/services/auth.service';
import type { AutorizacionService } from '../../src/application/services/autorizacion.service';
import type { RecuperacionService } from '../../src/application/services/recuperacion.service';
import type { RegistroVecinosService } from '../../src/application/services/registro-vecinos.service';
import type { UsuariosService } from '../../src/application/services/usuarios.service';
import type { RegistroTicketsService } from '../../src/application/services/registro-tickets.service';
import type { VecinosService } from '../../src/application/services/vecinos.service';
import type { CatalogosService } from '../../src/application/services/catalogos.service';
import type { CamposExtraService } from '../../src/application/services/campos-extra.service';
import type { BitacoraService } from '../../src/application/services/bitacora.service';
import type { ReportesService } from '../../src/application/services/reportes.service';
import type { CatalogosAdminService } from '../../src/application/services/catalogos-admin.service';
import type { ParametrosService } from '../../src/application/services/parametros.service';
import type { TriageService } from '../../src/application/services/triage.service';
import type { AsignacionService } from '../../src/application/services/asignacion.service';
import type { TrasladosService } from '../../src/application/services/traslados.service';
import type { AtencionService } from '../../src/application/services/atencion.service';
import type { ConfirmacionService } from '../../src/application/services/confirmacion.service';
import type { ComentariosService } from '../../src/application/services/comentarios.service';
import type { AdjuntosService } from '../../src/application/services/adjuntos.service';
import type { AlertasSlaService } from '../../src/application/services/alertas-sla.service';
import type { AvisosComentariosService } from '../../src/application/services/avisos-comentarios.service';
import type { CierreAutomaticoService } from '../../src/application/services/cierre-automatico.service';
import type { DespachoCorreosService } from '../../src/application/services/despacho-correos.service';
import type { EncuestasService } from '../../src/application/services/encuestas.service';
import type { EscaladasService } from '../../src/application/services/escaladas.service';
import type { EscalamientoService } from '../../src/application/services/escalamiento.service';
import type { LineaTiempoService } from '../../src/application/services/linea-tiempo.service';
import type { NotificadorCorreo } from '../../src/application/services/notificador-correo.service';
import type { NotificacionesService } from '../../src/application/services/notificaciones.service';
import type { PoliticasSlaService } from '../../src/application/services/politicas-sla.service';
import type { ConsultaPublicaService } from '../../src/application/services/consulta-publica.service';
import type { ConsultaTicketsService } from '../../src/application/services/consulta-tickets.service';
import type { BitacoraLecturaRepository } from '../../src/domain/repositories/bitacora-lectura-repository';
import type { ReporteLecturaRepository } from '../../src/domain/repositories/reporte-lectura-repository';
import { HealthService } from '../../src/application/services/health.service';
import type { Container } from '../../src/container';
import type { Clock } from '../../src/domain/health/clock';
import type { DatabaseHealthCheck } from '../../src/domain/health/database-health-check';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Container armado a mano: las pruebas no tocan Postgres.
function buildTestContainer(databaseUp: boolean): Container {
  const clock: Clock = { now: () => new Date() };
  const databaseHealthCheck: DatabaseHealthCheck = { isUp: async () => databaseUp };
  return {
    port: 0,
    loginLimitePorVentana: 10,
    recuperacionLimitePorVentana: 5,
    consultaLimitePorVentana: 10,
    consultaPublicaService: {} as ConsultaPublicaService,
    encuestasService: {} as EncuestasService,
    catalogosAdminService: {} as CatalogosAdminService,
    contextoSolicitud: { ip: () => null, ejecutar: (_ip, trabajo) => trabajo() },
    bitacoraService: {} as BitacoraService,
    reportesService: {} as ReportesService,
    healthService: new HealthService(clock, databaseHealthCheck),
    // /health no los usa.
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

describe('GET /health', () => {
  it('responde 200 con status ok y database up cuando la base está arriba', async () => {
    const res = await request(createApp(buildTestContainer(true))).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', timestamp: expect.stringMatching(ISO_UTC) });
  });

  it('responde 503 con status degraded y database down cuando la base está caída', async () => {
    const res = await request(createApp(buildTestContainer(false))).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down', timestamp: expect.stringMatching(ISO_UTC) });
  });
});
