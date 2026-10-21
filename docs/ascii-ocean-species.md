# ASCII Ocean: tài liệu tham khảo loài (R0)

Bảng số liệu và tập tính dùng cho `creatures/*.ts`. Tỉ lệ được ghi theo phần **tổng chiều dài (TL)**, nhìn từ trên xuống. Những giá trị ghi "tuning" là do mình chọn cho đẹp mắt, không phải đo đạc; còn lại đều có nguồn ở cuối file.

## Kích thước thật (dùng cho `realLength`)

| Loài                                                               | Chọn (m)                            | Khoảng                                             | Nguồn                   |
| ------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------- | ----------------------- |
| koi                                                                | 0.75                                | 0.6–0.9 (tuning; không tìm được số đo cm đáng tin) | —                       |
| bottlenose                                                         | 3.0                                 | 2–4                                                | [1]                     |
| orca                                                               | 7.0                                 | cái ≤ 7.7, đực ≤ 9                                 | [2]                     |
| humpback                                                           | 14                                  | 12–16                                              | [3]                     |
| classic (cá mập trắng)                                             | 5                                   | 4–6                                                | tham khảo chung         |
| hammerhead / greathammer / tiger / mako / thresher / nurse / zebra | 3.5 / 5 / 3.8 / 3.5 / 5 / 2.8 / 2.3 | —                                                  | tham khảo chung, tuning |

## Hình dạng nhìn từ trên xuống

- **Humpback:** vây ngực dài **25–33% TL** [3][4]. Chọn 0.30. Vây màu trắng, mép trước gồ ghề.
- **Great hammerhead:** đầu búa rộng **23–27% TL** [5]. Code hiện có `head.span = 0.21` là _nửa_ sải, tức cả sải là 0.42 TL, rộng gần gấp đôi thực tế. Đây là ghi chú cho đợt sau; **không sửa ở v2** vì scope guard (§3) cấm đổi 8 loài cá mập cũ. Ghi lại để anh quyết.
- **Orca:** vây lưng cao **tới ~2 m** ở con đực [6]. Nhìn từ trên chỉ thấy một gờ mảnh. **Mảng mắt trắng nằm trên và sau mắt**; mắt ở ngay dưới, phía trước mảng [2][6]. Mảng yên ngựa xám nằm sau vây lưng, có kiểu "open" (nhiều đen) và "closed" (nhiều trắng) [2].
- **Bottlenose:** trán dô (melon) rồi tới mỏ ngắn, vây lưng cong hình liềm, đuôi ngang có khía giữa.

## Màu

- **Koi** [7]: kohaku nền trắng, đỏ phủ trên, mép đỏ sắc nét. Sanke là trắng có đỏ, thêm đốm đen. Showa có nền đen, đỏ và trắng phủ trên, mảng đen trùm cả lên đầu (khác với sanke). Tancho chỉ có một chấm đỏ tròn trên đầu, không có đỏ ở chỗ khác. Ogon một màu ánh kim, có ba dạng: vàng yamabuki, bạch kim, cam orenji. Asagi lưng xanh xám có lưới vảy, hông và bụng đỏ, gốc vây ngực đỏ (motoaka).
- **Nước hấp thụ màu:** đỏ mất trước, rồi cam, vàng, lục, lam mất sau cùng [8]. Ta mô phỏng bằng hệ số suy giảm riêng cho từng kênh, `k = [0.9, 0.35, 0.18]` (R, G, B, tuning), áp với `(1 - depth)`.

## Tập tính dùng cho click

- **Orca, carousel** [9][10]: có hai pha, dồn đàn rồi ăn. Pod bao quanh đàn cá trích, ép thành khối và đẩy lên mặt nước, dùng bong bóng, **lật bụng trắng** và đập đuôi để dồn. Lúc ăn, vài con giữ khối cá trong khi con khác **quất đuôi làm choáng** nhiều con một lần rồi ăn từng con. Cú quất đuôi xảy ra trong khoảng 20 m sát mặt nước.
- **Humpback, bubble net** [11]: vào giữa đàn mồi, vừa lượn vòng vừa nhả bong bóng thành bức tường, vòng hẹp dần, cuối cùng **lao thẳng lên, há miệng nuốt**. Không phải lần ăn nào cũng dùng lưới bong bóng. Khi săn cá trích theo nhóm, cả nhóm cùng lao lên một lúc.
- **Thresher, tail-slap** [12]: khi tới gần, cá khép vây ngực để đổi góc thân, làm phần sau thân nâng nhanh và hãm đà lại, rồi **quất đuôi**. Một cú hạ được 2–7 con cá mòi, trung bình ăn 3.5 con mỗi lần.
- **Bottlenose** [13]: đập hoặc hất cá bằng đuôi cho văng lên, và quây mud-ring (đợt 2).
- **Hammerhead:** quét đầu sát đáy để cảm nhận điện, đầu búa lớn ghì mồi. Đây là tập tính đã được mô tả rộng rãi; tham số là tuning.

## Mặt nước

- Vệt sóng Kelvin sau vật thể di chuyển có góc nửa khẩu độ **≈19.47°** (arcsin 1/3). Đây là kết quả kinh điển của thuỷ động lực học.

## Nguồn

1. A-Z Animals, Bottlenose dolphin (dẫn NOAA), https://a-z-animals.com/animals/bottlenose-dolphin/
2. NOAA Ocean Today, Killer Whale Anatomy, https://oceantoday.noaa.gov/killerwhaleanatomy/ ; Species at Risk guide, https://sarguide.speciesatrisk.ca/sites/sarguide.speciesatrisk.ca/files/killer-whale.pdf
3. Megaptera novaeangliae treatment, Plazi, https://treatment.plazi.org/id/84551777ff8b-ffbb-ffc7-06c5f6eff622
4. Alaska Dept. of Fish and Game, humpback whale, https://adfg.alaska.gov/static/education/wns/humpback_whale.pdf ; NPS, https://www.nps.gov/places/humpback-whale.htm
5. FAO species catalogue, Sphyrna mokarran, https://fao.org/docrep/pdf/009/ad123e/ad123e35.pdf ; https://en.wikipedia.org/wiki/Great_hammerhead
6. Orca Research Trust ID chart, https://2025.orcaresearch.org/wp-content/uploads/2025/01/20200608-IDCHART-FINAL-web.pdf
7. Play It Koi, koi varieties, https://playitkoi.com/pages/koi-varieties ; All Pond Solutions, https://www.allpondsolutions.co.uk/fishkeeping-advice/koi-varieties-a-beginners-guide.html
8. Adorama, Underwater light, https://www.adorama.com/alc/Underwater-Light-Get-Rid-Of-The-Blues/
9. Carousel feeding, https://en.wikipedia.org/wiki/Carousel_feeding
10. National Geographic, orcas cooperative hunting, https://www.nationalgeographic.com/magazine/article/orcas-feeding-cooperative-hunting-killer-whales
11. NPR 2024, humpback bubble nets, https://www.npr.org/2024/09/06/nx-s1-5087900/humpback-whales-krill-bubble-net-feeding
12. Oliver et al. 2013, PLoS ONE 8(7): e67380, https://doaj.org/article/a73bd7e23c5c4a2599140555e1dce35d
13. National Geographic, bottlenose dolphin, https://on.natgeo.com/3ek9ph5
