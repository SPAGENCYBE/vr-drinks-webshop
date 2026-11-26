# VR Drinks
Nederlandstalige demowinkel met het originele VR Drinks-logo, 144 publieke catalogusartikelen van vr-drinks.be (momentopname van 22 november 2026) en een openingsbeeld met het eigen VR Drinks-blik, gevolgd door vier scrollscènes. Alle runtimebestanden staan lokaal in dist. De site vereist geen installatie van npm-pakketten.

## Starten
Pak de hele ZIP uit. Op Windows met Python 3 kun je START-WINDOWS.cmd openen. Op andere systemen voer je vanuit de uitgepakte projectmap het volgende uit.

    python3 -m http.server 8000 --bind 127.0.0.1 --directory dist

Open http://localhost:8000 in je browser. Activeer hardwareversnelling voor realtime 3D. Bij ontbrekende WebGL gebruikt de winkel de meegeleverde productfoto’s. De catalogus en winkelwagen blijven bedienbaar. Hosting kan op een gewone statische webserver door de inhoud van dist te uploaden. Hashroutes behouden hun eigen URL bij herladen.

## Aanpassen
- dist/catalog.js bevat productnamen, smaaktekst, volume, verpakkingen en prijzen in eurocent per verkoopeenheid. Geef elk product een blijvend uniek id voor bestaande winkelwagens.
- De vier homepageproducten hebben een wrap (rondomtextuur met voorkant in het midden) en image (transparante productfoto). Vervang de bestanden in dist/art of pas de paden in de catalogus aan. Losse verpakkingen en individuele artikelen staan lokaal in dist/single. De bron staat per beeld bij imageSource in dist/catalog.js. De vier waarborgartikelen dragen de aanduiding Leeggoed. De 3D-voorkant volgt de foto. De achterzijde heeft de basiskleur van het blik.
- dist/scene.js bevat de Three.js-scène met gedeelde blikgeometrie, materialen en studiolicht. dist/app.js bestuurt de tijdlijn, pagina’s, filters, winkelwagen en democheckout. dist/style.css regelt kleur, typografie en responsive lay-out.
- tools/art.py genereert optioneel de tijdelijke ontwerpen opnieuw op Linux met Python, Pillow, NumPy en de URW Base35-lettertypen. Voor het openen van de winkel zijn deze hulpmiddelen overbodig.

De catalogus bewaart per artikel het oorspronkelijke WooCommerce-ID, de bronlink, de prijs en de beschikbaarheid op de importdatum. De vier 3D-artikelen staan elk één keer in het assortiment.

## Uitlijning productfoto’s
De winkel gebruikt vierkante, witte fotovakken. De zichtbare onderkant van elk product staat op 88% van het vak. De verhoudingen blijven behouden. Vervang een productfoto door een strak uitgesneden beeld van één exemplaar op wit of transparant, met behoud van de oorspronkelijke verhoudingen. Verwijs in image naar het bestand. De klasse single-unit in dist/style.css bepaalt de hoogte en de gemeenschappelijke onderlijn. Verkoopeenheden en prijzen staan los van het beeld. Bij de Fanta Fiesta Mix toont de foto één smaak uit de tray. Controleer de gebruiksrechten van leveranciersfoto’s vóór publieke lancering.

## Bestellingen
De winkelwagen bewaart verkoopeenheden in de browser. Twee trays betekenen twee verkoopeenheden. De democheckout toont het producttotaal. Betalingen, voorraad, verzendtarieven en orderverwerking zijn niet gekoppeld. Voor verkoop moet een backend productprijzen en beschikbaarheid zelf valideren en een betaalsessie aanmaken. De demo vraagt geen klant- of betaalgegevens.

## Bronnen Coca-Cola

- https://www.coca-cola.com/be/nl/brands/coca-cola
  https://www.coca-cola.com/content/dam/onexp/be/nl/brands/coca-cola/2026/ren-2602-00179_bic_coca-colaregular_330ml_front_wet_closed_5000112638769_u1nf_222.png

- https://www.coca-cola.com/be/nl/brands/coca-cola-zero-sugar
  https://www.coca-cola.com/content/dam/onexp/be/nl/brands/coca-cola/2026/ren-2602-00171_bic_coca-cola_zero_330ml_front_wet_closed_5000112638745_u1nf_741.png

## Fanta en Sprite

- Fanta Orange 330 ml, Nederlandse verpakking: https://www.coca-cola.com/content/dam/onexp/nl/nl/products/fanta/fanta_330ml_front_dry_closed_5000112659559.png
- Sprite Lemon-Lime 330 ml, Belgische/Luxemburgse verpakking: https://www.coca-cola.com/content/dam/onexp/be/nl/campagnes/sprite-heat-hacks-2024/ren231200435_bic_spll_canslk_330ml_bel_lux_fr_w_closed_5449000214775_852_belux.png

## Homepage en winkelgegevens

De adressen, contactlinks en openingsuren staan in dist/index.html. Via #/ontdek opent de interactieve blikjescarrousel.

De homepage gebruikt de transparante video en het eindbeeld uit vr-splash-video.zip. De animatie duurt 3,22 seconden, bevat 60 beelden per seconde en speelt op de aangeleverde snelheid. De webbestanden staan in dist/hero/splash-60.webm, splash-60-dark.mp4, splash-first.webp en splash-end.webp.
