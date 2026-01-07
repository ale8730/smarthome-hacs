"""Select entities for SmartIntercom (marquee icon selection)."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from homeassistant.components.select import SelectEntity, SelectEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SmartIntercomCoordinator
from .const import (
    CMD_CLEAR_FIELD,
    CMD_SET_FIELD,
    DOMAIN,
    MANUFACTURER,
    MODEL,
)

_LOGGER = logging.getLogger(__name__)

# Option for no icon
OPTION_NONE = "none"


@dataclass(frozen=True)
class SmartIntercomSelectDescription(SelectEntityDescription):
    """Describe a SmartIntercom select entity."""

    field_index: int = 0


SELECT_DESCRIPTIONS: tuple[SmartIntercomSelectDescription, ...] = (
    SmartIntercomSelectDescription(
        key="marquee_icon_1",
        name="Marquee Icon 1",
        icon="mdi:image",
        field_index=0,
    ),
    SmartIntercomSelectDescription(
        key="marquee_icon_2",
        name="Marquee Icon 2",
        icon="mdi:image",
        field_index=1,
    ),
    SmartIntercomSelectDescription(
        key="marquee_icon_3",
        name="Marquee Icon 3",
        icon="mdi:image",
        field_index=2,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartIntercom select entities."""
    coordinator: SmartIntercomCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities = [
        SmartIntercomIconSelect(coordinator, entry, description)
        for description in SELECT_DESCRIPTIONS
    ]

    async_add_entities(entities)


class SmartIntercomIconSelect(CoordinatorEntity, SelectEntity):
    """A select entity for SmartIntercom marquee icon selection."""

    entity_description: SmartIntercomSelectDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SmartIntercomCoordinator,
        entry: ConfigEntry,
        description: SmartIntercomSelectDescription,
    ) -> None:
        """Initialize the select entity."""
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._entry = entry
        self._field_index = description.field_index

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
    def options(self) -> list[str]:
        """Return list of available icons."""
        icons = self.coordinator.data.get("icon_list", [])
        # Add "none" option at the beginning for clearing icon
        return [OPTION_NONE] + [self._icon_to_display_name(icon) for icon in icons]

    @property
    def current_option(self) -> str | None:
        """Return the currently selected icon."""
        marquee_data = self.coordinator.data.get("marquee_fields", [{}, {}, {}])
        if self._field_index < len(marquee_data):
            icon_path = marquee_data[self._field_index].get("icon", "")
            if not icon_path:
                return OPTION_NONE
            return self._icon_to_display_name(icon_path)
        return OPTION_NONE

    async def async_select_option(self, option: str) -> None:
        """Change the selected option."""
        # Get current text for this field
        marquee_data = self.coordinator.data.get("marquee_fields", [{}, {}, {}])
        current_text = ""
        if self._field_index < len(marquee_data):
            current_text = marquee_data[self._field_index].get("text", "")

        if option == OPTION_NONE:
            # Clear icon but keep text
            await self.coordinator.async_send_command(
                CMD_SET_FIELD,
                index=self._field_index,
                icon="",
                text=current_text,
            )
            icon_path = ""
        else:
            # Convert display name back to path
            icon_path = self._display_name_to_icon(option)
            await self.coordinator.async_send_command(
                CMD_SET_FIELD,
                index=self._field_index,
                icon=icon_path,
                text=current_text,
            )

        # Update local state
        if self._field_index < len(marquee_data):
            marquee_data[self._field_index]["icon"] = icon_path
        self.coordinator.data["marquee_fields"] = marquee_data
        self.coordinator.async_set_updated_data(self.coordinator.data)

    def _icon_to_display_name(self, icon_path: str) -> str:
        """Convert icon path to display name (e.g., /icons/10x10/home.xbm -> home)."""
        if not icon_path:
            return OPTION_NONE
        # Extract filename without extension
        filename = icon_path.split("/")[-1]
        return filename.replace(".xbm", "")

    def _display_name_to_icon(self, display_name: str) -> str:
        """Convert display name back to icon path."""
        if display_name == OPTION_NONE:
            return ""
        # Get full path from icon list
        icons = self.coordinator.data.get("icon_list", [])
        for icon in icons:
            if icon.endswith(f"/{display_name}.xbm"):
                return icon
        # Fallback: construct path
        return f"/icons/10x10/{display_name}.xbm"
