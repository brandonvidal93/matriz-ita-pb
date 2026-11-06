import { Injectable, computed, signal } from '@angular/core';
import { CONFIG } from '../config';
import { Registro } from './modelos';

declare const google: any;

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TIPO_REGISTRO = 'registro-ita';

interface ArchivoDrive {
  id: string;
  name: string;
  modifiedTime: string;
  appProperties?: Record<string, string>;
}

/**
 * Persistencia en Google Drive usando Google Identity Services (token en el
 * navegador, sin servidor). Cada registro es un JSON dentro de una carpeta
 * propia de la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class DriveService {
  readonly configurado = !!CONFIG.googleClientId;
  private token = signal<string | null>(null);
  private expira = 0;
  private tokenClient: any;
  private carpetaId: string | null = null;
  private archivoPorRegistro = new Map<string, string>();

  readonly conectado = computed(() => !!this.token());
  readonly usuario = signal<string | null>(null);

  private cargarScript(): Promise<void> {
    if (typeof google !== 'undefined' && google.accounts?.oauth2) return Promise.resolve();
    return new Promise((ok, fallo) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => fallo(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(s);
    });
  }

  async conectar(): Promise<void> {
    if (!this.configurado) throw new Error('Falta configurar googleClientId en src/app/config.ts');
    await this.cargarScript();
    await new Promise<void>((ok, fallo) => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.googleClientId,
        scope: CONFIG.driveScope,
        callback: (resp: any) => {
          if (resp.error) return fallo(new Error(resp.error_description || resp.error));
          this.token.set(resp.access_token);
          this.expira = Date.now() + (Number(resp.expires_in) - 60) * 1000;
          ok();
        },
        error_callback: (e: any) => fallo(new Error(e?.message || 'Inicio de sesión cancelado')),
      });
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
    try {
      const info = await this.api<any>(`${API}/about?fields=user(emailAddress,displayName)`);
      this.usuario.set(info.user?.emailAddress ?? info.user?.displayName ?? null);
    } catch {
      /* opcional */
    }
  }

  desconectar(): void {
    const t = this.token();
    if (t && typeof google !== 'undefined') google.accounts.oauth2.revoke(t, () => {});
    this.token.set(null);
    this.usuario.set(null);
    this.carpetaId = null;
    this.archivoPorRegistro.clear();
  }

  private async renovarSiExpira(): Promise<void> {
    if (this.token() && Date.now() < this.expira) return;
    await new Promise<void>((ok, fallo) => {
      this.tokenClient.callback = (resp: any) => {
        if (resp.error) return fallo(new Error(resp.error));
        this.token.set(resp.access_token);
        this.expira = Date.now() + (Number(resp.expires_in) - 60) * 1000;
        ok();
      };
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  private async api<T>(url: string, init: RequestInit = {}): Promise<T> {
    await this.renovarSiExpira();
    const r = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token()}`, ...(init.headers || {}) },
    });
    if (!r.ok) throw new Error(`Drive respondió ${r.status}: ${await r.text()}`);
    const ct = r.headers.get('content-type') || '';
    return (ct.includes('json') ? r.json() : (r.text() as any)) as Promise<T>;
  }

  private async carpeta(): Promise<string> {
    if (this.carpetaId) return this.carpetaId;
    const q = encodeURIComponent(
      `name='${CONFIG.driveCarpeta.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const res = await this.api<{ files: ArchivoDrive[] }>(`${API}/files?q=${q}&fields=files(id,name)`);
    if (res.files.length) return (this.carpetaId = res.files[0].id);
    const nueva = await this.api<ArchivoDrive>(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: CONFIG.driveCarpeta, mimeType: 'application/vnd.google-apps.folder' }),
    });
    return (this.carpetaId = nueva.id);
  }

  async listar(): Promise<Registro[]> {
    const padre = await this.carpeta();
    const q = encodeURIComponent(
      `'${padre}' in parents and trashed=false and appProperties has { key='tipo' and value='${TIPO_REGISTRO}' }`,
    );
    const res = await this.api<{ files: ArchivoDrive[] }>(
      `${API}/files?q=${q}&fields=files(id,name,modifiedTime,appProperties)&pageSize=200`,
    );
    const out: Registro[] = [];
    for (const f of res.files) {
      const reg = await this.api<Registro>(`${API}/files/${f.id}?alt=media`);
      this.archivoPorRegistro.set(reg.id, f.id);
      out.push(reg);
    }
    return out;
  }

  private async subir(meta: object, contenido: Blob, idExistente?: string): Promise<string> {
    const limite = 'matrizita' + Date.now();
    const cuerpo = new Blob([
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${limite}\r\nContent-Type: ${contenido.type || 'application/octet-stream'}\r\n\r\n`,
      contenido,
      `\r\n--${limite}--`,
    ]);
    const url = idExistente
      ? `${UPLOAD}/files/${idExistente}?uploadType=multipart&fields=id`
      : `${UPLOAD}/files?uploadType=multipart&fields=id`;
    const res = await this.api<ArchivoDrive>(url, {
      method: idExistente ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
      body: cuerpo,
    });
    return res.id;
  }

  async guardar(reg: Registro): Promise<void> {
    const padre = await this.carpeta();
    const existente = this.archivoPorRegistro.get(reg.id);
    const nombre = `registro-${reg.vigencia}-${reg.id}.json`;
    const meta: any = { name: nombre, appProperties: { tipo: TIPO_REGISTRO, registroId: reg.id } };
    if (!existente) meta.parents = [padre];
    const id = await this.subir(meta, new Blob([JSON.stringify(reg)], { type: 'application/json' }), existente);
    this.archivoPorRegistro.set(reg.id, id);
  }

  async eliminar(registroId: string): Promise<void> {
    const id = this.archivoPorRegistro.get(registroId);
    if (!id) return;
    // Se envía a la papelera (recuperable), no se borra definitivamente.
    await this.api(`${API}/files/${id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
    this.archivoPorRegistro.delete(registroId);
  }

  /** Guarda una copia del .xlsx exportado en la carpeta de la app. */
  async guardarExportacion(nombre: string, archivo: Blob): Promise<void> {
    const padre = await this.carpeta();
    await this.subir({ name: nombre, parents: [padre] }, archivo);
  }
}
