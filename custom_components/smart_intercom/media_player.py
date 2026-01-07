"""Media player entity for SmartIntercom audio streaming."""
from __future__ import annotations

import logging

from homeassistant.components.media_player import (
    MediaPlayerDeviceClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SmartIntercomCoordinator
from .audio_stream import AudioStreamManager
from .const import (
    CMD_START_LISTEN,
    CMD_STOP_LISTEN,
    DOMAIN,
    MANUFACTURER,
    MODEL,
    STREAM_MODE_IDLE,
    STREAM_MODE_LISTEN,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartIntercom media player entity."""
    coordinator: SmartIntercomCoordinator = hass.data[DOMAIN][entry.entry_id]

    async_add_entities([SmartIntercomMediaPlayer(coordinator, entry)])


class SmartIntercomMediaPlayer(CoordinatorEntity, MediaPlayerEntity):
    """Media player entity for listening to SmartIntercom audio."""

    _attr_has_entity_name = True
    _attr_name = "Audio Stream"
    _attr_device_class = MediaPlayerDeviceClass.SPEAKER
    _attr_supported_features = (
        MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.STOP
        | MediaPlayerEntityFeature.VOLUME_SET
    )

    def __init__(
        self,
        coordinator: SmartIntercomCoordinator,
        entry: ConfigEntry,
    ) -> None:
        """Initialize the media player."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_media_player"
        self._entry = entry
        self._volume = 1.0
        self._audio_manager = AudioStreamManager(coordinator)
        
        # Register for audio callbacks
        coordinator.register_audio_callback(self._audio_manager.on_audio_data)

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info."""
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.entry_id)},
            name="SmartIntercom",
            manufacturer=MANUFACTURER,
            model=MODEL,
        )

    @property
    def state(self) -> MediaPlayerState:
        """Return the state of the media player."""
        if not self.coordinator.data.get("connected"):
            return MediaPlayerState.OFF
        
        streaming_mode = self.coordinator.data.get("streaming_mode", STREAM_MODE_IDLE)
        
        if streaming_mode == STREAM_MODE_LISTEN:
            return MediaPlayerState.PLAYING
        elif streaming_mode != STREAM_MODE_IDLE:
            return MediaPlayerState.BUFFERING
        
        return MediaPlayerState.IDLE

    @property
    def volume_level(self) -> float:
        """Return the volume level (0.0 to 1.0)."""
        return self._volume

    @property
    def is_volume_muted(self) -> bool:
        """Return True if volume is muted."""
        return self._volume == 0

    async def async_media_play(self) -> None:
        """Start listening to intercom audio."""
        await self.coordinator.async_send_command(CMD_START_LISTEN)
        self.coordinator.set_streaming_mode(STREAM_MODE_LISTEN)
        self._audio_manager.start_streaming()
        _LOGGER.info("Started SmartIntercom audio stream")

    async def async_media_stop(self) -> None:
        """Stop listening to intercom audio."""
        await self.coordinator.async_send_command(CMD_STOP_LISTEN)
        self.coordinator.set_streaming_mode(STREAM_MODE_IDLE)
        self._audio_manager.stop_streaming()
        _LOGGER.info("Stopped SmartIntercom audio stream")

    async def async_set_volume_level(self, volume: float) -> None:
        """Set volume level (0.0 to 1.0)."""
        self._volume = volume
        # Volume is controlled via speaker gain on the device
        # Map 0-1 to device range 0.1-3.0
        device_gain = 0.1 + (volume * 2.9)
        await self.coordinator.async_send_command("set_speaker_gain", value=device_gain)

    @property
    def media_content_type(self) -> str:
        """Return the content type of current playing media."""
        return "audio/wav"

    @property
    def media_title(self) -> str | None:
        """Return the title of current playing media."""
        if self.state == MediaPlayerState.PLAYING:
            return "SmartIntercom Live Audio"
        return None
