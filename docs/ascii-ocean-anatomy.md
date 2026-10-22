# ASCII Ocean v3: species anatomy, taxa and water colour (R7 research)

Scope: the 12 species in `packages/core/src/components/ascii-ocean/creatures/`, seen from above (dorsal view).
All proportions are fractions of total length (TL) unless marked otherwise.

How to read the confidence tags:

- **[src n]**: taken from the numbered source at the end.
- **est.**: no measurement was retrieved. The value is a reasoned estimate and says why.
- Sources were searched and fetched in this round. Several FAO/Compagno PDFs could not be read in full (binary
  or 403), so where a figure came only from a search snippet, that is said in the source list.

The biggest gap: **the dorsal-view widths and fin reaches of the sharks are not in any source I could read.**
Compagno's 1984 FAO catalogue holds the real morphometric tables, but its PDF could not be parsed here. The
shark rows below are therefore mostly estimates, except where tagged.

---

## Fish or mammal

| Taxon  | Species                                                                    |
| ------ | -------------------------------------------------------------------------- |
| fish   | classic, hammerhead, greathammer, tiger, mako, thresher, nurse, zebra, koi |
| mammal | bottlenose, orca, humpback                                                 |

Fish: vertical caudal fin, lateral (side-to-side) tail beat, gill slits. Mammals: horizontal flukes,
dorso-ventral beat, blowhole, breathe at the surface.

---

## Fish

### 1. classic (great white, _Carcharodon carcharias_)

| Feature                | Value (TL)                                                                             | Source |
| ---------------------- | -------------------------------------------------------------------------------------- | ------ |
| Head                   | Conical, blunt snout                                                                   | est.   |
| Max width              | ~0.18 TL at the gill region (est.)                                                     | est.   |
| Pectoral root / length | root 0.15–0.2 TL, length ~0.15–0.2 TL, falcate tip                                     | est.   |
| First dorsal           | origin ~0.3–0.35 TL, base ~0.1 TL                                                      | est.   |
| Pelvics                | Hidden under the body from above                                                       | est.   |
| Caudal                 | Heterocercal. Upper lobe is the larger but sources disagree on its length (see below). | [1][2] |
| Max length             | 600 cm                                                                                 | [2]    |

- The caudal fin is lunate with a long upper lobe in adults; one FAO ID sheet says the caudal is "under one third of total length" [1]. Another Australian ID sheet says the upper and lower lobes are of similar size [2]. The two conflict. I cannot resolve it without the Compagno 1984 table: **use the lower-lobe-short, upper-lobe-long layout, and treat its length as an estimate of ~0.2–0.25 TL.**
- Colour: dark grey to blue-grey back, white belly, sharp line between them [est.; general knowledge, not retrieved].

### 2. hammerhead (scalloped hammerhead, _Sphyrna lewini_)

| Feature           | Value (TL)                                                     | Source |
| ----------------- | -------------------------------------------------------------- | ------ |
| Head              | Cephalofoil with a deep central notch and scalloped front edge | est.   |
| Head width (full) | ~0.20 TL (est.; no source retrieved)                           | est.   |
| Pectoral          | Root ~0.17–0.2 TL, length ~0.2 TL, falcate                     | est.   |
| First dorsal      | Origin ~0.28 TL, tall                                          | est.   |
| Caudal            | Heterocercal; upper lobe about 0.2 TL                          | est.   |

- Same family as the great hammerhead: the head is the defining mark. No dorsal-view width was retrieved for this species.
- Colour: olive-grey back, paler belly [est.].

### 3. greathammer (great hammerhead, _Sphyrna mokarran_)

| Feature           | Value (TL)                                                                     | Source |
| ----------------- | ------------------------------------------------------------------------------ | ------ |
| Head              | Broad cephalofoil, nearly straight front edge in adults, shallow central notch | [3][4] |
| Head width (full) | **23–27% TL**, mostly above 23%                                                | [3][4] |
| Pectoral          | Root ~0.16 TL, length ~0.2 TL, falcate                                         | est.   |
| First dorsal      | Origin ~0.24 TL, tall, sickle-shaped                                           | est.   |
| Caudal            | Heterocercal, upper lobe ~0.2 TL                                               | est.   |
| Max length        | 610 cm (male); common 370 cm                                                   | [4]    |

- **Correction:** the code's `head.span = 0.21` is only the half-span in the renderer, so the full width is 0.42 TL. The source figure (23–27%) is the full width, which means the half-span should be about **0.115–0.135**. Verify how `renderer.ts` uses `head.span` before changing it (see Changes).
- Colour: slate grey back, white belly [est.].

### 4. tiger (_Galeocerdo cuvier_)

| Feature      | Value (TL)                                                                               | Source      |
| ------------ | ---------------------------------------------------------------------------------------- | ----------- |
| Head         | Broad, blunt, square snout                                                               | [5]         |
| Max width    | ~0.15–0.18 TL around the gill region (est.)                                              | est.        |
| Pectoral     | Broad, root ~0.15 TL, length ~0.2 TL. Tips rounded, not sickle.                          | [5] (shape) |
| First dorsal | Origin ~0.33 TL                                                                          | est.        |
| Caudal       | Heterocercal. **Upper lobe long, about 0.30 TL**, rounded behind the sub-terminal notch. | [5]         |

- The 0.30 TL upper lobe is the best number in this sheet. It comes from a search snippet of the Fishes of Australia genus page; the page itself returned 403 [5].
- Colour: grey-brown back with dark vertical bars on the back half (bars fade with age); pale belly [est.].

### 5. zebra (leopard shark, _Stegostoma tigrinum_)

| Feature      | Value (TL)                                                   | Source |
| ------------ | ------------------------------------------------------------ | ------ |
| Head         | Short, rounded, blunt                                        | est.   |
| Pectoral     | Broad, rounded tips, root ~0.12 TL, length ~0.2 TL           | est.   |
| First dorsal | Origin ~0.36 TL, small                                       | est.   |
| Caudal       | Very long ribbon, lower lobe weak. Length ~0.3–0.4 TL (est.) | est.   |

- The tail is a long, low ribbon, not a deep blade. Model it as heterocercal with a small width.
- Colour: tan to yellow-brown back covered in dark spots, pale ridges along the back [est.; general knowledge].

### 6. mako (shortfin mako, _Isurus oxyrinchus_)

| Feature      | Value (TL)                                                                                                                                            | Source |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Head         | Long conical snout, taper to a narrow stalk                                                                                                           | [6]    |
| Pectoral     | **Shorter than the head**, narrow-tipped, anterior margin under head length                                                                           | [6]    |
| First dorsal | Origin ~0.34 TL                                                                                                                                       | est.   |
| Caudal       | Lunate, strong lower lobe. **Upper lobe is clearly longer than the lower** (not equal, despite the genus name). Strong lateral keels on the peduncle. | [6]    |
| Lobe length  | est. upper ~0.2 TL, lower ~0.15 TL                                                                                                                    | est.   |

- Colour: metallic blue-indigo back, white belly [est.; general knowledge].

### 7. thresher (common thresher, _Alopias vulpinus_)

| Feature      | Value (TL)                                                  | Source    |
| ------------ | ----------------------------------------------------------- | --------- |
| Head         | Small, rounded, large eyes                                  | est.      |
| Pectoral     | Long and sickle-shaped, length ~0.2–0.25 TL (est.)          | est.      |
| First dorsal | Origin ~0.24 TL                                             | est.      |
| Caudal       | Heterocercal. **Upper lobe about half of TL**, a long whip. | [7][8][9] |
| Lower lobe   | Short but strong                                            | [7]       |

- Three sources agree the upper lobe is about half the length: the FAO ID sheet (via search snippet), Wikipedia, and FishBase, which says it is "as long as or longer than" the rest of the body [7][8][9]. Aalbers et al. (2010) describe its use in feeding [10].
- Colour: bronze-grey to violet back, white belly [est.].

### 8. nurse (_Ginglymostoma cirratum_)

| Feature      | Value (TL)                                                                                                      | Source       |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ------------ |
| Head         | Broad, blunt, flattened                                                                                         | [11]         |
| Pectoral     | **Broad, rounded tips**, root ~0.16 TL, length ~0.17 TL (est.)                                                  | [11] (shape) |
| First dorsal | Origin ~0.5 TL (far back)                                                                                       | est.         |
| Caudal       | Long, low, **more than a quarter of TL** (~0.25–0.3 TL)                                                         | [11][12]     |
| Lower lobe   | Sources conflict: one says the upper lobe is considerably longer, another that there is no distinct lower lobe. | [12][13]     |

- Colour: tawny to brown, uniform [est.; general knowledge].

### 9. koi (_Cyprinus rubrofuscus_, pond fish)

| Feature  | Value (TL)                                               | Source |
| -------- | -------------------------------------------------------- | ------ |
| Body     | Deep, thick spindle; blunt head; max depth about 0.24 TL | est.   |
| Pectoral | Large round paddles, reach ~0.25 TL                      | est.   |
| Dorsal   | Long, low fin, origin ~0.3 TL                            | est.   |
| Caudal   | **Vertical fin** (fish), the blade from above            | est.   |

- No body-proportion source was retrieved for koi. The colours are in the existing species note [14][15].
- Colour: see Section 13 and the varieties in the existing notes [14][15].

---

## Mammals

### 10. bottlenose (_Tursiops truncatus_)

| Feature            | Value (TL)                                                 | Source                                                        |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Head               | Short beak, round melon behind it                          | est.                                                          |
| Max width          | ~0.1 TL around the melon (est.)                            | est.                                                          |
| Pectoral (flipper) | Pointed, falcate, root ~0.2 TL, length ~0.18–0.2 TL (est.) | est. (flipper study [16] gives indices; figure not retrieved) |
| Dorsal             | Curved, origin ~0.42 TL                                    | est.                                                          |
| Flukes             | Horizontal, span ~0.2 TL (est.)                            | est.                                                          |

- Breathing: one wild juvenile had a dive of about 55 s with about 3.5 blows between dives, blow interval about 10.5 s [17]. Captive adults: dives 61–112 s [17]. A routine cycle is about 1 min under water, several breaths, then a dive.
- Blow: low and weak, about 1 m, hard to see at range (est.).
- Colour: dark grey cape over the back, lighter flanks, pale belly [est.; the current coat matches this].

### 11. orca (_Orcinus orca_)

| Feature            | Value (TL)                                                         | Source |
| ------------------ | ------------------------------------------------------------------ | ------ |
| Head               | Blunt, rounded melon                                               | [18]   |
| Max width          | ~0.18 TL near the front of the body (est.)                         | est.   |
| Pectoral (flipper) | Broad paddle, root ~0.14 TL, length ~0.2 TL (est.)                 | est.   |
| Dorsal             | Male: tall, up to ~1.8 m, about 0.25 TL (est. for a 7 m male) [18] | [18]   |
| Flukes             | Horizontal, span ~0.2–0.25 TL (est.)                               | est.   |

- Breathing: fish-eating residents surfaced with a median respiratory interval of 26–29 s, from 20,613 surfacings of 98 individuals [19]. Most dives last under a minute, but adult males can stay under for more than 8 min [20].
- Blow: low, small, hard to see. Est. 1–2 m; no source retrieved.
- Colour: black back and flanks, white belly, white eye patch behind each eye, grey saddle behind the dorsal [est.; the current coat matches this].

### 12. humpback (_Megaptera novaeangliae_)

| Feature            | Value (TL)                                                   | Source                                                                      |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Head               | Broad, flat, tubercles on the snout                          | [21]                                                                        |
| Max width          | ~0.26 TL at the head (est., from the code's 0.13 half-width) | est.                                                                        |
| Pectoral (flipper) | **Very long**, 25–33% TL, swept back                         | [21][22] (figures reused from the existing note; not re-checked this round) |
| Dorsal             | Small hump at ~0.62 TL                                       | est.                                                                        |
| Flukes             | Span ~0.25–0.3 TL (est.)                                     | est.                                                                        |

- Blow: bushy, about **3–5 m** tall [23][24]. This is the tall, bushy blow; a blow of 3 m is the low end.
- Dive: feeding dives of 4–6 min [23]. One Alaskan guide says adults breathe every 10–15 min [25]. That conflicts with the NOAA figure. Sources disagree; the interval depends on feeding state. **Use about 1–5 min as an estimate** for the animation.
- Colour: dark grey-black back, white flippers, pale serrated flukes trailing edge [est.; the current coat matches this].

---

## Water colour

### Open ocean (Jerlov oceanic types I–III)

- Jerlov's open-ocean types are I, IA, IB, II and III. Morel (1988) gives an approximate chlorophyll link: I 0–0.01, IA 0.05, IB 0.1, II 0.5, III 1.5–2.0 mg/m³ [26].
- Regional Kd(490) ranges from a satellite study: IA 0.035–0.040, IB 0.042–0.065, II 0.07–0.1, III 0.115–0.14 m⁻¹ [27]. These are regional, not Jerlov's canonical values.
- Pure-water absorption is lowest near 418 nm, at 0.0044 ± 0.0006 m⁻¹ [28]. The full table at 450–700 nm **could not be retrieved**. The values below are estimates from memory of Pope and Fry (1997): roughly 0.007 m⁻¹ at 450, 0.03 at 500, 0.06 at 550, 0.2 at 600, 0.4 at 650 nm. Mason et al. found the blue absorption lower than Pope and Fry by a factor of about 2 [28]. Verify before using.
- Colour versus depth: the water column goes from a bright blue-green near the surface to deep indigo. Red is gone within the first few metres; green and blue last longest [est.; physics, consistent with [28]].

### Koi pond

- Green pond water comes from algae (chlorophyll absorbs red and blue, and reflects green) [29]. Brown tea-coloured water comes from dissolved organic matter (tannins, humic acids). I could not verify the tannin claim from a reliable source; it is an estimate.
- Algae absorb red and blue strongly, so green water has its lowest attenuation in green. Tannin absorbs blue far more than red and green.

### Suggested colours (sRGB → OKLCH, computed for this sheet)

| Use                       | sRGB      | OKLCH (L, C, H)            |
| ------------------------- | --------- | -------------------------- |
| Ocean surface, dark page  | `#1d5a6e` | 0.438, 0.069, 224          |
| Ocean deep, dark page     | `#0b2a3a` | 0.271, 0.047, 235          |
| Ocean surface, light page | `#9bb8c4` | 0.765, 0.036, 225          |
| Ocean deep, light page    | `#2b6f7f` | 0.506, 0.072, 216          |
| Pond surface, dark page   | `#4a5a2a` | 0.442, 0.074, 125          |
| Pond deep, dark page      | `#1c3a2a` | 0.320, 0.046, 159          |
| Pond surface, light page  | `#8fa36a` | 0.686, 0.082, 124          |
| Pond deep, light page     | `#5b7a4a` | 0.543, 0.080, 135          |
| Shallow tannin (optional) | `#6b5a2e` | 0.474, 0.066, 89           |
| Page background, dark     | `#0a0a0a` | 0.145, 0.000, 90 (neutral) |
| Page background, light    | `#ffffff` | 1.000, 0.000, 90 (neutral) |

- Page backgrounds are as specified; the warm tint in the design brief is not applied here.
- The water colours are "blend toward the page" targets. Keep them close to the page so light and dark modes both read.
- Light-page deep water is darker than its surface, so depth reads as more opaque, not lighter.

### Per-channel attenuation (`k` values, applied as `exp(-k · (1 - depth) · 2.2)`)

| Habitat | Current (code)      | Suggested            | Reason                                                                                               |
| ------- | ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| Ocean   | `[0.9, 0.35, 0.18]` | `[0.9, 0.3, 0.12]`   | Red goes first; blue lasts longest. Blue is the least absorbed, so its k is smallest [28]. Estimate. |
| Pond    | `[0.75, 0.32, 0.5]` | `[0.75, 0.22, 0.55]` | Algae and tannin both absorb blue and red, and pass green. Keep green's k lowest. Estimate.          |

- The ratio of red to blue absorption in the ocean is about 7:1 in these suggestions, which matches the pure-water shape at 600 vs 450 nm (from the estimated values above). Verify the ratio against the Pope and Fry table.
- The `VEIL_K = 0.35` haze is not in the sources. Leave it as it is.

---

## Changes

Current values are read from `creatures/sharks.ts`, `koi.ts`, `bottlenose.ts`, `orca.ts`, `humpback.ts` and `renderer.ts`.
"Heterocercal" parameters are proposed; they are estimates except where a source is given. The four parameters are
(a) blade length behind the peduncle, (b) upper-lobe extension past the body tip, (c) rest half-width, (d) beat twist.

| Species     | BodyShape / coat field               | Current value                               | Proposed value                                                                      | Source #                        |
| ----------- | ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| classic     | `tail` (new heterocercal)            | `caudal: 0.085` (forked triangle)           | heterocercal: length 0.22, ext 0.05, rest 0.012, twist 0.02                         | [1][2] (est. length)            |
| hammerhead  | `tail` (new heterocercal)            | `caudal: 0.11`                              | length 0.2, ext 0.05, rest 0.012, twist 0.02                                        | est.                            |
| greathammer | `head.span`                          | `0.21` (half-span)                          | ~`0.125` (full width 0.23–0.27 TL) — verify in renderer                             | [3][4]                          |
| greathammer | `tail` (new heterocercal)            | `caudal: 0.13`                              | length 0.22, ext 0.05, rest 0.012, twist 0.02                                       | est.                            |
| tiger       | `tail` (new heterocercal)            | `caudal: 0.095`                             | length 0.3, ext 0.04, rest 0.012, twist 0.02                                        | [5]                             |
| mako        | `tail` (new heterocercal)            | `caudal: 0.13`                              | length 0.22, upper ext 0.06, lower ext 0.03, rest 0.012, twist 0.025                | [6] (shape); est. (length)      |
| thresher    | `tail` (new heterocercal, long)      | `caudal: 0` (forked tail missing)           | length 0.5, ext 0.3, rest 0.01, twist 0.03                                          | [7][8][9]                       |
| nurse       | `tail` (new heterocercal, no lower)  | `caudal: 0`                                 | length 0.27, ext 0.04, rest 0.02, twist 0.02                                        | [11][12]                        |
| zebra       | `tail` (ribbon heterocercal)         | `caudal: 0`                                 | length 0.35, ext 0.03, rest 0.012, twist 0.02                                       | est.                            |
| bottlenose  | `pectoral` (clearer falcate flipper) | `[0.2, 0.28, 0.36, 0.18]`                   | `[0.18, 0.26, 0.34, 0.2]`, keep falcate                                             | est. (no measurement retrieved) |
| bottlenose  | `tail.notch` / body end              | `notch: 0.03`, body halfWidth ends at s = 1 | body ends at s = 1 − notch (no body cell behind the notch)                          | est.                            |
| orca        | `tail.notch` / body end              | `notch: 0.03`                               | body ends at s = 1 − notch                                                          | est.                            |
| humpback    | `tail.notch` / body end              | `notch: 0.025`                              | body ends at s = 1 − notch                                                          | est.                            |
| koi         | `tail` (vertical blade)              | `caudal` kind, length 0.24, width 0.07      | keep; check that the blade is not drawn between the lobes                           | est.                            |
| all sharks  | `caudal` (forked, horizontal)        | `caudal: 0.085 … 0.13`                      | unused by heterocercal sharks; remove the triangle at `renderer.ts:1096` for sharks | est.                            |
| ocean water | `WATER_K`                            | `[0.9, 0.35, 0.18]`                         | `[0.9, 0.3, 0.12]`                                                                  | [28]                            |
| pond water  | `POND_WATER_K`                       | `[0.75, 0.32, 0.5]`                         | `[0.75, 0.22, 0.55]`                                                                | [29]                            |

Notes on the changes:

- The **fluke notch fix** is in the renderer: the body must end at `1 - notch`, so no body cell sits behind the notch.
  The current `tailHit` draws only the wing, and the body's last cells (down to `halfWidth(1)`) pass between the lobes.
  Verify this in `renderer.ts` before changing `notch`.
- The **bottlenose flipper** keeps its falcate shape. The new numbers are estimates; a flipper measurement study [16] was found but its percentages were not retrieved.
- Heterocercal values are a starting point for R8. Sharks sweep the blade side to side with the lateral beat, as the koi caudal does.

---

## Sources

1. Compagno, L.J.V. (1983), FAO Species Identification Sheet, great white shark (search snippet). Caudal "lunate, under one third of total length". https://www.fao.org/docrep/pdf/009/ad468e/ad468eON.pdf (landing page; not fully readable).
2. Australian Government, ID sheet, _Carcharodon carcharias_: upper and lower lobes of similar size; max TL 600 cm. https://www.agriculture.gov.au/sites/default/files/documents/id-carcharodon-carchiarias.pdf
3. FAO species catalogue, _Sphyrna mokarran_ (Compagno 1984). Head anterior margin nearly straight in adults. https://fao.org/docrep/pdf/009/ad123e/ad123e35.pdf (page content cut off before the measurements).
4. Fishes of Texas, _Sphyrna mokarran_ (and FishBase summary 914): expanded head width 23–27% TL; max TL 610 cm male, common 370 cm. https://fishesoftexas.org/taxa/sphyrna-mokarran ; https://www.fishbase.org/summary/914
5. Fishes of Australia, genus _Galeocerdo_ (search snippet; the page returned 403): upper caudal lobe long, about 30% TL, rounded behind the sub-terminal notch. https://fishesofaustralia.net.au/Home/genus/559
6. ICCAT Manual, shortfin mako (_Isurus oxyrinchus_), ch. 2.2.1.2: pectoral fins narrow-tipped, anterior margin shorter than head; lunate caudal, upper lobe clearly longer than lower. https://ICCAT.int/Documents/SCRS/Manual/CH2/2_2_1_2_SMA_ENG.pdf (search snippet)
7. Compagno, L.J.V., FAO ID sheet, _Alopias_ (search snippet): upper caudal lobe about half of TL. https://fao.org/docrep/pdf/009/ad468e/ad468eON.pdf (landing page)
8. Wikipedia, Common thresher: upper caudal lobe about half the length. https://en.wikipedia.org/wiki/Common_thresher
9. FishBase summary 2535, _Alopias vulpinus_: upper lobe about as long as the rest of the body; max TL 573 cm male. https://www.fishbase.se/summary/2535
10. Aalbers, S.A. et al. (2010), J. Fish Biol.: upper lobe approaches trunk length; all 34 feeding events started with the upper lobe. https://pier.org/userdocs/images/files/Aalbers%20et%20al%202010%20thresher%20feeding.pdf (search snippet)
11. Naturalis Sharks, _Ginglymostoma cirratum_ and FishBase summary 2532: caudal fin over a quarter of TL; pectoral and dorsal fins rounded tips. https://sharks.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/taxon.php?id=62532 ; https://fishbase.se/summary/2532
12. SeaWorld (nurse shark): caudal about one quarter of TL; upper lobe considerably longer than the lower. https://seaworld.org/animals/facts/cartilaginous-fish/nurse-shark/
13. Florida Museum, nurse shark (citing Compagno et al. 2005): caudal over a quarter of TL; no distinct lower lobe. https://www.flmnh.ufl.edu/fish/Education/sharkkey/nurseshark.html (conflicts with [12] on the lower lobe)
14. Play It Koi, koi varieties: colour descriptions. https://playitkoi.com/pages/koi-varieties (reused from the existing v2 note)
15. All Pond Solutions, koi varieties. https://www.allpondsolutions.co.uk/fishkeeping-advice/koi-varieties-a-beginners-guide.html (reused from the existing v2 note)
16. Lucić, H. et al., bottlenose flipper morphometrics (64 dolphins, indices for flipper vs body length). https://hrcak.srce.hr/en/135341 (abstract only; the percentages were not retrieved)
17. Lockyer, C. & Morris, R. (1987), dive and blow intervals of a wild juvenile and captive "Percy" bottlenose dolphins (search snippet of the abstract). Dives ~55 s wild, 61–112 s captive; ~3.5 blows between dives. https://repository.si.edu/bitstream/handle/10088/4735/VZ_jgm5.pdf (search result, not the full text)
18. Orca Research Trust, killer whale ID chart (male dorsal up to ~1.8 m) and NOAA Ocean Today killer whale anatomy: https://2025.orcaresearch.org/wp-content/uploads/2025/01/20200608-IDCHART-FINAL-web.pdf ; https://oceantoday.noaa.gov/killerwhaleanatomy/ (reused from the existing v2 note)
19. Journal of Wildlife Diseases (2024?), "Respiratory intervals and swimming speed as remotely sensed health metrics", JWD-D-23-00186: median respiratory interval 26–29 s for fish-eating residents; 20,613 surfacings, 98 individuals. https://complete.bioone.org/journals/journal-of-wildlife-diseases/volume-61/issue-1/JWD-D-23-00186/RESPIRATORY-INTERVALS-AND-SWIMMING-SPEED-AS-REMOTELY-SENSED-HEALTH-METRICS/10.7589/JWD-D-23-00186.full (search snippet; year not confirmed)
20. Drone and tag study of 11 resident orcas near British Columbia (search snippet, source not identified; the >8 min dive by one adult male is from that snippet only). Not independently verified.
21. Megaptera novaeangliae treatment (Plazi) and Alaska Dept. of Fish and Game humpback sheet, reused from the existing v2 note: flippers 25–33% TL. https://treatment.plazi.org/id/84551777ff8b-ffbb-ffc7-06c5f6eff622 ; https://adfg.alaska.gov/static/education/wns/humpback_whale.pdf
22. National Park Service, humpback whale (blow ~3 m; reused): https://www.nps.gov/places/humpback-whale.htm
23. NOAA Stellwagen Bank, whale behaviours: bushy spout 10–16 ft (3–5 m); feeding dives 4–6 min. https://stellwagen.noaa.gov/visit/whalewatching/whale-behaviors.html
24. Victorian wildlife guide, humpback: blow up to about 5 m. https://www.wildlife.vic.gov.au/__data/assets/pdf_file/0028/90748/Humpback-Whale.pdf
25. Alaska Dept. of Fish and Game, whale behaviours: adults breathe every 10–15 min, may stay under up to 45 min. https://www.adfg.alaska.gov/static/viewing/pdfs/whale_behaviors.pdf (conflicts with [23]; treat as the long end)
26. Ocean Optics Book, classification schemes (Jerlov types; Morel 1988 chlorophyll table). https://www.oceanopticsbook.info/view/inherent-and-apparent-optical-properties/classification-schemes
27. Satellite study of Jerlov types, Gujarat waters (Kd(490) ranges for IA, IB, II, III). https://repository.ias.ac.in/98963 (search snippet)
28. Pope, R.M. & Fry, E.S. (1997), "Absorption spectrum (380–700 nm) of pure water. II. Integrating cavity measurements", Appl. Opt. 36, 8710–8723; minimum 0.0044 ± 0.0006 m⁻¹ at 418 nm. https://omlc.org/spectra/water/abs/pope97.html ; Mason et al. (lower blue values) via https://oceancolor.gsfc.nasa.gov/ (search snippet). The table was not retrieved.
29. Chlorophyll absorption and green pond colour (general, not peer-reviewed): https://www.aquagardening.com.au/learn/how-to-maintain-a-crystal-clear-pond/ (low-quality snippet; treat as a weak source).

Sources flagged as weak: [20], [25] and [29]. The 2024 orca respiratory study [19] is a peer-reviewed paper,
but the year was not confirmed from the snippet.
