# Chirptenna VNA

Asistente web (Web Serial) para medir antenas con un NanoVNA. Independiente de Chirptenna (el generador de antenas,
repo `sqtactical/chirptenna`) para servir con cualquier antena; comparte estilo y alguna convención. Sin servidor ni
compilación: HTML + JS (módulos ES) + CSS. Detalle de uso y estructura en `README.md`.

## Ejecutar y probar
- Servir: `python -m http.server 8765` desde la raíz → <http://localhost:8765> (modo simulado sin equipo).
- Pruebas: `node --test pruebas/` (Node ≥ 20; ~5 s). Hay que pasarlas antes de cada commit.
- Todo en español (nombres, comentarios, mensajes). Archivos en UTF-8 sin BOM, LF.

## Reglas con el NanoVNA (obligatorias; vienen del proyecto Chirptenna)
- NanoVNA-H, firmware DiSlord 1.2.42. **Nunca enviar `save`**: no se pisan los slots de calibración del equipo.
- Tras una medida en bruto hay que restaurar siempre `cal on` (si estaba activa) y el barrido (`sweep`), en `finally`.
- **Nada que toque el equipo real sin el usuario delante** (hay que cambiar patrones a mano). El driver sigue sin probar con
  hardware: `cal`, `cal off`, `sweep`, tiempos y el límite de 101 puntos por `scan` están verificados solo con el emulador.

## Lecciones
1. La corrección SOL en JS coincide con `vna/calibracion.py` de Chirptenna a 1e-16 con el OSL real del equipo (test con
   datos reales en `pruebas/datos/`, que son una muestra reducida).
2. Calibrando por tramos, por encima de ~1,6 GHz la carga buena refleja el 31–36 % del OPEN **en bruto** (en todo el rango,
   19 %): el umbral de «carga mal puesta» de `vna/calibrar.py` (0,3) daría falsos fallos; aquí es 0,5. Un OPEN o SHORT
   puesto como carga da ~100 %.
3. La prominencia de una resonancia se mide hasta el siguiente punto más alto, no contra el valle más bajo de los dos lados:
   el ruido en la falda de una resonancia grande daba «resonancias» falsas. Los máximos poco prominentes salen aparte como
   «posiblemente falsa» (`resonanciasDudosas`) y no entran en la recomendación, el veredicto ni el afinado.
4. Medir bien una banda estrecha con barrido logarítmico: se encadenan barridos lineales de ≤101 puntos y se **afina**
   (ventanas de ±3 % con 201 puntos alrededor de los 4 mejores picos) fusionando con `fusionar`.
5. Verificar la interfaz en el navegador (panel de vista previa o Edge) tras cambios visibles; los tests no ven el DOM.
   Tras cambiar JS/CSS puede hacer falta recarga forzada (caché).

## Pendiente
**El plan completo está en `ROADMAP.md`** (fases con casillas; márcalas al terminar). La Fase 0 (probar con el equipo real)
va antes que todo lo demás. Resumen:
- Probar el driver con el NanoVNA conectado (pedir al usuario `version`, `info`, `scan 50000 2700000000 11 3`).
- Modelo de patrones con retardo/capacidad del OPEN (precisión > 1 GHz); drivers de V2/V2Plus4/F V3/LiteVNA.
- Verificar los bordes de `bandas.json` con los planes nacionales; selector de idioma; versión de escritorio (reutilizar
  la lógica de Python del proyecto Chirptenna) y posible enlace desde su pestaña «Medir».
- Crear el repo privado en GitHub (`sqtactical/Chirptenna-VNA`) y publicar con `.github/workflows/pages.yml`.
