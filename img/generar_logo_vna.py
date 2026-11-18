"""Logo de Chirptenna VNA: el grillo de Chirptenna + el nombre, con fondo transparente (SVG y PNG).

Genera dos variantes: `logo-vna.*` (texto oscuro, para fondos claros) y `logo-vna-oscuro.*` (texto claro, para fondos
oscuros, p. ej. el tema oscuro de GitHub). Las letras salen como trazados (no dependen de ninguna fuente instalada).

Uso: python img/generar_logo_vna.py <carpeta del repositorio Chirptenna>
  (necesita matplotlib y numpy, y `antenas.geometria` de Chirptenna para las antenas de Koch del grillo)
"""
import os
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(AQUI)), 'proyecto_generador_antenas')
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, 'docs', 'logo'))
import generar_logo as L  # noqa: E402

plt.rcParams['svg.fonttype'] = 'path'

VARIANTES = {
    'logo-vna': dict(texto='#1f2a24', verde='#2f6b3a'),
    'logo-vna-oscuro': dict(texto='#f1efe6', verde='#7cc489'),
}


def dibujar(nombre, texto, verde):
    fig, ax = plt.subplots(figsize=(12.4, 3))
    L.grillo(ax)
    kw = dict(fontsize=58, fontweight='bold', va='center', ha='left', family='DejaVu Sans')
    ax.text(3.6, 0.35, 'Chirp', color=texto, **kw)
    ax.text(3.6 + 6.05, 0.35, 'tenna', color=L.COBRE, **kw)
    ax.text(3.6 + 6.05 + 7.2, 0.35, 'VNA', color=verde, **kw)
    ax.text(3.65, -1.85, 'mide cualquier antena con un NanoVNA · Web Serial', color=verde, fontsize=15, va='center',
            ha='left', family='DejaVu Sans')
    ax.set_xlim(-3.1, 25.6); ax.set_ylim(-3.9, 4.0); ax.set_aspect('equal'); ax.axis('off')
    fig.subplots_adjust(0, 0, 1, 1)
    for ext in ('svg', 'png'):
        fig.savefig(os.path.join(AQUI, f'{nombre}.{ext}'), transparent=True, dpi=200 if ext == 'png' else None)
    plt.close(fig)


if __name__ == '__main__':
    for nombre, c in VARIANTES.items():
        dibujar(nombre, **c)
    print('Logos guardados en', AQUI)
