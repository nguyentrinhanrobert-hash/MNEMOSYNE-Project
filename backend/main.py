import os
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from validator import validate_formula
from gemini_service import GeminiService

load_dotenv()

app = FastAPI(title="MNEMOSYNE Backend API", version="1.0.0")

# Cấu hình CORS cho phép Frontend truy cập
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    gemini_service = GeminiService()
except Exception as e:
    print(f"[CẢNH BÁO] Chưa thể khởi tạo Gemini Service: {e}")
    gemini_service = None

class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, Any]] = []
    current_formula: Dict[str, float]

class ChatResponse(BaseModel):
    reply: str
    proposed_formula: Optional[Dict[str, float]] = None
    valid: bool = True
    errors: List[str] = []
    limits_verified: bool = False

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    if not gemini_service:
        raise HTTPException(
            status_code=500, 
            detail="Backend chưa cấu hình GEMINI_API_KEY trong file .env!"
        )

    try:
        # 1. Gọi Gemini API
        ai_result = gemini_service.generate_chat_response(
            message=req.message,
            history=req.history,
            current_formula=req.current_formula
        )

        reply = ai_result.get("reply", "Đã nhận được yêu cầu của bạn.")
        proposed_formula = ai_result.get("proposed_formula")

        # 2. Kiểm tra tính hợp lệ của công thức do AI đề xuất
        if proposed_formula is not None:
            is_valid, errors = validate_formula(proposed_formula)
        else:
            is_valid = True
            errors = []

        # 3. Trả về đúng cấu trúc JSON Frontend yêu cầu
        return ChatResponse(
            reply=reply,
            proposed_formula=proposed_formula,
            valid=is_valid,
            errors=errors,
            limits_verified=False
        )

    except Exception as e:
        return ChatResponse(
            reply=f"Rất tiếc, đã xảy ra lỗi kết nối với MNEMOSYNE ({str(e)}).",
            proposed_formula=None,
            valid=False,
            errors=[str(e)],
            limits_verified=False
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)