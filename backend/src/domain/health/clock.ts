// Puerto: la infraestructura provee la hora real; las pruebas usan una fija.
export interface Clock {
  now(): Date;
}
