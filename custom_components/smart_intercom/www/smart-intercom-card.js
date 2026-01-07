/**
 * SmartIntercom Card - Custom Lovelace Card for Home Assistant
 * 
 * Features:
 * - MDI icons with HA native styling
 * - Fully customizable labels and colors
 * - Toggle visibility for each button group
 * - Real-time audio streaming (Full-duplex, Listen, Speak)
 * - Audio visualizer
 */

class SmartIntercomCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._hass = null;
        this._config = null;
        this._ws = null;
        this._audioContext = null;
        this._mediaStream = null;
        this._isStreaming = false;
        this._streamMode = 'idle';
        this._authenticated = false;
        this._nextPlayTime = 0;
    }

    // Provide card info for HA card picker
    static getStubConfig() {
        return {
            host: "192.168.1.100",
            port: 80,
            secret_key: "",
            use_ssl: false,
            name: "SmartIntercom",
        };
    }

    set hass(hass) {
        this._hass = hass;
    }

    setConfig(config) {
        if (!config.host) throw new Error('Please specify the host (IP or domain)');

        // Default configuration with all options
        this._config = {
            // Connection
            host: config.host,
            port: config.port || (config.use_ssl ? 443 : 80),
            secret_key: config.secret_key || '',
            use_ssl: config.use_ssl || false,
            name: config.name || 'SmartIntercom',

            // Button visibility
            show_full_duplex: config.show_full_duplex !== false,
            show_listen: config.show_listen !== false,
            show_speak: config.show_speak !== false,
            show_doorbell: config.show_doorbell !== false,
            show_alarm: config.show_alarm !== false,
            show_gain: config.show_gain !== false,
            show_visualizer: config.show_visualizer !== false,

            // Custom labels
            labels: {
                full_duplex: config.labels?.full_duplex || 'Full Duplex',
                listen: config.labels?.listen || 'Listen',
                speak: config.labels?.speak || 'Speak',
                stop: config.labels?.stop || 'Stop',
                doorbell: config.labels?.doorbell || 'Doorbell',
                alarm_start: config.labels?.alarm_start || 'Alarm',
                alarm_stop: config.labels?.alarm_stop || 'Stop Alarm',
                mic_gain: config.labels?.mic_gain || 'Microphone',
                speaker_gain: config.labels?.speaker_gain || 'Speaker',
            },

            // Custom colors
            colors: {
                primary: config.colors?.primary || 'var(--primary-color)',
                streaming: config.colors?.streaming || '#4caf50',
                stop: config.colors?.stop || '#f44336',
                secondary: config.colors?.secondary || 'var(--secondary-text-color)',
                visualizer: config.colors?.visualizer || 'var(--primary-color)',
            },
        };

        this._render();
    }

    getCardSize() {
        return 3;
    }

    _render() {
        const config = this._config;
        const labels = config.labels;
        const colors = config.colors;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    --card-primary: ${colors.primary};
                    --card-streaming: ${colors.streaming};
                    --card-stop: ${colors.stop};
                    --card-secondary: ${colors.secondary};
                    --card-visualizer: ${colors.visualizer};
                }
                
                ha-card {
                    padding: 16px;
                }
                
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                
                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .header-icon {
                    color: var(--card-primary);
                    --mdc-icon-size: 32px;
                }
                
                .title {
                    font-size: 1.2em;
                    font-weight: 500;
                    color: var(--primary-text-color);
                }
                
                .status-badge {
                    font-size: 0.75em;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-weight: 500;
                    text-transform: uppercase;
                }
                
                .status-badge.disconnected {
                    background: rgba(244, 67, 54, 0.1);
                    color: #f44336;
                }
                
                .status-badge.connected {
                    background: rgba(76, 175, 80, 0.1);
                    color: #4caf50;
                }
                
                .status-badge.streaming {
                    background: rgba(33, 150, 243, 0.1);
                    color: #2196f3;
                    animation: pulse 1.5s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }
                
                .visualizer {
                    height: 40px;
                    background: var(--card-background-color, #1c1c1c);
                    border-radius: 8px;
                    margin-bottom: 16px;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    gap: 2px;
                    padding: 4px 8px;
                    overflow: hidden;
                }
                
                .bar {
                    width: 4px;
                    background: var(--card-visualizer);
                    border-radius: 2px 2px 0 0;
                    height: 4px;
                    transition: height 0.1s ease;
                }
                
                .section {
                    margin-bottom: 16px;
                }
                
                .section-label {
                    font-size: 0.75em;
                    color: var(--secondary-text-color);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 8px;
                }
                
                .btn-group {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                
                .btn {
                    flex: 1;
                    min-width: 80px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 12px 8px;
                    border: none;
                    border-radius: 12px;
                    cursor: pointer;
                    background: var(--card-background-color, rgba(0,0,0,0.1));
                    color: var(--primary-text-color);
                    transition: all 0.2s ease;
                    gap: 4px;
                }
                
                .btn:hover {
                    background: var(--card-primary);
                    color: white;
                }
                
                .btn.active {
                    background: var(--card-streaming);
                    color: white;
                }
                
                .btn.stop {
                    background: var(--card-stop);
                    color: white;
                    flex: 0 0 100%;
                }
                
                .btn.stop:hover {
                    filter: brightness(1.1);
                }
                
                .btn.hidden {
                    display: none;
                }
                
                .btn ha-icon {
                    --mdc-icon-size: 24px;
                }
                
                .btn-label {
                    font-size: 0.75em;
                    font-weight: 500;
                }
                
                .gain-section {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                .gain-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .gain-row ha-icon {
                    color: var(--card-secondary);
                    --mdc-icon-size: 20px;
                }
                
                .gain-row label {
                    flex: 0 0 80px;
                    font-size: 0.85em;
                    color: var(--secondary-text-color);
                }
                
                .gain-row input[type="range"] {
                    flex: 1;
                    height: 4px;
                    -webkit-appearance: none;
                    background: var(--divider-color);
                    border-radius: 2px;
                    outline: none;
                }
                
                .gain-row input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: var(--card-primary);
                    cursor: pointer;
                }
                
                .gain-value {
                    flex: 0 0 40px;
                    font-size: 0.85em;
                    color: var(--primary-text-color);
                    text-align: right;
                }
                
                .error {
                    color: var(--card-stop);
                    font-size: 0.85em;
                    margin-top: 8px;
                    display: none;
                }
                
                .divider {
                    height: 1px;
                    background: var(--divider-color);
                    margin: 16px 0;
                }
            </style>
            
            <ha-card>
                <div class="header">
                    <div class="header-left">
                        <ha-icon class="header-icon" icon="mdi:intercom"></ha-icon>
                        <span class="title">${config.name}</span>
                    </div>
                    <span class="status-badge disconnected" id="status">Disconnected</span>
                </div>
                
                ${config.show_visualizer ? `
                <div class="visualizer" id="visualizer">
                    ${Array(24).fill('<div class="bar"></div>').join('')}
                </div>
                ` : ''}
                
                <div class="section">
                    <div class="section-label">Audio Streaming</div>
                    <div class="btn-group">
                        ${config.show_full_duplex ? `
                        <button class="btn" id="btn-fd" onclick="this.getRootNode().host._startStreaming('full_duplex', true, true)">
                            <ha-icon icon="mdi:phone"></ha-icon>
                            <span class="btn-label">${labels.full_duplex}</span>
                        </button>
                        ` : ''}
                        ${config.show_listen ? `
                        <button class="btn" id="btn-listen" onclick="this.getRootNode().host._startStreaming('listen', true, false)">
                            <ha-icon icon="mdi:ear-hearing"></ha-icon>
                            <span class="btn-label">${labels.listen}</span>
                        </button>
                        ` : ''}
                        ${config.show_speak ? `
                        <button class="btn" id="btn-speak" onclick="this.getRootNode().host._startStreaming('speak', false, true)">
                            <ha-icon icon="mdi:bullhorn"></ha-icon>
                            <span class="btn-label">${labels.speak}</span>
                        </button>
                        ` : ''}
                        <button class="btn stop hidden" id="btn-stop" onclick="this.getRootNode().host._stopStreaming()">
                            <ha-icon icon="mdi:stop"></ha-icon>
                            <span class="btn-label">${labels.stop}</span>
                        </button>
                    </div>
                </div>
                
                ${(config.show_doorbell || config.show_alarm) ? `
                <div class="divider"></div>
                <div class="section">
                    <div class="section-label">Actions</div>
                    <div class="btn-group">
                        ${config.show_doorbell ? `
                        <button class="btn" onclick="this.getRootNode().host._sendCommand('doorbell')">
                            <ha-icon icon="mdi:bell"></ha-icon>
                            <span class="btn-label">${labels.doorbell}</span>
                        </button>
                        ` : ''}
                        ${config.show_alarm ? `
                        <button class="btn" id="btn-alarm-start" onclick="this.getRootNode().host._sendCommand('start_alarm')">
                            <ha-icon icon="mdi:alarm-light"></ha-icon>
                            <span class="btn-label">${labels.alarm_start}</span>
                        </button>
                        <button class="btn hidden" id="btn-alarm-stop" onclick="this.getRootNode().host._sendCommand('stop_alarm')">
                            <ha-icon icon="mdi:alarm-off"></ha-icon>
                            <span class="btn-label">${labels.alarm_stop}</span>
                        </button>
                        ` : ''}
                    </div>
                </div>
                ` : ''}
                
                ${config.show_gain ? `
                <div class="divider"></div>
                <div class="section">
                    <div class="section-label">Volume</div>
                    <div class="gain-section">
                        <div class="gain-row">
                            <ha-icon icon="mdi:microphone"></ha-icon>
                            <label>${labels.mic_gain}</label>
                            <input type="range" min="10" max="500" value="100" id="mic-gain" 
                                   oninput="this.getRootNode().host._updateGainDisplay('mic', this.value)"
                                   onchange="this.getRootNode().host._sendCommand('set_mic_gain', {value: this.value / 100})">
                            <span class="gain-value" id="mic-gain-value">1.0</span>
                        </div>
                        <div class="gain-row">
                            <ha-icon icon="mdi:volume-high"></ha-icon>
                            <label>${labels.speaker_gain}</label>
                            <input type="range" min="10" max="300" value="100" id="speaker-gain"
                                   oninput="this.getRootNode().host._updateGainDisplay('speaker', this.value)"
                                   onchange="this.getRootNode().host._sendCommand('set_speaker_gain', {value: this.value / 100})">
                            <span class="gain-value" id="speaker-gain-value">1.0</span>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="error" id="error"></div>
            </ha-card>
        `;

        // Connect after render
        setTimeout(() => this._connect(), 500);
    }

    _connect() {
        if (this._ws) {
            this._ws.close();
        }

        const protocol = this._config.use_ssl ? 'wss' : 'ws';
        const port = this._config.port;
        const wsUrl = (this._config.use_ssl && port === 443)
            ? `${protocol}://${this._config.host}/audio_stream`
            : `${protocol}://${this._config.host}:${port}/audio_stream`;

        try {
            this._ws = new WebSocket(wsUrl);
            this._ws.binaryType = 'arraybuffer';

            this._ws.onopen = () => {
                this._ws.send(JSON.stringify({ cmd: 'auth', key: this._config.secret_key }));
            };

            this._ws.onmessage = (e) => {
                if (typeof e.data === 'string') {
                    const data = JSON.parse(e.data);
                    if (data.type === 'auth_success') {
                        this._authenticated = true;
                        this._updateStatus('Connected', 'connected');
                    } else if (data.type === 'auth_failed') {
                        this._showError('Authentication failed - check secret key');
                    }
                } else if (this._isStreaming && this._enablePlayback) {
                    this._playAudio(e.data);
                }
            };

            this._ws.onclose = () => {
                this._authenticated = false;
                this._updateStatus('Disconnected', 'disconnected');
                setTimeout(() => this._connect(), 5000);
            };

            this._ws.onerror = () => {
                this._showError('Connection error - check host/port/SSL settings');
            };
        } catch (err) {
            this._showError('Failed to connect: ' + err.message);
        }
    }

    async _startStreaming(mode, playback, mic) {
        if (!this._authenticated) {
            this._showError('Not connected');
            return;
        }

        try {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            this._nextPlayTime = this._audioContext.currentTime;

            if (mic) {
                this._mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: { sampleRate: 16000, channelCount: 1 }
                });
                const source = this._audioContext.createMediaStreamSource(this._mediaStream);
                const processor = this._audioContext.createScriptProcessor(1024, 1, 1);

                processor.onaudioprocess = (e) => {
                    if (this._isStreaming && this._ws.readyState === 1) {
                        const input = e.inputBuffer.getChannelData(0);
                        const pcm = new Int16Array(input.length);
                        for (let i = 0; i < input.length; i++) {
                            pcm[i] = input[i] < 0 ? input[i] * 0x8000 : input[i] * 0x7FFF;
                        }
                        this._ws.send(pcm.buffer);
                    }
                };

                source.connect(processor);
                processor.connect(this._audioContext.destination);
                this._micNodes = { source, processor };
            }

            this._isStreaming = true;
            this._enablePlayback = playback;
            this._streamMode = mode;

            const startCmd = mode === 'full_duplex' ? 'start_stream' :
                mode === 'listen' ? 'start_listen' : 'start_speak';
            this._ws.send(JSON.stringify({ cmd: startCmd }));

            this._updateStatus(mode.replace('_', ' ').toUpperCase(), 'streaming');
            this._toggleStopButton(true);

        } catch (err) {
            this._showError(err.message);
        }
    }

    _stopStreaming() {
        if (this._mediaStream) {
            this._mediaStream.getTracks().forEach(t => t.stop());
        }
        if (this._micNodes) {
            this._micNodes.source.disconnect();
            this._micNodes.processor.disconnect();
        }

        if (this._ws && this._ws.readyState === 1) {
            let stopCmd = 'stop_stream';
            if (this._streamMode === 'listen') stopCmd = 'stop_listen';
            else if (this._streamMode === 'speak') stopCmd = 'stop_speak';
            this._ws.send(JSON.stringify({ cmd: stopCmd }));
        }

        this._isStreaming = false;
        this._streamMode = 'idle';
        this._updateStatus('Connected', 'connected');
        this._toggleStopButton(false);
    }

    _playAudio(data) {
        if (!this._audioContext) return;

        const int16 = new Int16Array(data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }

        const buffer = this._audioContext.createBuffer(1, float32.length, 16000);
        buffer.getChannelData(0).set(float32);

        const source = this._audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this._audioContext.destination);

        if (this._nextPlayTime < this._audioContext.currentTime) {
            this._nextPlayTime = this._audioContext.currentTime;
        }
        source.start(this._nextPlayTime);
        this._nextPlayTime += buffer.duration;

        this._updateVisualizer(float32);
    }

    _updateVisualizer(data) {
        const visualizer = this.shadowRoot.getElementById('visualizer');
        if (!visualizer) return;

        const bars = visualizer.querySelectorAll('.bar');
        const step = Math.floor(data.length / bars.length);

        bars.forEach((bar, i) => {
            let sum = 0;
            for (let j = 0; j < step; j++) {
                sum += Math.abs(data[i * step + j] || 0);
            }
            const height = Math.max(4, Math.min(32, (sum / step) * 200));
            bar.style.height = `${height}px`;
        });
    }

    _sendCommand(cmd, params = {}) {
        if (this._ws && this._ws.readyState === 1) {
            this._ws.send(JSON.stringify({ cmd, ...params }));
        }
    }

    _updateStatus(text, cssClass) {
        const status = this.shadowRoot.getElementById('status');
        if (status) {
            status.textContent = text;
            status.className = `status-badge ${cssClass}`;
        }
    }

    _showError(message) {
        const error = this.shadowRoot.getElementById('error');
        if (error) {
            error.textContent = message;
            error.style.display = 'block';
            setTimeout(() => error.style.display = 'none', 5000);
        }
    }

    _toggleStopButton(show) {
        const stopBtn = this.shadowRoot.getElementById('btn-stop');
        const streamBtns = ['btn-fd', 'btn-listen', 'btn-speak'];

        if (stopBtn) {
            stopBtn.classList.toggle('hidden', !show);
        }

        streamBtns.forEach(id => {
            const btn = this.shadowRoot.getElementById(id);
            if (btn) btn.classList.toggle('hidden', show);
        });
    }

    _updateGainDisplay(type, value) {
        const display = this.shadowRoot.getElementById(`${type}-gain-value`);
        if (display) {
            display.textContent = (value / 100).toFixed(1);
        }
    }
}

customElements.define('smart-intercom-card', SmartIntercomCard);

// Register for card picker
window.customCards = window.customCards || [];
window.customCards.push({
    type: 'smart-intercom-card',
    name: 'SmartIntercom Card',
    description: 'Custom card for SmartIntercom ESP32 with audio streaming',
    preview: true,
});
