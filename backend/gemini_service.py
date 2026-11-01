import json
import os
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types

# Định nghĩa Schema dạng dict chuẩn cho Gemini API
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "reply": {
            "type": "STRING",
            "description": "Lời tư vấn tiếng Việt mang sắc thái ấm áp, tinh tế, phù hợp chủ đề mùa thu."
        },
        "proposed_formula": {
            "type": "OBJECT",
            "nullable": True,
            "description": "Công thức đề xuất gồm 8 nguyên liệu (%): Bergamot, White Tea, Green Apple, Lavender, Geranium, Sandalwood accord, Vanilla accord, Ethanol.",
            "properties": {
                "Bergamot": {"type": "NUMBER"},
                "White Tea": {"type": "NUMBER"},
                "Green Apple": {"type": "NUMBER"},
                "Lavender": {"type": "NUMBER"},
                "Geranium": {"type": "NUMBER"},
                "Sandalwood accord": {"type": "NUMBER"},
                "Vanilla accord": {"type": "NUMBER"},
                "Ethanol": {"type": "NUMBER"}
            },
            "required": [
                "Bergamot", "White Tea", "Green Apple", "Lavender", 
                "Geranium", "Sandalwood accord", "Vanilla accord", "Ethanol"
            ]
        }
    },
    "required": ["reply"]
}

SYSTEM_PROMPT = """Bạn là MNEMOSYNE - trợ lý điều chế nước hoa trí tuệ nhân tạo thuộc xưởng điều hương "AUTUMN, ARCHIVED.".
Tông giọng: Ấm áp, tinh tế, sâu lắng, đậm chất thơ mùa thu nhưng tuân thủ kỹ thuật chính xác.

NGUYÊN TẮC QUAN TRỌNG VỀ CÔNG THỨC:
1. Bạn CHỈ ĐƯỢC DÙNG ĐÚNG 8 nguyên liệu sau:
   - Bergamot (Tầng Đầu - Citrus)
   - Green Apple (Tầng Đầu - Fruity)
   - White Tea (Tầng Giữa - Aromatic)
   - Lavender (Tầng Giữa - Aromatic)
   - Geranium (Tầng Giữa - Floral)
   - Sandalwood accord (Tầng Cuối - Woody)
   - Vanilla accord (Tầng Cuối - Amber)
   - Ethanol (Dung môi)

2. RÀNG BUỘC PHẦN TRĂM BẮT BUỘC:
   - Ethanol LUÔN LUÔN BẰNG ĐÚNG 80.0
   - Tổng 7 nguyên liệu tạo hương CÓ TỔNG CỘNG BẰNG ĐÚNG 20.0
   - TỔNG CẢ CÔNG THỨC BẰNG ĐÚNG 100.0

3. KHI NÀO TRẢ VỀ proposed_formula:
   - Nếu người dùng yêu cầu điều chỉnh mùi hương (ví dụ: "thêm hương gỗ", "bớt ngọt"), hãy tính toán tỉ lệ mới và trả về proposed_formula đủ 8 nguyên liệu.
   - Nếu người dùng chỉ chào hỏi hoặc trò chuyện không cần đổi công thức, hãy đặt proposed_formula là null.
"""

class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("Thiếu GEMINI_API_KEY trong biến môi trường (.env)")
        self.client = genai.Client(api_key=api_key)
        self.model_name = "gemini-3.8-flash"

    def generate_chat_response(
        self, 
        message: str, 
        history: List[Dict[str, str]], 
        current_formula: Dict[str, float]
    ) -> Dict[str, Any]:
        
        history_text = ""
        for h in history:
            role = "Người dùng" if h.get("role") == "user" else "MNEMOSYNE"
            history_text += f"{role}: {h.get('content')}\n"

        user_prompt = f"""LỊCH SỬ TRÒ CHUYỆN:
{history_text}

CÔNG THỨC HIỆN TẠI TRÊN THE ATELIER (%):
{json.dumps(current_formula, ensure_ascii=False, indent=2)}

YÊU CẦU MỚI CỦA NGUỜI DÙNG:
"{message}"

Hãy đưa ra lời tư vấn và công thức đề xuất (nếu cần điều chỉnh).
"""

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=user_prompt,
            config = types.GenerateContentConfig(
    system_instruction=SYSTEM_PROMPT,
    response_mime_type="application/json",
    response_schema=RESPONSE_SCHEMA,
    temperature=0.7,
    max_output_tokens=350,  # <-- THÊM DÒNG NÀY VÀO ĐÂY
)
        )

        return json.loads(response.text)