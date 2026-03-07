# Plan tối ưu UI/UX cho Modern War

## 1. Mục tiêu

- Game phải luôn nằm trong một viewport cố định, không phát sinh page scroll hoặc horizontal scroll trong lúc chơi.
- Battlefield là vùng nhận tập trung chính; HUD chỉ hỗ trợ quyết định và điều khiển, không được tranh diện tích hoặc buộc người chơi đảo mắt liên tục.
- Mọi hành động chính phải dễ hiểu ngay tại thời điểm thao tác: chọn quân, ra lệnh, đặt nhà, train unit, pause, restart.
- UI phải theo mô hình "responsive by compression", không phải "responsive by stacking". Nếu màn hình quá nhỏ cho RTS chuẩn thì ưu tiên compact mode hoặc chặn bằng guard, không chấp nhận xếp dọc rồi kéo scroll.

## 2. Hiện trạng rút ra từ code

### 2.1 Layout hiện tại tự sinh scroll từ tầng gốc

- `body`, `#app`, `.shell` đều dùng `min-height: 100vh`, trong khi `.shell` còn có `padding` và `gap`, nên tổng chiều cao thực tế vượt viewport ngay cả khi nội dung chưa nhiều. Xem `src/style.css:19`, `src/style.css:28`, `src/style.css:32`.
- `.viewport` đang có `min-height: 780px`, nên chỉ riêng `topbar + gap + viewport` đã vượt nhiều màn hình laptop thấp. Xem `src/style.css:94`.
- `board` dùng 3 cột `270px + minmax(760px, 1fr) + 300px`, nên trên màn hình hẹp dễ sinh horizontal overflow trước khi tới breakpoint. Xem `src/style.css:74`.

### 2.2 Responsive hiện tại đi ngược mục tiêu one-page

- Ở `max-width: 1180px`, toàn bộ `board` bị xếp thành 1 cột, khiến `panel-left`, `viewport`, `panel-right` nằm dọc và gần như chắc chắn phải cuộn trang. Xem `src/style.css:531`.
- Ở `max-width: 760px`, `battle-ribbon` không còn là overlay tuyệt đối mà trở thành block nằm trong flow layout, tiếp tục đẩy canvas xuống. Xem `src/style.css:562`.
- Cách responsive này phù hợp dashboard, không phù hợp game RTS một màn hình.

### 2.3 HUD đang bị lặp và phân mảnh

- Thông tin selection vừa nằm ở panel trái, vừa nằm ở `battle-ribbon`. Xem `src/main.ts:67`, `src/main.ts:92`.
- Trạng thái mode vừa có ở `mode-chip`, vừa có ở `status-line`, và khi build còn bị ghi đè thêm lần nữa bằng chuỗi hướng dẫn khác. Xem `src/main.ts:84`, `src/main.ts:51`, `src/main.ts:597`, `src/main.ts:634`.
- `Forces`, `Selection`, `Production Queue`, `Construction`, `Production`, `tips` đều thường trực, làm mật độ giao diện quá cao so với quy mô gameplay hiện tại.

### 2.4 Feedback điều khiển còn dựa quá nhiều vào text ngoài battlefield

- `BattleScene` đã có selection box, build preview, combat line và range circle, nhưng chưa có cue rõ ràng ngay gần con trỏ hoặc ngay trên selection để người chơi biết mình đang ở mode nào. Xem `src/game/phaser/BattleScene.ts:121`, `src/game/phaser/BattleScene.ts:544`, `src/game/phaser/BattleScene.ts:621`.
- `getModeLabel()` trả về cả câu hướng dẫn dài và đang bị dùng như text thường trực trong HUD. Xem `src/game/controller.ts:496`.
- Khi build/train thành công hoặc thất bại, phản hồi chính vẫn nằm ở panel và queue text, chưa có acknowledgement ngay tại điểm tương tác. Xem `src/main.ts:610`, `src/main.ts:624`, `src/game/controller.ts:318`.

### 2.5 Mental model của command mode chưa đủ tự giải thích

- `A` chỉ arm `attack-move`, nhưng người chơi vẫn phải nhớ right-click để commit. Xem `src/game/phaser/BattleScene.ts:90`, `src/game/controller.ts:256`, `src/game/controller.ts:276`.
- Build dùng left-click để confirm ngay trong mode build, còn right-click/Esc để cancel. Xem `src/game/phaser/BattleScene.ts:121`, `src/game/phaser/BattleScene.ts:185`.
- Right-click còn kiêm luôn move, attack, set rally, cancel build. Tất cả đều hợp lý về logic, nhưng affordance trực quan hiện còn yếu.

### 2.6 Browser scroll vẫn là rủi ro điều khiển

- Code hiện chưa khóa overflow toàn app.
- Code hiện chưa có cơ chế rõ ràng để chặn hành vi scroll mặc định của browser đối với `wheel`, `Space`, `Arrow keys` khi đang active match.
- Đây là điểm phải xử lý triệt để vì người chơi bị trôi trang trong lúc combat là lỗi UX mức nền, không phải lỗi phụ.

## 3. Định hướng target UI

### 3.1 Đích layout

Chuyển từ mô hình "topbar + 2 side panels + ribbon + tips" sang mô hình RTS tập trung battlefield:

- Một top command strip mỏng:
  - Credits, income, timer, pause, restart, battle status.
  - Chỉ hiển thị số liệu thật sự cần nhìn liên tục.
- Một battlefield stage chiếm phần lớn màn hình:
  - Canvas + world-space feedback.
  - Chỉ giữ lại các overlay thật sự chiến thuật.
- Một command deck cố định ở đáy:
  - Cột trái: selection summary.
  - Cột giữa: command/build/train actions theo ngữ cảnh.
  - Cột phải: queue, status ngắn, alert ngắn.

Lý do chọn hướng này:

- Giữ được chiều rộng battlefield tốt hơn 3 cột.
- Cắt bớt chiều cao top chrome.
- Phù hợp thói quen RTS hơn.
- Dễ khóa game vào đúng 1 viewport.

### 3.2 Quy tắc hiển thị thông tin

- Một thông tin chỉ có một nơi thường trực.
- Text hướng dẫn dài không được chiếm vùng cố định; chỉ là hint tạm thời hoặc help overlay.
- Thông tin cấp chiến thuật phải gần battlefield.
- Thông tin cấp hệ thống hoặc meta mới đặt lên top strip.
- Panel phụ như `Forces` hoặc LAN setup phải là secondary UI, không được cạnh tranh với gameplay chính.

### 3.3 Phạm vi hỗ trợ màn hình

- Ưu tiên `desktop/laptop landscape`, mốc thực tế nên lấy tối thiểu khoảng `1280x720`.
- Không stack dọc main layout ở breakpoint hẹp.
- Nếu viewport nhỏ hơn ngưỡng cho phép:
  - hoặc dùng compact HUD,
  - hoặc hiện guard yêu cầu landscape / desktop,
  - nhưng không được sinh page scroll.

## 4. Kế hoạch triển khai theo phase

### Phase 1: Khóa app về một màn hình cố định

Mục tiêu:

- Loại bỏ hoàn toàn page scroll khi đang trong game.

Việc cần làm:

- Đổi toàn bộ root layout sang chiều cao khóa theo viewport thực (`100dvh`).
- Bỏ cơ chế `min-height` cộng dồn ở `body`, `#app`, `.shell`.
- Chuyển shell sang layout có chiều cao tính trước:
  - `top strip`
  - `battlefield stage`
  - `command deck`
- Thêm `overflow: hidden` và `overscroll-behavior: none` ở tầng gốc.
- Không để breakpoint nào đổi main shell thành stack dọc.
- Chặn browser default scroll cho `wheel`, `Space`, `Arrow keys` khi active match.
- Đảm bảo canvas luôn fit vào stage, không làm document dài ra.

File ảnh hưởng khi implement:

- `src/style.css`
- `src/main.ts`
- có thể thêm một lớp state nhỏ cho focus/game-active trong `src/main.ts`

### Phase 2: Tái cấu trúc information architecture

Mục tiêu:

- Giảm số vùng HUD thường trực và bỏ trùng lặp.

Việc cần làm:

- Gộp `battle-ribbon`, `status-line`, một phần `topbar` vào một hệ thống status rõ ràng hơn.
- Bỏ việc hiển thị cùng một dữ liệu ở nhiều nơi:
  - map/meta chỉ còn một chỗ,
  - mode chỉ còn một chỗ thường trực,
  - selection count chỉ còn một chỗ thường trực.
- Đưa `Forces` khỏi trạng thái always-visible:
  - chuyển thành drawer/tab phụ,
  - hoặc compact summary theo icon/count.
- Đưa `tips` khỏi trạng thái always-visible.
- Đổi `HudModel` từ kiểu "một chuỗi dài mô tả tất cả" sang dữ liệu có tầng:
  - `statusLabel` ngắn
  - `statusHint` ngắn
  - `transientAlert`
  - `selectionSummary`
  - `contextActions`

File ảnh hưởng khi implement:

- `src/main.ts`
- `src/game/controller.ts`

### Phase 3: Chuyển command/build/train sang command deck ngữ cảnh

Mục tiêu:

- Người chơi chỉ nhìn thấy đúng thứ mình cần điều khiển ở đúng thời điểm.

Việc cần làm:

- Khi không chọn gì:
  - command deck chỉ hiện quick help ngắn + economy essentials.
- Khi chọn unit:
  - command deck ưu tiên selection info, combat status, lệnh cơ bản.
- Khi chọn building:
  - command deck ưu tiên rally, queue, production actions.
- Khi vào build mode:
  - command deck chuyển sang trạng thái armed rõ ràng, không giữ các panel gây nhiễu.
- Hiển thị lý do disabled ngay trên action card hoặc trong tooltip/hint ngắn:
  - thiếu tiền,
  - thiếu tech,
  - building chưa hoàn thành.
- Build/train thành công phải có acknowledgement ngắn:
  - queue badge,
  - toast ngắn,
  - hoặc pulse ngay trên action card.

File ảnh hưởng khi implement:

- `src/main.ts`
- `src/game/controller.ts`

### Phase 4: Đưa feedback quan trọng vào trong battlefield

Mục tiêu:

- Người chơi không phải rời mắt khỏi chiến trường chỉ để hiểu lệnh vừa ra có đúng không.

Việc cần làm:

- Thêm trạng thái command armed ngay gần con trỏ hoặc gần tâm viewport:
  - `Build: Refinery`
  - `Attack Move`
  - `Rally Point`
- Thêm order marker trên map:
  - move marker,
  - attack marker,
  - rally marker,
  - build placement state rõ hơn.
- Rút gọn `modeLabel` thành trạng thái ngắn và đẩy phần giải thích thành hint tạm thời.
- Với build mode:
  - hiển thị rõ `valid / blocked`
  - hiển thị lý do blocked ngắn ngay trong battlefield, không buộc nhìn qua panel.
- Với combat:
  - giữ range/target line nhưng cần cân nhắc độ đậm và số lượng để không biến thành nhiễu khi chọn nhiều unit.

File ảnh hưởng khi implement:

- `src/game/phaser/BattleScene.ts`
- `src/game/controller.ts`
- `src/main.ts`

### Phase 5: Chuẩn hóa control UX

Mục tiêu:

- Điều khiển dễ học hơn và không gây nhầm mode.

Việc cần làm:

- Chuẩn hóa rule:
  - chọn mode -> nhìn thấy armed state -> click xác nhận -> mode reset rõ ràng.
- Bổ sung help overlay nhỏ mở bằng phím hoặc icon, thay cho `tips` cố định.
- Cân nhắc thêm các điều khiển RTS dễ học hơn:
  - WASD hoặc edge-pan là tùy chọn,
  - phím reset zoom / center rõ ràng,
  - hiển thị control scheme trong pre-game help.
- Khi canvas active, input game phải thắng input scroll của browser.
- Khi overlay mở, input game phải giảm ưu tiên để tránh thao tác nhầm bên dưới.

File ảnh hưởng khi implement:

- `src/game/phaser/BattleScene.ts`
- `src/main.ts`
- `src/style.css`

### Phase 6: Đơn giản hóa pre-game và LAN flow

Mục tiêu:

- Người chơi solo vào trận nhanh nhất có thể.

Việc cần làm:

- Tách CTA `Start Skirmish` thành hành động chính duy nhất.
- Thu gọn LAN setup thành khu vực secondary/collapsible.
- Chỉ hiển thị các field LAN khi người chơi chủ động mở LAN mode.
- Giữ overlay setup gọn, không biến nó thành một form dashboard nhiều trường ngay giữa màn hình.

File ảnh hưởng khi implement:

- `src/main.ts`
- `src/style.css`

## 5. Thứ tự ưu tiên thực tế

Nếu làm theo mức độ tác động UX cao nhất trước, nên đi theo thứ tự này:

1. Phase 1: khóa scroll và fixed-stage layout.
2. Phase 2: bỏ HUD trùng lặp và chốt information hierarchy.
3. Phase 3: command deck ngữ cảnh.
4. Phase 4: feedback ngay trong battlefield.
5. Phase 5: polish controls/help.
6. Phase 6: rút gọn pre-game/LAN.

## 6. Acceptance criteria

### 6.1 One-page / no-scroll

- Ở các mốc `1366x768`, `1440x900`, `1920x1080`, document không có vertical scrollbar và không có horizontal scrollbar trong trạng thái chơi bình thường.
- `wheel`, `Space`, `Arrow keys` không làm browser scroll khi match đang active.
- Không có breakpoint nào chuyển main game shell thành stack dọc.

### 6.2 Focus / visual hierarchy

- Battlefield là vùng lớn nhất và ít bị overlay thường trực nhất.
- Không còn `tips` luôn phủ đáy battlefield.
- Không còn cùng một dữ liệu xuất hiện ở 2-3 vị trí thường trực.
- Người chơi có thể hiểu mode hiện tại chỉ bằng việc nhìn vào vùng gần battlefield và command deck.

### 6.3 Control clarity

- Khi vào build mode hoặc attack-move, UI hiển thị armed state rõ ràng trong dưới 100ms.
- Khi action không thực hiện được, người chơi thấy lý do ngắn ngay tại action đó hoặc gần con trỏ.
- Khi queue/build/order được tạo thành công, người chơi thấy acknowledgement ngắn mà không cần tự rà toàn HUD.

### 6.4 Navigation / setup

- Flow solo vào trận không cần quét qua form LAN.
- Overlay setup và overlay endgame không làm vỡ fixed layout.

## 7. Ghi chú về phạm vi

- Minimap, control groups, remap keys, settings panel chi tiết là các hạng mục tốt nhưng nên để sau khi hoàn tất fixed-stage + contextual HUD.
- Nền tảng gameplay hiện tại đã đủ để nâng UX mà chưa cần động mạnh tới simulation. Trọng tâm nên là `main.ts`, `style.css`, `controller.ts`, `BattleScene.ts`.
- Nếu chỉ sửa CSS mà không đổi information architecture, kết quả sẽ vẫn là "dashboard đẹp hơn" chứ chưa thành RTS UI tập trung.
