import type { EnviadorCorreo } from '../../domain/notificaciones/enviador-correo';
import { renderizar } from '../../domain/notificaciones/plantilla';
import type { PlantillaRepository } from '../../domain/repositories/plantilla-repository';

// Envía un correo a partir de una plantilla de plantillas_notificacion (RF-33).
export class EnvioCorreo {
  constructor(
    private readonly plantillas: PlantillaRepository,
    private readonly enviador: EnviadorCorreo,
    private readonly registrarError: (mensaje: string) => void,
  ) {}

  async enviar(clave: string, para: string, variables: Record<string, string>): Promise<void> {
    // Se lee en cada envío: un cambio de la plantilla en la base aplica sin reiniciar.
    const plantilla = await this.plantillas.buscarPorClave(clave);
    if (!plantilla) {
      throw new Error(`No existe la plantilla ${clave}`);
    }
    const correo = renderizar(plantilla, variables);
    await this.enviador.enviar({ para, asunto: correo.asunto, texto: correo.texto, html: correo.html });
  }

  // Devuelve false si falla. El fallo queda en el log con el usuario_id y nunca con el contenido (que puede llevar un token).
  // usuarioId es null cuando el destinatario no tiene cuenta (p. ej. un registro que no se completó, SPEC 16).
  async intentar(
    clave: string,
    para: string,
    variables: Record<string, string>,
    usuarioId: number | null,
  ): Promise<boolean> {
    try {
      await this.enviar(clave, para, variables);
      return true;
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.registrarError(`No se pudo enviar el correo ${clave} al usuario_id ${usuarioId}: ${detalle}`);
      return false;
    }
  }

  // Sale sin bloquear al que llama: la respuesta HTTP no espera al SMTP.
  sinEsperar(clave: string, para: string, variables: Record<string, string>, usuarioId: number | null): void {
    void this.intentar(clave, para, variables, usuarioId);
  }
}
