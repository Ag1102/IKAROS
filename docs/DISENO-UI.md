# Dirección de diseño de la interfaz (que no parezca hecha por IA)

## Concepto
**Consola de control de misión real, usada por ingenieros.** Densa, funcional, con datos primero.
Referencia: pantallas del Mission Design Lab y de control de misión de NASA (sin copiar logos), no una "landing page de startup".

## Lo que delata a una interfaz generada (evitar)
- Degradados morados/azules, brillos neón, fondos con desenfoque tipo vidrio.
- Tarjetas redondeadas idénticas en una cuadrícula de 3, todas con la misma sombra.
- Emojis o iconos genéricos como decoración, textos con "✨", "Potencia tu misión".
- Tipografía por defecto (Inter/Roboto para todo), centrado simétrico en todas partes.
- Textos vagos y números redondos inventados ("99.9 %", "+250 %").
- Animaciones de entrada en todo, sin motivo.

## Lo que sí
- **Datos reales y con unidad en todo:** `482 W`, `0.044 AU`, `T+ 03:12:45`, tablas alineadas con cifras tabulares.
- **Reloj de misión (T+)** siempre visible, indicadores de estado con texto (NOMINAL / ADVERTENCIA / CRÍTICO), no solo color.
- **Paneles planos** con líneas finas de 1 px, esquinas casi rectas, sin sombras grandes; zonas con densidad distinta, no todo igual.
- **Asimetría con propósito:** la escena 3D ocupa el centro; los paneles se organizan por segmento (lanzamiento, espacio, tierra, usuario) y por rol.
- **Paleta corta:** fondo gris-azul muy oscuro (no negro puro), un ámbar para advertencias/acciones, un cian apagado para datos en vivo, rojo solo para fallos. Nada más.
- **Tipografía:** *Barlow Condensed* para títulos y etiquetas, *Barlow* para texto, *IBM Plex Mono* para cifras y telemetría. Tres pesos como máximo.
- **Iconos:** pocos, de trazo uniforme, dibujados a medida (SVG propios o un solo set); mejor etiquetas de texto.
- **Movimiento solo con función:** las agujas, barras y trazas se mueven porque reflejan datos; transiciones breves (≤150 ms).
- **Textos escritos por el equipo:** frases cortas y concretas, tono de ingeniero ("Radiadores fuera de la umbra"), con detalles propios del juego.
- **Imperfecciones controladas:** pequeñas marcas de calibración, números de serie de módulos, etiquetas de revisión; evitan el aspecto "plantilla".
- **Accesibilidad:** contraste AA, estados con texto, foco visible, uso sin ratón en menús.

## Reglas de marca y legales
- No usar el logo de NASA (meatball/worm) como elemento de nuestra marca ni sugerir respaldo de NASA; mostrar logos y modelos NASA solo tal cual, sin cambios.
- Crear un logotipo y nombre propios para el juego ("Ikaros" con subtítulo).

## Cómo comprobarlo antes del envío
1. Captura de cada pantalla y revisión contra la lista "evitar".
2. Probar con alguien ajeno al equipo: ¿se siente una herramienta de ingenieros o una plantilla?
3. Revisar que cada número tenga unidad y fuente.
