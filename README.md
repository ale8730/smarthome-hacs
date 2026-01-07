# SmartIntercom - Home Assistant Integration

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![HA Version](https://img.shields.io/badge/Home%20Assistant-2024.1%2B-blue)](https://www.home-assistant.io/)

Native Home Assistant integration for **SmartIntercom ESP32** intercom system with **bidirectional audio streaming** via WebSocket.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔔 **Doorbell & Alarm** | Trigger doorbell sound, start/stop alarm |
| 📞 **Audio Streaming** | Full-duplex, listen-only, speak-only modes |
| 🎚️ **Gain Control** | Adjust microphone and speaker gain |
| 📺 **Display Control** | Update OLED display text and marquee fields |
| 🔊 **Media Player** | Listen to intercom audio directly in HA |

## 📦 Installation

### HACS (Recommended)

1. Open **HACS** in Home Assistant
2. Click the **⋮** menu → **Custom repositories**
3. Add: `https://github.com/ale8730/SmartIntercom` with category **Integration**
4. Search for "SmartIntercom" and install
5. **Restart Home Assistant**

### Manual Installation

1. Copy the folder `hacs/custom_components/smart_intercom/` to your Home Assistant `config/custom_components/` directory:

```
config/
└── custom_components/
    └── smart_intercom/
        ├── __init__.py
        ├── manifest.json
        ├── config_flow.py
        ├── const.py
        ├── websocket_client.py
        ├── audio_stream.py
        ├── media_player.py
        ├── button.py
        ├── sensor.py
        ├── number.py
        ├── text.py
        ├── services.yaml
        ├── strings.json
        └── translations/
            ├── en.json
            └── it.json
```

2. **Restart Home Assistant**

## ⚙️ Configuration

1. Go to **Settings** → **Devices & Services**
2. Click **+ Add Integration**
3. Search for **SmartIntercom**
4. Enter the configuration:

| Field | Description | Example |
|-------|-------------|---------|
| **Host** | IP address of your ESP32 | `192.168.1.100` |
| **Port** | WebSocket port (default: 80) | `80` |
| **Secret Key** | Authentication key (from `config.h`) | `SmartIntercom2026` |
| **Enable Audio** | Enable audio streaming features | ✓ |

> ⚠️ **Important**: The secret key must match the `WS_SECRET_KEY` defined in your ESP32's `config.h` file.

## 🎛️ Available Entities

### Buttons
| Entity | Action |
|--------|--------|
| `button.smartintercom_doorbell` | Play doorbell sound |
| `button.smartintercom_start_alarm` | Start alarm loop |
| `button.smartintercom_stop_alarm` | Stop alarm |
| `button.smartintercom_start_full_duplex` | Start bidirectional audio |
| `button.smartintercom_stop_full_duplex` | Stop bidirectional audio |
| `button.smartintercom_start_listen` | Start listen mode (ESP32 → HA) |
| `button.smartintercom_stop_listen` | Stop listen mode |
| `button.smartintercom_start_speak` | Start speak mode (HA → ESP32) |
| `button.smartintercom_stop_speak` | Stop speak mode |

### Sensors
| Entity | Description |
|--------|-------------|
| `sensor.smartintercom_connection_status` | Connected / Disconnected |
| `sensor.smartintercom_streaming_mode` | idle / full_duplex / listen / speak |
| `sensor.smartintercom_mic_gain_level` | Current microphone gain |
| `sensor.smartintercom_speaker_gain_level` | Current speaker gain |

### Number Controls
| Entity | Range | Description |
|--------|-------|-------------|
| `number.smartintercom_microphone_gain` | 0.1 - 5.0 | Microphone signal amplification |
| `number.smartintercom_speaker_gain` | 0.1 - 3.0 | Speaker volume |

### Text Inputs
| Entity | Description |
|--------|-------------|
| `text.smartintercom_display_line_1` | First line of OLED display |
| `text.smartintercom_display_line_2` | Second line of OLED display |
| `text.smartintercom_external_text` | Status text below display box |

### Media Player
| Entity | Features |
|--------|----------|
| `media_player.smartintercom_audio_stream` | Play/Stop, Volume control |

## 🔧 Services

### `smart_intercom.set_marquee_field`
Set a scrolling marquee field on the OLED display.

```yaml
service: smart_intercom.set_marquee_field
data:
  index: 0  # 0, 1, or 2
  icon: "/icons/10x10/home.xbm"
  text: "Welcome Home"
```

### `smart_intercom.clear_marquee_field`
Clear a marquee field.

```yaml
service: smart_intercom.clear_marquee_field
data:
  index: 0
```

## 🏠 Example Automations

### Doorbell notification when away

```yaml
automation:
  - alias: "Doorbell Alert"
    trigger:
      - platform: state
        entity_id: button.smartintercom_doorbell
    action:
      - service: notify.mobile_app
        data:
          title: "🔔 Doorbell"
          message: "Someone is at the door!"
```

### Update display when arriving home

```yaml
automation:
  - alias: "Welcome Home Display"
    trigger:
      - platform: zone
        entity_id: person.john
        zone: zone.home
        event: enter
    action:
      - service: text.set_value
        target:
          entity_id: text.smartintercom_external_text
        data:
          value: "Welcome Home!"
```

### Listen when motion detected

```yaml
automation:
  - alias: "Auto Listen on Motion"
    trigger:
      - platform: state
        entity_id: binary_sensor.front_door_motion
        to: "on"
    action:
      - service: button.press
        target:
          entity_id: button.smartintercom_start_listen
      - delay: "00:00:30"
      - service: button.press
        target:
          entity_id: button.smartintercom_stop_listen
```

## 🔊 Audio Streaming

The integration supports bidirectional audio streaming:

| Mode | Direction | Use Case |
|------|-----------|----------|
| **Full-Duplex** | ESP32 ↔ HA | Two-way conversation |
| **Listen** | ESP32 → HA | Monitor intercom audio |
| **Speak** | HA → ESP32 | Announcements, TTS |

## 🎴 Custom Lovelace Card

This integration includes a **custom Lovelace card** with real audio streaming in the browser!

### Step 1: Add the card resource

Go to **Settings** → **Dashboards** → **⋮** (top right) → **Resources** → **Add Resource**:

| Field | Value |
|-------|-------|
| URL | `/local/community/smart_intercom/smart-intercom-card.js` |
| Type | JavaScript Module |

### Step 2: Add the card to your dashboard

Edit your Lovelace dashboard and add a **Manual card** with this YAML:

```yaml
type: custom:smart-intercom-card
host: 192.168.1.100      # Your ESP32 IP
port: 80
secret_key: SmartIntercom2026
name: Front Door Intercom
show_controls: true      # Show doorbell/alarm buttons
show_gain: true          # Show volume sliders
```

### Card Features
- 🎙️ **Audio Visualizer** - Real-time audio level display
- 📞 **Full-Duplex** - Two-way conversation with ESP32
- 👂 **Listen Mode** - Monitor intercom microphone
- 📢 **Speak Mode** - Send audio to ESP32 speaker
- 🔔 **Quick Actions** - Doorbell, Alarm buttons
- 🎚️ **Gain Sliders** - Adjust mic/speaker volume

> ⚠️ **HTTPS Note**: If Home Assistant uses HTTPS, your browser may block the WebSocket connection to the ESP32 (ws://). To fix this, either:
> - Access HA via HTTP for the intercom page
> - Or configure the ESP32 with SSL certificates (advanced)

## 🐛 Troubleshooting

### Cannot connect to device
- Verify the ESP32 IP address is correct
- Ensure port 80 is not blocked by firewall
- Check that the ESP32 is running and connected to WiFi

### Authentication failed
- Verify the secret key matches `WS_SECRET_KEY` in ESP32's `config.h`
- Default key: `SmartIntercom2026`

### No audio
- Ensure "Enable Audio" is checked in integration settings
- Start listen mode before expecting audio
- Check speaker/microphone connections on ESP32

## 📝 License

This integration is provided for personal use with the SmartIntercom ESP32 project.

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/ale8730/SmartIntercom/issues)
- **Documentation**: See `api.md` in the SmartIntercom project
