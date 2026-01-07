"""SmartIntercom integration for Home Assistant."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PORT, Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    CONF_ENABLE_AUDIO,
    CONF_SECRET_KEY,
    CONF_USE_SSL,
    CMD_CLEAR_FIELD,
    CMD_SET_FIELD,
    DOMAIN,
    PLATFORMS,
    STREAM_MODE_FULL_DUPLEX,
    STREAM_MODE_IDLE,
    STREAM_MODE_LISTEN,
    STREAM_MODE_SPEAK,
)
from .websocket_client import SmartIntercomClient

_LOGGER = logging.getLogger(__name__)


class SmartIntercomCoordinator(DataUpdateCoordinator):
    """Coordinator for SmartIntercom data."""

    def __init__(
        self,
        hass: HomeAssistant,
        client: SmartIntercomClient,
        enable_audio: bool,
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=None,  # Push-based updates via WebSocket
        )
        self.client = client
        self.enable_audio = enable_audio
        
        # State data
        self.data = {
            "connected": False,
            "streaming_mode": STREAM_MODE_IDLE,
            "mic_gain": 1.0,
            "speaker_gain": 1.0,
            "display_line1": "",
            "display_line2": "",
            "external_text": "",
        }
        
        # Audio buffer for media player
        self._audio_buffer: bytes = b""
        self._audio_callbacks: list = []

    def on_message(self, data: dict) -> None:
        """Handle incoming JSON messages from device."""
        _LOGGER.debug("Received message: %s", data)
        # Update state based on message type if needed
        self.async_set_updated_data(self.data)

    def on_audio(self, audio_data: bytes) -> None:
        """Handle incoming audio data."""
        self._audio_buffer += audio_data
        # Notify audio subscribers
        for callback in self._audio_callbacks:
            callback(audio_data)

    def on_connect(self) -> None:
        """Handle successful connection."""
        self.data["connected"] = True
        self.async_set_updated_data(self.data)

    def on_disconnect(self) -> None:
        """Handle disconnection."""
        self.data["connected"] = False
        self.data["streaming_mode"] = STREAM_MODE_IDLE
        self.async_set_updated_data(self.data)

    def register_audio_callback(self, callback) -> None:
        """Register a callback for audio data."""
        self._audio_callbacks.append(callback)

    def unregister_audio_callback(self, callback) -> None:
        """Unregister an audio callback."""
        if callback in self._audio_callbacks:
            self._audio_callbacks.remove(callback)

    async def async_send_command(self, cmd: str, **kwargs: Any) -> bool:
        """Send a command to the device."""
        return await self.client.send_command(cmd, **kwargs)

    async def async_send_audio(self, data: bytes) -> bool:
        """Send audio data to the device."""
        return await self.client.send_audio(data)

    def set_streaming_mode(self, mode: str) -> None:
        """Update the streaming mode state."""
        self.data["streaming_mode"] = mode
        self.async_set_updated_data(self.data)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up SmartIntercom from a config entry."""
    host = entry.data[CONF_HOST]
    port = entry.data[CONF_PORT]
    secret_key = entry.data[CONF_SECRET_KEY]
    enable_audio = entry.data.get(CONF_ENABLE_AUDIO, True)
    use_ssl = entry.data.get(CONF_USE_SSL, False)

    # Create WebSocket client
    client = SmartIntercomClient(
        host=host,
        port=port,
        secret_key=secret_key,
        use_ssl=use_ssl,
    )

    # Create coordinator
    coordinator = SmartIntercomCoordinator(hass, client, enable_audio)

    # Set up callbacks
    client.on_message = coordinator.on_message
    client.on_audio = coordinator.on_audio
    client.on_connect = coordinator.on_connect
    client.on_disconnect = coordinator.on_disconnect

    # Connect to device
    if not await client.connect():
        _LOGGER.error("Failed to connect to SmartIntercom at %s:%s", host, port)
        # Don't fail setup - allow reconnection
    
    # Store coordinator
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    # Set up platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register services
    await async_register_services(hass)

    # Register frontend card
    await async_register_frontend(hass)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Unload platforms
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    
    if unload_ok:
        coordinator = hass.data[DOMAIN].pop(entry.entry_id)
        await coordinator.client.disconnect()

    return unload_ok


async def async_register_services(hass: HomeAssistant) -> None:
    """Register custom services."""
    
    async def handle_set_marquee_field(call: ServiceCall) -> None:
        """Handle set_marquee_field service call."""
        index = call.data.get("index", 0)
        icon = call.data.get("icon", "")
        text = call.data.get("text", "")
        
        for coordinator in hass.data[DOMAIN].values():
            await coordinator.async_send_command(
                CMD_SET_FIELD,
                index=index,
                icon=icon,
                text=text,
            )

    async def handle_clear_marquee_field(call: ServiceCall) -> None:
        """Handle clear_marquee_field service call."""
        index = call.data.get("index", 0)
        
        for coordinator in hass.data[DOMAIN].values():
            await coordinator.async_send_command(CMD_CLEAR_FIELD, index=index)

    # Register services if not already registered
    if not hass.services.has_service(DOMAIN, "set_marquee_field"):
        hass.services.async_register(DOMAIN, "set_marquee_field", handle_set_marquee_field)
    
    if not hass.services.has_service(DOMAIN, "clear_marquee_field"):
        hass.services.async_register(DOMAIN, "clear_marquee_field", handle_clear_marquee_field)


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Register the custom Lovelace card."""
    import os
    from homeassistant.components.http import StaticPathConfig
    
    # Check if already registered (avoid duplicate registration error)
    frontend_key = f"{DOMAIN}_frontend_registered"
    if hass.data.get(frontend_key):
        return
    
    # Get the path to our JavaScript file
    card_path = os.path.join(os.path.dirname(__file__), "www", "smart-intercom-card.js")
    
    if not os.path.exists(card_path):
        _LOGGER.warning("SmartIntercom card file not found at %s", card_path)
        return

    try:
        # Register as a static path using the new async API
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                url_path=f"/{DOMAIN}/smart-intercom-card.js",
                path=card_path,
                cache_headers=False,
            )
        ])
        
        # Mark as registered
        hass.data[frontend_key] = True
        
        _LOGGER.info(
            "SmartIntercom card registered at /%s/smart-intercom-card.js",
            DOMAIN,
        )
    except RuntimeError as err:
        # Route already registered (e.g., during reload)
        _LOGGER.debug("Frontend already registered: %s", err)
        hass.data[frontend_key] = True
