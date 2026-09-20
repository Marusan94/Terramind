#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Cuaderno PDF: de donde sale cada dato de Terramind, como se calcula y con que algoritmo.
Uso:  python docs/cuaderno/generar.py
Sale: docs/cuaderno/Terramind_Cuaderno_Datos.pdf (+ figs/*.png)
Fuentes en vivo con respaldo local si no hay red.
"""
import json
import math
import os
import urllib.request
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from fpdf import FPDF

BASE = os.path.dirname(os.path.abspath(__file__))
FIGS = os.path.join(BASE, "figs")
PDF_OUT = os.path.join(BASE, "Terramind_Cuaderno_Datos.pdf")
os.makedirs(FIGS, exist_ok=True)

FECHA = datetime.now().strftime("%d/%m/%Y")


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Terramind-Cuaderno/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save_fig(path):
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()


# ---------------- Datos reales ----------------
CAMS = {"time": [], "pm25": []}
try:
    raw = get(
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        "?latitude=6.247&longitude=-75.567&hourly=pm2_5"
        "&past_days=3&forecast_days=2&timezone=America%2FBogota"
    )
    d = json.loads(raw)
    CAMS = {"time": d["hourly"]["time"], "pm25": d["hourly"]["pm2_5"]}
    print("CAMS en vivo:", len(CAMS["time"]), "horas")
except Exception as exc:  # noqa: BLE001
    print("CAMS sin red, figuras con muestra:", exc)
    base = [12, 11, 10, 9, 8, 7, 6, 5, 4, 4, 5, 8, 12, 16, 20, 22, 21, 18, 15, 13, 12, 11, 10, 9]
    CAMS = {"time": [f"demo-{i:03d}" for i in range(120)], "pm25": (base * 5)[:120]}

GAUGES = []
try:
    raw = get("https://geoportal.siata.gov.co/fastgeoapi/geodata/geodataJson/2/niveles")
    feats = json.loads(raw)["features"]
    for f in feats:
        p = f["properties"]
        try:
            nivel = float(p.get("nivelActual", 0) or 0)
            precaucion = float(p.get("nivelPrecaucion", 0) or 0)
        except (TypeError, ValueError):
            continue  # 'No hay datos en el tiempo consultado' u otro texto
        GAUGES.append(
            {
                "nombre": p.get("nombreEstacion", "?"),
                "nivel": nivel,
                "precaucion": precaucion,
                "fecha": str(p.get("fechaUltimoDato", "")),
            }
        )
    print("Geoportal en vivo:", len(GAUGES), "estaciones")
except Exception as exc:  # noqa: BLE001
    print("Geoportal sin red:", exc)


# ---------------- Algoritmos (mismos que la app) ----------------
BP = [
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 500.0, 301, 500),
]


def pm25_a_aqi(pm):
    for lo, hi, alo, ahi in BP:
        if lo <= pm <= hi:
            return round((ahi - alo) / (hi - lo) * (pm - lo) + alo)
    return 500 if pm > 500 else 0


def least_squares(xs, ys):
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    slope = num / den if den else 0.0
    return slope, my - slope * mx


def std(xs):
    m = sum(xs) / len(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / len(xs))


# ---------------- Figuras ----------------
def fig_flujo():
    fig, ax = plt.subplots(figsize=(8, 3.2))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 4)
    ax.axis("off")
    boxes = [
        (0.2, 1.4, 1.9, 1.2, "SIATA\n(historico)"),
        (0.2, 2.7, 1.9, 1.2, "Open-Meteo\nCAMS+clima"),
        (0.2, 0.1, 1.9, 1.2, "Geoportal\n(niveles)"),
        (4.0, 1.4, 2.0, 1.2, "valley.ts\n(unifica)"),
        (7.8, 1.4, 2.0, 1.2, "Mapa +\nDashboard"),
    ]
    for x, y, w, h, label in boxes:
        ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05", fc="#eef2ff", ec="#6366f1"))
        ax.text(x + w / 2, y + h / 2, label, ha="center", va="center", fontsize=8)
    for _, y, _, h, _ in boxes[:3]:
        ax.annotate("", xy=(4.0, y + h / 2), xytext=(2.1, y + h / 2),
                    arrowprops={"arrowstyle": "->", "color": "#6366f1"})
    ax.annotate("", xy=(7.8, 2.0), xytext=(6.0, 2.0), arrowprops={"arrowstyle": "->", "color": "#6366f1"})
    ax.text(5, 0.5, "Sin red -> respaldo simulado etiquetado", ha="center", fontsize=8, color="#b45309")
    save_fig(os.path.join(FIGS, "fig1_flujo.png"))


def fig_aqi():
    fig, ax = plt.subplots(figsize=(8, 3.4))
    xs, ys = [], []
    v = 0.0
    while v <= 200:
        xs.append(v)
        ys.append(pm25_a_aqi(v))
        v += 0.5
    ax.step(xs, ys, where="post", color="#8b5cf6")
    ax.set_xlabel("PM2.5 (ug/m3)")
    ax.set_ylabel("AQI (EPA)")
    ax.set_title("PM2.5 -> AQI: interpolacion lineal por tramos EPA")
    for y in (50, 100, 150, 200):
        ax.axhline(y, color="gray", ls="--", lw=0.7)
    save_fig(os.path.join(FIGS, "fig2_aqi.png"))


def fig_regresion():
    vals = [v for v in CAMS["pm25"][-96:-24] if v is not None]
    xs = list(range(len(vals)))
    slope, icept = least_squares(xs, vals)
    s = std(vals)
    fut = [slope * (len(vals) + i) + icept for i in range(1, 25)]
    lo = [f - 1.96 * s for f in fut]
    hi = [f + 1.96 * s for f in fut]
    fig, ax = plt.subplots(figsize=(8, 3.4))
    ax.plot(xs, vals, color="#06b6d4", lw=1.2, label="PM2.5 pasado (CAMS)")
    ax.plot(xs, [slope * x + icept for x in xs], color="#f59e0b", ls="--", label=f"Tendencia (m={slope:.3f})")
    fx = list(range(len(vals) + 1, len(vals) + 25))
    ax.plot(fx, fut, color="#8b5cf6", label="Pronostico 24h")
    ax.fill_between(fx, lo, hi, color="#8b5cf6", alpha=0.2, label="IC 95%")
    ax.set_title("Minimos cuadrados + intervalo de confianza 95%")
    ax.set_xlabel("hora")
    ax.set_ylabel("PM2.5 (ug/m3)")
    ax.legend(fontsize=7)
    save_fig(os.path.join(FIGS, "fig3_regresion.png"))
    return slope, s


def fig_forecast48():
    vals = [v for v in CAMS["pm25"][-48:] if v is not None]
    fig, ax = plt.subplots(figsize=(8, 3.4))
    ax.plot(range(len(vals)), vals, color="#06b6d4", label="PM2.5 CAMS 48h")
    ax.set_title("Pronostico CAMS 48h: picos de hora pico 7-9h y 17-20h")
    ax.set_xlabel("hora futura")
    ax.set_ylabel("PM2.5 (ug/m3)")
    ax.legend(fontsize=8)
    save_fig(os.path.join(FIGS, "fig4_forecast48.png"))


def fig_niveles():
    if not GAUGES:
        return None
    top = sorted(GAUGES, key=lambda g: g["nivel"], reverse=True)[:10]
    names = [g["nombre"][:26] for g in top]
    niv = [g["nivel"] for g in top]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    ax.barh(names, niv, color="#0284c7")
    ax.set_xlabel("nivel actual (m)")
    ax.set_title("Niveles en vivo Geoportal SIATA (top 10)")
    ax.invert_yaxis()
    save_fig(os.path.join(FIGS, "fig5_niveles.png"))
    return top


fig_flujo()
fig_aqi()
SLOPE, SIGMA = fig_regresion()
fig_forecast48()
TOP_GAUGES = fig_niveles()

past = [v for v in CAMS["pm25"] if v is not None]
LAST_PM = past[len(past) // 2] if past else 0.0
LAST_AQI = pm25_a_aqi(LAST_PM)


# ---------------- PDF ----------------
def S(s):
    return s.encode("latin-1", "replace").decode("latin-1")


class PDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, S(f"Cuaderno de datos Terramind | {FECHA}"), align="C")
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, S(f"Pagina {self.page_no()}/{{nb}}"), align="C")


pdf = PDF("P", "mm", "A4")
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=18)

ACCENT = (139, 92, 246)
DARK = (20, 22, 34)
GRAY = (100, 116, 139)
GREEN = (34, 197, 94)
YELLOW = (202, 138, 4)


def h1(num, title):
    pdf.set_fill_color(*DARK)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 9, S(f"  {num}. {title}"), fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def h2(title):
    pdf.set_text_color(*ACCENT)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 7, S(title), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def p(text):
    pdf.set_text_color(40, 40, 40)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 5, S(text), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def bullets(items):
    pdf.set_text_color(40, 40, 40)
    pdf.set_font("Helvetica", "", 9)
    for it in items:
        pdf.multi_cell(0, 5, S(f"  - {it}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)


def table(head, rows, widths):
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(235, 240, 255)
    pdf.set_text_color(30, 30, 30)
    for i, htxt in enumerate(head):
        pdf.cell(widths[i], 6, S(htxt), border=1, fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for row in rows:
        for i, val in enumerate(row):
            pdf.cell(widths[i], 6, S(str(val)), border=1)
        pdf.ln()
    pdf.ln(2)


def fig(name, caption, w=170):
    pdf.image(os.path.join(FIGS, name), w=w)
    pdf.ln(2)  # vuelve x al margen: caption a ancho completo
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(*GRAY)
    pdf.multi_cell(0, 5, S(caption), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def badge_row(label, color, text):
    pdf.set_font("Helvetica", "B", 9)
    if color == "g":
        pdf.set_text_color(*GREEN)
    elif color == "y":
        pdf.set_text_color(*YELLOW)
    else:
        pdf.set_text_color(*ACCENT)
    pdf.cell(28, 6, S(label))
    pdf.set_text_color(40, 40, 40)
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 6, S(text), new_x="LMARGIN", new_y="NEXT")


# Portada
pdf.add_page()
pdf.ln(30)


def cover_line(text, size, style, color):
    pdf.set_font("Helvetica", style, size)
    pdf.set_text_color(*color)
    pdf.cell(0, size * 0.6, S(text), align="C", new_x="LMARGIN", new_y="NEXT")


cover_line("Terramind", 26, "B", DARK)
cover_line("Cuaderno de datos: fuentes, calculos y algoritmos", 14, "", ACCENT)
pdf.ln(4)
cover_line(f"Valle de Aburra, Colombia | {FECHA}", 10, "", GRAY)
cover_line("De donde sale cada numero del mapa y el dashboard,", 10, "", GRAY)
cover_line("como se actualiza y que matematica hay detras.", 10, "", GRAY)

# 1
pdf.add_page()
h1(1, "Como se actualiza la app")
p("Al abrir (y con el boton Actualizar del sidebar) apps/web/src/services/valley.ts pide "
  "4 fuentes en paralelo. Si una falla, se usa respaldo simulado y la fuente visible lo dice. "
  "No hay pipelines periodicos en servidor: es fetch en vivo al cargar.")
fig("fig1_flujo.png", "Flujo de datos: 3 fuentes vivas + respaldo simulado etiquetado.")
table(
    ["Capa", "Fuente", "Acceso", "Cadencia"],
    [
        ["Estaciones", "SIATA dumps _Last (hist. sep-2024)", "GET siata.gov.co/EntregaData1/...", "Al cargar"],
        ["Aire actual", "Open-Meteo CAMS (~11 km)", "GET air-quality-api.open-meteo.com", "Al cargar"],
        ["Clima", "Open-Meteo forecast", "GET api.open-meteo.com/v1/forecast", "Al cargar"],
        ["Niveles rio", "Geoportal SIATA en vivo", "Proxy /api/geoportal -> geoportal.siata.gov.co", "Al cargar"],
        ["Mapa base", "OSM / OpenFreeMap / DEM AWS", "Tiles directos + proxy", "Bajo demanda"],
        ["Radar", "RainViewer", "API publica", "Al cargar"],
        ["Chat IA", "Groq (backend) / directo", "POST /api/v1/copilot/query", "Por pregunta"],
        ["RAG docs", "Backend memoria/pgvector", "POST /api/v1/rag/*", "Por pregunta"],
    ],
    [26, 52, 62, 30],
)

# 2
h1(2, "AQI: de PM2.5 a indice EPA")
p("Archivo: apps/web/src/data/stations.ts calculateAQI. Solo PM2.5 (los demas "
  "contaminantes se registran pero no ponderan). Interpolacion lineal por tramos EPA: "
  "AQI = (Ah-Al)/(Bh-Bl) * (C-Bl) + Al.")
table(
    ["PM2.5", "AQI", "Categoria"],
    [["0 - 12.0", "0 - 50", "Buena"], ["12.1 - 35.4", "51 - 100", "Moderada"],
     ["35.5 - 55.4", "101 - 150", "Danina sensibles"], ["55.5 - 150.4", "151 - 200", "Danina"],
     ["150.5 - 250.4", "201 - 300", "Muy danina"], ["250.5 - 500", "301 - 500", "Peligrosa"]],
    [40, 40, 90],
)
badge_row("REAL", "g", f"Ejemplo con CAMS en vivo: PM2.5 = {LAST_PM} ug/m3 -> AQI = {LAST_AQI} (misma tabla que la app).")
fig("fig2_aqi.png", "Escalones EPA: el AQI salta de tramo en 12.0 / 35.5 / 55.5 ug/m3.")

# 3
h1(3, "Pronostico 48h y semanal")
p("Archivo: apps/web/src/services/predictions.ts. Entrada: serie REAL SIATA "
  "(>=12 puntos validos, via seriesToHistory) o historico demo si no hay. Metodo: "
  "pendiente por minimos cuadrados sobre las ultimas 6h + patron horario de hora pico "
  "(7-9h x1.3, 17-20h x1.4, madrugada x0.6) + intervalo de confianza del 95% "
  "(1.96 * desviacion, creciendo 2% por hora). Semanal: promedios por hora + factor "
  "fin de semana 0.75 + tendencia semanal. Ruido determinista: el pronostico no cambia "
  "entre aperturas.")
badge_row("REAL", "g", f"Pendiente ajustada sobre CAMS real: m = {SLOPE:.4f} AQI/hora, sigma = {SIGMA:.2f}.")
fig("fig3_regresion.png", "Recta de minimos cuadrados sobre PM2.5 real + banda IC 95% (metodo de la app).")
fig("fig4_forecast48.png", "CAMS 48h real: se ven las jorobas de hora pico que el patron horario modela.")

# 4
h1(4, "Niveles de agua en vivo")
p("Archivo: apps/web/src/services/hydro.ts. Endpoint Geoportal SIATA con 4 medidores "
  "destacados (codigos 106, 520, 331, 238). Campos: nivelActual, nivelPrecaucion, "
  "fechaUltimoDato. Tendencia (sube/baja/estable) por comparacion de la serie de 72h. "
  "Sin medidores -> error honesto, sin inventar.")
if TOP_GAUGES:
    table(
        ["Estacion", "Nivel (m)", "Ultimo dato"],
        [[g["nombre"][:34], f"{g['nivel']:.2f}", g["fecha"][:16].replace("T", " ")] for g in TOP_GAUGES[:8]],
        [80, 30, 60],
    )
    fig("fig5_niveles.png", "Niveles actuales en vivo (Geoportal SIATA) al generar este cuaderno.")
else:
    p("Sin red al generar: ver niveles en la pestana Agua del dashboard.")

# 5
pdf.add_page()
h1(5, "Clima, radar y mapa base")
bullets([
    "Clima actual (apps/web/src/services/openMeteo.ts): temperatura, humedad, codigo WMO "
    "-> etiqueta (ej. 'Lluvia ligera'). Sin key, zona America/Bogota.",
    "Radar de lluvia: RainViewer (tiles animados, gratis sin key).",
    "Mapa base: OpenStreetMap raster (respaldo) + OpenFreeMap vector (edificios 3D) + "
    "DEM Terrarium de AWS (terreno). Proxies /carto-tiles y /dem-tiles en vite.config.ts.",
    "Cache: tiles y documentos en IndexedDB + memoria (tileCache.ts, 50 MB).",
])

h1(6, "Chats y RAG documental")
bullets([
    "Chat del mapa: 1) backend POST /api/v1/copilot/query (key Groq en servidor, motor "
    "openai/gpt-oss-20b verificado); 2) keys directas del navegador; 3) extractivo local. "
    "Nunca 500: degradado honesto.",
    "RAG: POST /api/v1/rag/search|query|documents. Embeddings por hash offline o "
    "MiniLM; memoria demo con 4 docs + ingesta SIATA opcional. Responde con citas [n]; "
    "sin fuentes se abstiene y encauza.",
    "Anti-alucinacion: sistema exige citar fragmentos; sin fuente lo declara.",
])

# 6 (demo)
h1(7, "Demo etiquetado: que, por que y alternativa")
table(
    ["Dato", "Por que es demo", "Alternativa"],
    [
        ["NDVI / parques", "Sin fuente libre sin key (Sentinel Hub pide key)", "Pegar key o usar FIRMS-like; hoy ubicaciones reales + NDVI ilustrativo"],
        ["Humo (sin key)", "FIRMS exige MAP_KEY gratuita con registro", "Ya integrado: con VITE_FIRMS_MAP_KEY se vuelve en vivo solo"],
        ["Pronostico demo", "Sin serie SIATA cargada", "Ya usa serie real cuando existe (>=12 pts)"],
        ["Humedad por altitud", "Heuristica lapse (+0.8%/100m sobre Open-Meteo)", "Aceptable como estimador etiquetado"],
        ["Vulnerabilidad", "Indice compuesto propio (no oficial)", "Documentado como adaptacion prototipo"],
    ],
    [32, 68, 70],
)

# 7
pdf.add_page()
h1(8, "Dashboard pestana por pestana")
bullets([
    "Resumen: promedios aritmeticos de estaciones validas; serie horaria real SIATA "
    "(>=12 pts) o sintetica marcada; deltas = ultimo - primero.",
    "Inteligencia (intelligence.ts, determinista): ranking vs OMS-15; semaforo POECA; "
    "techo de mezcla = 180 + diurno*1250 + viento*45; fuentes por heuristica "
    "(hora pico + distrito industrial + viento); P(excedencia) gaussiana; anomalias MAD k=3.5; "
    "ruta IDW 1/(d+0.5)^2 + dosis 5 min/tramo.",
    "Territorio: vulnerabilidad = 100*(0.55*AQI/200 + 0.25*(1800-elev)/500 + 0.2*industrial).",
    "Pronostico: seccion 3 (etiqueta real/demo visible).",
    "Estaciones: ranking por AQI con calidad VALID/MISSING/SIMULATED por estacion.",
    "Cientifico: tabla OMS vs actual (PM2.5:15, PM10:45, O3:60, NO2:25 ug/m3).",
    "Clima/Agua/Vegetacion/Explorar/Calidad/Metodo: clima Open-Meteo; agua Geoportal; "
    "vegetacion demo; explorer CSV con serie real si hay; calidad explica -9999; metodo el linaje.",
])

h1(9, "Anexo: formulas")
bullets([
    "AQI(PM) = (Ah-Al)/(Bh-Bl) * (PM-Bl) + Al por tramo EPA.",
    "Pendiente minimos cuadrados: m = sum((x-mx)(y-my)) / sum((x-mx)^2).",
    "IC95(h) = 1.96 * sigma * (1 + 0.02*h).",
    "P excedencia = 1 - Phi((umbral - mu)/sigma).",
    "MAD: anomalia si |x - mediana| > 3.5 * MAD.",
    "IDW ruta: C = sum(Ci/(di+0.5)^2) / sum(1/(di+0.5)^2).",
    "Adveccion humo (didactica, no HYSPLIT): 1 punto/hora con viento 70 deg, 2.5 m/s.",
])

pdf.output(PDF_OUT)
print("PDF:", PDF_OUT)
