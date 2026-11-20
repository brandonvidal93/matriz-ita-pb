import { MatSnackBarConfig } from '@angular/material/snack-bar';

/** Error: rojo y sin cierre automático; se queda hasta que el usuario lo cierre (2.2.1). El texto dice qué falló (1.4.1). */
export const AVISO_ERROR: MatSnackBarConfig = { panelClass: 'aviso-error', politeness: 'assertive' };
/** Confirmación: verde y se cierra sola, porque no pide ninguna acción. */
export const AVISO_OK: MatSnackBarConfig = { panelClass: 'aviso-ok', duration: 6000 };
