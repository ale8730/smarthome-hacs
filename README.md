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
| **Host** | IP address or domain of your ESP32 (or proxy) | `192.168.1.100` or `talkie.example.com` |
| **Port** | WebSocket port (80 for local, 443 for SSL proxy) | `80` or `443` |
| **Secret Key** | Authentication key (from `config.h`) | `SmartIntercom2026` |
| **Enable Audio** | Enable audio streaming features | ✓ |
| **Use SSL** | Enable for HTTPS proxy (wss:// instead of ws://) | ✓ for proxy |

### Local Connection (Direct to ESP32)
```
Host: 192.168.1.98
Port: 80
Use SSL: ❌ (unchecked)
```

### Proxy Connection (via reverse proxy with SSL)
```
Host: talkie.yourdomain.com
Port: 443
Use SSL: ✓ (checked)
```

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
| `text.smartintercom_marquee_text_1` | Text for marquee field 1 |
| `text.smartintercom_marquee_text_2` | Text for marquee field 2 |
| `text.smartintercom_marquee_text_3` | Text for marquee field 3 |

### Marquee Icon Selects
| Entity | Description |
|--------|-------------|
| `select.smartintercom_marquee_icon_1` | Icon for marquee field 1 |
| `select.smartintercom_marquee_icon_2` | Icon for marquee field 2 |
| `select.smartintercom_marquee_icon_3` | Icon for marquee field 3 |

> 💡 **Tip**: The icon list is fetched from the ESP32's `/icons/10x10/` directory. Select "none" to clear the icon.

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
| URL | `/smart_intercom/smart-intercom-card.js` |
| Type | JavaScript Module |


### Step 2: Add the card to your dashboard

Edit your Lovelace dashboard and add a **Manual card** with this YAML:

**Minimal Configuration:**
```yaml
type: custom:smart-intercom-card
host: 192.168.1.100
secret_key: SmartIntercom2026
```

**Complete Configuration with All Options:**
```yaml
type: custom:smart-intercom-card

# Connection settings
host: 192.168.1.100           # ESP32 IP or proxy domain
port: 80                       # 80 for local, 443 for SSL proxy
secret_key: SmartIntercom2026  # Must match ESP32 config
use_ssl: false                 # true for wss://, false for ws://
name: Front Door Intercom      # Card title

# Button visibility (all default to true)
show_full_duplex: true
show_listen: true
show_speak: true
show_doorbell: true
show_alarm: true
show_gain: true
show_visualizer: true

# Custom button labels
labels:
  full_duplex: "Call"
  listen: "Listen"
  speak: "Speak"
  stop: "Stop"
  doorbell: "Ring Bell"
  alarm_start: "Alarm"
  alarm_stop: "Stop Alarm"
  mic_gain: "Microphone"
  speaker_gain: "Speaker"

# Custom colors (CSS color values)
colors:
  primary: "var(--primary-color)"    # Default HA primary
  streaming: "#4caf50"               # Green when streaming
  stop: "#f44336"                    # Red for stop button
  secondary: "#757575"               # Secondary text
  visualizer: "var(--primary-color)" # Visualizer bars
```

**Proxy Connection (via HTTPS reverse proxy):**
```yaml
type: custom:smart-intercom-card
host: talkie.yourdomain.com
port: 443
secret_key: SmartIntercom2026
use_ssl: true
name: SmartIntercom
```

**Minimal Listen-Only Card:**
```yaml
type: custom:smart-intercom-card
host: 192.168.1.100
secret_key: SmartIntercom2026
show_full_duplex: false
show_speak: false
show_doorbell: false
show_alarm: false
show_gain: false
```

### Card Features
- 🎙️ **Audio Visualizer** - Real-time audio level display with customizable colors
- 📞 **Full-Duplex** - Two-way conversation with ESP32
- 👂 **Listen Mode** - Monitor intercom microphone
- 📢 **Speak Mode** - Send audio to ESP32 speaker
- 🔔 **Quick Actions** - Doorbell, Alarm buttons
- 🎚️ **Gain Sliders** - Adjust mic/speaker volume
- 🔒 **SSL Support** - Works with HTTPS reverse proxy
- 🎨 **Customizable** - Labels, colors, and button visibility
- 🏠 **HA Native Styling** - Matches your Home Assistant theme


## ⚠️ HTTPS / Mixed Content Issue

**Problem**: When accessing Home Assistant via HTTPS (e.g., `https://ha.example.com`), browsers block WebSocket connections to the ESP32 over insecure `ws://` protocol. You'll see this error:

```
Mixed Content: The page was loaded over HTTPS, but attempted to connect 
to the insecure WebSocket endpoint 'ws://192.168.1.x/audio_stream'.
```

### Solution 1: Access HA via HTTP (Easiest)

For the audio card to work, access Home Assistant using HTTP instead of HTTPS:
- Use `http://192.168.1.x:8123` (your HA local IP)
- Or configure a separate HTTP-only domain/port for intercom use

### Solution 2: Use the ESP32 Web Interface Directly

The ESP32 has a built-in web interface with full audio support. Add an **iframe card** to your dashboard:

```yaml
type: iframe
url: "http://192.168.1.98/"
aspect_ratio: "4:3"
```

> **Note**: This iframe will also be blocked on HTTPS pages. Access HA via HTTP or use a separate browser tab.

### Solution 3: ESP32 with SSL (Advanced)

Configure the ESP32 to serve WebSocket over WSS (requires self-signed or valid SSL certificate). This requires firmware modifications.

### Solution 4: Reverse Proxy with WebSocket Upgrade

Set up a reverse proxy (like nginx) that:
1. Terminates SSL for your domain
2. Proxies WebSocket connections to the ESP32

Example nginx config:
```nginx
location /intercom-ws/ {
    proxy_pass http://192.168.1.98/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Then update the card config to use the proxy path.

## 🐛 Troubleshooting

### Cannot connect to device
- Verify the ESP32 IP address is correct
- Ensure port 80 is not blocked by firewall
- Check that the ESP32 is running and connected to WiFi
- If using HTTPS, see the section above about Mixed Content

### Authentication failed
- Verify the secret key matches `WS_SECRET_KEY` in ESP32's `config.h`
- Default key: `SmartIntercom2026`

### No audio in custom card
- Check browser console for errors (F12 → Console)
- Ensure you're accessing HA via HTTP (not HTTPS)
- Allow microphone access when browser prompts
- Check that ESP32 is responding to WebSocket connections

### Card shows "Disconnected"
- Verify ESP32 IP and port in card config
- Check ESP32 serial monitor for connection attempts
- Ensure only one WebSocket client is connected (ESP32 supports 1 client)

### Integration works but card doesn't
The integration uses HA's Python backend for WebSocket, which doesn't have the HTTPS restriction. The card uses browser JavaScript, which does. Use the integration buttons/entities for control when on HTTPS.

## 📝 License

This integration is provided for personal use with the SmartIntercom ESP32 project.

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/ale8730/smarthome-hacs/issues)
- **ESP32 Project**: [SmartIntercom](https://github.com/ale8730/SmartIntercom)
- **Documentation**: See `api.md` in the SmartIntercom project
