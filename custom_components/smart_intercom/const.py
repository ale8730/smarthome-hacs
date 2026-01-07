"""Constants for SmartIntercom integration."""

DOMAIN = "smart_intercom"
MANUFACTURER = "SmartIntercom"
MODEL = "ESP32 Intercom"

# Configuration
CONF_HOST = "host"
CONF_PORT = "port"
CONF_SECRET_KEY = "secret_key"
CONF_ENABLE_AUDIO = "enable_audio"
CONF_USE_SSL = "use_ssl"

DEFAULT_PORT = 80
DEFAULT_ENABLE_AUDIO = True
DEFAULT_USE_SSL = False

# Audio parameters (must match ESP32 config)
AUDIO_SAMPLE_RATE = 16000
AUDIO_BITS = 16
AUDIO_CHANNELS = 1
AUDIO_CHUNK_SIZE = 1024  # bytes per WebSocket message

# WebSocket commands
CMD_AUTH = "auth"
CMD_START_STREAM = "start_stream"
CMD_STOP_STREAM = "stop_stream"
CMD_START_LISTEN = "start_listen"
CMD_STOP_LISTEN = "stop_listen"
CMD_START_SPEAK = "start_speak"
CMD_STOP_SPEAK = "stop_speak"
CMD_DOORBELL = "doorbell"
CMD_START_ALARM = "start_alarm"
CMD_STOP_ALARM = "stop_alarm"
CMD_SET_MIC_GAIN = "set_mic_gain"
CMD_SET_SPEAKER_GAIN = "set_speaker_gain"
CMD_SET_TEXT = "set_text"
CMD_SET_EXTERNAL_TEXT = "set_external_text"
CMD_SET_FIELD = "set_field"
CMD_CLEAR_FIELD = "clear_field"
CMD_GET_ICONS = "get_icons"

# WebSocket message types
MSG_AUTH_REQUIRED = "auth_required"
MSG_AUTH_SUCCESS = "auth_success"
MSG_AUTH_FAILED = "auth_failed"

# Streaming modes
STREAM_MODE_IDLE = "idle"
STREAM_MODE_FULL_DUPLEX = "full_duplex"
STREAM_MODE_LISTEN = "listen"
STREAM_MODE_SPEAK = "speak"

# Entity keys
ENTITY_CONNECTION_STATUS = "connection_status"
ENTITY_STREAMING_MODE = "streaming_mode"
ENTITY_MIC_GAIN = "mic_gain"
ENTITY_SPEAKER_GAIN = "speaker_gain"

# Platforms to setup
PLATFORMS = ["button", "sensor", "number", "text", "media_player"]
