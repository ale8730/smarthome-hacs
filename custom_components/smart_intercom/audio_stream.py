"""Audio streaming utilities for SmartIntercom."""
from __future__ import annotations

import asyncio
import io
import logging
import struct
import wave
from typing import AsyncGenerator

from aiohttp import web

from .const import AUDIO_BITS, AUDIO_CHANNELS, AUDIO_CHUNK_SIZE, AUDIO_SAMPLE_RATE

_LOGGER = logging.getLogger(__name__)


class AudioStreamManager:
    """Manages audio streaming between ESP32 and Home Assistant."""

    def __init__(self, coordinator) -> None:
        """Initialize the audio stream manager."""
        self.coordinator = coordinator
        self._audio_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=100)
        self._streaming = False

    def on_audio_data(self, data: bytes) -> None:
        """Handle incoming audio data from ESP32."""
        if self._streaming:
            try:
                self._audio_queue.put_nowait(data)
            except asyncio.QueueFull:
                # Drop oldest data if queue is full
                try:
                    self._audio_queue.get_nowait()
                    self._audio_queue.put_nowait(data)
                except asyncio.QueueEmpty:
                    pass

    async def get_audio_chunk(self, timeout: float = 1.0) -> bytes | None:
        """Get a chunk of audio data."""
        try:
            return await asyncio.wait_for(self._audio_queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    def start_streaming(self) -> None:
        """Start accepting audio data."""
        self._streaming = True
        # Clear any old data
        while not self._audio_queue.empty():
            try:
                self._audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def stop_streaming(self) -> None:
        """Stop accepting audio data."""
        self._streaming = False

    @property
    def is_streaming(self) -> bool:
        """Return True if streaming is active."""
        return self._streaming


def pcm_to_wav_header(num_samples: int = 0) -> bytes:
    """Generate a WAV header for PCM audio data."""
    # For streaming, we use a placeholder size or calculate based on samples
    data_size = num_samples * AUDIO_CHANNELS * (AUDIO_BITS // 8)
    
    # If streaming (unknown size), use max value
    if num_samples == 0:
        data_size = 0xFFFFFFFF - 36
    
    header = io.BytesIO()
    
    # RIFF header
    header.write(b"RIFF")
    header.write(struct.pack("<I", data_size + 36))  # File size - 8
    header.write(b"WAVE")
    
    # fmt chunk
    header.write(b"fmt ")
    header.write(struct.pack("<I", 16))  # Chunk size
    header.write(struct.pack("<H", 1))   # Audio format (PCM)
    header.write(struct.pack("<H", AUDIO_CHANNELS))
    header.write(struct.pack("<I", AUDIO_SAMPLE_RATE))
    header.write(struct.pack("<I", AUDIO_SAMPLE_RATE * AUDIO_CHANNELS * (AUDIO_BITS // 8)))  # Byte rate
    header.write(struct.pack("<H", AUDIO_CHANNELS * (AUDIO_BITS // 8)))  # Block align
    header.write(struct.pack("<H", AUDIO_BITS))
    
    # data chunk
    header.write(b"data")
    header.write(struct.pack("<I", data_size))
    
    return header.getvalue()


def pcm_to_wav(pcm_data: bytes) -> bytes:
    """Convert raw PCM data to WAV format."""
    wav_buffer = io.BytesIO()
    
    with wave.open(wav_buffer, "wb") as wav:
        wav.setnchannels(AUDIO_CHANNELS)
        wav.setsampwidth(AUDIO_BITS // 8)
        wav.setframerate(AUDIO_SAMPLE_RATE)
        wav.writeframes(pcm_data)
    
    return wav_buffer.getvalue()


async def audio_stream_handler(request: web.Request) -> web.StreamResponse:
    """HTTP handler for streaming audio as WAV."""
    coordinator = request.app.get("coordinator")
    if not coordinator:
        return web.Response(status=503, text="Coordinator not available")
    
    audio_manager = AudioStreamManager(coordinator)
    coordinator.register_audio_callback(audio_manager.on_audio_data)
    
    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "audio/wav",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
    await response.prepare(request)
    
    try:
        # Send WAV header
        await response.write(pcm_to_wav_header())
        
        audio_manager.start_streaming()
        
        while True:
            chunk = await audio_manager.get_audio_chunk(timeout=5.0)
            if chunk is None:
                # Send silence to keep connection alive
                silence = bytes(AUDIO_CHUNK_SIZE)
                await response.write(silence)
            else:
                await response.write(chunk)
                
    except asyncio.CancelledError:
        pass
    except ConnectionResetError:
        _LOGGER.debug("Audio stream client disconnected")
    finally:
        audio_manager.stop_streaming()
        coordinator.unregister_audio_callback(audio_manager.on_audio_data)
    
    return response


class TextToSpeechSender:
    """Send TTS audio to ESP32 speaker."""

    def __init__(self, coordinator) -> None:
        """Initialize TTS sender."""
        self.coordinator = coordinator

    async def send_tts_audio(self, audio_data: bytes, sample_rate: int = 16000) -> bool:
        """Send TTS audio to ESP32.
        
        Args:
            audio_data: Raw PCM audio data (16-bit signed, mono)
            sample_rate: Sample rate (will be resampled if not 16kHz)
        """
        # If sample rate doesn't match, we'd need to resample
        # For now, assume 16kHz input
        if sample_rate != AUDIO_SAMPLE_RATE:
            _LOGGER.warning(
                "TTS sample rate %d doesn't match device rate %d, audio may sound distorted",
                sample_rate,
                AUDIO_SAMPLE_RATE,
            )
        
        # Send audio in chunks
        for i in range(0, len(audio_data), AUDIO_CHUNK_SIZE):
            chunk = audio_data[i:i + AUDIO_CHUNK_SIZE]
            success = await self.coordinator.async_send_audio(chunk)
            if not success:
                return False
            # Small delay to prevent overwhelming the ESP32
            await asyncio.sleep(0.01)
        
        return True
