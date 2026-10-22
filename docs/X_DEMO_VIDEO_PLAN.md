# Kế hoạch video demo ASCII Ocean trên X

Mục tiêu: một bài đăng trên X cho thấy hai điều có thật.

1. **Sản phẩm:** một đại dương vẽ hoàn toàn bằng ký tự ASCII, với 12 loài.
2. **Cách làm:** Claude Opus 5.5 điều phối một nhóm Haiku agent (coder, reviewer, tester), còn bạn review bằng mắt và góp ý từng vòng.

Nguyên tắc: **mọi cảnh đều là footage thật** của site, của terminal và của git log. Không dựng cảnh giả, không nói quá. Những bài "Opus 5.5 build X" được chia sẻ nhiều thường là vì họ cho thấy quy trình thật, kể cả những lần agent làm sai rồi sửa lại.

---

## 1. Thông số X cần nhớ

- **Độ dài:** tài khoản thường tối đa 2:20 (140 s) và 512 MB. Premium cho phép video dài hơn nhiều.
- **Định dạng:** MP4 (H.264), 30 hoặc 60 fps.
  - Ngang: 1920×1080 hoặc 1280×720.
  - Vuông: 1080×1080. Khung vuông chiếm nhiều chỗ hơn trên feed điện thoại.
- **Tự phát không tiếng:** chữ trên màn hình và phụ đề là bắt buộc. Nhạc chỉ là phần thêm.
- **Ba giây đầu quyết định** người xem có dừng lại hay không. Frame đầu tiên cũng là thumbnail.
- **ASCII bị nén rất xấu:** glyph nhỏ chuyển động liên tục sẽ thành nhòe.
  - Quay ở cỡ cell lớn hơn bình thường (font 16–20 px thay vì 10–12).
  - Xuất với bitrate cao (≥ 12 Mbps cho 1080p).
  - Tránh cảnh toàn màn hình có quá nhiều ký tự nhỏ.

## 2. Ba kịch bản

### A. Video chính, 45–60 s, 16:9 (bản 1:1 cắt lại từ đó)

| Thời gian | Hình                                                                                                                                                                              | Chữ trên màn hình                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0–3 s     | Toàn màn hình: đàn orca bơi qua mặt biển tối, có tia nắng lấp lánh. Không có UI.                                                                                                  | "Every animal here is made of text."                           |
| 3–8 s     | Zoom chậm vào thân một con cá mập cho tới khi thấy rõ từng ký tự `%S8X`.                                                                                                          | "No sprites. No SVG. Just characters."                         |
| 8–22 s    | Lần lượt từng loài trong section species của docs, mỗi loài khoảng 1 s, có nhãn tên. Cuối cảnh là hồ koi với lá súng.                                                             | "12 species · real proportions"                                |
| 22–30 s   | So sánh trước/sau mặt biển, chia đôi màn hình: bản R19 trông như tấm lưới, bản R20 có sóng swell thật.                                                                            | "v1: looked like a net → v2: researched real ocean optics"     |
| 30–45 s   | Timelapse terminal Claude Code ở tốc độ ×10–×20: Opus viết spec, spawn Haiku coder, reviewer và tester, test chạy "246 pass". Thêm góp ý tiếng Việt của bạn kèm phụ đề tiếng Anh. | "Opus 5.5 ran a team of Haiku agents. I reviewed every round." |
| 45–52 s   | Trang chủ portfolio: chế độ theme, bật tắt dark/light.                                                                                                                            | "Ships as a shadcn registry component"                         |
| 52–60 s   | Lệnh `npx shadcn@latest add https://www.huanngdev.site/r/ascii-ocean.json` và link.                                                                                               | handle và link                                                 |

### B. Thread 5 clip, mỗi clip 8–15 s, đăng nối tiếp

1. **Hook:** cảnh orca và mặt biển (giống 0–8 s của bản A).
2. **Trước/sau mặt biển:** kèm 2–3 câu về nghiên cứu: phổ sóng Phillips, sun glitter của Cox–Munk, vệt gió Langmuir.
3. **Hồ koi:** lá súng, bèo tấm, hoa trắng; koi bơi luồn dưới lá.
4. **Quy trình agent:** timelapse terminal, rồi `git log --oneline` của nhánh này.
5. **Cài đặt:** lệnh shadcn, link docs, link repo.

### C. Build log dài, ≤ 2:20, dành cho người làm dev

Kể theo các vòng R12 → R21. Mỗi vòng gồm một câu góp ý thật của bạn, cách agent hiểu nó, và kết quả.

- Có cả những lần làm sai, ví dụ cá orca lật bụng đột ngột và mặt biển trông như tấm lưới. Đó là phần chân thật nhất.
- Kết thúc bằng quyết định gỡ phần nhảy và đớp mồi để giữ cho việc bơi ổn định. Chọn bỏ bớt cũng là một quyết định kỹ thuật đáng kể.

**Thứ tự nên đăng:** A trước, B làm reply thread ngay dưới A, còn C để vài ngày sau làm bài thứ hai.

## 3. Công cụ

### Quay

- **Screen Studio** (macOS, mua một lần): tự zoom theo click, con trỏ mượt, quay ở độ phân giải retina. Phù hợp nhất để quay site và terminal.
- **Cap** (miễn phí, mã nguồn mở): thay thế cho Screen Studio nếu không muốn trả tiền.
- **Playwright `recordVideo`:** repo đã có sẵn script. Dùng khi cần cảnh lặp lại y hệt với cùng `seed`, nhưng chất lượng chỉ dùng làm nháp.
- **Trang quay riêng (nên làm trước khi quay):** `/dev/ascii-ocean/film?species=…&seed=…&cell=18`. Trang không có header, khung 1920×1080 cố định, cell to. Có seed thì quay lại bao nhiêu lần cũng ra đúng một cảnh.

### Terminal

- Quay phiên Claude Code thật bằng Screen Studio, rồi tăng tốc khi dựng.
- **VHS** (charmbracelet) chỉ dùng cho cảnh terminal có kịch bản, như cảnh lệnh cài đặt. Đừng dùng nó để giả lập phiên agent.

### Dựng

- **CapCut** (desktop): nhanh, tự tạo phụ đề, dễ cắt bản 1:1. Hợp nếu muốn ra video sớm.
- **Remotion** (React): dựng video bằng code, dùng đúng font Geist và màu của site. Có thể render trực tiếp component AsciiOcean vào video với seed cố định. Tốn công hơn nhưng nhất quán với thương hiệu và dùng lại được cho các component sau.
- **Descript:** tiện nếu định có giọng đọc, vì sửa video bằng cách sửa transcript.

### Âm thanh

- Nhạc ambient nhẹ không bản quyền, ví dụ YouTube Audio Library hoặc Artlist.
- Thêm tiếng sóng rất nhỏ nếu muốn. Video phải xem được khi tắt tiếng.

### Trên X

- **Typefully:** soạn thread, xem trước, hẹn giờ, xem analytics từng bài.
- **X Pro (TweetDeck):** theo dõi reply và mention trong vài giờ đầu sau khi đăng.
- **X Analytics:** so sánh lượt xem, tỉ lệ xem hết video và profile click giữa A và B.
- **Communities:** "Build in Public" và các cộng đồng về shadcn/ui, Next.js, creative coding.
- **Premium:** chỉ cần nếu muốn đăng bản C dài hơn 2:20 hoặc muốn sửa bài sau khi đăng.

## 4. Chuẩn bị trước khi quay

1. **Giữ lại ảnh trước/sau mặt biển.** Bản R19 không có trong commit nào. Ảnh hiện chỉ nằm trong thư mục tạm của phiên này và sẽ bị xóa:
   - trước: `/private/tmp/claude-501/-Users-huanngdev-Documents-dev-me/a7e089f5-2534-4b0a-907c-3e6dde59e756/scratchpad/browser/shots/r19/`
   - sau: `/private/tmp/claude-501/-Users-huanngdev-Documents-dev-me/a7e089f5-2534-4b0a-907c-3e6dde59e756/scratchpad/browser/shots/r20/`

   Hãy chép hai thư mục này ra chỗ khác nếu muốn dùng.

2. Làm trang `film` như mục 3. Đây là một PR nhỏ.
3. Chọn sẵn seed cho từng cảnh: xem thử vài seed rồi ghi lại seed đẹp nhất.
4. Lấy 3–5 câu góp ý thật của bạn trong quá trình làm, dịch sang tiếng Anh để làm phụ đề.
5. Viết caption cho bài đăng, ví dụ:

   > I asked Claude Opus 5.5 to build an ocean out of ASCII.
   > It ran a team of Haiku agents — coder, reviewer, testers — and I reviewed every round.
   > 12 species, real proportions, a sea surface built from actual ocean optics.
   > Install it as a shadcn component ↓

6. Quay thử 10 s, đăng ở chế độ riêng tư hoặc lên tài khoản phụ để xem mức nén thật, rồi chỉnh cỡ cell và bitrate.

## 5. Checklist khi đăng

- [ ] Frame đầu tiên đẹp, có chữ hook.
- [ ] Có phụ đề hoặc chữ trên màn hình ở mọi cảnh.
- [ ] Có bản 1:1 cho điện thoại.
- [ ] Link nằm trong reply đầu tiên, không đặt ở bài chính, vì X thường giảm hiển thị bài có link ngoài.
- [ ] Ghim bài lên profile.
- [ ] Ở lại trả lời comment trong 1–2 giờ đầu.
