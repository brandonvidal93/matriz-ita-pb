"""
Genera, a partir de un archivo de la Matriz de evaluación - Nivel de Accesibilidad
(diligenciado o en blanco):

  1. public/plantilla/matriz-evaluacion-accesibilidad.xlsx -> plantilla en blanco:
     se vacían las celdas que diligencia la aplicación (ver CELDAS) y sus
     hipervínculos, y se pide a Excel recalcular fórmulas y gráficos al abrir.
  2. src/app/data/catalogo-accesibilidad.json -> criterios (hoja 2, completados con
     la descripción y el enlace W3C de la hoja 8) y herramientas (hoja 4).

Igual que preparar_plantilla.py, se edita el XML del paquete sin reserializarlo.

Uso:
    python tools/preparar_accesibilidad.py <archivo.xlsx>
"""
import json
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

from preparar_plantilla import NS, RAIZ, col_row, leer_shared_strings, limpiar, valor

FILAS_CRITERIOS = range(13, 91)
FILAS_HALLAZGOS = range(5, 35)
FILAS_HERRAMIENTAS = range(4, 10)

# Celdas que escribe la aplicación, por hoja.
CELDAS = {
    'sheet1.xml': {f'B{r}' for r in range(7, 15)},
    'sheet2.xml': {f'{c}{r}' for r in FILAS_CRITERIOS for c in 'HJ'},
    'sheet3.xml': {f'{c}{r}' for r in FILAS_HALLAZGOS for c in 'BCDEFGH'},
    'sheet4.xml': {f'A{r}' for r in FILAS_HERRAMIENTAS} | {'A12', 'A15', 'A18'} | {f'B{r}' for r in range(21, 28)},
}


def leer_hoja(z, nombre, ss):
    root = ET.fromstring(z.read(f'xl/worksheets/{nombre}'))
    celdas = {c.get('r'): limpiar(valor(c, ss)) for c in root.iter(f"{{{NS['m']}}}c")}
    rels = {}
    try:
        for r in ET.fromstring(z.read(f'xl/worksheets/_rels/{nombre}.rels')):
            rels[r.get('Id')] = r.get('Target')
    except KeyError:
        pass
    enlaces = {h.get('ref'): rels.get(h.get(f"{{{NS['r']}}}id")) for h in root.iter(f"{{{NS['m']}}}hyperlink")}
    return celdas, enlaces


def vaciar(z, nombre):
    """Devuelve (hoja, rels) sin los valores ni los hipervínculos de CELDAS."""
    hoja = z.read(f'xl/worksheets/{nombre}').decode('utf-8')
    celdas = CELDAS[nombre]

    def celda(m):
        ref = m.group(2)
        if ref in celdas:
            # Las casillas de verificación (booleanas) quedan en FALSO.
            if ' t="b"' in m.group(1):
                return f'<c{m.group(1)}><v>0</v></c>'
            return '<c' + re.sub(r'\s+t="[^"]*"', '', m.group(1)) + '/>'
        # Fórmulas: sin el valor en caché, para no mostrar los totales del ejemplo.
        return re.sub(r'(<f>.*?</f>)<v>.*?</v>', r'\1', m.group(0), flags=re.S)

    hoja = re.sub(r'<c(\s+r="([A-Z]+\d+)"[^>]*?)(?:/>|>.*?</c>)', celda, hoja, flags=re.S)
    borrar = set()

    def hl(m):
        if m.group(1) not in celdas:
            return m.group(0)
        borrar.update(re.findall(r'r:id="([^"]+)"', m.group(0)))
        return ''

    hoja = re.sub(r'<hyperlink\b(?=[^>]*\bref="([A-Z]+\d+)")[^>]*/>', hl, hoja)
    hoja = re.sub(r'<hyperlinks>\s*</hyperlinks>', '', hoja)
    ruta_rels = f'xl/worksheets/_rels/{nombre}.rels'
    rels = z.read(ruta_rels).decode('utf-8') if ruta_rels in z.namelist() else None
    for rid in borrar:
        rels = re.sub(rf'<Relationship Id="{rid}"[^>]*/>', '', rels)
    return hoja, rels


def main(origen):
    z = zipfile.ZipFile(origen)
    ss = leer_shared_strings(z)

    # --- catálogo
    h2, _ = leer_hoja(z, 'sheet2.xml', ss)
    h8, enlaces8 = leer_hoja(z, 'sheet6.xml', ss)  # hoja 8: Definición de criterios
    h4, _ = leer_hoja(z, 'sheet4.xml', ss)
    definiciones = {}
    for r in range(4, 200):
        sc = h8.get(f'D{r}')
        if sc:
            definiciones[sc] = {
                'descripcion': h8.get(f'G{r}', ''),
                'excepcion': h8.get(f'H{r}', ''),
                'enlace': enlaces8.get(f'I{r}') or '',
            }
    criterios = []
    for r in FILAS_CRITERIOS:
        sc = h2.get(f'B{r}')
        if not sc:
            raise SystemExit(f'Falta el criterio de la fila {r} en la hoja 2')
        d = definiciones.get(sc)
        if not d:
            raise SystemExit(f'El criterio {sc} no está en la hoja 8')
        criterios.append({
            'fila': r,
            'sc': sc,
            'mintic': h2.get(f'C{r}', ''),
            'principio': h2.get(f'D{r}', ''),
            'directriz': h2.get(f'E{r}', ''),
            'criterio': h2.get(f'F{r}', ''),
            'nivel': h2.get(f'G{r}', ''),
            'metodo': h2.get(f'I{r}', ''),
            **d,
        })
    herramientas = [{'fila': r, 'nombre': h4[f'B{r}']} for r in FILAS_HERRAMIENTAS]
    catalogo = {'criterios': criterios, 'herramientas': herramientas, 'maxHallazgos': len(FILAS_HALLAZGOS)}
    destino_json = RAIZ / 'src/app/data/catalogo-accesibilidad.json'
    destino_json.write_text(json.dumps(catalogo, ensure_ascii=False, indent=1), encoding='utf-8')

    # --- plantilla en blanco
    reemplazos = {}
    for nombre in CELDAS:
        hoja, rels = vaciar(z, nombre)
        reemplazos[f'xl/worksheets/{nombre}'] = hoja
        if rels is not None:
            reemplazos[f'xl/worksheets/_rels/{nombre}.rels'] = rels
    libro = z.read('xl/workbook.xml').decode('utf-8')
    reemplazos['xl/workbook.xml'] = re.sub(r'<calcPr\b[^>]*/>', '<calcPr fullCalcOnLoad="1"/>', libro)

    destino_xlsx = RAIZ / 'public/plantilla/matriz-evaluacion-accesibilidad.xlsx'
    with zipfile.ZipFile(destino_xlsx, 'w', zipfile.ZIP_DEFLATED) as out:
        for info in z.infolist():
            data = reemplazos.get(info.filename)
            out.writestr(info, data.encode('utf-8') if data is not None else z.read(info.filename))

    print(f'Criterios: {len(criterios)} | herramientas: {len(herramientas)}')
    print(f'-> {destino_json.relative_to(RAIZ)}\n-> {destino_xlsx.relative_to(RAIZ)}')


if __name__ == '__main__':
    main(sys.argv[1])
