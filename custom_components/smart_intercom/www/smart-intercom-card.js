/**
 * SmartIntercom Card - Custom Lovelace Card for Home Assistant
 * 
 * Features:
 * - Syncs with ESP32 state (streaming, alarm, doorbell)
 * - MDI icons with HA native styling
 * - Fully customizable labels and colors
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
        this._statusInterval = null;
        this._espState = {
            full_duplex: false,
            listen: false,
            speak: false,
            alarm_active: false,
            busy: false
        };
    }

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

        this._config = {
            host: config.host,
            port: config.port || (config.use_ssl ? 443 : 80),
            secret_key: config.secret_key || '',
            use_ssl: config.use_ssl || false,
            name: config.name || 'SmartIntercom',
            show_full_duplex: config.show_full_duplex !== false,
            show_listen: config.show_listen !== false,
            show_speak: config.show_speak !== false,
            show_gain: config.show_gain !== false,
            show_visualizer: config.show_visualizer !== false,
            labels: {
                full_duplex: config.labels?.full_duplex || 'Full Duplex',
                listen: config.labels?.listen || 'Listen',
                speak: config.labels?.speak || 'Speak',
                stop: config.labels?.stop || 'Stop',
                mic_gain: config.labels?.mic_gain || 'Microphone',
                speaker_gain: config.labels?.speaker_gain || 'Speaker',
                busy: config.labels?.busy || 'Device Busy',
            },
            button_colors: {
                full_duplex: config.button_colors?.full_duplex || '#2196f3',
                listen: config.button_colors?.listen || '#9c27b0',
                speak: config.button_colors?.speak || '#ff9800',
                stop: config.button_colors?.stop || '#f44336',
            },
            colors: {
                streaming: config.colors?.streaming || '#4caf50',
                visualizer: config.colors?.visualizer || 'var(--primary-color)',
            },
        };

        this._render();
    }

    disconnectedCallback() {
        if (this._statusInterval) {
            clearInterval(this._statusInterval);
        }
        if (this._ws) {
            this._ws.close();
        }
    }

    getCardSize() {
        return 3;
    }

    _darkenColor(color, percent) {
        if (color.startsWith('var(')) return color;
        if (!color.startsWith('#')) return color;

        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);

        r = Math.max(0, Math.floor(r * (1 - percent / 100)));
        g = Math.max(0, Math.floor(g * (1 - percent / 100)));
        b = Math.max(0, Math.floor(b * (1 - percent / 100)));

        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    _render() {
        const config = this._config;
        const labels = config.labels;
        const btnColors = config.button_colors;
        const colors = config.colors;

        const hoverColors = {
            full_duplex: this._darkenColor(btnColors.full_duplex, 20),
            listen: this._darkenColor(btnColors.listen, 20),
            speak: this._darkenColor(btnColors.speak, 20),
            stop: this._darkenColor(btnColors.stop, 20),
        };

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    --btn-full-duplex: ${btnColors.full_duplex};
                    --btn-full-duplex-hover: ${hoverColors.full_duplex};
                    --btn-listen: ${btnColors.listen};
                    --btn-listen-hover: ${hoverColors.listen};
                    --btn-speak: ${btnColors.speak};
                    --btn-speak-hover: ${hoverColors.speak};
                    --btn-stop: ${btnColors.stop};
                    --btn-stop-hover: ${hoverColors.stop};
                    --card-streaming: ${colors.streaming};
                    --card-visualizer: ${colors.visualizer};
                }

                ha-card { padding: 16px; }

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
                    color: var(--primary-color);
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

                .status-badge.disconnected { background: rgba(244, 67, 54, 0.1); color: #f44336; }
                .status-badge.connected { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
                .status-badge.streaming { background: rgba(33, 150, 243, 0.1); color: #2196f3; animation: pulse 1.5s infinite; }
                .status-badge.busy { background: rgba(255, 152, 0, 0.1); color: #ff9800; }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.6; }
                }

                .busy-notice {
                    background: rgba(255, 152, 0, 0.1);
                    color: #ff9800;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    margin-bottom: 16px;
                    display: none;
                }

                .busy-notice.show { display: block; }

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

                .section { margin-bottom: 16px; }

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
                    padding: 16px 8px;
                    border: none;
                    border-radius: 12px;
                    cursor: pointer;
                    color: white;
                    transition: all 0.2s ease;
                    gap: 6px;
                }

                .btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }

                .btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .btn.full-duplex { background: var(--btn-full-duplex); }
                .btn.full-duplex:hover:not(:disabled) { background: var(--btn-full-duplex-hover); }

                .btn.listen { background: var(--btn-listen); }
                .btn.listen:hover:not(:disabled) { background: var(--btn-listen-hover); }

                .btn.speak { background: var(--btn-speak); }
                .btn.speak:hover:not(:disabled) { background: var(--btn-speak-hover); }

                .btn.stop { background: var(--btn-stop); flex: 0 0 100%; }
                .btn.stop:hover:not(:disabled) { background: var(--btn-stop-hover); }

                .btn.streaming { background: var(--card-streaming) !important; animation: pulse 1.5s infinite; }

                .btn.hidden { display: none; }

                .btn ha-icon { --mdc-icon-size: 28px; }

                .btn-label { font-size: 0.8em; font-weight: 500; }

                .gain-section { display: flex; flex-direction: column; gap: 12px; }

                .gain-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .gain-row ha-icon { color: var(--secondary-text-color); --mdc-icon-size: 20px; }

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
                    background: var(--primary-color);
                    cursor: pointer;
                }

                .gain-value {
                    flex: 0 0 40px;
                    font-size: 0.85em;
                    color: var(--primary-text-color);
                    text-align: right;
                }

                .error {
                    color: #f44336;
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

                <div class="busy-notice" id="busy-notice">
                    <ha-icon icon="mdi:alarm-light" style="--mdc-icon-size: 20px;"></ha-icon>
                    ${labels.busy}
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
                        <button class="btn full-duplex" id="btn-fd">
                            <ha-icon icon="mdi:phone"></ha-icon>
                            <span class="btn-label">${labels.full_duplex}</span>
                        </button>
                        ` : ''}
                        ${config.show_listen ? `
                        <button class="btn listen" id="btn-listen">
                            <ha-icon icon="mdi:ear-hearing"></ha-icon>
                            <span class="btn-label">${labels.listen}</span>
                        </button>
                        ` : ''}
                        ${config.show_speak ? `
                        <button class="btn speak" id="btn-speak">
                            <ha-icon icon="mdi:bullhorn"></ha-icon>
                            <span class="btn-label">${labels.speak}</span>
                        </button>
                        ` : ''}
                        <button class="btn stop hidden" id="btn-stop">
                            <ha-icon icon="mdi:stop"></ha-icon>
                            <span class="btn-label">${labels.stop}</span>
                        </button>
                    </div>
                </div>

                ${config.show_gain ? `
                <div class="divider"></div>
                <div class="section">
                    <div class="section-label">Volume</div>
                    <div class="gain-section">
                        <div class="gain-row">
                            <ha-icon icon="mdi:microphone"></ha-icon>
                            <label>${labels.mic_gain}</label>
                            <input type="range" min="10" max="500" value="100" id="mic-gain">
                            <span class="gain-value" id="mic-gain-value">1.0</span>
                        </div>
                        <div class="gain-row">
                            <ha-icon icon="mdi:volume-high"></ha-icon>
                            <label>${labels.speaker_gain}</label>
                            <input type="range" min="10" max="300" value="100" id="speaker-gain">
                            <span class="gain-value" id="speaker-gain-value">1.0</span>
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="error" id="error"></div>
            </ha-card>
        `;

        // Attach event listeners after render
        setTimeout(() => {
            this._attachEventListeners();
            this._connect();
            this._startStatusPolling();
        }, 100);
    }

    _attachEventListeners() {
        const btnFd = this.shadowRoot.getElementById('btn-fd');
        const btnListen = this.shadowRoot.getElementById('btn-listen');
        const btnSpeak = this.shadowRoot.getElementById('btn-speak');
        const btnStop = this.shadowRoot.getElementById('btn-stop');
        const micGain = this.shadowRoot.getElementById('mic-gain');
        const speakerGain = this.shadowRoot.getElementById('speaker-gain');

        if (btnFd) btnFd.addEventListener('click', () => this._startStreaming('full_duplex', true, true));
        if (btnListen) btnListen.addEventListener('click', () => this._startStreaming('listen', true, false));
        if (btnSpeak) btnSpeak.addEventListener('click', () => this._startStreaming('speak', false, true));
        if (btnStop) btnStop.addEventListener('click', () => this._stopStreaming());

        if (micGain) {
            micGain.addEventListener('input', (e) => this._updateGainDisplay('mic', e.target.value));
            micGain.addEventListener('change', (e) => this._sendCommand('set_mic_gain', { value: e.target.value / 100 }));
        }
        if (speakerGain) {
            speakerGain.addEventListener('input', (e) => this._updateGainDisplay('speaker', e.target.value));
            speakerGain.addEventListener('change', (e) => this._sendCommand('set_speaker_gain', { value: e.target.value / 100 }));
        }
    }

    _startStatusPolling() {
        // Fetch status immediately
        this._fetchStatus();

        // Poll every 3 seconds
        this._statusInterval = setInterval(() => this._fetchStatus(), 3000);
    }

    async _fetchStatus() {
        const protocol = this._config.use_ssl ? 'https' : 'http';
        const port = this._config.port;
        const baseUrl = (this._config.use_ssl && port === 443)
            ? `${protocol}://${this._config.host}`
            : `${protocol}://${this._config.host}:${port}`;

        try {
            const response = await fetch(`${baseUrl}/status`);
            if (response.ok) {
                const data = await response.json();
                this._updateEspState(data);
            }
        } catch (err) {
            // Silently fail - WebSocket status will be primary
        }
    }

    _updateEspState(data) {
        const streaming = data.streaming || {};
        const audio = data.audio || {};

        this._espState = {
            full_duplex: streaming.full_duplex || false,
            listen: streaming.listen || false,
            speak: streaming.speak || false,
            alarm_active: audio.alarm_active || false,
            doorbell_playing: audio.doorbell_playing || false,
            busy: (audio.alarm_active || audio.doorbell_playing) || false
        };

        // Determine current mode from ESP32 state
        let currentMode = 'idle';
        if (streaming.full_duplex) currentMode = 'full_duplex';
        else if (streaming.listen) currentMode = 'listen';
        else if (streaming.speak) currentMode = 'speak';

        // Update UI based on ESP32 state
        this._updateUIForState(currentMode);

        // Update gain values if provided
        if (audio.mic_gain !== undefined) {
            const micGain = this.shadowRoot.getElementById('mic-gain');
            if (micGain) {
                micGain.value = Math.round(audio.mic_gain * 100);
                this._updateGainDisplay('mic', micGain.value);
            }
        }
        if (audio.speaker_gain !== undefined) {
            const speakerGain = this.shadowRoot.getElementById('speaker-gain');
            if (speakerGain) {
                speakerGain.value = Math.round(audio.speaker_gain * 100);
                this._updateGainDisplay('speaker', speakerGain.value);
            }
        }
    }

    _updateUIForState(mode) {
        const busyNotice = this.shadowRoot.getElementById('busy-notice');
        const btnFd = this.shadowRoot.getElementById('btn-fd');
        const btnListen = this.shadowRoot.getElementById('btn-listen');
        const btnSpeak = this.shadowRoot.getElementById('btn-speak');
        const btnStop = this.shadowRoot.getElementById('btn-stop');

        // Show busy notice if alarm or doorbell is active
        if (busyNotice) {
            busyNotice.classList.toggle('show', this._espState.busy);
        }

        // If device is busy (alarm or doorbell), disable all buttons
        if (this._espState.busy) {
            if (btnFd) btnFd.disabled = true;
            if (btnListen) btnListen.disabled = true;
            if (btnSpeak) btnSpeak.disabled = true;
            this._updateStatus(this._config.labels.busy, 'busy');
            return;
        }

        // If ESP32 is streaming (possibly started from another client)
        if (mode !== 'idle') {
            // Sync local state
            this._isStreaming = true;
            this._streamMode = mode;

            // Show stop button, hide start buttons
            if (btnFd) btnFd.classList.add('hidden');
            if (btnListen) btnListen.classList.add('hidden');
            if (btnSpeak) btnSpeak.classList.add('hidden');
            if (btnStop) btnStop.classList.remove('hidden');

            this._updateStatus(mode.replace('_', ' ').toUpperCase(), 'streaming');
        } else {
            // Idle - enable buttons
            if (btnFd) { btnFd.disabled = false; btnFd.classList.remove('hidden'); }
            if (btnListen) { btnListen.disabled = false; btnListen.classList.remove('hidden'); }
            if (btnSpeak) { btnSpeak.disabled = false; btnSpeak.classList.remove('hidden'); }
            if (btnStop) btnStop.classList.add('hidden');

            if (this._authenticated) {
                this._updateStatus('Connected', 'connected');
            }

            // Reset local state
            if (this._isStreaming && !this._espState.full_duplex && !this._espState.listen && !this._espState.speak) {
                this._isStreaming = false;
                this._streamMode = 'idle';
            }
        }
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
                        this._fetchStatus(); // Get current state after auth
                    } else if (data.type === 'auth_failed') {
                        this._showError('Authentication failed');
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
                this._showError('Connection error');
            };
        } catch (err) {
            this._showError('Failed to connect: ' + err.message);
        }
    }

    async _startStreaming(mode, playback, mic) {
        // Check if device is busy (alarm or doorbell playing)
        if (this._espState.busy) {
            this._showError(this._config.labels.busy);
            return;
        }

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

        if (stopBtn) stopBtn.classList.toggle('hidden', !show);
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

window.customCards = window.customCards || [];
window.customCards.push({
    type: 'smart-intercom-card',
    name: 'SmartIntercom Card',
    description: 'Audio streaming card for SmartIntercom ESP32',
    preview: true,
});
