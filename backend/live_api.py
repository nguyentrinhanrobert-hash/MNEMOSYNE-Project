import os
import json
import base64
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types

live_router = APIRouter()

@live_router.websocket("/api/live")
async def live_voice_endpoint(websocket: WebSocket):
    await websocket.accept()
    api_key = os.getenv("GEMINI_API_KEY")
    live_model = os.getenv("GEMINI_LIVE_MODEL", "gemini-2.5-flash-native-audio-preview-09-2025")

    if not api_key:
        await websocket.send_json({"type": "error", "message": "Thiếu GEMINI_API_KEY trên server."})
        await websocket.close()
        return

    try:
        init_raw = await websocket.receive_text()
        init_msg = json.loads(init_raw)
        if init_msg.get("type") != "start":
            await websocket.send_json({"type": "error", "message": "Gói khởi tạo phải có type='start'."})
            await websocket.close()
            return

        current_formula = init_msg.get("current_formula", {})
        system_instruction = (
            "Bạn là MNEMOSYNE, chuyên gia tư vấn điều chế nước hoa mùa thu bằng tiếng Việt. "
            "Hãy trò chuyện tự nhiên, ấm áp, ngắn gọn và giàu cảm xúc về ký ức mùi hương. "
            f"Công thức hiện tại của người dùng trên bàn pha chế (%): {json.dumps(current_formula, ensure_ascii=False)}. "
            "Lưu ý: Bạn chỉ tư vấn và gợi ý điều chỉnh bằng lời nói, không tự ý thay đổi số liệu trên giao diện."
        )

        client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction=types.Content(
                parts=[types.Part.from_text(text=system_instruction)]
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
        )

        async with client.aio.live.connect(model=live_model, config=config) as session:
            await websocket.send_json({"type": "ready"})

            async def receive_from_client():
                try:
                    while True:
                        raw = await websocket.receive_text()
                        msg = json.loads(raw)
                        if msg.get("type") == "audio" and msg.get("data"):
                            pcm_bytes = base64.b64decode(msg["data"])
                            await session.send(
                                input={"data": pcm_bytes, "mime_type": "audio/pcm;rate=16000"},
                                end_of_turn=False
                            )
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    print(f"[Live Client Error] {e}", flush=True)
                    try:
                        await websocket.send_json({"type": "error", "message": f"Lỗi gửi âm thanh: {e}"})
                    except Exception:
                        pass

            async def receive_from_gemini():
                try:
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content:
                            if server_content.interrupted:
                                await websocket.send_json({"type": "interrupted"})
                            
                            # Gửi phụ đề giọng nói của AI về Frontend
                            if getattr(server_content, "output_transcription", None) and server_content.output_transcription.text:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "role": "assistant",
                                    "text": server_content.output_transcription.text
                                })

                            # Gửi phụ đề giọng nói của người dùng về Frontend
                            if getattr(server_content, "input_transcription", None) and server_content.input_transcription.text:
                                await websocket.send_json({
                                    "type": "transcript",
                                    "role": "user",
                                    "text": server_content.input_transcription.text
                                })

                            if server_content.model_turn:
                                for part in server_content.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        b64_audio = base64.b64encode(part.inline_data.data).decode("utf-8")
                                        await websocket.send_json({
                                            "type": "audio",
                                            "data": b64_audio,
                                            "sample_rate": 24000
                                        })
                                    elif getattr(part, "text", None):
                                        await websocket.send_json({
                                            "type": "transcript",
                                            "role": "assistant",
                                            "text": part.text
                                        })

                            if server_content.turn_complete:
                                await websocket.send_json({"type": "turn_complete"})
                except Exception as e:
                    print(f"[Live Gemini Error] {e}", flush=True)
                    try:
                        await websocket.send_json({"type": "error", "message": f"Lỗi Gemini Live: {e}"})
                    except Exception:
                        pass

            tasks = [
                asyncio.create_task(receive_from_client()),
                asyncio.create_task(receive_from_gemini()),
            ]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()

    except WebSocketDisconnect:
        print("[Live] Client ngắt kết nối.", flush=True)
    except Exception as e:
        print(f"[Live Session Error] {e}", flush=True)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass