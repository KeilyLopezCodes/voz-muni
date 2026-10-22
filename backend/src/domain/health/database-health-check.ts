// Puerto: la infraestructura comprueba la base real; las pruebas usan un falso.
export interface DatabaseHealthCheck {
  isUp(): Promise<boolean>;
}
