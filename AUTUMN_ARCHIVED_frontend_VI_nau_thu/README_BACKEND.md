# AUTUMN, ARCHIVED. — Frontend bàn giao để kết nối Gemini

## Chạy frontend
Cần Python 3 (chỉ để chạy web server tĩnh):
```bash
cd AUTUMN_ARCHIVED_frontend
python -m http.server 5500
```
Mở `http://localhost:5500` trong trình duyệt. Cần internet để tải React, Babel và font từ CDN. **Không mở `index.html` trực tiếp bằng `file://`** vì trình duyệt sẽ chặn đọc JSON.

## Dữ liệu chính
- `data/du_lieu_goc.xlsx`: **bản Excel gốc người dùng cung cấp**.
- `data/perfume_data.json`: dữ liệu được trích xuất từ Excel; frontend dùng file này, không hardcode công thức.
- Bao gồm: 8 nguyên liệu, THU-A/B/C, FINAL và điểm tổng hợp cảm quan từ DASHBOARD.
- Cột `Giới hạn GV(%)` đang trống nên `limits_verified=false`. Không được tuyên bố công thức an toàn.
- Các giá trị trong JSON là **điểm phần trăm** (ví dụ 1.25), trong Excel là dạng số thập phân (0.0125).

## Hợp đồng API cần backend triển khai
Frontend mặc định gọi `http://localhost:8000/api/chat`. Có thể thay URL bằng cách đặt `window.MNEMOSYNE_API_BASE` **trước khi tải app.jsx** trong `index.html`.

`POST /api/chat` request:
```json
{
  "message":"Mình muốn hương gỗ rõ hơn",
  "history":[{"role":"assistant","content":"Chào bạn..."}],
  "current_formula":{"Bergamot":1.25,"Green Apple":2.5,"White Tea":6.25,"Lavender":1.25,"Geranium":2.5,"Sandalwood accord":5,"Vanilla accord":1.25,"Ethanol":80}
}
```
Response:
```json
{
  "reply":"Mình đề xuất tăng nhẹ Sandalwood accord...",
  "proposed_formula":{"Bergamot":1.25,"Green Apple":2.5,"White Tea":5.75,"Lavender":1.25,"Geranium":2.5,"Sandalwood accord":5.5,"Vanilla accord":1.25,"Ethanol":80},
  "valid":true,
  "errors":[],
  "limits_verified":false
}
```
Nếu không có công thức mới, đặt `proposed_formula: null`. Nếu công thức sai, `valid: false` và giải thích ở `errors`.

**CORS**: Cho phép origin `http://localhost:5500`.
**API key**: Chỉ ở backend, tuyệt đối không đưa vào frontend.
**History**: Frontend gửi các tin nhắn user/assistant; backend dùng lịch sử để giữ ngữ cảnh.
**Lưu ý**: Nếu API chưa chạy hoặc lỗi, frontend tự chuyển sang **DEMO** và gắn nhãn rõ ràng. Demo không gọi Gemini.

## File chính
- `index.html`: entry point, React/Babel CDN.
- `styles.css`: dark-academia responsive styling.
- `app.jsx`: React chat, API call, mock fallback, kiểm tra công thức, thanh trượt, CSV.
- `data/perfume_data.json`: dữ liệu đã trích xuất từ Excel.
- `data/du_lieu_goc.xlsx`: Excel nguồn.

## Checklist khi ghép
1. Chạy frontend và backend riêng; kiểm tra request `POST /api/chat` trong Network tab.
2. Kiểm tra tên nguyên liệu phải khớp chính xác JSON.
3. AI trả lời tiếng Việt, dùng lịch sử chat, chỉ dùng 8 thành phần hiện có.
4. Chỉ cho áp dụng công thức khi `valid` của backend **và** kiểm tra frontend đều đúng.
5. Thử API mất mạng, trả lỗi, công thức tổng 99%, nguyên liệu lạ, phần trăm âm.
6. Không thay đổi dữ liệu gốc Excel nếu chưa được nhóm đồng ý.

## Ghi chú
Frontend là bản demo tích hợp sẵn; chưa có backend/Gemini API trong gói này. React dùng CDN/Babel để dễ chạy và bàn giao, phù hợp trình diễn học đường. Khi triển khai chính thức có thể chuyển sang Vite để build production.


## Giao diện tiếng Việt / bảng màu
Phiên bản này đã Việt hóa các nhãn giao diện và đổi sang tông nâu hổ phách theo file `index(1).html` người dùng cung cấp. Không thay đổi hợp đồng `/api/chat` hay dữ liệu Excel. Chạy bằng `python3 -m http.server 5500` trong thư mục này rồi mở `http://localhost:5500`.
