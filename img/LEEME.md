# Logo

- `grillo.svg` / `grillo.png`: el grillo de **Chirptenna** (un grillo visto desde arriba con las antenas en curva de Koch, del color del cobre de una PCB). Es una copia de `docs/logo/` del proyecto [Chirptenna](https://github.com/sqtactical/chirptenna), que lo genera con `docs/logo/generar_logo.py`; este repo lo usa en local para no depender de la web de Chirptenna. Mismo autor y misma licencia (AGPL-3.0) que el resto del código.
- `grillo-cable.svg` / `grillo-cable.png`: variante de este proyecto, el mismo grillo enrollado en un cable coaxial y sujetando un conector SMA. La genera `node img/generar_variante.mjs` a partir de `grillo.svg` (inyecta el cable por detrás y por delante del grillo y el conector); para cambiarla, se edita ese script. El PNG se obtiene abriendo el SVG a 800 × 800 px.

Usos previstos: `grillo.svg` como logo y favicon de la web y de los informes; `grillo-cable.svg` como ilustración (cabecera del README, imagen para compartir el repositorio, pantallas vacías o de error).
