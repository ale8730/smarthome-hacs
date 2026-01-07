"""Sensor entities for SmartIntercom."""
from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import SmartIntercomCoordinator
from .const import (
    DOMAIN,
    MANUFACTURER,
    MODEL,
    STREAM_MODE_FULL_DUPLEX,
    STREAM_MODE_IDLE,
    STREAM_MODE_LISTEN,
    STREAM_MODE_SPEAK,
)


@dataclass(frozen=True)
class SmartIntercomSensorDescription(SensorEntityDescription):
    """Describe a SmartIntercom sensor."""

    data_key: str = ""


SENSOR_DESCRIPTIONS: tuple[SmartIntercomSensorDescription, ...] = (
    SmartIntercomSensorDescription(
        key="connection_status",
        name="Connection Status",
        icon="mdi:connection",
        data_key="connected",
    ),
    SmartIntercomSensorDescription(
        key="streaming_mode",
        name="Streaming Mode",
        icon="mdi:broadcast",
        data_key="streaming_mode",
        device_class=SensorDeviceClass.ENUM,
        options=[
            STREAM_MODE_IDLE,
            STREAM_MODE_FULL_DUPLEX,
            STREAM_MODE_LISTEN,
            STREAM_MODE_SPEAK,
        ],
    ),
    SmartIntercomSensorDescription(
        key="mic_gain_sensor",
        name="Mic Gain Level",
        icon="mdi:microphone",
        data_key="mic_gain",
        native_unit_of_measurement="x",
    ),
    SmartIntercomSensorDescription(
        key="speaker_gain_sensor",
        name="Speaker Gain Level",
        icon="mdi:volume-high",
        data_key="speaker_gain",
        native_unit_of_measurement="x",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up SmartIntercom sensor entities."""
    coordinator: SmartIntercomCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities = [
        SmartIntercomSensor(coordinator, entry, description)
        for description in SENSOR_DESCRIPTIONS
    ]

    async_add_entities(entities)


class SmartIntercomSensor(CoordinatorEntity, SensorEntity):
    """A sensor entity for SmartIntercom."""

    entity_description: SmartIntercomSensorDescription
    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: SmartIntercomCoordinator,
        entry: ConfigEntry,
        description: SmartIntercomSensorDescription,
    ) -> None:
        """Initialize the sensor."""
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
    def native_value(self):
        """Return the state of the sensor."""
        value = self.coordinator.data.get(self.entity_description.data_key)
        
        # Special handling for connection status
        if self.entity_description.data_key == "connected":
            return "Connected" if value else "Disconnected"
        
        return value
