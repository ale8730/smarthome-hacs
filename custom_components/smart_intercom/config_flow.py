"""Config flow for SmartIntercom integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
from homeassistant.exceptions import HomeAssistantError

from .const import (
    CONF_ENABLE_AUDIO,
    CONF_SECRET_KEY,
    DEFAULT_ENABLE_AUDIO,
    DEFAULT_PORT,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_HOST): str,
        vol.Required(CONF_PORT, default=DEFAULT_PORT): int,
        vol.Required(CONF_SECRET_KEY): str,
        vol.Optional(CONF_ENABLE_AUDIO, default=DEFAULT_ENABLE_AUDIO): bool,
    }
)


async def validate_input(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Validate the user input allows us to connect."""
    import websockets
    
    host = data[CONF_HOST]
    port = data[CONF_PORT]
    secret_key = data[CONF_SECRET_KEY]
    
    ws_url = f"ws://{host}:{port}/audio_stream"
    
    try:
        async with websockets.connect(ws_url, close_timeout=5) as ws:
            # Wait for auth_required message
            import asyncio
            import json
            
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=5.0)
                data_msg = json.loads(message)
                
                if data_msg.get("type") != "auth_required":
                    raise CannotConnect("Unexpected response from device")
                
                # Send authentication
                await ws.send(json.dumps({"cmd": "auth", "key": secret_key}))
                
                # Wait for auth response
                response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                resp_data = json.loads(response)
                
                if resp_data.get("type") == "auth_failed":
                    raise InvalidAuth("Invalid secret key")
                elif resp_data.get("type") != "auth_success":
                    raise CannotConnect("Unexpected auth response")
                    
            except asyncio.TimeoutError:
                raise CannotConnect("Connection timeout")
                
    except websockets.exceptions.InvalidURI:
        raise CannotConnect("Invalid host address")
    except websockets.exceptions.WebSocketException as err:
        raise CannotConnect(f"WebSocket error: {err}")
    except OSError as err:
        raise CannotConnect(f"Connection failed: {err}")
    
    # Return info for creating entry
    return {"title": f"SmartIntercom ({host})"}


class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for SmartIntercom."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}
        
        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except CannotConnect:
                errors["base"] = "cannot_connect"
            except InvalidAuth:
                errors["base"] = "invalid_auth"
            except Exception:
                _LOGGER.exception("Unexpected exception")
                errors["base"] = "unknown"
            else:
                # Check if already configured
                await self.async_set_unique_id(user_input[CONF_HOST])
                self._abort_if_unique_id_configured()
                
                return self.async_create_entry(title=info["title"], data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )


class CannotConnect(HomeAssistantError):
    """Error to indicate we cannot connect."""


class InvalidAuth(HomeAssistantError):
    """Error to indicate there is invalid auth."""
