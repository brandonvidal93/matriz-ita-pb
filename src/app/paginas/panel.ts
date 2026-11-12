import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../core/auth.service';
import { FORMATOS, Formato } from '../core/modelos';

/** Ruta e ícono de cada formato; el nombre y la descripción están en `formatos.<id>` de public/i18n. */
export const FORMATOS_UI: Record<Formato, { ruta: string; icono: string }> = {
  ita: { ruta: '/ita', icono: 'fact_check' },
};

/** Página de inicio: los formatos a los que tiene acceso el usuario. */
@Component({
  imports: [RouterLink, MatIconModule, TranslocoPipe],
  templateUrl: './panel.html',
})
export class PanelPage {
  private auth = inject(AuthService);
  formatos = computed(() =>
    FORMATOS.filter((f) => this.auth.puede(f, 'ver')).map((id) => ({ id, ...FORMATOS_UI[id], edita: this.auth.puede(id, 'editar') })),
  );
}
