# Assets Brandly — logo

Logo généré (pas de fichier externe à fournir). Le composant `.brandly-logo`
(+ helper JS `logoMarkup()`) dans `index.html` assemble **un picto SVG** et **un
wordmark texte** (police Quicksand). C'est net à toute taille et recolorable.

## Picto (SVG vectoriel)
| Fichier | Couleur | Usage |
|---|---|---|
| `brandly-icon-sage.svg` | sauge `#7E9580` | fond clair + favicon SVG |
| `brandly-icon-light.svg` | crème `#F4F2EA` | fond foncé (`light:true`) |
| `brandly-icon.svg` | `currentColor` | recolorable via CSS `color` |

Motif : anneau + point central (réinterprétation géométrique propre du cercle).

## Wordmark
Rendu en **texte** (`<span class="brandly-logo__word">brandly.</span>`) en
**Quicksand 700**, sauge `#7E9580`, point final terracotta `#C2714E`.
→ Pas de fichier image : toujours net, recolorable, accessible.

## Favicons (PNG générés)
`favicon-32.png` (onglet, transparent), `favicon-180.png` (apple-touch, fond crème),
`favicon-512.png` (PWA maskable, fond crème). Référencés par `site.webmanifest`.

## Régénérer les favicons
```
node assets/_gen_favicons.js
```
(rendu anti-aliasé en pur Node, sans dépendance — voir le script)

## Couleurs
- Sauge : `#7E9580`  ·  Crème : `#F4F2EA`  ·  Terracotta (point) : `#C2714E`
- Fond sidebar : `#485B43`

## Remplacer par ton propre artwork plus tard
Dépose tes SVG transparents et remplace les `src` du picto dans `index.html`
(ou ajuste le helper `logoMarkup`). Privilégie le SVG.
