# Letterlab — dictee

Zelfstandige dicteetool met twee weergaven. De cursistenpagina staat
rechtstreeks op de hoofdlink. De lesgeverspagina staat onder `beheer/`.

| Weergave | Wat staat erop | Link |
|---|---|---|
| Onderkant (standaard) | woord, vakjes en toetsenbord | zoals altijd |
| Volledig | instructie-audio, luisterknop, afbeelding, woord, vakjes en toetsenbord | met `&weergave=volledig` erachter |

Alle bestaande links blijven de onderkant tonen, precies zoals vroeger.
De Excel-lijst maakt per oefening beide links (tabblad **Dicteelinken**).

## Publiceren

Maak op GitHub een openbare repository `dictee` en upload de **inhoud** van deze
map. Schakel GitHub Pages in via `main` en `/ (root)`.

- Cursisten: `https://gebruikersnaam.github.io/dictee/`
- Beheer: `https://gebruikersnaam.github.io/dictee/beheer/`

Gebruik in Excel bij **Basislink Letterlab** de cursistenlink hierboven.

## Overstappen

Publiceer en test deze repository eerst. Vervang daarna de bestaande links in
Genially. Verwijder de oude gecombineerde repository pas wanneer alle vervangen
links op pc, Android en iPhone werken.

## Volledige versie

Extra mogelijkheden in de link (alleen samen met `weergave=volledig`):

| In de link | Betekenis |
|---|---|
| `instructie=naam` | Instructie-audio uit `assets/audio/instructies/`. |
| `beeld=naam` | Afbeelding uit `assets/afbeeldingen/`. |
| `audio=naam` | Woordaudio uit `assets/audio/woorden/`. |
| `audio=geen` | Geen luisterknop. |

- In Excel typ je alleen de bestandsnaam. De extensie mag je weglaten:
  `kat` vindt `kat.jpg`, `kat.png` of `kat.webp` (of `kat.mp3` bij audio).
- Een volledige link (`https://...`) werkt ook.
- Bestandsnamen zijn hoofdlettergevoelig. Gebruik bij voorkeur kleine letters.
- Bestanden toevoegen: open op github.com de map en kies
  **Add file → Upload files**.

### Meerdere woorden na elkaar (reeks)

Zet de woorden in één link, gescheiden door `|`. De andere waarden staan in
dezelfde volgorde:

```
?woord=kip|vis|maan&ontbreekt=1,2,3|2|1,2,3&weergave=volledig&beeld=kip|vis|maan
```

- Na een juist antwoord verschijnt na een korte pauze vanzelf het volgende
  woord. Bolletjes bovenaan tonen hoeveel woorden er zijn.
- Staat bij `ontbreekt`, `voorbeeld`, `beeld` of `audio` maar één waarde, dan
  geldt die voor alle woorden. Een lege plaats (`kip||maan`) betekent: bij dat
  woord niets.
- De maaktool (`create`) biedt de reeks alleen bij **Volledig** aan. In
  Genially blijft het één woord per pagina.

### Waar komt het geluid van het woord vandaan?

Laat je **Audio woord** leeg, dan zoekt het dictee zelf, in deze volgorde:

1. `assets/audio/woorden/eerste-letter/woord.mp3` in deze repository;
2. de woordopname van het klik-klakboekje
   (`klikklak/assets/audio/woorden/eerste-letter/woord.mp3`);
3. de nonsenswoordopname van het klik-klakboekje;
4. als er nergens een opname is: de Belgisch-Nederlandse browserstem.

Opnames die al bij het klik-klakboekje staan, hoef je dus niet te kopiëren.
Dat werkt omdat beide tools op `ligolimino.github.io` staan.

Ontbreekt de afbeelding of de instructie, dan verschijnt dat onderdeel gewoon
niet. De oefening blijft werken.

## Na een wijziging

Verhoog in `index.html` en `beheer/index.html` het versienummer achter
`styles.css?v=` en `app.js?v=`. Anders tonen telefoons nog een tijd de oude
versie.
