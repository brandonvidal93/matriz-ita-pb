"""
Genera, a partir de un archivo de la Matriz ITA (diligenciado o en blanco):

  1. public/plantilla/matriz-ita-2023.xlsx  -> plantilla oficial en blanco
     (misma estructura, estilos y celdas combinadas; solo se vacían las
     columnas F, G, H e I de las filas de ítems y se retiran las imágenes e
     hipervínculos que se hubieran pegado como evidencia en la columna I).
  2. src/app/data/catalogo-ita-2023.json   -> catálogo de ítems para la app.

El trabajo se hace directamente sobre el XML del paquete .xlsx para no
alterar nada más del archivo oficial.

Uso:
    python tools/preparar_plantilla.py <archivo_matriz.xlsx>
"""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    'm': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
FILA_INICIO = 5
COLS_RESPUESTA = ('F', 'G', 'H', 'I')
RAIZ = Path(__file__).resolve().parent.parent


def col_row(ref):
    m = re.match(r'([A-Z]+)(\d+)', ref)
    return m.group(1), int(m.group(2))


def leer_shared_strings(z):
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    out = []
    for si in root.findall('m:si', NS):
        out.append(''.join(t.text or '' for t in si.iter(f"{{{NS['m']}}}t")))
    return out


def valor(c, ss):
    t = c.get('t')
    if t == 's':
        v = c.find('m:v', NS)
        return ss[int(v.text)] if v is not None else None
    if t == 'inlineStr':
        return ''.join(x.text or '' for x in c.iter(f"{{{NS['m']}}}t"))
    v = c.find('m:v', NS)
    return v.text if v is not None else None


def limpiar(txt):
    if txt is None:
        return ''
    return re.sub(r'[ \t]+', ' ', txt.replace('\r', '')).strip()


def main(origen):
    z = zipfile.ZipFile(origen)
    ss = leer_shared_strings(z)
    hoja_xml = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
    root = ET.fromstring(hoja_xml)

    # --- celdas combinadas -> mapa celda -> celda superior izquierda
    merges = {}
    encabezados_grupo = set()
    for mc in root.iter(f"{{{NS['m']}}}mergeCell"):
        a, b = mc.get('ref').split(':')
        ca, ra = col_row(a)
        cb, rb = col_row(b)
        if ca == 'A' and cb == 'I' and ra == rb:
            encabezados_grupo.add(ra)
        for r in range(ra, rb + 1):
            if ca == cb:
                merges[(ca, r)] = (ca, ra)

    celdas = {}
    for row in root.iter(f"{{{NS['m']}}}row"):
        for c in row.findall('m:c', NS):
            col, r = col_row(c.get('r'))
            celdas[(col, r)] = limpiar(valor(c, ss))

    def v(col, r):
        return celdas.get(merges.get((col, r), (col, r)), '')

    # --- catálogo
    items, grupo, ultima_fila = [], '', FILA_INICIO
    for r in range(FILA_INICIO, 500):
        if r in encabezados_grupo:
            grupo = v('A', r)
            continue
        item = v('C', r)
        if not item:
            continue
        ultima_fila = r
        texto_e = v('E', r)
        items.append({
            'fila': r,
            'grupo': grupo,
            'nivel1': v('A', r),
            'nivel2': v('B', r),
            'item': item,
            'explicacion': v('D', r),
            'normatividad': texto_e,
            'tipo': 'numero' if grupo.upper().startswith('INFORMACION ADICIONAL') else 'cumplimiento',
        })

    filas_item = {it['fila'] for it in items}
    catalogo = {
        'version': 'ITA 2023',
        'hoja': 'sheet1.xml',
        'columnas': {'si': 'F', 'no': 'G', 'na': 'H', 'observacion': 'I'},
        'items': items,
    }
    destino_json = RAIZ / 'src/app/data/catalogo-ita-2023.json'
    destino_json.parent.mkdir(parents=True, exist_ok=True)
    destino_json.write_text(json.dumps(catalogo, ensure_ascii=False, indent=1), encoding='utf-8')

    # --- plantilla en blanco (edición textual del XML para no reserializar)
    def vaciar_celda(m):
        col, r = col_row(m.group(2))
        if col in COLS_RESPUESTA and r in filas_item:
            attrs = re.sub(r'\s+t="[^"]*"', '', m.group(1))
            return f'<c{attrs}/>'
        return m.group(0)

    patron_celda = re.compile(r'<c(\s+r="([A-Z]+\d+)"[^>]*?)(?:/>|>.*?</c>)', re.S)
    hoja_nueva = patron_celda.sub(vaciar_celda, hoja_xml)

    # hipervínculos en celdas vaciadas
    rels_borrar = set()

    def quitar_hl(m):
        col, r = col_row(m.group(1))
        if col in COLS_RESPUESTA and r in filas_item:
            rid = re.search(r'r:id="([^"]+)"', m.group(0))
            if rid:
                rels_borrar.add(rid.group(1))
            return ''
        return m.group(0)

    hoja_nueva = re.sub(r'<hyperlink ref="([A-Z]+\d+)"[^>]*/>', quitar_hl, hoja_nueva)
    hoja_nueva = re.sub(r'<hyperlinks>\s*</hyperlinks>', '', hoja_nueva)
    hoja_nueva = re.sub(r'topLeftCell="[A-Z]+\d+"', 'topLeftCell="A1"', hoja_nueva, count=1)

    rels_hoja = z.read('xl/worksheets/_rels/sheet1.xml.rels').decode('utf-8')
    for rid in rels_borrar:
        rels_hoja = re.sub(rf'<Relationship Id="{rid}"[^>]*/>', '', rels_hoja)

    # imágenes ancladas a las filas de ítems (evidencias pegadas en columna I)
    drawing = z.read('xl/drawings/drawing1.xml').decode('utf-8')
    rels_dibujo = z.read('xl/drawings/_rels/drawing1.xml.rels').decode('utf-8')
    anclas = re.findall(r'<xdr:(?:twoCellAnchor|oneCellAnchor)\b.*?</xdr:(?:twoCellAnchor|oneCellAnchor)>', drawing, re.S)
    media_borrar = set()
    for a in anclas:
        fila = int(re.search(r'<xdr:from>.*?<xdr:row>(\d+)</xdr:row>', a, re.S).group(1)) + 1
        if fila in filas_item:
            drawing = drawing.replace(a, '')
            for rid in re.findall(r'r:embed="([^"]+)"', a):
                t = re.search(rf'<Relationship Id="{rid}"[^>]*Target="([^"]+)"', rels_dibujo)
                if t:
                    media_borrar.add('xl/media/' + t.group(1).split('/')[-1])
                rels_dibujo = re.sub(rf'<Relationship Id="{rid}"[^>]*/>', '', rels_dibujo)
    # no borrar medios que sigan referenciados
    usados = set('xl/media/' + t.split('/')[-1] for t in re.findall(r'Target="([^"]+)"', rels_dibujo))
    media_borrar -= usados

    reemplazos = {
        'xl/worksheets/sheet1.xml': hoja_nueva,
        'xl/worksheets/_rels/sheet1.xml.rels': rels_hoja,
        'xl/drawings/drawing1.xml': drawing,
        'xl/drawings/_rels/drawing1.xml.rels': rels_dibujo,
    }
    destino_xlsx = RAIZ / 'public/plantilla/matriz-ita-2023.xlsx'
    destino_xlsx.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destino_xlsx, 'w', zipfile.ZIP_DEFLATED) as out:
        for info in z.infolist():
            if info.filename in media_borrar:
                continue
            data = reemplazos.get(info.filename)
            out.writestr(info, data.encode('utf-8') if data is not None else z.read(info.filename))

    print(f'Ítems: {len(items)} (filas {items[0]["fila"]}-{ultima_fila})')
    print(f'Hipervínculos retirados: {len(rels_borrar)} | imágenes retiradas: {len(media_borrar)}')
    print(f'-> {destino_json.relative_to(RAIZ)}\n-> {destino_xlsx.relative_to(RAIZ)}')


if __name__ == '__main__':
    main(sys.argv[1])
