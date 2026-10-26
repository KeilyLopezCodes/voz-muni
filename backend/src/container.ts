import knex from 'knex';
import { AdjuntosService } from './application/services/adjuntos.service';
import { AlertasSlaService } from './application/services/alertas-sla.service';
import { AsignacionService } from './application/services/asignacion.service';
import { AtencionService } from './application/services/atencion.service';
import { AuthService } from './application/services/auth.service';
import { AutorizacionService } from './application/services/autorizacion.service';
import { CamposExtraService } from './application/services/campos-extra.service';
import { CatalogosService } from './application/services/catalogos.service';
import { ComentariosService } from './application/services/comentarios.service';
import { ConfirmacionService } from './application/services/confirmacion.service';
import { ParametrosService } from './application/services/parametros.service';
import { PlazosConfirmacionService } from './application/services/plazos-confirmacion.service';
import { PoliticasSlaService } from './application/services/politicas-sla.service';
import { SlaService } from './application/services/sla.service';
import { ConsultaTicketsService } from './application/services/consulta-tickets.service';
import { EnvioCorreo } from './application/services/envio-correo';
import { HealthService } from './application/services/health.service';
import { LineaTiempoService } from './application/services/linea-tiempo.service';
import { NotificacionesService } from './application/services/notificaciones.service';
import { RecuperacionService } from './application/services/recuperacion.service';
import { RegistroTicketsService } from './application/services/registro-tickets.service';
import { RegistroVecinosService } from './application/services/registro-vecinos.service';
import { TrasladosService } from './application/services/traslados.service';
import { TriageService } from './application/services/triage.service';
import { UsuariosService } from './application/services/usuarios.service';
import { VecinosService } from './application/services/vecinos.service';
import type { Clock } from './domain/health/clock';
import type { EnviadorCorreo } from './domain/notificaciones/enviador-correo';
import type { BitacoraLecturaRepository } from './domain/repositories/bitacora-lectura-repository';
import type { ReporteLecturaRepository } from './domain/repositories/reporte-lectura-repository';
import { BcryptPasswordHasher } from './infrastructure/auth/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/auth/jwt-token-service';
import { SystemClock } from './infrastructure/clock/system-clock';
import { type Env, loadEnv } from './infrastructure/config/env';
import { buildKnexConfig } from './infrastructure/database/knex-config';
import { KnexDatabaseHealthCheck } from './infrastructure/database/knex-database-health-check';
import { iniciarJobAlertasSla } from './infrastructure/jobs/alertas-sla.job';
import { NodemailerEnviadorCorreo } from './infrastructure/mail/nodemailer-enviador-correo';
import { KnexAtencionLecturaRepository } from './infrastructure/repositories/knex-atencion-lectura-repository';
import { KnexBitacoraLecturaRepository } from './infrastructure/repositories/knex-bitacora-lectura-repository';
import { KnexCatalogoLecturaRepository } from './infrastructure/repositories/knex-catalogo-lectura-repository';
import { KnexLineaTiempoRepository } from './infrastructure/repositories/knex-linea-tiempo-repository';
import { KnexNotificacionRepository } from './infrastructure/repositories/knex-notificacion-repository';
import { KnexParametroRepository } from './infrastructure/repositories/knex-parametro-repository';
import { KnexCalendarioRepository } from './infrastructure/repositories/knex-calendario-repository';
import { KnexPorAsignarLecturaRepository } from './infrastructure/repositories/knex-por-asignar-lectura-repository';
import { KnexPlantillaRepository } from './infrastructure/repositories/knex-plantilla-repository';
import { KnexPoliticaSlaRepository } from './infrastructure/repositories/knex-politica-sla-repository';
import { KnexRegistroTicketRepository } from './infrastructure/repositories/knex-registro-ticket-repository';
import { KnexReporteLecturaRepository } from './infrastructure/repositories/knex-reporte-lectura-repository';
import { KnexRestablecimientoRepository } from './infrastructure/repositories/knex-restablecimiento-repository';
import { KnexSesionRepository } from './infrastructure/repositories/knex-sesion-repository';
import { KnexTicketLecturaRepository } from './infrastructure/repositories/knex-ticket-lectura-repository';
import { KnexTransaccion } from './infrastructure/repositories/knex-transaccion';
import { DiscoAlmacenArchivos } from './infrastructure/storage/disco-almacen-archivos';
import { ZipInspectorDocx } from './infrastructure/storage/zip-inspector-docx';
import { KnexTriageLecturaRepository } from './infrastructure/repositories/knex-triage-lectura-repository';
import { KnexUsuarioAdminRepository } from './infrastructure/repositories/knex-usuario-admin-repository';
import { KnexUsuarioRepository } from './infrastructure/repositories/knex-usuario-repository';
import { KnexVecinoRepository } from './infrastructure/repositories/knex-vecino-repository';

export interface Container {
  port: number;
  loginLimitePorVentana: number;
  recuperacionLimitePorVentana: number;
  healthService: HealthService;
  authService: AuthService;
  autorizacionService: AutorizacionService;
  recuperacionService: RecuperacionService;
  registroVecinosService: RegistroVecinosService;
  usuariosService: UsuariosService;
  // Lectura con alcance (SPEC 11). Los endpoints de tickets, reportes y bitácora llegan con sus specs.
  consultaTicketsService: ConsultaTicketsService;
  reportesLectura: ReporteLecturaRepository;
  bitacoraLectura: BitacoraLecturaRepository;
  registroTicketsService: RegistroTicketsService;
  vecinosService: VecinosService;
  catalogosService: CatalogosService;
  camposExtraService: CamposExtraService;
  parametrosService: ParametrosService;
  triageService: TriageService;
  asignacionService: AsignacionService;
  trasladosService: TrasladosService;
  atencionService: AtencionService;
  confirmacionService: ConfirmacionService;
  comentariosService: ComentariosService;
  adjuntosService: AdjuntosService;
  lineaTiempoService: LineaTiempoService;
  politicasSlaService: PoliticasSlaService;
  // Lo llama el job de alertas (SPEC 31); server.ts lo programa, app.ts no.
  alertasSlaService: AlertasSlaService;
  notificacionesService: NotificacionesService;
  // SLA_ALERTAS_ACTIVO. server.ts programa el job después de listen; devuelve la función que lo detiene.
  alertasSlaActivo: boolean;
  iniciarAlertasSla(): () => void;
  // Crea ADJUNTOS_DIR si no existe; server.ts lo llama antes de escuchar.
  prepararAlmacen(): Promise<void>;
  dispose(): Promise<void>;
}

export interface OpcionesContainer {
  // Las pruebas inyectan un enviador que guarda los correos en memoria.
  enviadorCorreo?: EnviadorCorreo;
  // Y un reloj para fijar la hora en los plazos (SPEC 27).
  reloj?: Clock;
}

// Único punto fuera de infrastructure/ que instancia sus adaptadores.
export function buildContainer(env: Env = loadEnv(), opciones: OpcionesContainer = {}): Container {
  const db = knex(buildKnexConfig(env.DATABASE_URL));
  const clock = opciones.reloj ?? new SystemClock();
  const usuarios = new KnexUsuarioRepository(db);
  const sesiones = new KnexSesionRepository(db);
  const tokens = new JwtTokenService(env.JWT_SECRET);
  const hasher = new BcryptPasswordHasher();
  const enviadorCorreo =
    opciones.enviadorCorreo ??
    new NodemailerEnviadorCorreo({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.MAIL_FROM,
    });
  const transaccion = new KnexTransaccion(db);
  const vecinos = new KnexVecinoRepository(db);
  const catalogo = new KnexCatalogoLecturaRepository(db);
  const parametros = new ParametrosService(new KnexParametroRepository(db));
  const plazosConfirmacion = new PlazosConfirmacionService(
    new KnexParametroRepository(db),
    new KnexCalendarioRepository(db),
  );
  // Único lugar donde se calculan los vencimientos (SPEC 30).
  const sla = new SlaService(
    new KnexParametroRepository(db),
    new KnexCalendarioRepository(db),
    new KnexPoliticaSlaRepository(db),
  );
  const alertasSla = new AlertasSlaService(transaccion, new KnexParametroRepository(db), (mensaje) => console.error(mensaje));
  const almacen = new DiscoAlmacenArchivos(env.ADJUNTOS_DIR);
  const consultaTickets = new ConsultaTicketsService(new KnexTicketLecturaRepository(db), plazosConfirmacion, clock);
  const correo = new EnvioCorreo(new KnexPlantillaRepository(db), enviadorCorreo, (mensaje) => console.error(mensaje));
  return {
    port: env.PORT,
    loginLimitePorVentana: env.LOGIN_LIMITE_POR_VENTANA,
    recuperacionLimitePorVentana: env.RECUPERACION_LIMITE_POR_VENTANA,
    healthService: new HealthService(clock, new KnexDatabaseHealthCheck(db)),
    authService: new AuthService(usuarios, sesiones, hasher, tokens, clock),
    autorizacionService: new AutorizacionService(usuarios, tokens, clock),
    recuperacionService: new RecuperacionService(
      usuarios,
      new KnexRestablecimientoRepository(db),
      transaccion,
      correo,
      hasher,
      tokens,
      clock,
      env.APP_URL,
    ),
    registroVecinosService: new RegistroVecinosService(transaccion, correo, hasher, tokens, clock, env.APP_URL),
    usuariosService: new UsuariosService(new KnexUsuarioAdminRepository(db), transaccion, correo, tokens, clock, env.APP_URL),
    consultaTicketsService: consultaTickets,
    reportesLectura: new KnexReporteLecturaRepository(db),
    bitacoraLectura: new KnexBitacoraLecturaRepository(db),
    registroTicketsService: new RegistroTicketsService(
      new KnexRegistroTicketRepository(db),
      catalogo,
      vecinos,
      correo,
      parametros,
      clock,
      env.APP_URL,
    ),
    vecinosService: new VecinosService(vecinos, transaccion, correo, tokens, clock, env.APP_URL),
    catalogosService: new CatalogosService(catalogo),
    camposExtraService: new CamposExtraService(transaccion),
    parametrosService: parametros,
    triageService: new TriageService(transaccion, new KnexTriageLecturaRepository(db), correo, clock, env.APP_URL, sla),
    asignacionService: new AsignacionService(transaccion, new KnexPorAsignarLecturaRepository(db), clock),
    trasladosService: new TrasladosService(transaccion, catalogo, clock),
    atencionService: new AtencionService(
      transaccion,
      new KnexAtencionLecturaRepository(db),
      clock,
      (ahora) => plazosConfirmacion.vencimientoConfirmacion(ahora),
      sla,
    ),
    confirmacionService: new ConfirmacionService(transaccion, plazosConfirmacion, correo, clock, env.APP_URL, sla),
    comentariosService: new ComentariosService(transaccion, new KnexTicketLecturaRepository(db), clock, sla),
    adjuntosService: new AdjuntosService(
      transaccion,
      new KnexTicketLecturaRepository(db),
      almacen,
      new ZipInspectorDocx(),
      clock,
      (mensaje) => console.error(mensaje),
    ),
    lineaTiempoService: new LineaTiempoService(consultaTickets, new KnexLineaTiempoRepository(db)),
    politicasSlaService: new PoliticasSlaService(new KnexPoliticaSlaRepository(db), transaccion, clock),
    alertasSlaService: alertasSla,
    notificacionesService: new NotificacionesService(new KnexNotificacionRepository(db)),
    alertasSlaActivo: env.SLA_ALERTAS_ACTIVO,
    iniciarAlertasSla: () => iniciarJobAlertasSla(alertasSla, { cron: env.SLA_ALERTAS_CRON }, clock),
    prepararAlmacen: () => almacen.preparar(),
    dispose: () => db.destroy(),
  };
}
