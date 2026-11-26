<p align="center"><picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/logo-vna-oscuro.png">
  <img src="img/logo-vna.png" alt="Chirptenna VNA" width="560">
</picture></p>

# Chirptenna VNA

[Español](README.md) · [English](README.en.md) · **Français** · [Deutsch](README.de.md)

Assistant web pour **mesurer une antenne avec un NanoVNA** depuis le navigateur, sans rien installer : il dit si elle
résonne là où tu veux, s'il faut **l'allonger ou la raccourcir et de combien**, et donne tous ses paramètres (abaque de
Smith, impédance, ROS, phase, temps de groupe). Il convient à **n'importe quelle antenne** ; il est né dans le projet
[Chirptenna](https://sqtactical.github.io/chirptenna/) (générateur d'antennes fractales pour PCB) et en partage le style.

> **État : alpha.** Testé avec un émulateur du shell de l'appareil et avec des données réelles d'un NanoVNA-H, **mais le
> pilote n'a pas encore été exécuté sur un appareil connecté**. D'ici là, considère-le comme expérimental.

**Utilise-le maintenant : <https://sqtactical.github.io/Chirptenna-VNA/>** (Chrome ou Edge de bureau ; il a un mode simulé pour essayer sans appareil).

## Ce qu'il fait

- **Mode Simple** : tu choisis la bande (radioamateur de MF à SHF, ISM européennes et américaines) ou un balayage
  général, tu mesures et tu lis un verdict (« Allonge l'antenne de 3,2 % », « couvre la bande », « ne résonne pas dans la plage »…).
- **Mode Avancé** : abaque de Smith, Z, phase, ROS, temps de groupe, curseur, tableau des bandes, export CSV et Touchstone
  `.s1p`, et **rapport PDF** avec les graphiques.
- **Étude d'une bande avec marge latérale** (bord inférieur ×(1−m), supérieur ×(1+m) ; 10 % par défaut) ou **balayage
  général** de toute la plage de l'appareil (3000 points, espacement logarithmique) avec **affinage** automatique autour des résonances.
- **Délai avant la mesure** pour t'éloigner de l'antenne (compte à rebours et bips).
- **Étalonnage OSL guidé par tronçons** : tu peux étalonner toute la plage d'un coup ou « par morceaux », t'arrêter et
  reprendre un autre jour ; les jeux sont stockés dans le navigateur et exportés/importés en JSON. L'étalonnage de
  l'application corrige les données brutes et ne touche pas aux emplacements de l'appareil.
- **Cricky**, le grillon assistant (clin d'œil à Clippy) : une bulle discrète qui commente l'essentiel (connexion,
  étalonnage, compte à rebours, résultat). Mode Simple uniquement ; se ferme d'un clic et peut être coupé définitivement.
- Les résonances peu marquées (bruit, ondulation sur le flanc d'une autre) ne sont pas mélangées aux vraies : elles
  apparaissent à part comme **« peut-être fausse »**.
- **Mode simulé avec 13 antennes d'exemple** (sans appareil) : bien centrée, résonne bas ou haut, mal adaptée, étroite,
  courbe irrégulière, trappes HF et les deux erreurs typiques (câble ouvert et charge de 50 Ω). En en choisissant une,
  l'application sélectionne la bande qui la montre le mieux.
- **Mon nœud Meshtastic** : tu choisis région et preset et l'application calcule la fréquence réelle de ton canal et juge
  l'antenne à cet endroit.
- **Comparer des antennes** : enregistre plusieurs mesures avec un nom et compare-les dans un tableau et un graphique.
- **Outils radioamateur** (mode Avancé) : réseau d'adaptation en L avec valeurs E24, mesure de coaxial et de stubs, retrait
  du câble de la mesure, Q des trappes et résonateurs, mode « En direct » pour régler un coupleur et verdict par bande pour les antennes multibandes.
- **Outils d'expert** : comparer avec un fichier Touchstone (`.s1p`/`.s2p`) ou avec le `resultado.json` d'une simulation
  Chirptenna (estime l'εr réelle), moyenne de balayages avec bruit estimé et une API de console (`window.chirptenna`).
- **Lecture à voix haute** du verdict.
- **Régions** : Europe (R1), Amériques (R2) et Asie-Pacifique (R3, avec des bandes UIT non vérifiées par pays).
- **Langues** : espagnol, anglais, français et allemand (sélecteur dans l'en-tête ; choisie automatiquement selon le
  navigateur ou avec `?idioma=fr`). Les traductions ont été faites par Claude et gagneraient à être relues par un locuteur natif.

## Appareils

| Appareil | État |
|---|---|
| NanoVNA-H / H4 avec firmware **DiSlord** 1.2.x (jusqu'à 2,7 GHz) | Pris en charge (pilote `js/drivers/nanovna-h.js`) ; non essayé avec le matériel connecté |
| NanoVNA V2, V2 Plus4, F V3, LiteVNA (jusqu'à 6 GHz) | Prévu : les bandes jusqu'à 6 GHz sont déjà dans `bandas.json` ; les pilotes manquent |

## Comment l'utiliser

Il faut **Chrome ou Edge de bureau** (Web Serial) et une page servie en `https` ou en `localhost`.

```powershell
python -m http.server 8765
```

puis ouvre <http://localhost:8765>. Sans appareil, coche **« Mode simulé »** : une antenne d'exemple avec deux résonances et
des erreurs de mesure réalistes pour essayer l'étalonnage.

### Essayer avec ton NanoVNA

Ouvre **[diagnostico.html](diagnostico.html)** avec l'appareil connecté : il vérifie le protocole, la limite de points, les
temps et que la mesure brute restaure l'étalonnage, et génère un rapport texte à coller dans un ticket. Il n'envoie jamais `save`.

## Aller-retour des antennes (Chirptenna Wire et Chirptenna)

Les antennes voyagent dans des fichiers ordinaires ; rien à configurer. Avec **Chirptenna Wire** (antennes filaires, NEC2) :

| Quoi | Comment |
|---|---|
| **Récupérer la simulation** (`.s1p`) | Dans Wire : `python -m wire s1p <type> <MHz> --salida sim.s1p` ou le bouton *Télécharger le S11 simulé* (onglet Simulation). Ici, mode **Avancé** → **Comparer avec un fichier Touchstone** → choisis le `.s1p` : il s'affiche en gris sur le graphique du ROS, avec la différence point à point et l'écart de la résonance |
| **Emporter ta mesure** (`.s1p`) | Mesure, puis en mode Avancé appuie sur **Touchstone (.s1p)**. Dans Wire, onglet *Medir* → *Abrir .s1p medido* : il la compare à la simulation et le design passe à « Mesuré » si l'écart est ≤ 2 % |
| **Emporter le facteur de vitesse d'un câble** | Dans **Coaxial et stubs**, **Télécharger le VF pour Chirptenna Wire** (`cable_*.json`). Dans Wire : *Abrir cable medido* (onglet Diseño) ou `--cable-medido` |

Avec **Chirptenna** (antennes imprimées sur PCB), la comparaison marche pareil : la même case **Comparer avec un fichier Touchstone**
accepte aussi le `resultado.json` d'une simulation de Chirptenna (elle compare la résonance simulée à la mesurée et estime l'εr réelle
du substrat). La simulation est en espace libre, sans câble : une référence, pas une mesure. Pour comparer plusieurs antennes mesurées
entre elles, utilise **Comparer des antennes**.

## Tests

```powershell
npm test
node herramientas/i18n.mjs faltan
```

Node ≥ 20, sans dépendances. Ils couvrent le pilote face à un émulateur du shell DiSlord (`pruebas/emulador.mjs`),
l'analyse (résonances, recommandation, bandes), l'étalonnage par tronçons et des **données réelles** (`pruebas/datos/`) :
la correction SOL en JS coïncide avec celle en Python du projet Chirptenna (`vna/calibracion.py`) et une antenne de 868 MHz mesurée donne le résultat attendu.

## Structure

```
index.html  estilos.css  bandas.json
js/app.js          interface et flux de mesure
js/analisis.js     S11 → RL, ROS, Z, délai ; résonances ; recommandation ; bandes
js/calibracion.js  OSL à 3 termes par tronçons, couverture, vérification des étalons
js/asistente.js    assistant d'étalonnage pas à pas
js/grafico.js      graphiques canvas (RL, Smith, séries)
js/informe.js      rapport PDF (jsPDF, chargé à la demande depuis cdnjs)
js/i18n.js         langues : T(), sélecteur (catalogues dans idiomas/*.json ; outil dans herramientas/i18n.mjs)
js/drivers/        nanovna-h.js (Web Serial) et simulado.js
pruebas/           node:test, émulateur et données réelles
```

## Limites connues

- Les étalons sont supposés **idéaux** (OPEN +1, SHORT −1, LOAD 0) : avec des kits bon marché il y a une erreur au-dessus
  de ~1 GHz. Un modèle avec retard et capacité de l'OPEN est en attente.
- **Les bords des bandes sont écrits de mémoire**, sans vérification avec les plans de fréquences nationaux. Vérifie-les
  avant de t'y fier (réglementation, puissances et canaux sont à part).
- 101 points maximum par `scan` de l'appareil ; les longs balayages sont enchaînés et prennent du temps.
- Le temps de groupe est bruité (dérivée de la phase).
- **Les incertitudes sont uniquement indicatives.** La plage de la perte de retour vient de la vérification de l'étalonnage et de marges typiques supposées ; l'incertitude réelle peut être plus grande. Inadapté à la métrologie sans étalons calibrés et traçables.

## Feuille de route

Fonctions prévues pour débutants, Meshtastic, radioamateurs et experts RF : [ROADMAP.md](ROADMAP.md) (en espagnol).

## Licence

[AGPL-3.0](LICENSE), comme Chirptenna.
