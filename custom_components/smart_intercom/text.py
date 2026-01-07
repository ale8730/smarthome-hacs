"""Text entities for SmartIntercom (display control)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.text import TextEntity, TextEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SmartIntercomCoordinator
from .const import (
    CMD_SET_EXTERNAL_TEXT,
    CMD_SET_TEXT,
    DOMAIN,
    MANUFACTURER,
    MODEL,
)


@dataclass(frozen=True)
class SmartIntercomTextDescription(TextEntityDescription):
    """Describe a SmartIntercom text entity."""

    data_key: str = ""
    is_display_line: bool = False
    line_number: int = 0


TEXT_DESCRIPTIONS: tuple[SmartIntercomTextDescription, ...] = (
    SmartIntercomTextDescription(
        key="display_line1",
        name="Display Line 1",
        icon="mdi:format-text",
        data_key="display_line1",
        is_display_line=True,
        line_number=1,
    ),
    SmartIntercomTextDescription(
        key="display_line2",
        name="Display Line 2",
        icon="mdi:format-text",
        data_key="display_line2",
        is_display_line=True,
        line_number=2,
    ),
    SmartIntercomTextDescription(
        key="external_text",
        name="External Text",
        icon="mdi:text-box-outline",
        data_key="external_text",
        is_display_line=False,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartIntercom text entities."""
    coordinator: SmartIntercomCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities = [
        SmartIntercomText(coordinator, entry, description)
        for description in TEXT_DESCRIPTIONS
    ]

    async_add_entities(entities)


class SmartIntercomText(CoordinatorEntity, TextEntity):
    """A text entity for SmartIntercom display control."""

    entity_description: SmartIntercomTextDescription
    _attr_has_entity_name = True
    _attr_native_max = 30  # Max characters for OLED display

    def __init__(
        self,
        coordinator: SmartIntercomCoordinator,
        entry: ConfigEntry,
        description: SmartIntercomTextDescription,
    ) -> None:
        """Initialize the text entity."""
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

    @property
    def native_value(self) -> str:
        """Return the current text value."""
        return self.coordinator.data.get(self.entity_description.data_key, "")

    async def async_set_value(self, value: str) -> None:
        """Set new text value."""
        if self.entity_description.is_display_line:
            # For display lines, we need to send both lines together
            line1 = self.coordinator.data.get("display_line1", "")
            line2 = self.coordinator.data.get("display_line2", "")
            
            if self.entity_description.line_number == 1:
                line1 = value
            else:
                line2 = value
            
            await self.coordinator.async_send_command(
                CMD_SET_TEXT,
                line1=line1,
                line2=line2,
            )
        else:
            # External text
            await self.coordinator.async_send_command(
                CMD_SET_EXTERNAL_TEXT,
                text=value,
            )
        
        # Update local state
        self.coordinator.data[self.entity_description.data_key] = value
        self.coordinator.async_set_updated_data(self.coordinator.data)
