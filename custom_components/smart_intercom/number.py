"""Number entities for SmartIntercom (gain controls)."""
from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.number import (
    NumberDeviceClass,
    NumberEntity,
    NumberEntityDescription,
    NumberMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SmartIntercomCoordinator
from .const import (
    CMD_SET_MIC_GAIN,
    CMD_SET_SPEAKER_GAIN,
    DOMAIN,
    MANUFACTURER,
    MODEL,
)


@dataclass(frozen=True)
class SmartIntercomNumberDescription(NumberEntityDescription):
    """Describe a SmartIntercom number entity."""

    command: str = ""
    data_key: str = ""


NUMBER_DESCRIPTIONS: tuple[SmartIntercomNumberDescription, ...] = (
    SmartIntercomNumberDescription(
        key="mic_gain",
        name="Microphone Gain",
        icon="mdi:microphone-settings",
        native_min_value=0.1,
        native_max_value=5.0,
        native_step=0.1,
        mode=NumberMode.SLIDER,
        command=CMD_SET_MIC_GAIN,
        data_key="mic_gain",
    ),
    SmartIntercomNumberDescription(
        key="speaker_gain",
        name="Speaker Gain",
        icon="mdi:volume-source",
        native_min_value=0.1,
        native_max_value=3.0,
        native_step=0.1,
        mode=NumberMode.SLIDER,
        command=CMD_SET_SPEAKER_GAIN,
        data_key="speaker_gain",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartIntercom number entities."""
    coordinator: SmartIntercomCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities = [
        SmartIntercomNumber(coordinator, entry, description)
        for description in NUMBER_DESCRIPTIONS
    ]

    async_add_entities(entities)


class SmartIntercomNumber(CoordinatorEntity, NumberEntity):
    """A number entity for SmartIntercom gain control."""

    entity_description: SmartIntercomNumberDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SmartIntercomCoordinator,
        entry: ConfigEntry,
        description: SmartIntercomNumberDescription,
    ) -> None:
        """Initialize the number entity."""
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
    def native_value(self) -> float:
        """Return the current value."""
        return self.coordinator.data.get(self.entity_description.data_key, 1.0)

    async def async_set_native_value(self, value: float) -> None:
        """Set new value."""
        await self.coordinator.async_send_command(
            self.entity_description.command,
            value=value,
        )
        # Update local state
        self.coordinator.data[self.entity_description.data_key] = value
        self.coordinator.async_set_updated_data(self.coordinator.data)
