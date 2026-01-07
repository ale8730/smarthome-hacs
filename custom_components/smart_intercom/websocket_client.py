"""WebSocket client for SmartIntercom communication."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

import websockets
from websockets.client import WebSocketClientProtocol

from .const import (
    AUDIO_CHUNK_SIZE,
    CMD_AUTH,
    MSG_AUTH_FAILED,
    MSG_AUTH_REQUIRED,
    MSG_AUTH_SUCCESS,
)

_LOGGER = logging.getLogger(__name__)


class SmartIntercomClient:
    """WebSocket client for SmartIntercom ESP32 device."""

    def __init__(
        self,
        host: str,
        port: int,
        secret_key: str,
        on_message: Callable[[dict], None] | None = None,
        on_audio: Callable[[bytes], None] | None = None,
        on_disconnect: Callable[[], None] | None = None,
        on_connect: Callable[[], None] | None = None,
    ) -> None:
        """Initialize the WebSocket client."""
        self._host = host
        self._port = port
        self._secret_key = secret_key
        self._ws: WebSocketClientProtocol | None = None
        self._connected = False
        self._authenticated = False
        self._listen_task: asyncio.Task | None = None
        self._reconnect_task: asyncio.Task | None = None
        self._should_reconnect = True
        
        # Callbacks
        self.on_message = on_message
        self.on_audio = on_audio
        self.on_disconnect = on_disconnect
        self.on_connect = on_connect

    @property
    def connected(self) -> bool:
        """Return True if connected and authenticated."""
        return self._connected and self._authenticated

    @property
    def ws_url(self) -> str:
        """Return the WebSocket URL."""
        return f"ws://{self._host}:{self._port}/audio_stream"

    async def connect(self) -> bool:
        """Connect to the WebSocket server."""
        try:
            _LOGGER.debug("Connecting to %s", self.ws_url)
            self._ws = await websockets.connect(
                self.ws_url,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5,
            )
            self._connected = True
            _LOGGER.info("Connected to SmartIntercom at %s", self.ws_url)
            
            # Start listening for messages
            self._listen_task = asyncio.create_task(self._listen_loop())
            return True
            
        except Exception as err:
            _LOGGER.error("Failed to connect to SmartIntercom: %s", err)
            self._connected = False
            return False

    async def disconnect(self) -> None:
        """Disconnect from the WebSocket server."""
        self._should_reconnect = False
        
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
            self._listen_task = None
        
        if self._reconnect_task:
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
            self._reconnect_task = None
        
        if self._ws:
            await self._ws.close()
            self._ws = None
        
        self._connected = False
        self._authenticated = False
        _LOGGER.info("Disconnected from SmartIntercom")

    async def send_command(self, cmd: str, **kwargs: Any) -> bool:
        """Send a JSON command to the device."""
        if not self._ws or not self.connected:
            _LOGGER.warning("Cannot send command: not connected")
            return False
        
        try:
            import json
            message = {"cmd": cmd, **kwargs}
            await self._ws.send(json.dumps(message))
            _LOGGER.debug("Sent command: %s", message)
            return True
        except Exception as err:
            _LOGGER.error("Failed to send command: %s", err)
            return False

    async def send_audio(self, data: bytes) -> bool:
        """Send binary audio data to the device."""
        if not self._ws or not self.connected:
            return False
        
        try:
            # Send in chunks if necessary
            for i in range(0, len(data), AUDIO_CHUNK_SIZE):
                chunk = data[i:i + AUDIO_CHUNK_SIZE]
                await self._ws.send(chunk)
            return True
        except Exception as err:
            _LOGGER.error("Failed to send audio: %s", err)
            return False

    async def _listen_loop(self) -> None:
        """Listen for incoming WebSocket messages."""
        import json
        
        try:
            async for message in self._ws:
                if isinstance(message, str):
                    # JSON text message
                    try:
                        data = json.loads(message)
                        await self._handle_json_message(data)
                    except json.JSONDecodeError:
                        _LOGGER.warning("Received invalid JSON: %s", message)
                elif isinstance(message, bytes):
                    # Binary audio data
                    if self.on_audio:
                        self.on_audio(message)
                        
        except websockets.ConnectionClosed:
            _LOGGER.warning("WebSocket connection closed")
        except Exception as err:
            _LOGGER.error("Error in listen loop: %s", err)
        finally:
            self._connected = False
            self._authenticated = False
            if self.on_disconnect:
                self.on_disconnect()
            
            # Attempt reconnection
            if self._should_reconnect:
                self._reconnect_task = asyncio.create_task(self._reconnect())

    async def _handle_json_message(self, data: dict) -> None:
        """Handle incoming JSON messages."""
        msg_type = data.get("type", "")
        
        if msg_type == MSG_AUTH_REQUIRED:
            _LOGGER.debug("Authentication required, sending key")
            await self._authenticate()
        elif msg_type == MSG_AUTH_SUCCESS:
            _LOGGER.info("Authentication successful")
            self._authenticated = True
            if self.on_connect:
                self.on_connect()
        elif msg_type == MSG_AUTH_FAILED:
            _LOGGER.error("Authentication failed")
            self._authenticated = False
            await self.disconnect()
        else:
            # Forward other messages to callback
            if self.on_message:
                self.on_message(data)

    async def _authenticate(self) -> None:
        """Send authentication message."""
        if self._ws and self._secret_key:
            import json
            auth_msg = {"cmd": CMD_AUTH, "key": self._secret_key}
            await self._ws.send(json.dumps(auth_msg))

    async def _reconnect(self) -> None:
        """Attempt to reconnect after disconnection."""
        retry_delay = 5
        max_delay = 60
        
        while self._should_reconnect and not self._connected:
            _LOGGER.info("Attempting to reconnect in %d seconds...", retry_delay)
            await asyncio.sleep(retry_delay)
            
            if await self.connect():
                break
            
            retry_delay = min(retry_delay * 2, max_delay)
