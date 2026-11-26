<p align="center"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/logo-vna-oscuro.png">
  <img src="img/logo-vna.png" alt="Chirptenna VNA" width="560">
</picture></p>

# Chirptenna VNA

**Español** · [English](README.en.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

Asistente web para **medir una antena con un NanoVNA** desde el navegador, sin instalar nada: dice si resuena donde
quieres, si hay que **alargarla o cortarla y cuánto**, y da todos sus parámetros (Smith, impedancia, VSWR, fase, retardo
de grupo). Sirve para **cualquier antena**; nació dentro del proyecto [Chirptenna](https://sqtactical.github.io/chirptenna/)
(generador de antenas fractales para PCB) y comparte su estilo.

> **Estado: alpha.** Probado con un emulador del shell del equipo y con datos reales de un NanoVNA-H, **pero el driver aún
> no se ha ejecutado contra el equipo conectado**. Hasta entonces, trátalo como experimental.

**Úsalo ahora: <https://sqtactical.github.io/Chirptenna-VNA/>** (Chrome o Edge de escritorio; tiene un modo simulado para probar sin equipo).

## Qué hace

- **Modo Simple**: eliges la banda (HAM de MF a SHF, ISM europeas y americanas) o un barrido general, mides y lees un
  veredicto («Alarga la antena un 3,2 %», «cubre la banda», «no resuena dentro del rango»…).
- **Modo Avanzado**: carta de Smith, Z, fase, VSWR, retardo de grupo, cursor, tabla de bandas, exportación CSV y
  Touchstone `.s1p`, e **informe PDF** con los gráficos.
- **Estudio de una banda con margen lateral** (borde inferior ×(1−m), superior ×(1+m); 10 % por defecto) o **barrido general**
  de todo el rango del equipo (3000 puntos, espaciado logarítmico) con **afinado** automático alrededor de las resonancias.
- **Retardo antes de medir** para apartarte de la antena (con cuenta atrás y pitidos).
- **Calibración guiada OSL por tramos**: puedes calibrar todo el rango de una vez o «a cachos», parar y seguir otro día;
  los juegos se guardan en el navegador y se exportan/importan en JSON. La calibración de la app corrige los datos en bruto
  y no toca los slots del equipo.
- **Cricky**, el grillo asistente (guiño a Clippy): una burbuja discreta que comenta lo importante (conexión, calibración, cuenta atrás, resultado). Solo en el modo Simple; se cierra de un clic y se puede silenciar para siempre.
- Las resonancias poco marcadas (ruido, rizado en la falda de otra) no se mezclan con las reales: salen aparte como
  **«posiblemente falsa»**.
- **Modo simulado con 13 antenas de ejemplo** (sin equipo): bien centrada, resuena baja o alta, mal adaptada, estrecha,
  curva irregular, trampas de HF y los dos errores típicos (cable abierto y carga de 50 Ω). Al elegir una, la app selecciona
  la banda que mejor la enseña.
- **Mi nodo Meshtastic**: eliges región y preset y la app calcula la frecuencia real de tu canal y juzga la antena ahí.
- **Comparar antenas**: guarda varias medidas con nombre y compáralas en una tabla y un gráfico.
- **Herramientas de radioaficionado** (modo Avanzado): red de adaptación en L con valores E24, medida de coaxial y stubs, quitar el cable de la medida, Q de trampas y resonadores, comprobación de un choke o balun 1:1, modo «En vivo» para ajustar un acoplador y veredicto por banda en antenas multibanda.
- **Herramientas de experto**: comparar con un archivo Touchstone (.s1p/.s2p) o con el esultado.json de una simulación de Chirptenna (estima la εr real), promediar barridos con ruido estimado y una API de consola (window.chirptenna).
- **Leer en voz alta** el veredicto.
- **Regiones**: Europa (R1), América (R2) y Asia-Pacífico (R3, con bandas ITU sin contrastar por país).
- **Idiomas**: castellano, inglés, francés y alemán (selector en la cabecera; se elige solo según el navegador o con
  `?idioma=en`). Las traducciones las ha hecho Claude y conviene que las revise alguien nativo.

## Equipos

| Equipo | Estado |
|---|---|
| NanoVNA-H / H4 con firmware **DiSlord** 1.2.x (hasta 2,7 GHz) | Soportado (driver `js/drivers/nanovna-h.js`); sin probar con el hardware conectado |
| NanoVNA V2, V2 Plus4, F V3, LiteVNA (hasta 6 GHz) | Previsto: las bandas hasta 6 GHz ya están en `bandas.json`; faltan los drivers |

## Cómo usarlo

Hace falta **Chrome o Edge de escritorio** (Web Serial) y una página servida por `https` o `localhost`.

```powershell
python -m http.server 8765
```

y abre <http://localhost:8765>. Sin equipo, marca **«Modo simulado»**: una antena de ejemplo con dos resonancias y errores
de medida realistas para probar la calibración.

### Probar con tu NanoVNA

Abre **[diagnostico.html](diagnostico.html)** con el equipo conectado: comprueba el protocolo, el límite de puntos, los tiempos y que la
medida en bruto restaura la calibración, y genera un informe de texto para pegar en una incidencia. Nunca envía `save`.

## Llevar y traer antenas (Chirptenna Wire y Chirptenna)

Las antenas viajan en archivos normales; no hay que configurar nada. Con **Chirptenna Wire** (antenas de alambre, NEC2):

| Qué | Cómo |
|---|---|
| **Traer lo simulado** (`.s1p`) | En Wire: `python -m wire s1p <tipo> <MHz> --salida sim.s1p` o el botón *Descargar S11 simulado* (pestaña Simulación). Aquí, modo **Avanzado** → **Comparar con un archivo Touchstone** → elige el `.s1p`: sale en gris sobre el gráfico de ROE, con la diferencia punto a punto y cuánto se desvía la resonancia |
| **Llevar tu medida** (`.s1p`) | Mide, y en modo Avanzado pulsa **Touchstone (.s1p)**. En Wire, pestaña *Medir* → *Abrir .s1p medido*: lo compara con la simulación y el diseño pasa a «Medido» si la desviación es ≤ 2 % |
| **Llevar el factor de velocidad de un cable** | En **Coaxial y stubs**, **Descargar el VF para Chirptenna Wire** (`cable_*.json`). En Wire: *Abrir cable medido* (pestaña Diseño) o `--cable-medido` |

Con **Chirptenna** (antenas impresas en PCB) vale lo mismo para la comparación: el mismo cuadro **Comparar con un archivo Touchstone**
acepta también el `resultado.json` de una simulación de Chirptenna (compara la resonancia simulada con la medida y estima la εr real
del sustrato). Lo simulado es espacio libre y sin cable: es una referencia, no una medida. Para comparar varias antenas medidas entre
sí usa **Comparar antenas**.

## Pruebas

```powershell
npm test
node herramientas/i18n.mjs faltan
```

Node ≥ 20, sin dependencias. Cubren el driver contra un emulador del shell de DiSlord (`pruebas/emulador.mjs`), el análisis
(resonancias, recomendación, bandas), la calibración por tramos y **datos reales** (`pruebas/datos/`): la corrección SOL en
JS coincide con la de Python del proyecto Chirptenna (`vna/calibracion.py`) y una antena de 868 MHz medida da lo esperado.

## Estructura

```
index.html  estilos.css  bandas.json
js/app.js          interfaz y flujo de medida
js/analisis.js     S11 → RL, VSWR, Z, retardo; resonancias; recomendación; bandas
js/calibracion.js  OSL de 3 términos por tramos, cobertura, comprobación de patrones
js/asistente.js    asistente de calibración paso a paso
js/grafico.js      gráficos en canvas (RL, Smith, series)
js/informe.js      informe PDF (jsPDF, cargado bajo demanda desde cdnjs)
js/i18n.js         idiomas: T(), selector (catálogos en idiomas/*.json; herramienta en herramientas/i18n.mjs)
js/drivers/        nanovna-h.js (Web Serial) y simulado.js
pruebas/           node:test, emulador y datos reales
```

## Límites conocidos

- Los patrones de calibración se suponen **ideales** (OPEN +1, SHORT −1, LOAD 0): con kits baratos hay error por encima de
  ~1 GHz. Un modelo con retardo y capacidad del OPEN está pendiente.
- **Los bordes de las bandas están escritos de memoria**, sin comprobar con los planes de frecuencias nacionales. Compruébalos
  antes de depender de ellos (regulación, potencias y canales aparte).
- Máximo 101 puntos por `scan` del equipo; los barridos largos se encadenan y tardan.
- El retardo de grupo sale ruidoso (derivada de la fase).
- **Las incertidumbres son solo orientativas.** El rango de la pérdida de retorno sale de la verificación de la calibración y de márgenes típicos supuestos; la incertidumbre real puede ser mayor. No sirve para metrología sin patrones calibrados y trazables.

## Hoja de ruta

Funciones previstas para principiantes, Meshtastic, radioaficionados y expertos en RF: [ROADMAP.md](ROADMAP.md).

## Licencia

[AGPL-3.0](LICENSE), como Chirptenna.
