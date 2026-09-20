from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 14)
        self.cell(0, 10, 'Fuentes Oficiales Ambientales - Colombia', align='C', new_x="LMARGIN", new_y="NEXT")
        self.set_font('Helvetica', '', 9)
        self.cell(0, 6, 'Referencia rapida para ingesta RAG - TerraMind', align='C', new_x="LMARGIN", new_y="NEXT")
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.cell(0, 10, f'Pagina {self.page_no()}/{{nb}}', align='C')

    def add_section(self, title, items):
        self.set_font('Helvetica', 'B', 11)
        self.set_fill_color(30, 80, 130)
        self.set_text_color(255, 255, 255)
        self.cell(0, 8, f'  {title}', fill=True, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(2)
        for item in items:
            self.add_item(item)
        self.ln(3)

    def add_item(self, item):
        self.set_font('Helvetica', 'B', 9)
        x = self.get_x()
        y = self.get_y()
        self.multi_cell(0, 5, item['name'], new_x="LMARGIN", new_y="NEXT")
        self.set_font('Helvetica', '', 8.5)
        self.set_text_color(80, 80, 80)
        self.multi_cell(0, 4.5, item['desc'], new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        if item.get('url'):
            self.set_font('Helvetica', 'U', 8)
            self.set_text_color(0, 51, 153)
            self.cell(0, 4.5, item['url'], link=item['url'], new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0, 0, 0)
        self.ln(1.5)


pdf = PDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)
pdf.add_page()

# --- SISTEMAS DE INFORMACION NACIONALES ---
sistemas_nacionales = [
    {"name": "SIAC - Sistema de Información Ambiental de Colombia",
     "desc": "Puerta de entrada a SIRH, SISAIRE, SNIF, RESPEL, RUA, RUNAP, datos geograficos y demas sistemas ambientales oficiales.",
     "url": "https://siac.gov.co"},
    {"name": "SIRH - Sistema de Información del Recurso Hídrico",
     "desc": "Concesiones, fuentes, oferta, demanda, calidad y datos asociados al agua.",
     "url": "https://siac.gov.co/sirh"},
    {"name": "SISAIRE - Sistema Oficial de Información de Calidad del Aire",
     "desc": "Complementario a los datos de SIATA para el contexto nacional.",
     "url": "https://siac.gov.co/sisaire"},
    {"name": "SNIF - Sistema Nacional de Información Forestal",
     "desc": "Bosques, aprovechamiento forestal, movilizacion, deforestacion y estadisticas forestales.",
     "url": "https://siac.gov.co/snif"},
    {"name": "RESPEL - Registro de Generadores de Residuos Peligrosos",
     "desc": "Obligaciones, cantidades, manejo y trazabilidad de residuos peligrosos.",
     "url": "https://siac.gov.co/respel"},
    {"name": "RUA - Registro Único Ambiental",
     "desc": "Informacion de establecimientos sobre uso de recursos, emisiones, residuos, vertimientos y gestion ambiental.",
     "url": "https://siac.gov.co/rua"},
    {"name": "RUNAP - Registro Único Nacional de Areas Protegidas",
     "desc": "Areas protegidas, categorias, ubicacion e instrumentos asociados.",
     "url": "https://runap.parquesnacionales.gov.co"},
]
pdf.add_section("SISTEMAS DE INFORMACION NACIONALES (SIAC)", sistemas_nacionales)

# --- MARCO NORMATIVO FUNDAMENTAL ---
marco_normativo = [
    {"name": "Constitucion Politica de Colombia (1991)",
     "desc": "Base juridica del derecho al ambiente sano, proteccion de recursos naturales, planificacion ambiental y participacion ciudadana (Arts. 79, 80, 334, 366).",
     "url": "https://www.senado.gov.co/constitucion"},
    {"name": "Ley 99 de 1993",
     "desc": "Crea el Ministerio de Ambiente y el SINA, define autoridades ambientales, licenciamiento, instrumentos economicos y principios de gestion ambiental.",
     "url": "https://www.minambiente.gov.co/ley-99-1993"},
    {"name": "Decreto 1076 de 2015 (Decreto Unico Reglamentario Sector Ambiente)",
     "desc": "Pieza central para permisos, agua, vertimientos, emisiones, bosques, biodiversidad, licenciamiento y obligaciones ambientales.",
     "url": "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=73004"},
    {"name": "Ley 1333 de 2009 - Regimen Sancionatorio Ambiental",
     "desc": "Infracciones ambientales, medidas preventivas, multas, decomisos, cierres y procedimiento sancionatorio.",
     "url": "https://www.minambiente.gov.co/ley-1333-2009"},
    {"name": "Ley 1931 de 2018 + Ley 2169 de 2021 - Cambio Climatico",
     "desc": "Marco colombiano de cambio climatico, adaptacion, mitigacion, metas climaticas y planificacion.",
     "url": "https://www.minambiente.gov.co/cambio-climatico"},
]
pdf.add_section("MARCO NORMATIVO FUNDAMENTAL", marco_normativo)

# --- NORMATIVA ESPECIFICA (RESOLUCIONES CLAVE) ---
resoluciones = [
    {"name": "Resolucion 631 de 2015",
     "desc": "Norma clave de vertimientos: parametros, limites maximos permisibles y condiciones para vertimientos puntuales.",
     "url": "https://www.minambiente.gov.co/resolucion-631-2015"},
    {"name": "Resolucion 2254 de 2017",
     "desc": "Norma nacional de calidad del aire y referencia para PM2.5, PM10, O3, NO2, SO2, CO y otros contaminantes.",
     "url": "https://www.minambiente.gov.co/resolucion-2254-2017"},
    {"name": "Resolucion 627 de 2006",
     "desc": "Norma nacional de emision de ruido y ruido ambiental, especialmente relevante para Medellin y el Valle de Aburra.",
     "url": "https://www.minambiente.gov.co/resolucion-627-2006"},
]
pdf.add_section("RESOLUCIONES AMBIENTALES CLAVE", resoluciones)

# --- AUTORIDADES AMBIENTALES REGIONALES ---
autoridades = [
    {"name": "AMVA - Area Metropolitana del Valle de Aburra",
     "desc": "Autoridad ambiental urbana de Medellin y el Valle; normativa, acuerdos, resoluciones, aire, ruido, residuos, agua y tramites.",
     "url": "https://www.metropol.gov.co"},
    {"name": "SIATA - Sistema de Alerta Temprana del Valle de Aburra",
     "desc": "Datos ambientales hiperlocales: PM2.5, PM10, meteorologia, lluvia, hidrologia, radar, estaciones, incendios y alertas.",
     "url": "https://siata.gov.co"},
    {"name": "CORANTIOQUIA",
     "desc": "Autoridad ambiental regional para Antioquia fuera de jurisdiccion AMVA; permisos, agua, bosques, biodiversidad, mineria y sancionatorio.",
     "url": "https://www.corantioquia.gov.co"},
    {"name": "CORNARE",
     "desc": "Autoridad ambiental regional del Oriente antioquenho; normativa, permisos, recursos naturales, agua, biodiversidad y tramites.",
     "url": "https://www.cornare.gov.co"},
    {"name": "ANLA - Autoridad Nacional de Licencias Ambientales",
     "desc": "Licencias ambientales nacionales, estudios de impacto, terminos de referencia, seguimiento, modificaciones y obligaciones.",
     "url": "https://www.anla.gov.co"},
    {"name": "IDEAM",
     "desc": "Fuente nacional fundamental para clima, hidrologia, meteorologia, calidad ambiental, bosques, deforestacion, agua y cambio climatico.",
     "url": "https://www.ideam.gov.co"},
]
pdf.add_section("AUTORIDADES AMBIENTALES Y ENTIDADES TECNICAS", autoridades)

# --- INSTRUMENTOS DE PLANIFICACION Y GESTION ---
instrumentos = [
    {"name": "POT Medellin - Acuerdo 48 de 2014",
     "desc": "Usos del suelo, estructura ecologica, riesgo, proteccion, planeacion territorial y normativa municipal.",
     "url": "https://www.medellin.gov.co/pot"},
    {"name": "POMCA / Ordenamiento de Cuencas",
     "desc": "Determinantes, usos, proteccion hidrica, riesgos y planificacion ambiental de cuencas y microcuencas.",
     "url": "https://www.minambiente.gov.co/recurso-hidrico/pomca"},
    {"name": "PIGECA / POECA",
     "desc": "Instrumentos metropolitanos para gestion de calidad del aire y respuesta a episodios de contaminacion en el Valle de Aburra.",
     "url": "https://www.metropol.gov.co/pigeca"},
    {"name": "Plan de Accion de Ruido 2019-2030 / Acuerdo Metropolitano 24 de 2019",
     "desc": "Planificacion especifica para prevencion y control del ruido en los diez municipios del Valle de Aburra.",
     "url": "https://www.metropol.gov.co/plan-ruido"},
    {"name": "NDC Colombia - Contribuciones Determinadas a Nivel Nacional",
     "desc": "Compromisos climaticos nacionales, metas de reduccion de GEI y adaptacion bajo el Acuerdo de Paris.",
     "url": "https://unfccc.int/ndc-colombia"},
]
pdf.add_section("INSTRUMENTOS DE PLANIFICACION Y GESTION TERRITORIAL", instrumentos)

# --- DATOS ABIEROS Y PORTAL DE TRAMITES ---
datos_abiertos = [
    {"name": "Datos Abiertos Colombia (datos.gov.co)",
     "desc": "Datasets publicos que complementan legislacion con datos estructurados y reutilizables.",
     "url": "https://www.datos.gov.co"},
    {"name": "Datos Abiertos Medellin (Medata)",
     "desc": "Datasets municipales para cruzar normativa ambiental con territorio, infraestructura, movilidad y variables urbanas.",
     "url": "https://medata.gov.co"},
    {"name": "VITAL - Ventanilla Integral de Trámites Ambientales en Linea",
     "desc": "Util para conectar el RAG con procesos y tramites reales.",
     "url": "https://vital.anla.gov.co"},
]
pdf.add_section("DATOS ABIERTOS Y TRAMITES", datos_abiertos)

# --- INSTITUCIONES CIENTIFICAS Y CONOCIMIENTO ---
instituciones = [
    {"name": "Instituto Humboldt",
     "desc": "Biodiversidad, especies, ecosistemas, servicios ecosistemicos y conocimiento cientifico colombiano.",
     "url": "https://www.humboldt.org.co"},
    {"name": "Parques Nacionales Naturales de Colombia",
     "desc": "Areas protegidas, planes de manejo, zonificacion, conservacion y restricciones territoriales.",
     "url": "https://www.parquesnacionales.gov.co"},
    {"name": "Universidades: UdeA, UNAL, EAFIT, UPB, ITM",
     "desc": "Evidencia cientifica, estudios locales, tesis y conocimiento que complementa las fuentes oficiales.",
     "url": "https://www.udea.edu.co"},
]
pdf.add_section("INSTITUCIONES CIENTIFICAS Y ACADEMICAS", instituciones)

# --- ORGANISMOS INTERNACIONALES Y ESTANDARES ---
internacionales = [
    {"name": "Escazu - Acuerdo Regional",
     "desc": "Acceso a informacion ambiental, participacion publica y justicia ambiental; relevante para consultas ciudadanas.",
     "url": "https://www.cepal.org/escazu"},
    {"name": "OMS - Salud Ambiental",
     "desc": "Calidad del aire, agua, saneamiento, ruido, quimicos, cambio climatico y efectos ambientales sobre salud.",
     "url": "https://www.who.int/health-topics/environmental-health"},
    {"name": "PNUMA / UNEP",
     "desc": "Conocimiento internacional sobre contaminacion, biodiversidad, quimicos, residuos, clima, economia circular y restauracion.",
     "url": "https://www.unep.org"},
    {"name": "OCDE - Environment",
     "desc": "Politicas publicas, economia ambiental, agua, biodiversidad, contaminacion, residuos, clima y gobernanza.",
     "url": "https://www.oecd.org/environment"},
    {"name": "ICONTEC / ISO 14000",
     "desc": "Estandares tecnicos de gestion ambiental, ACV, GEI, huella de carbono y desempeno ambiental.",
     "url": "https://www.icontec.org"},
]
pdf.add_section("ORGANISMOS INTERNACIONALES Y ESTANDARES TECNICOS", internacionales)

# --- MINERIA ---
mineria = [
    {"name": "ANM - Agencia Nacional de Mineria + Normativa Ambiental Minera",
     "desc": "Titulos, catastro, exploracion/explotacion y cruce con licenciamiento, agua, biodiversidad y restauracion.",
     "url": "https://www.anm.gov.co"},
]
pdf.add_section("MINERIA", mineria)

# --- JURISPRUDENCIA ---
jurisprudencia = [
    {"name": "Corte Constitucional",
     "desc": "Interpretacion del derecho al ambiente sano, agua, licencias, sanciones, biodiversidad y conflictos ambientales.",
     "url": "https://www.corteconstitucional.gov.co"},
    {"name": "Consejo de Estado",
     "desc": "Jurisprudencia contencioso-administrativa en materia ambiental, licencias, sanciones y contratacion estatal.",
     "url": "https://www.consejodeestado.gov.co"},
    {"name": "Corte Suprema de Justicia",
     "desc": "Casacion y tutelas en materia ambiental, responsabilidad civil y penal ambiental.",
     "url": "https://www.cortesuprema.gov.co"},
]
pdf.add_section("JURISPRUDENCIA AMBIENTAL", jurisprudencia)

output_path = r"C:\Users\USUARIO\Terramind\Fuentes_Ambientales_Colombia.pdf"
pdf.output(output_path)
print(f"PDF generado en: {output_path}")