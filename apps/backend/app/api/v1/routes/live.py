from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.websocket_manager import ConnectionManager

router = APIRouter()
manager = ConnectionManager()


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            await manager.broadcast(f"Realtime event: {message}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
