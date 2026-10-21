# ASCII Ocean v2: nhiều loài, số lượng tuỳ chỉnh, click để cho ăn

> Trạng thái: **đã duyệt 2026-10-21**. Q1–Q4 theo đề xuất. Yêu cầu thêm: tối ưu hiệu năng, animation mượt, có chiều sâu cho con vật và có mặt nước (xem §15).
> Người code: Claude Haiku, mỗi vòng một spec có scope guard. Người plan, điều phối và review cuối: Claude (Opus). Đội agent: xem §14.

---

## 0. Cần anh chốt trước khi code

| #   | Câu hỏi                                                                                                            | Đề xuất của tôi                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Màu mặc định là màu thật của loài (`colors="natural"`) hay giữ kiểu xám theo theme như bây giờ (`colors="theme"`)? | Component mặc định dùng `natural`. **Cover trang chủ giữ `theme`**, vì CLAUDE.md muốn site tối giản và dùng accent rất ít.  |
| Q2  | Cá koi có bơi chung với cá mập/cá voi không? Ngoài đời koi là cá nước ngọt.                                        | Có hai `scene`: `"ocean"` và `"pond"`. API không cấm trộn, nhưng các preset trong demo đều đúng thực tế.                    |
| Q3  | Kích thước theo tỉ lệ thật hay tỉ lệ "đẹp"?                                                                        | Mặc định `scale="stylized"` (nén tỉ lệ thật bằng hàm mũ 0.45). Có thêm `scale="true"` cho ai muốn đúng tuyệt đối.           |
| Q4  | Đợt 1 làm những loài mới nào?                                                                                      | Koi, cá heo mũi chai, cá voi sát thủ, cá voi lưng gù. Cá mập voi, cá đuối manta, cá voi xanh, rùa biển để sang đợt 2 (§12). |

---

## 1. "Hình ảnh các con cá bạn tự gen được không?"

**Không cần ảnh, và tôi cũng không nên dùng ảnh.** Component này vẽ con vật bằng toán chứ không vẽ bằng bitmap. Hiện mỗi con cá mập gồm:

- một **đường cong độ rộng** `halfWidth(s)`, chạy từ mõm (s = 0) tới đuôi (s = 1),
- các **vây** là tam giác đặt theo tỉ lệ chiều dài: vây ngực, vây bụng, vây lưng, vây đuôi,
- một **hàm hoa văn** `marked(s, v)`, ví dụ sọc của cá mập hổ hay đốm của cá mập vằn,
- mỗi ô lưới được lấy mẫu 5 lần, từ đó chọn ký tự ASCII và màu nền.

Vì vậy, mỗi loài mới cũng chỉ là **dữ liệu và hàm** mà tôi viết được. Tôi không tạo được ảnh chụp, nhưng cũng không cần: ảnh raster sẽ không biết uốn mình khi bơi, không đổi theo theme, và không ghép được vào lưới ký tự.

Độ thực tế đến từ ba thứ:

1. **Tỉ lệ cơ thể nhìn từ trên xuống.** Lấy từ tài liệu như FAO Species Catalogue, NOAA Fisheries và các sổ tay nhận dạng. Vòng R0 sẽ lập bảng số liệu kèm nguồn. Số trong §5 hiện là ước lượng (≈) và R0 phải xác minh lại.
2. **Màu theo vùng cơ thể** (lưng, hông, bụng, mảng hoa văn), lấy từ ảnh tham khảo rồi quy về OKLCH (§6).
3. **Cách bơi đúng cơ chế.** Cá và cá mập uốn thân sang ngang. Cá voi và cá heo quẫy đuôi lên xuống, nên nhìn từ trên thân gần như thẳng, đuôi nằm ngang và rộng. Đây là chi tiết dễ làm sai nhất.

Để duyệt hình, tôi sẽ dựng một **species sheet**: trang dev hiển thị từng loài đứng yên, ở theme sáng và tối, đặt cạnh ảnh tham khảo. Anh xem bằng mắt rồi chỉnh (§10).

---

## 2. Hiện trạng (đã đọc code)

- `world.ts`: cá mồi chạy mô hình boids (sardine, anchovy, silverside, mackerel, goby) và có hành vi "báo động" lan trong đàn. Cá mập có cột sống 20 node chạy theo kiểu follow-the-leader. Chúng có các trạng thái đói, đi săn và tuần tra.
- `renderer.ts`: `SHAPES` chứa 8 loài cá mập (classic, hammerhead, greathammer, tiger, zebra, mako, thresher, nurse). Bóng đổ lệch một chút để tạo cảm giác độ cao. Theme mode đảo thang xám (`tone()`). Ký tự accent nhấp nháy ngẫu nhiên.
- Click hiện chỉ gọi `world.splash()`, làm cá mồi trong bán kính 240px tản ra. Cá mập không phản ứng gì.
- Hover thì cá mồi tránh con trỏ.
- Props hiện có: `sharks?: SharkSpec[]` và `className`. Số cá mồi tự tính theo diện tích.
- `Math.random()` dùng khắp nơi, nên **không tái lập được** kết quả. Điều này cần sửa trước để có thể so ảnh trước/sau refactor.
- Các chỗ đang dùng: cover trang chủ, card ở `/components` (previews.tsx), trang docs và demo. Item này nằm trong registry `@huanngdev` và MCP đã có docs cho nó.

---

## 3. Mục tiêu và giới hạn phạm vi

**Mục tiêu**

1. Tuỳ chỉnh được **số lượng** và **loài** theo nhóm, ví dụ "4 cá voi sát thủ, 1 cá mập búa, đàn cá mồi dày".
2. Thêm loài mới với **màu, kích thước và tập tính** gần thực tế.
3. **Click là cho ăn.** Con vật ở gần bơi tới đớp mồi, hoặc làm động tác đặc trưng của loài.
4. **Tương thích ngược:** nếu không truyền prop nào thì kết quả giống hệt hiện tại, kiểm bằng test tất định (§10).

**Ngoài phạm vi** (scope guard cho mọi vòng)

- Không dùng ảnh, sprite, WebGL hay thư viện mới. Vẫn là canvas 2D và ký tự ASCII.
- Không đổi cover trang chủ, trừ việc thêm `colors="theme"` nếu Q1 chọn như đề xuất.
- Không thêm âm thanh. Không vẽ cảnh nền (đá, rong, lá súng) ở đợt 1.
- Không đổi ngoại hình hay hành vi của 8 loài cá mập hiện có, trừ việc thêm phản ứng khi được cho ăn.
- Không tạo lại ảnh thumbnail trong `apps/web/public/images`. Việc đó anh tự làm.

---

## 4. API mới

```ts
export type CreatureSpecies =
  | SharkKind // 8 loài cá mập hiện có, giữ nguyên id
  | "koi"
  | "bottlenose"
  | "orca"
  | "humpback";

export type KoiVariety = "kohaku" | "sanke" | "showa" | "tancho" | "ogon" | "asagi";

export type CreatureGroup = {
  species: CreatureSpecies;
  /** Số con trong nhóm, 1–12. Loài sống theo bầy (orca, bottlenose) sẽ bơi thành pod. */
  count?: number; // mặc định 1
  /** Hệ số kích thước nhân thêm sau khi đã tính theo kích thước thật. */
  size?: number; // mặc định 1
  /** Chỉ dùng cho koi: một giống, hoặc danh sách để random theo seed. */
  variety?: KoiVariety | KoiVariety[];
};

export type AsciiOceanProps = {
  creatures?: CreatureGroup[];
  /** @deprecated Dùng creatures. Vẫn hoạt động và được map sang creatures. */
  sharks?: SharkSpec[];
  /** Mặc định: "pond" nếu mọi con đều là koi, còn lại là "ocean". */
  scene?: "ocean" | "pond";
  /** Mật độ cá mồi: số nhân, false để tắt, "auto" giữ cách tính theo diện tích. Ở pond mặc định là false. */
  baitFish?: number | "auto" | false;
  /** "feed" = click để cho ăn, "splash" = hành vi cũ, "none" = tắt. */
  interaction?: "feed" | "splash" | "none"; // mặc định "feed"
  scale?: "stylized" | "true"; // mặc định "stylized"
  colors?: "natural" | "theme"; // mặc định "natural" (xem Q1)
  /** Cùng seed thì cùng kết quả: vị trí, hoa văn koi, quyết định hành vi. */
  seed?: number;
  className?: string;
};
```

Ví dụ:

```tsx
<AsciiOcean creatures={[{ species: "orca", count: 4 }, { species: "hammerhead" }]} />
<AsciiOcean scene="pond" creatures={[{ species: "koi", count: 7, variety: ["kohaku", "showa", "tancho"] }]} />
```

**Quy tắc tương thích**

- Không truyền `creatures` lẫn `sharks`: dùng `DEFAULT_SHARKS` như cũ (4 con classic), `interaction="feed"`. Với cá mập, "feed" bao gồm cả hiệu ứng splash cũ, nên chỉ có thêm hành vi chứ không mất gì.
- `sharks={[{ kind, size }]}` được map thành `creatures={[{ species: kind, size, count: 1 }]}`, giữ nguyên quy tắc `depth = size`.
- Danh sách con vật vẫn cố định suốt vòng đời canvas. Muốn đổi thì đổi `key`, như hiện nay.
- Giới hạn: tối đa 12 con mỗi nhóm và 16 con lớn tổng cộng. Vượt quá thì cắt bớt và in `console.warn` khi chạy dev.

**Kích thước khi hiển thị**
`L = base × (realLength / realLengthMax)^k × size × (1 ± 8% jitter theo seed)`

- `base` giữ như hiện tại: `clamp(minSide × 0.44, 170, 430)`.
- `k = 0.45` khi `stylized`, `k = 1` khi `true`.
- Luôn kẹp chiều dài tối thiểu ở 7 ô lưới để loài nhỏ vẫn còn nhìn ra hình.

Ví dụ với stylized, khi trong bể có cả humpback (14 m) và koi (0.75 m): koi ≈ (0.054)^0.45 ≈ 0.27 chiều dài humpback. Với `true` thì koi chỉ còn 0.054, và sẽ bị kẹp lên mức tối thiểu.

---

## 5. Danh sách loài

Mọi số liệu đều là ước lượng (≈). R0 phải xác minh lại kèm nguồn. Tốc độ quy về chiều-dài-thân/giây (BL/s), vì nó giữ đúng cảm giác nhanh chậm giữa các loài sau khi tỉ lệ kích thước đã bị nén.

### 5.1 Loài mới (đợt 1)

| Loài                                          | Dài thật             | Hình nhìn từ trên                                                                                                                                                                                                                                 | Màu theo vùng                                                                                                                                                                                                                              | Cách bơi                                                                                                                      | Xã hội                                             |
| --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Koi** (_Cyprinus rubrofuscus_)              | ≈0.6–0.9 m           | Thân hình thoi dày, đầu tù với 2 cặp râu ngắn. Vây ngực to, tròn, hơi trong. Đuôi hình quạt, hai thùy mềm.                                                                                                                                        | Theo giống: **kohaku** trắng với mảng đỏ cam; **sanke** thêm đốm đen nhỏ; **showa** nền đen có đỏ và trắng, gốc vây ngực đen; **tancho** trắng với một chấm đỏ tròn trên đầu; **ogon** vàng ánh kim; **asagi** lưới vảy xanh xám, hông đỏ. | Chậm, uốn ngang nhẹ, hay lượn và dừng lơ lửng. ≈0.35 BL/s.                                                                    | Bầy lỏng, không đi thành đàn chặt. Không sợ người. |
| **Cá heo mũi chai** (_Tursiops truncatus_)    | ≈2–4 m               | Thân thuôn có trán dô (melon) rồi tới mỏ ngắn. Vây ngực nhọn, vây lưng cong hình liềm. **Đuôi nằm ngang**, có khía giữa.                                                                                                                          | Lưng xám than đậm (cape), hông xám nhạt hơn, bụng gần trắng. Hai tông xám chuyển dần (countershading).                                                                                                                                     | Quẫy đuôi lên xuống, nên nhìn từ trên thân gần như thẳng, chỉ đuôi "thở" theo nhịp. Nhanh, ≈0.8 BL/s, lúc bứt tốc gấp ~3 lần. | Pod 2–8 con, bơi so le.                            |
| **Cá voi sát thủ** (_Orcinus orca_)           | ≈5–8 m (đực lớn hơn) | Thân to tròn, đầu tù không có mỏ. Vây ngực to hình mái chèo. Vây lưng rất cao, nhìn từ trên là một gờ sáng. Đuôi ngang.                                                                                                                           | Lưng **đen gần tuyệt đối**. **Mảng yên ngựa xám** ngay sau vây lưng (thấy rõ từ trên). **Mảng trắng sau mắt** lộ ra ở mép đầu. Bụng trắng, chỉ thấy khi nó lăn mình.                                                                       | Quẫy đuôi lên xuống, ≈0.5 BL/s, bứt tốc mạnh.                                                                                 | Pod 3–6 con theo dòng mẹ, phối hợp săn.            |
| **Cá voi lưng gù** (_Megaptera novaeangliae_) | ≈12–16 m             | Thân dài và to. Đầu dẹt có **u sần** (tubercles). **Vây ngực rất dài, ≈1/3 chiều dài thân, màu trắng, mép trước gồ ghề**: đây là dấu hiệu nhận ra ngay từ trên cao. Vây lưng chỉ là cái bướu nhỏ ở khoảng 2/3 thân. Đuôi ngang, mép sau răng cưa. | Lưng xám đen. Vây ngực trắng (một số cá thể có đốm đen). Mặt dưới đuôi có hoa văn trắng đen riêng từng con.                                                                                                                                | Rất chậm, ≈0.15 BL/s. Khi lặn sâu thì nhấc đuôi lên khỏi mặt nước ("fluking").                                                | Đơn độc hoặc nhóm 2–3 con.                         |

### 5.2 Tám loài cá mập hiện có: hình và màu giữ nguyên, chỉ thêm tập tính

| Loài                       | Dài thật ≈         | Tập tính có thật dùng cho click                                                                                                 |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| classic (cá mập trắng)     | 4–6 m              | Bơi vòng quanh để điều tra, rồi lao từ dưới lên đớp. Có khi chồm khỏi mặt nước (breach).                                        |
| hammerhead (búa vỏ sò)     | 3–4 m              | **Lắc đầu quét qua lại** như máy dò kim loại (cảm nhận điện qua đầu búa) rồi mới đớp.                                           |
| greathammer (búa lớn)      | 4–6 m              | Quét đầu, rồi **dùng đầu ghim mồi** xuống trước khi đớp.                                                                        |
| tiger (cá mập hổ)          | 3–4.5 m            | Tới chậm, ăn tạp, "nuốt hết" (đớp nhiều mẩu liên tiếp).                                                                         |
| mako                       | 3–4 m              | Bứt tốc nhanh nhất, có khi breach.                                                                                              |
| thresher (cá mập đuôi dài) | 4–6 m, gồm cả đuôi | **Quất đuôi** qua đàn cá mồi cho chúng choáng rồi ăn. Hành vi này có ghi nhận trong nghiên cứu (Oliver et al., 2013, PLoS ONE). |
| nurse (cá mập y tá)        | 2.5–3 m            | Chậm, **hút mồi** (suction feeding) khi đứng gần như yên. Bình thường hay nằm nghỉ.                                             |
| zebra (cá mập vằn)         | 2–2.5 m            | Chậm, lượn sát đáy, mổ mồi từ từ.                                                                                               |

---

## 6. Màu sắc và theme

**Hai chế độ**

- `colors="theme"`: giữ đúng cơ chế hiện tại (thang xám đảo theo theme, accent nhấp nháy). Loài mới vẽ hoa văn bằng xám đậm/nhạt, không dùng sắc màu.
- `colors="natural"`: màu thật theo vùng cơ thể. **Không bao giờ đảo màu**: orca vẫn đen trắng ở cả theme sáng lẫn tối. Chỉ chỉnh độ sáng để luôn nổi trên nền.

**Dữ liệu màu.** Mỗi loài khai báo `regions: Record<RegionId, Oklch>`, ví dụ `back`, `flank`, `belly`, `patch`, `fin`, `eye`. Hàm `pattern(s, v, individual)` trả về vùng của từng điểm trên thân. Ô lưới được tô bằng:
`fill = region màu × shade (ánh sáng từ trên-trái, như hiện tại) × depthDim`.
Ký tự vẽ đè lên dùng mực tương phản với `fill`.

**Quy tắc tương phản (có unit test)**

- Viền mỗi con vật (ô `FLAG_EDGE`) phải có tương phản ≥ 3:1 so với màu nền ở cả hai theme. Test chạy cho mọi loài × {light, dark} × nền mặc định của site.
- Vùng gần trắng (bụng orca, koi kohaku) trên nền sáng sẽ có **viền mực đậm**. Vùng gần đen (lưng orca) trên nền tối sẽ có **viền sáng mảnh**. Cách làm giống mép mực trong tranh khắc.
- Accent nhấp nháy: chỉ còn ở loài có ánh kim (koi ogon, vảy koi lấp lánh trắng). Tắt ở cá voi và cá heo.

**Gợi ý giá trị khởi đầu** (R0 sẽ chỉnh theo ảnh tham khảo; chuỗi OKLCH là `L C H`)

- Koi đỏ (hi) `0.62 0.19 35`, trắng (shiroji) `0.96 0.01 90`, đen (sumi) `0.22 0.01 260`, vàng ogon `0.80 0.14 85`, xanh asagi `0.60 0.04 240`.
- Orca đen `0.18 0.01 260`, trắng `0.97 0 0`, yên ngựa `0.62 0.01 250`.
- Cá heo, lưng cape `0.42 0.02 245`, hông `0.62 0.015 240`, bụng `0.90 0.01 240`.
- Humpback, lưng `0.28 0.01 250`, vây ngực `0.93 0.005 240`.

---

## 7. Kiến trúc

```
packages/core/src/components/ascii-ocean/
  ascii-ocean.tsx          props mới, map sharks → creatures
  engine.ts                lọc click (§8.1), truyền props
  math.ts                  thêm PRNG có seed (mulberry32); rand/randInt nhận rng
  species.ts               cá mồi (giữ nguyên)
  world.ts                 Creature thay cho Shark (đổi tên kiểu, logic chung), Food, behaviour runner
  renderer.ts              rasterize dùng chung cho mọi body plan; SHAPES chuyển sang creatures/
  creatures/
    types.ts               CreatureDef: body, tail, regions, pattern, motion, social, actions
    sharks.ts              8 loài cá mập hiện có (chuyển nguyên từ renderer, không đổi số)
    koi.ts  bottlenose.ts  orca.ts  humpback.ts
    index.ts               CREATURES: Record<CreatureSpecies, CreatureDef>
  behaviours/
    state.ts               máy trạng thái: cruise → notice → approach → action → recover
    actions.ts             thư viện động tác (§8.3)
  effects.ts               gợn nước, bụi nước, bong bóng, mẩu mồi
```

Registry vẫn là **một item** `ascii-ocean`. `scripts/registry/items.ts` sẽ liệt kê thêm file mới.

**Loại thân (`tail`)** quyết định cách uốn và hình đuôi:

- `"caudal"`: cá mập. Uốn ngang, đuôi đứng nên nhìn từ trên rất mảnh (như hiện tại).
- `"fluke"`: cá voi, cá heo. Thân gần như thẳng, biên độ uốn ngang chỉ ≈15% so với cá mập. Đuôi hai thùy nằm ngang và rộng; nhịp quẫy hiện thành đuôi co dãn chiều ngang cộng độ sáng đổi theo pha. Có **lỗ thở** để phun nước.
- `"koi"`: uốn ngang mềm, đuôi quạt lượn trễ pha. Vây ngực lớn vẫy theo nhịp riêng.

**Tham số vẽ theo từng con** (world tính, renderer đọc), dùng để diễn tả động tác 3D trên mặt phẳng nhìn từ trên:

- `height` từ 0 đến 1: nhô lên gần camera. Thân phóng to tới +25%, sáng hơn, **bóng lệch xa hơn**. Độ lệch bóng là thứ làm người xem tin là con vật đang ở trên cao.
- `pitch` từ 0 đến 1: dựng đứng (spyhop, nhào lộn đứng). Chiều dài co lại theo `cos`, đầu sáng lên.
- `roll` từ -1 đến 1: lăn mình. Chiều ngang co theo `|cos|` và mảng bụng lộ ra.
- `gape` từ 0 đến 1: há miệng. Đầu rộng ra; với humpback là nếp bụng phình to.
- `finSpread` và `tailSlap`: biên độ vây và cú đập đuôi.

---

## 8. Click để cho ăn

### 8.1 Bắt sự kiện

- Dùng `pointerdown` rồi `pointerup`, và chỉ tính khi con trỏ di chuyển dưới 6px. Như vậy chạm để cuộn trang trên điện thoại không bị tính là cho ăn.
- **Bỏ qua** khi `e.target.closest("a, button, input, textarea, select, [role=button], [contenteditable]")` khớp, để click vào link trên cover không thả mồi.
- `prefers-reduced-motion`: không làm gì (giữ như hiện tại).
- Tối đa 6 lượt mồi cùng lúc. Click thêm khi đã đủ chỉ tạo gợn nước.

### 8.2 Mồi và chọn con phản ứng

- `Food { x, y, kind, morsels, life }`. Ở **ocean**: 3–6 mẩu mồi `*` tản trong bán kính khoảng 1.5 ô, chìm dần (thu nhỏ và mờ) trong ~10 giây, kèm một **vệt mùi** trôi theo `current()` (dùng lại trường wake). Ở **pond**: 4–8 viên `o` **nổi** trên mặt nước, trôi chậm, tồn tại ~14 giây.
- Ở ocean, cá mồi vẫn tản ra ngay khi click (giữ `splash`). Sau khoảng 2 giây, cá mồi gần đó quay lại rỉa mồi. Sự tranh ăn này kéo kẻ săn mồi tới.
- Mỗi loài có `senseRange` (tính theo `minSide`). Cá mập rất xa, vì đánh hơi được: ≈0.9. Cá voi và cá heo xa: ≈0.7. Koi trung bình: ≈0.5.
- Chọn con phản ứng: các con trong tầm, xếp theo khoảng cách, tối đa `maxResponders` (2 với loài lớn, 5 với koi vì koi hay chen nhau). Con nào đang trong thời gian nghỉ (6–10 giây) thì bỏ qua.
- **Luôn có phản hồi:** nếu không con nào trong tầm, con gần nhất ít nhất phải **quay đầu và chậm lại** trong vòng 0.5 giây.
- Mỗi con bốc một động tác theo bảng trọng số của loài nó (§8.3). Động tác có điều kiện chỉ được chọn khi điều kiện đúng, ví dụ `carousel` cần ≥3 orca trong pod và một đàn cá mồi trong bán kính R. Không thoả thì rơi về `approachAndBite`. Mọi lựa chọn dùng PRNG có seed.

### 8.3 Động tác theo loài

Trạng thái chung: `cruise → notice (quay đầu) → approach (bơi tới, tăng tốc) → action → recover → cruise`.

| Loài           | Động tác (trọng số)                                                               | Diễn tả trên màn hình                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **koi**        | `surfaceSlurp` (1.0)                                                              | Bơi tới, đầu chạm mặt nước, `gape` mở rồi khép, **gợn tròn** loang ra, viên mồi biến mất. Các con chen vai nhau. Khi hover ở pond, koi **từ từ bơi theo con trỏ**, giống thói quen chờ người cho ăn (ngược với cá mồi).                                                                                                 |
| **bottlenose** | `approachAndBite` (0.4), `leap` (0.35), `fishWhack` (0.25)                        | `leap`: `height` lên rồi xuống, bóng tách xa, hai lần bụi nước. `fishWhack`: đập đuôi hất một con cá mồi văng ra. Cả pod bơi tới theo đội hình so le.                                                                                                                                                                   |
| **orca**       | `carousel` (0.6, cần pod ≥3 và cá mồi), `approachAndBite` (0.25), `spyhop` (0.15) | `carousel` mô phỏng cách săn cá trích ở Na Uy: cả pod bơi vòng quanh đàn cá mồi, đàn bị dồn thành **bait ball** (tăng cohesion và mill). Orca **lăn mình lộ bụng trắng** để dồn đàn, rồi **đập đuôi** (`tailSlap`) cho cá choáng (chậm lại, sáng nhấp nháy) và ăn. `spyhop`: dựng đứng (`pitch`), đầu nhô lên quan sát. |
| **humpback**   | `bubbleNet` (0.6, cần cá mồi), `lunge` (0.25), `blowAndFluke` (0.15)              | `bubbleNet`: bơi xoắn ốc nhả **vòng bong bóng** `o°.` bao quanh đàn cá mồi, rồi **trồi thẳng lên giữa vòng, há to** (`gape` và `height`), nuốt cả đàn. `lunge`: há miệng lao ngang. `blowAndFluke`: phun nước rồi nhấc đuôi lặn xuống, thân mờ dần và lộ mặt dưới đuôi.                                                 |
| classic        | `circleThenLunge` (0.75), `breach` (0.25)                                         | Vòng một lần quanh mồi rồi lao tới đớp. `breach`: `height` lên rất cao, cú rơi xuống tạo bụi nước lớn.                                                                                                                                                                                                                  |
| hammerhead     | `scanSweep` (1.0)                                                                 | Đầu lắc qua lại 3–4 lần trên vị trí mồi rồi mới đớp.                                                                                                                                                                                                                                                                    |
| greathammer    | `scanAndPin` (1.0)                                                                | Quét đầu, ghì đầu xuống mồi (chậm hẳn, `pitch` âm nhẹ), rồi đớp.                                                                                                                                                                                                                                                        |
| tiger          | `gulpAll` (1.0)                                                                   | Tới chậm, đớp từng mẩu cho tới hết.                                                                                                                                                                                                                                                                                     |
| mako           | `burst` (0.7), `breach` (0.3)                                                     | Bứt tốc ×3, quẹo gắt.                                                                                                                                                                                                                                                                                                   |
| thresher       | `tailWhip` (0.8, cần cá mồi), `approachAndBite` (0.2)                             | Bơi ngang qua đàn cá mồi rồi **quất đuôi** về phía trước. Cá mồi trong cung đuôi bị choáng và nó quay lại ăn.                                                                                                                                                                                                           |
| nurse          | `suction` (1.0)                                                                   | Tới rất chậm, dừng, mồi bị "hút" vào miệng (các mẩu kéo về phía mõm).                                                                                                                                                                                                                                                   |
| zebra          | `slowPeck` (1.0)                                                                  | Lượn sát, mổ từ từ.                                                                                                                                                                                                                                                                                                     |

**Tập tính tự nhiên khi không ai click** (thưa thớt để không gây rối mắt)

- Cá voi và cá heo **lên thở** theo chu kỳ (cá heo vài chục giây, humpback lâu hơn): một làn bụi nước nhỏ ở lỗ thở.
- Pod orca và cá heo giữ đội hình. Từ đợt 2, con non bơi sát bên mẹ (echelon swimming).
- Koi thỉnh thoảng dừng lơ lửng và vẫy vây ngực.

### 8.4 Hiệu ứng mới (`effects.ts`)

- **Gợn tròn**: vòng tròn nở dần, ký tự `. : ·` men theo mép, vẽ bằng cách stamp vào trường energy có sẵn.
- **Bụi nước và vệt phun**: hạt `' . , *` toả ra rồi rơi xuống.
- **Bong bóng**: `o` → `°` → `.` nổi lên, nghĩa là nhỏ dần rồi mất (vì nhìn từ trên).
- **Cá choáng**: cá mồi bị choáng thì chậm lại và sáng lên trong 1–2 giây.
- Mọi hiệu ứng có giới hạn số hạt (≤ 400) và tự hết hạn.

---

## 9. Hiệu năng

- Ngân sách: **≤ 6 ms mỗi frame** cho phần mô phỏng và vẽ, với khung 1440×900, Chrome trên Apple M-series, đo ở cảnh nặng nhất trong demo (4 orca, 1 humpback, 2 cá mập, cá mồi auto).
- Rasterize hiện đang thử mọi đoạn cột sống cho mỗi mẫu. Cách tối ưu: lấy bounding box của từng đoạn và chỉ thử những đoạn có bbox giao với hàng ô đang xét. Chỉ làm nếu đo thấy vượt ngân sách.
- Harness đo: script playwright-core chạy **Chrome thật**, ghi thời gian mỗi frame trong 10 giây, in p50 và p95. Không dùng webview ẩn của Orca vì nó không có requestAnimationFrame.
- Vẫn tạm dừng khi canvas ra khỏi màn hình (đã có IntersectionObserver).

---

## 10. Cách kiểm chứng

1. **Test tất định (trước refactor):** `world.test.ts` chạy `World` với seed cố định qua 600 bước dt = 1/60, rồi hash vị trí mọi con. Hash phải **giữ nguyên** qua R1 và R2. Thêm một test render: dùng `@napi-rs/canvas` hoặc một mock ctx để ghi lại chuỗi lệnh `fillRect/fillText` rồi so hash. R1a sẽ quyết dùng cách nào tuỳ cái nào dễ chạy trong `bun test`.
2. **Species sheet:** route dev `/dev/ascii-ocean`, trả `notFound()` khi build production. Trang hiển thị mỗi loài đứng yên (dừng sau N bước), ở cả theme sáng và tối, với mọi giống koi. Có overlay debug bật tắt được, ghi trạng thái từng con (`approach`, `carousel`...). Tôi chụp bằng playwright, còn anh duyệt bằng mắt.
3. **Test tương phản** (§6) và **test dữ liệu:** mỗi `CreatureSpecies` có đủ def; trọng số hành vi dương; mọi động tác có điều kiện đều có đường dự phòng.
4. **Test hành vi** (world, không vẽ): thả mồi cạnh một koi thì sau ≤ 3 giây số mẩu mồi giảm; thả mồi cạnh pod 4 orca kèm đàn cá mồi với seed X thì trạng thái `carousel` xuất hiện; không có con nào trong tầm thì con gần nhất có `notice` trong ≤ 0.5 giây; click lên `<a>` thì không tạo `Food`.
5. **Kiểm tra sẵn có của repo:** format, lint, check-types, `bun test`, `registry` + `registry:check`, `llms` + `llms:check`, `verify-install ascii-ocean` (smoke render cần cập nhật props), `bun run build`, rồi `mcp:smoke`.
6. **Ảnh chụp** 1440px và 360px, light và dark, cho: cover (phải giống trước), demo ocean, demo pond.

---

## 11. Các vòng cho Haiku

Mỗi vòng có một spec riêng ghi rõ "chỉ sửa những file X" và "không được đổi Y". Tôi review diff và chạy kiểm chứng trước khi sang vòng sau. Không commit cho tới khi anh duyệt UI.

| Vòng      | Ai làm                   | Nội dung                                                                                                                                                                                                                         | Xong khi                                               |
| --------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **R0**    | Tôi                      | Research tỉ lệ thân nhìn từ trên, màu và tập tính, kèm nguồn. Tạo `docs/ascii-ocean-species.md`                                                                                                                                  | Mọi số ≈ ở §5 và §6 đã có nguồn hoặc được sửa          |
| **R1a**   | Haiku                    | PRNG có seed trong `math.ts`, prop `seed`, test hash tất định                                                                                                                                                                    | Test xanh; không truyền seed thì vẫn ngẫu nhiên như cũ |
| **R1b**   | Haiku                    | Refactor `Shark` thành `Creature`, chuyển `SHAPES` sang `creatures/sharks.ts`, thêm `CreatureDef`. **Không đổi hành vi**                                                                                                         | Hash từ R1a giữ nguyên; ảnh chụp cover giống trước     |
| **R2**    | Haiku                    | API mới (`creatures`, `count`, `scene`, `baitFish`, `scale`, `interaction`, `colors`), map `sharks`, giới hạn số lượng, công thức kích thước                                                                                     | Hash mặc định giữ nguyên; test map                     |
| **R3**    | Haiku                    | Hệ màu `natural`/`theme`, vùng màu, test tương phản. Cá mập hiện có ở `natural` lấy từ `tint` cũ                                                                                                                                 | Test tương phản xanh; `theme` giống hệt trước          |
| **R4**    | Haiku                    | Loại thân `fluke` và `koi` trong renderer, cùng các tham số `height/pitch/roll/gape`                                                                                                                                             | Species sheet có thân thử nghiệm của cả 3 loại         |
| **R5a–d** | Haiku, mỗi loài một vòng | koi (6 giống) → bottlenose → orca → humpback                                                                                                                                                                                     | Anh duyệt ảnh từng loài trên species sheet             |
| **R6**    | Haiku                    | Máy trạng thái, `Food`, chọn con phản ứng, lọc click, koi theo con trỏ, cá mồi quay lại rỉa                                                                                                                                      | Test hành vi ở §10.4                                   |
| **R7**    | Haiku                    | Động tác cho cá mập (§8.3)                                                                                                                                                                                                       | Overlay debug thấy đúng trạng thái; anh xem trực tiếp  |
| **R8**    | Haiku                    | Động tác cho loài mới: carousel, bubbleNet, leap, spyhop, fluke                                                                                                                                                                  | Như R7                                                 |
| **R9**    | Haiku                    | `effects.ts`: gợn, bụi nước, bong bóng, cá choáng                                                                                                                                                                                | Giới hạn hạt có test                                   |
| **R10**   | Haiku + tôi đo           | Harness hiệu năng, tối ưu nếu vượt ngân sách                                                                                                                                                                                     | p95 ≤ 6 ms                                             |
| **R11**   | Haiku                    | Demo preset (Open ocean, Orca pod, Humpback feeding, Koi pond, Shark gallery); docs (`component-docs/ascii-ocean.ts`: props, types, keywords koi/orca/dolphin/whale/pond); `registry/items.ts`; smoke; chạy lại registry và llms | Mọi lệnh ở §10.5 xanh                                  |

Sau R11, anh review UI, rồi commit lên nhánh `feature/ascii-ocean-v2` và mở PR.

---

## 12. Đợt 2 (chưa làm, chỉ ghi lại)

- **Cá mập voi**: lọc mồi, đứng dựng hút mồi, lưng có đốm trắng xếp ô (dùng lại hàm đốm của cá mập vằn).
- **Cá đuối manta**: vỗ cánh, nhào lộn khi ăn (somersault, cyclone feeding).
- **Cá voi xanh**: lunge feeding ăn nhuyễn thể; cần thêm loại "mồi nhuyễn thể" là đám chấm mờ.
- **Rùa biển**.
- Con non trong pod (echelon). Cá heo cưỡi sóng trước con trỏ khi rê nhanh.
- Cảnh nền cho pond: lá súng, bóng nắng (caustics).

---

## 13. Rủi ro

- **Ô lưới thô** (≈12×18 px): koi nhỏ dài ~8 ô thì hoa văn sẽ vỡ. Cách giảm: pond scene dùng koi lớn hơn và `scale` không áp lên koi khi bể chỉ có koi. Có thể cho chỉnh cỡ chữ canvas (`text-[10px]`) để có lưới mịn hơn; ghi điều này trong docs.
- **Rối mắt:** CLAUDE.md có nguyên tắc "motion serves meaning". Động tác chỉ xảy ra khi người dùng click. Tập tính tự nhiên giữ thưa, và cover dùng `theme` nên vẫn tối giản.
- **Tương thích registry:** người đã cài bản cũ chỉ nhận thay đổi khi họ `add` lại. API cũ vẫn chạy, nên không gãy.
- **Haiku sửa lan ra ngoài:** mỗi spec có danh sách file được phép sửa, và test hash chặn thay đổi ngầm.

---

## 14. Đội agent (mỗi vòng)

| Vai                 | Model | Việc                                                                                                                                 | Được sửa                             |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| **Coder**           | Haiku | Code theo spec của vòng                                                                                                              | Chỉ những file spec liệt kê          |
| **Reviewer**        | Haiku | Đọc diff theo checklist: đúng spec, không lan phạm vi, không cấp phát trong hot loop, đặt tên và độ dày comment theo code xung quanh | Không sửa gì; chỉ báo cáo            |
| **Function tester** | Haiku | Viết hoặc chạy `bun test`, test tất định và test hành vi, rồi chạy các kiểm tra của repo                                             | Chỉ file `*.test.ts`                 |
| **Browser tester**  | Haiku | Chạy dev server và playwright-core với Chrome thật: chụp 1440/360 ở light và dark, đo frame time, click thử                          | Không sửa code; ảnh lưu ở scratchpad |
| **Controller**      | Opus  | Viết spec, gộp báo cáo, chạy lại các kiểm tra quan trọng, review cuối, quyết định sang vòng sau                                      | Plan; sửa nhỏ khi cần                |

Thứ tự trong một vòng: Coder → (Reviewer ∥ Function tester ∥ Browser tester, chạy song song) → Controller. Nếu có lỗi thì Coder sửa đúng các mục bị báo rồi chạy lại. Không ai commit cho tới khi anh duyệt UI.

---

## 15. Chiều sâu, mặt nước, độ mượt

**Chiều sâu (`depth`, 0 = sát đáy hoặc xa camera, 1 = sát mặt nước)**

- Mỗi con có `depth` thay đổi theo thời gian, ví dụ cá voi và cá heo lặn rồi trồi lên thở, koi trồi lên ăn. Thứ tự vẽ theo `depth` (painter's algorithm), không theo chiều dài như hiện tại.
- **Nước hấp thụ màu theo định luật Beer–Lambert:** đỏ mất trước, rồi tới cam và vàng; xanh lam và lục còn lâu nhất. Con ở sâu bị pha dần về màu nước và giảm tương phản, nên koi đỏ ở sâu trông nâu xám. Trong `theme` mode thì chỉ giảm tương phản.
- **Bóng đổ dưới đáy:** con ở gần mặt nước thì bóng nằm xa và nhạt, con ở sát đáy thì bóng gần và đậm. Dùng lại `sharkShadow`, với độ lệch và độ đậm tính theo `depth`.
- Con ở sâu dùng ký tự thưa hơn (dịch về đầu nhẹ của `SKIN_RAMP`) và có viền mềm hơn.

**Mặt nước**

- **Caustics:** lưới sáng di chuyển chậm, là tổng 2–3 trường sin xoay chéo nhau. Nó điều biến độ sáng chấm nền và phủ nhẹ lên thân con vật ở nông. Tính ở nửa độ phân giải lưới rồi nội suy.
- **Vệt sóng mặt nước:** con có `depth > 0.85` để lại **vệt chữ V (Kelvin wake, góc ≈19.5°)** phía sau. Gợn tròn từ các sự kiện ở §8.4.
- Mọi hiệu ứng mặt nước đều nhẹ, có thể tắt bằng prop `surface?: boolean` (mặc định true). Cover dùng `theme` nên caustics chỉ là xám.

**Độ mượt và tối ưu**

- **Nội suy khi vẽ:** world vẫn chạy bước cố định 1/60 s, nhưng renderer nội suy giữa trạng thái trước và sau bằng `alpha = acc / STEP`. Như vậy màn 120 Hz không bị giật kiểu 0–1–0 bước mỗi frame.
- **Không cấp phát trong vòng lặp nóng:** bỏ chuỗi `rgb(...)` tạo cho mỗi ô ở mỗi frame. Thay bằng màu lượng tử hoá (ví dụ 32 mức sáng × N vùng) và bảng chuỗi tạo sẵn. Gom ô theo `fillStyle` để giảm số lần đổi state canvas (như `drawDots` đang làm).
- `starts` và `cursor` của `drawDots` đang tạo `Int32Array` mới mỗi frame; chuyển thành bộ đệm dùng lại.
- Ngân sách và cách đo ở §9: p95 ≤ 6 ms, không có frame > 16.7 ms trong 10 giây, không có GC lớn khi xem Performance trace.

---

## 16. Đợt sửa sau review UI (R12–R16)

Góp ý của anh sau khi xem UI:

- đuôi koi bị glitch, và phải là đuôi dọc chứ không phải đuôi ngang;
- hồ koi không có sóng, mà có lá súng và bèo;
- khi cá đớp mồi thì có gợn sóng lan ra xung quanh;
- đáy biển và đáy hồ chi tiết hơn một chút, với chiều sâu đúng thực tế;
- cá voi và cá heo hay ngoi lên phun nước, và nhảy khỏi mặt nước rồi lặn xuống.

**Trả lời câu hỏi về kích thước:** có giảm. Kích thước tính theo con lớn nhất trong bể, `(chiều dài thật / chiều dài con lớn nhất)^0.45`:

| Bể có thêm                            | Koi còn bao nhiêu so với con lớn nhất |
| ------------------------------------- | ------------------------------------- |
| cá voi lưng gù (14 m)                 | khoảng 27%                            |
| cá mập trắng (5 m)                    | khoảng 43%                            |
| không có con nào khác (bể chỉ có koi) | 100%                                  |

`scale="true"` giữ tỉ lệ thật (koi chỉ còn 5% so với cá voi). Muốn koi to hơn trong bể chung thì đặt `size` cho nhóm koi.

| Vòng    | Nội dung                                                                                                                                                                                                                                                                                                                                 | Xong khi                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **R12** | Đuôi koi thành **vây đuôi dọc**. Nhìn từ trên xuống, nó là một lưỡi mỏng, nửa trong, nghiêng sang hai bên theo nhịp quẫy. Bỏ kiểu quạt hai thuỳ nằm ngang. Sửa cuống đuôi bị đứt thành mảnh. Koi bớt uốn hình chữ S: chỉ nửa sau thân uốn, và khớp cứng hơn                                                                              | Test: đuôi và thân luôn liền một khối qua 60 pha; ảnh 2x không có mảnh rời |
| **R13** | **Gợn sóng khi đớp mồi:** 2–3 vòng đồng tâm, lan dần ra rồi nhạt đi. Cỡ vòng theo cỡ con. Koi đớp thì vòng rõ, không có bụi nước. Có giới hạn số vòng và không cấp phát mỗi frame                                                                                                                                                        | Vòng thấy rõ trên ảnh; test giới hạn pool                                  |
| **R14** | **Mặt hồ koi:** tắt lưới caustics và vệt chữ V. Thêm lá súng (có khe hình chữ V, vài lá có hoa) và cụm bèo tấm. Chúng nằm trên mặt nước, che koi bơi bên dưới, có bóng đổ xuống đáy, trôi rất chậm và bị gợn sóng đẩy nhẹ                                                                                                                | Ảnh hồ ở light và dark; perf vẫn ≤ 6 ms                                    |
| **R15** | **Đáy nước:** biển có nền cát gợn sóng, rải vài hòn đá. Hồ có bùn và sỏi tròn, nước ngả xanh lục và nâu. Đáy là lớp sâu nhất, nên bị nước hấp thụ màu nhiều nhất và rất mờ. Chỉ vẽ một lần vào canvas nền, nên không tốn gì mỗi frame. Chỉ có ở `natural`; cover (`theme`) giữ nguyên                                                    | Hash theme giữ nguyên; ảnh 2x ở light và dark                              |
| **R16** | **Thú biển tự làm trò, không cần thả mồi:** cá heo thỉnh thoảng nhảy vọt (cả đàn nhảy lệch nhau một chút); orca và cá voi lưng gù thỉnh thoảng phóng hẳn lên khỏi mặt nước (breach). Cá voi thở 2–4 hơi liền rồi lặn sâu và giơ đuôi lên khỏi nước (fluke-up). Cột phun nước cao và rõ hơn. Lịch tính theo id và đồng hồ, không dùng rng | Test lịch tất định; ảnh có cú nhảy và cột phun                             |

Cách làm như các vòng trước: Haiku code → Haiku review, Haiku test bằng function và Haiku test bằng trình duyệt chạy song song → tôi review cuối. Các hash ở `theme` (cover) không được đổi.

**Góp ý thêm (lần 2), đã đưa vào plan:**

- **R14:** bỏ lá súng to. Thay bằng nhiều lá bèo nhỏ (1–4 ô) rải ngẫu nhiên, trôi chậm, và bị koi đẩy dạt ra khi bơi qua. Chỉ 1–2 bông hoa cho cả hồ.
- **R17 (mới):** bỏ vệt xanh quanh thân và sau đuôi khi cá bơi ở `natural`, gồm cả vệt chữ V. Cover (`theme`) giữ nguyên. Khi lao tới mồi, cá tăng tốc nhanh hơn và quẫy đuôi nhanh, mạnh hơn.
- **R16:** cú nhảy của cá heo, orca và cá voi đi đủ các bước:
  1. uốn xuống dưới nước;
  2. bơi nhanh lên;
  3. phá mặt nước;
  4. lượn trên không;
  5. phá mặt nước lần nữa khi rơi xuống;
  6. chìm xuống;
  7. nổi lên thở.

  Lúc ở trên không, thân phóng to rồi thu lại (tối đa +45%) để thấy độ cao.

Thứ tự làm: R14 → R17 → R15 → R16.

**Góp ý lần 3, đã đưa vào plan:**

- **R18a:**
  - Mọi tư thế chuyển dần, không bật tắt đột ngột.
  - Orca lật bụng chậm, mỗi con khoảng 7 giây mới lật một lần. Mảng trắng ở bụng hiện dần ra từ giữa.
  - Không còn cá dựng đứng thân: nhìn từ trên xuống, thân luôn giữ ít nhất 70% chiều dài.
  - Cá voi lưng gù to hơn: cảnh có orca hoặc cá voi dùng chiều dài nền lớn hơn. Thêm chi tiết: hà bám ở đầu, vây và đuôi; hai lỗ thở; lưng loang; mép đuôi răng cưa; gù lưng.
- **R16 (làm lại):** cùng nội dung như trước, cộng thêm quy tắc mọi tư thế phải chuyển mượt.
- **R18b:** thêm nút "Play jump" cạnh ô chọn cảnh. Nút này cho một con biết nhảy, chọn ngẫu nhiên, nhảy một cú, và bị khoá cho tới khi cú nhảy xong. Cảnh không có con nào biết nhảy (như hồ koi) thì không hiện nút.

Thứ tự làm: R18a → R16 → R18b.

## 17. Thu gọn: chỉ bơi (R21), các phần để sau

**Quyết định (2026-10-22):** mặt biển và hình dáng các loài đã ổn. Phần nhảy khỏi mặt nước và phần đớp mồi được gỡ khỏi code. Từ giờ các con vật chỉ bơi qua bơi lại, và ưu tiên là bơi ổn định nhất có thể.

**Toàn bộ code của các phần dưới đây vẫn còn ở commit `ab0a78d`** (nhánh feature/ascii-ocean-v2). Khi làm lại, hãy lấy từ đó ra, đừng viết lại từ đầu.

Các phần để sau:

- **Cho ăn:**
  - click để thả mồi, nhóm mồi, gọi con vật tới;
  - mỗi loài một cách đớp: approachAndBite, surfaceSlurp, carousel, bubbleNet, lunge, scanSweep, gulpAll, suction, …;
  - vòng gợn khi đớp, bong bóng, quẫy đuôi nhanh khi lao tới mồi (R13, R17, R17b).
- **Săn cá mồi:** cá mập đuổi và ăn bầy cá nhỏ. Bầy cá nhỏ vẫn còn, nhưng giờ chỉ bơi.
- **Nhảy:**
  - leap và breachRoll, cú breach của cá mập;
  - thân trồi lên bắt đầu từ đầu (emerge), phóng to khi ở trên không (R16, R16b);
  - nút "Play jump" (R18b).
- **Thở:** lên mặt nước phun nước, chuỗi nhịp thở, lặn sâu giơ đuôi (soundDive).
- **Chuyện cần sửa khi làm lại:**
  - splash bắn theo giá trị emerge mục tiêu, nên sớm hơn hình khoảng 0.2 s;
  - sau mỗi show có khoảng 1.5 s "recover", nên nút bấm mở lại khi con vật vẫn chưa nhảy lại được;
  - cú breach của cá mập khi không có mồi thì không có hướng lao lên.

**R21 gồm:**

- **R21a:** gỡ phần mô phỏng và API (world, creatures, engine, component), và thêm test độ ổn định khi bơi.
- **R21b:** gỡ code renderer và effects không còn dùng.
- **R21c:** demo chỉ còn ô chọn cảnh. Trang docs có thêm section giới thiệu từng loài.
