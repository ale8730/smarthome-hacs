"""Button entities for SmartIntercom."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SmartIntercomCoordinator
from .const import (
    CMD_DOORBELL,
    CMD_START_ALARM,
    CMD_START_LISTEN,
    CMD_START_SPEAK,
    CMD_START_STREAM,
    CMD_STOP_ALARM,
    CMD_STOP_LISTEN,
    CMD_STOP_SPEAK,
    CMD_STOP_STREAM,
    DOMAIN,
    MANUFACTURER,
    MODEL,
    STREAM_MODE_FULL_DUPLEX,
    STREAM_MODE_IDLE,
    STREAM_MODE_LISTEN,
    STREAM_MODE_SPEAK,
)


@dataclass(frozen=True)
class SmartIntercomButtonDescription(ButtonEntityDescription):
    """Describe a SmartIntercom button."""

    command: str = ""
    stream_mode: str | None = None  # If set, updates streaming mode on press


BUTTON_DESCRIPTIONS: tuple[SmartIntercomButtonDescription, ...] = (
    SmartIntercomButtonDescription(
        key="doorbell",
        name="Doorbell",
        icon="mdi:bell-ring",
        command=CMD_DOORBELL,
    ),
    SmartIntercomButtonDescription(
        key="start_alarm",
        name="Start Alarm",
        icon="mdi:alarm-light",
        command=CMD_START_ALARM,
    ),
    SmartIntercomButtonDescription(
        key="stop_alarm",
        name="Stop Alarm",
        icon="mdi:alarm-light-off",
        command=CMD_STOP_ALARM,
    ),
    SmartIntercomButtonDescription(
        key="start_stream",
        name="Start Full-Duplex",
        icon="mdi:phone",
        command=CMD_START_STREAM,
        stream_mode=STREAM_MODE_FULL_DUPLEX,
    ),
    SmartIntercomButtonDescription(
        key="stop_stream",
        name="Stop Full-Duplex",
        icon="mdi:phone-hangup",
        command=CMD_STOP_STREAM,
        stream_mode=STREAM_MODE_IDLE,
    ),
    SmartIntercomButtonDescription(
        key="start_listen",
        name="Start Listen",
        icon="mdi:ear-hearing",
        command=CMD_START_LISTEN,
        stream_mode=STREAM_MODE_LISTEN,
    ),
    SmartIntercomButtonDescription(
        key="stop_listen",
        name="Stop Listen",
        icon="mdi:ear-hearing-off",
        command=CMD_STOP_LISTEN,
        stream_mode=STREAM_MODE_IDLE,
    ),
    SmartIntercomButtonDescription(
        key="start_speak",
        name="Start Speak",
        icon="mdi:bullhorn",
        command=CMD_START_SPEAK,
        stream_mode=STREAM_MODE_SPEAK,
    ),
    SmartIntercomButtonDescription(
        key="stop_speak",
        name="Stop Speak",
        icon="mdi:bullhorn-outline",
        command=CMD_STOP_SPEAK,
        stream_mode=STREAM_MODE_IDLE,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartIntercom button entities."""
    coordinator: SmartIntercomCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities = [
        SmartIntercomButton(coordinator, entry, description)
        for description in BUTTON_DESCRIPTIONS
    ]

    async_add_entities(entities)


class SmartIntercomButton(CoordinatorEntity, ButtonEntity):
    """A button entity for SmartIntercom."""

    entity_description: SmartIntercomButtonDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SmartIntercomCoordinator,
        entry: ConfigEntry,
        description: SmartIntercomButtonDescription,
    ) -> None:
        """Initialize the button."""
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._entry = entry

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info."""
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry.entry_id)},
            name="SmartIntercom",
            manufacturer=MANUFACTURER,
            model=MODEL,
        )

    async def async_press(self) -> None:
        """Handle button press."""
        await self.coordinator.async_send_command(self.entity_description.command)
        
        # Update streaming mode if applicable
        if self.entity_description.stream_mode is not None:
            self.coordinator.set_streaming_mode(self.entity_description.stream_mode)
