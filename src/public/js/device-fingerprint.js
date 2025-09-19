// src/public/js/device-fingerprint.js
/**
 * Client-side device fingerprinting
 * This script should be included in login pages
 */
class DeviceFingerprinter {
  
  static async generateFingerprint() {
    const fingerprint = {
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      plugins: this.getPlugins(),
      canvas: await this.getCanvasFingerprint(),
      webgl: this.getWebGLFingerprint(),
      fonts: await this.getFonts(),
      audioContext: await this.getAudioFingerprint(),
      webrtc: await this.getWebRTCFingerprint()
    };

    return fingerprint;
  }

  static getPlugins() {
    const plugins = [];
    for (let i = 0; i < navigator.plugins.length; i++) {
      plugins.push(navigator.plugins[i].name);
    }
    return plugins;
  }

  static async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = 200;
      canvas.height = 50;
      
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Device fingerprinting 🔒', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Security check', 4, 35);
      
      return canvas.toDataURL();
    } catch (error) {
      return null;
    }
  }

  static getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) return null;
      
      return {
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
      };
    } catch (error) {
      return null;
    }
  }

  static async getFonts() {
    try {
      const fonts = [
        'Arial', 'Times New Roman', 'Courier New', 'Helvetica',
        'Georgia', 'Verdana', 'Trebuchet MS', 'Impact',
        'Comic Sans MS', 'Tahoma', 'Lucida Console'
      ];

      const availableFonts = [];
      const testString = 'mmmmmmmmmmlli';
      const testSize = '72px';
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      for (const font of fonts) {
        ctx.font = `${testSize} ${font}`;
        const width = ctx.measureText(testString).width;
        
        // Check if font is available by comparing widths
        ctx.font = `${testSize} monospace`;
        const monoWidth = ctx.measureText(testString).width;
        
        if (width !== monoWidth) {
          availableFonts.push(font);
        }
      }
      
      return availableFonts;
    } catch (error) {
      return [];
    }
  }

  static async getAudioFingerprint() {
    try {
      if (!window.AudioContext && !window.webkitAudioContext) {
        return null;
      }
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      const scriptProcessor = context.createScriptProcessor(4096, 1, 1);
      
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, context.currentTime);
      
      gain.gain.setValueAtTime(0, context.currentTime);
      
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gain);
      gain.connect(context.destination);
      
      oscillator.start(0);
      
      return new Promise((resolve) => {
        scriptProcessor.onaudioprocess = function(bins) {
          const sum = bins.inputBuffer.getChannelData(0).reduce((a, b) => a + b, 0);
          oscillator.disconnect();
          scriptProcessor.disconnect();
          context.close();
          resolve(sum.toString());
        };
      });
    } catch (error) {
      return null;
    }
  }

  static async getWebRTCFingerprint() {
    try {
      if (!window.RTCPeerConnection) return null;
      
      const pc = new RTCPeerConnection();
      
      return new Promise((resolve) => {
        pc.createDataChannel('');
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
          
          pc.onicecandidate = function(ice) {
            if (ice && ice.candidate && ice.candidate.candidate) {
              const candidate = ice.candidate.candidate;
              resolve(candidate.split(' ')[4] || null);
              pc.close();
            }
          };
        });
        
        // Timeout after 1 second
        setTimeout(() => {
          pc.close();
          resolve(null);
        }, 1000);
      });
    } catch (error) {
      return null;
    }
  }
}

// Export for use in authentication
window.DeviceFingerprinter = DeviceFingerprinter;
