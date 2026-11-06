import { Injectable } from '@angular/core';
import JSZip from 'jszip';
import { CATALOGO, PLANTILLA_URL, textoObservacion } from './catalogo';
import { EstadoCumplimiento, Evidencia, Registro, Respuesta, nuevoId } from './modelos';

const HOJA = 'xl/worksheets/' + CATALOGO.hoja;
const RELS_HOJA = 'xl/worksheets/_rels/sheet1.xml.rels';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const URL_RE = /https?:\/\/[^\s"'<>;,]+[^\s"'<>;,.)\]]/gi;

export interface ResultadoImportacion {
  respuestas: Record<number, Respuesta>;
  evidencias: Evidencia[];
  advertencias: string[];
  itemsLeidos: number;
}

function escaparXml(t: string): string {
  return t
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colANum(col: string): number {
  return [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function celdaTexto(ref: string, estilo: string, texto: string): string {
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto.slice(0, 32000))}</t></is></c>`;
}

/** Excel suele crear vínculos con texto pegado ("https://x/%20;%20Ubicado…"): se deja solo la URL. */
function limpiarHipervinculo(destino?: string): string | null {
  if (!destino) return null;
  let t = destino;
  try {
    t = decodeURI(destino);
  } catch {}
  const m = t.match(URL_RE);
  return m ? m[0] : null;
}

function tituloDesdeUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (!seg) return u.hostname;
    return decodeURIComponent(seg)
      .replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, (m) => ` (${m.slice(1).toUpperCase()})`)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (c) => c.toUpperCase());
  } catch {
    return url;
  }
}

/**
 * Lectura y escritura de la matriz oficial trabajando directamente sobre el
 * XML del paquete .xlsx: solo se tocan las celdas F, G, H e I de las filas de
 * ítems; estilos, celdas combinadas, encabezados y la hoja de instrucciones
 * quedan exactamente como en la plantilla.
 */
@Injectable({ providedIn: 'root' })
export class XlsxService {
  async exportar(reg: Registro): Promise<Blob> {
    const plantilla = await fetch(PLANTILLA_URL);
    if (!plantilla.ok) throw new Error('No se encontró la plantilla oficial (public/plantilla).');
    const zip = await JSZip.loadAsync(await plantilla.arrayBuffer());
    let hoja = await zip.file(HOJA)!.async('string');
    let rels = await zip.file(RELS_HOJA)!.async('string');
    const { si, no, na, observacion } = CATALOGO.columnas;
    const enlaces: { ref: string; url: string }[] = [];

    for (const it of CATALOGO.items) {
      const r = reg.respuestas[it.fila];
      if (!r) continue;
      const valores: Record<string, string> = {};
      if (it.tipo === 'cumplimiento' && r.estado) {
        valores[{ SI: si, NO: no, NA: na }[r.estado]] = 'X';
      }
      const texto = textoObservacion(r, reg);
      if (texto) valores[observacion] = texto;
      if (!Object.keys(valores).length) continue;
      hoja = this.escribirFila(hoja, it.fila, valores);
      const primera = r.evidencias.map((id) => reg.evidencias.find((e) => e.id === id)).find((e) => !!e);
      if (primera) enlaces.push({ ref: `${observacion}${it.fila}`, url: primera.url });
    }

    if (enlaces.length) {
      const items = enlaces.map((e, i) => `<hyperlink ref="${e.ref}" r:id="rIdITA${i + 1}"/>`).join('');
      if (hoja.includes('<hyperlinks>')) hoja = hoja.replace('</hyperlinks>', items + '</hyperlinks>');
      else {
        const ancla = hoja.search(/<(printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|drawing)\b/);
        hoja = ancla >= 0 ? hoja.slice(0, ancla) + `<hyperlinks>${items}</hyperlinks>` + hoja.slice(ancla) : hoja;
      }
      const relItems = enlaces
        .map(
          (e, i) =>
            `<Relationship Id="rIdITA${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escaparXml(e.url)}" TargetMode="External"/>`,
        )
        .join('');
      rels = rels.replace('</Relationships>', relItems + '</Relationships>');
    }

    zip.file(HOJA, hoja);
    zip.file(RELS_HOJA, rels);
    return zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /** Reemplaza (o inserta en orden) las celdas indicadas dentro de una fila. */
  private escribirFila(hoja: string, fila: number, valores: Record<string, string>): string {
    const reFila = new RegExp(`<row r="${fila}"([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`);
    const m = hoja.match(reFila);
    if (!m) throw new Error(`La plantilla no tiene la fila ${fila}`);
    const atributos = m[1];
    const celdas: { col: string; xml: string }[] = [];
    for (const c of (m[2] ?? '').matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g))
      celdas.push({ col: c[1], xml: c[0] });
    for (const [col, texto] of Object.entries(valores)) {
      const ref = `${col}${fila}`;
      const i = celdas.findIndex((c) => c.col === col);
      const estilo = i >= 0 ? (celdas[i].xml.match(/\ss="\d+"/)?.[0] ?? '') : '';
      const xml = celdaTexto(ref, estilo, texto);
      if (i >= 0) celdas[i].xml = xml;
      else celdas.push({ col, xml });
    }
    celdas.sort((a, b) => colANum(a.col) - colANum(b.col));
    const nuevaFila = `<row r="${fila}"${atributos.replace(/\s*spans="[^"]*"/, '')}>${celdas.map((c) => c.xml).join('')}</row>`;
    return hoja.replace(m[0], nuevaFila);
  }

  /** Lee una matriz ya diligenciada (de un año anterior) como punto de partida. */
  async importar(archivo: Blob): Promise<ResultadoImportacion> {
    const zip = await JSZip.loadAsync(archivo);
    const dp = new DOMParser();
    const hojaXml = await zip.file(HOJA)?.async('string');
    if (!hojaXml) throw new Error('El archivo no tiene la estructura de la Matriz ITA.');
    const ss: string[] = [];
    const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
    if (ssXml) {
      const d = dp.parseFromString(ssXml, 'application/xml');
      for (const si of Array.from(d.getElementsByTagNameNS(NS_MAIN, 'si')))
        ss.push(Array.from(si.getElementsByTagNameNS(NS_MAIN, 't')).map((t) => t.textContent ?? '').join(''));
    }
    const doc = dp.parseFromString(hojaXml, 'application/xml');
    const celdas = new Map<string, string>();
    for (const c of Array.from(doc.getElementsByTagNameNS(NS_MAIN, 'c'))) {
      const t = c.getAttribute('t');
      let v = '';
      if (t === 's') v = ss[+(c.getElementsByTagNameNS(NS_MAIN, 'v')[0]?.textContent ?? -1)] ?? '';
      else if (t === 'inlineStr')
        v = Array.from(c.getElementsByTagNameNS(NS_MAIN, 't')).map((x) => x.textContent ?? '').join('');
      else v = c.getElementsByTagNameNS(NS_MAIN, 'v')[0]?.textContent ?? '';
      celdas.set(c.getAttribute('r')!, v.trim());
    }

    // hipervínculos de la hoja
    const hipervinculos = new Map<string, string>();
    const relsXml = await zip.file(RELS_HOJA)?.async('string');
    if (relsXml) {
      const destinos = new Map<string, string>();
      for (const m of relsXml.matchAll(/<Relationship\s+[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"[^>]*?TargetMode="External"/g))
        destinos.set(m[1], m[2].replace(/&amp;/g, '&'));
      for (const m of hojaXml.matchAll(/<hyperlink ref="([A-Z]+\d+)"[^>]*?r:id="([^"]+)"/g))
        if (destinos.has(m[2])) hipervinculos.set(m[1], destinos.get(m[2])!);
    }

    // imágenes pegadas (no se pueden migrar automáticamente)
    const imagenesPorFila = new Map<number, number>();
    const dibujo = await zip.file('xl/drawings/drawing1.xml')?.async('string');
    if (dibujo)
      for (const m of dibujo.matchAll(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/g)) {
        const f = +m[1] + 1;
        imagenesPorFila.set(f, (imagenesPorFila.get(f) ?? 0) + 1);
      }

    const { si, no, na, observacion } = CATALOGO.columnas;
    const evidencias: Evidencia[] = [];
    const porUrl = new Map<string, Evidencia>();
    const respuestas: Record<number, Respuesta> = {};
    const advertencias: string[] = [];
    let itemsLeidos = 0;

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
    for (const it of CATALOGO.items) {
      const textoC = celdas.get(`C${it.fila}`) ?? '';
      if (norm(textoC) !== norm(it.item)) {
        advertencias.push(`Fila ${it.fila}: el texto del ítem no coincide con la plantilla; se omitió.`);
        continue;
      }
      let estado: EstadoCumplimiento | null = null;
      if (celdas.get(`${si}${it.fila}`)) estado = 'SI';
      else if (celdas.get(`${no}${it.fila}`)) estado = 'NO';
      else if (celdas.get(`${na}${it.fila}`)) estado = 'NA';
      const texto = celdas.get(`${observacion}${it.fila}`) ?? '';
      const urls = new Set<string>((texto.match(URL_RE) ?? []).map((u) => u.trim()));
      const hl = limpiarHipervinculo(hipervinculos.get(`${observacion}${it.fila}`));
      if (hl && ![...urls].some((u) => u.startsWith(hl) || hl.startsWith(u))) urls.add(hl);
      const ids: string[] = [];
      for (const u of urls) {
        let ev = porUrl.get(u);
        if (!ev) {
          ev = { id: nuevoId(), titulo: tituloDesdeUrl(u), url: u };
          porUrl.set(u, ev);
          evidencias.push(ev);
        }
        ids.push(ev.id);
      }
      const resto = texto
        .replace(URL_RE, '')
        .replace(/^[\s;,:\-–]+|[\s;,:\-–]+$/gm, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
      if (estado || resto || ids.length) {
        itemsLeidos++;
        respuestas[it.fila] = { estado, observacion: resto, evidencias: ids };
      }
      const imgs = imagenesPorFila.get(it.fila);
      if (imgs)
        advertencias.push(
          `Fila ${it.fila}: tenía ${imgs} imagen(es) pegada(s) como evidencia. Súbela(s) al portal o al Drive y agrégala(s) como enlace.`,
        );
    }
    return { respuestas, evidencias, advertencias, itemsLeidos };
  }
}
