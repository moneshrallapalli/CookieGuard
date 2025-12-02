(function() {
  'use strict';
  const fingerprintingAttempts = {
    canvas: [],
    webgl: [],
    audio: [],
    fonts: [],
    webrtc: []
  };
  const CONFIG = {
    CANVAS_MIN_AREA: 16,           
    FONT_MEASUREMENT_THRESHOLD: 50, 
    AUDIO_SILENT_THRESHOLD: 0.001,  
    WEBGL_PARAM_THRESHOLD: 10       
  };
  const canvasStats = {
    toDataURLCalls: 0,
    getImageDataCalls: 0,
    totalPixelsRead: 0,
    uniqueCanvases: new Set()
  };
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    const width = this.width;
    const height = this.height;
    const area = width * height;
    if (area > CONFIG.CANVAS_MIN_AREA) {
      canvasStats.toDataURLCalls++;
      canvasStats.uniqueCanvases.add(this);
      const result = originalToDataURL.apply(this, args);
      const contentHash = result.substring(0, 100);
      fingerprintingAttempts.canvas.push({
        type: 'toDataURL',
        timestamp: Date.now(),
        width: width,
        height: height,
        area: area,
        format: args[0] || 'image/png',
        contentHash: contentHash,
        stackTrace: new Error().stack
      });
      reportFingerprinting('canvas', {
        method: 'toDataURL',
        width: width,
        height: height,
        area: area,
        totalCalls: canvasStats.toDataURLCalls
      });
      return result;
    }
    return originalToDataURL.apply(this, args);
  };
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const [x, y, width, height] = args;
    const area = width * height;
    if (area > CONFIG.CANVAS_MIN_AREA) {
      canvasStats.getImageDataCalls++;
      canvasStats.totalPixelsRead += area;
      fingerprintingAttempts.canvas.push({
        type: 'getImageData',
        timestamp: Date.now(),
        x: x,
        y: y,
        width: width,
        height: height,
        area: area,
        stackTrace: new Error().stack
      });
      reportFingerprinting('canvas', {
        method: 'getImageData',
        width: width,
        height: height,
        area: area,
        totalPixelsRead: canvasStats.totalPixelsRead
      });
    }
    return originalGetImageData.apply(this, args);
  };
  const webglStats = {
    contexts: 0,
    parameterQueries: 0,
    queriedParams: new Set(),
    rendererInfo: 0
  };
  const SENSITIVE_WEBGL_PARAMS = [
    'VENDOR', 'RENDERER', 'VERSION',
    'SHADING_LANGUAGE_VERSION',
    'MAX_TEXTURE_SIZE', 'MAX_VIEWPORT_DIMS',
    'ALIASED_LINE_WIDTH_RANGE', 'ALIASED_POINT_SIZE_RANGE'
  ];
  function hookWebGLGetParameter(prototype) {
    const originalGetParameter = prototype.getParameter;
    prototype.getParameter = function(param) {
      const paramName = getWebGLParamName(param);
      webglStats.parameterQueries++;
      webglStats.queriedParams.add(paramName);
      if (paramName.includes('RENDERER') || paramName.includes('VENDOR')) {
        webglStats.rendererInfo++;
        fingerprintingAttempts.webgl.push({
          type: 'getParameter',
          timestamp: Date.now(),
          parameter: paramName,
          sensitive: true,
          stackTrace: new Error().stack
        });
        reportFingerprinting('webgl', {
          method: 'getParameter',
          parameter: paramName,
          totalQueries: webglStats.parameterQueries,
          rendererInfoQueries: webglStats.rendererInfo
        });
      }
      else if (webglStats.parameterQueries > CONFIG.WEBGL_PARAM_THRESHOLD) {
        fingerprintingAttempts.webgl.push({
          type: 'getParameter',
          timestamp: Date.now(),
          parameter: paramName,
          sensitive: SENSITIVE_WEBGL_PARAMS.some(p => paramName.includes(p)),
          stackTrace: new Error().stack
        });
        if (webglStats.parameterQueries === CONFIG.WEBGL_PARAM_THRESHOLD + 1) {
          reportFingerprinting('webgl', {
            method: 'mass_enumeration',
            totalQueries: webglStats.parameterQueries,
            uniqueParams: webglStats.queriedParams.size
          });
        }
      }
      return originalGetParameter.apply(this, arguments);
    };
  }
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
    const context = originalGetContext.apply(this, [contextType, ...args]);
    if (contextType === 'webgl' || contextType === 'webgl2' || contextType === 'experimental-webgl') {
      webglStats.contexts++;
      if (context && !context._fingerprintHooked) {
        hookWebGLGetParameter(Object.getPrototypeOf(context));
        context._fingerprintHooked = true;
      }
      fingerprintingAttempts.webgl.push({
        type: 'context_creation',
        timestamp: Date.now(),
        contextType: contextType,
        stackTrace: new Error().stack
      });
    }
    return context;
  };
  function getWebGLParamName(param) {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return `UNKNOWN_${param}`;
    for (let key in gl) {
      if (gl[key] === param) return key;
    }
    return `UNKNOWN_${param}`;
  }
  const audioStats = {
    contexts: 0,
    oscillators: 0,
    analysers: 0,
    silentProcessing: 0,
    channelData: 0
  };
  if (window.AudioContext || window.webkitAudioContext) {
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    window.AudioContext = function(...args) {
      const context = new OriginalAudioContext(...args);
      audioStats.contexts++;
      const originalCreateOscillator = context.createOscillator.bind(context);
      context.createOscillator = function(...args) {
        audioStats.oscillators++;
        fingerprintingAttempts.audio.push({
          type: 'oscillator_creation',
          timestamp: Date.now(),
          stackTrace: new Error().stack
        });
        return originalCreateOscillator(...args);
      };
      const originalCreateAnalyser = context.createAnalyser.bind(context);
      context.createAnalyser = function(...args) {
        audioStats.analysers++;
        fingerprintingAttempts.audio.push({
          type: 'analyser_creation',
          timestamp: Date.now(),
          stackTrace: new Error().stack
        });
        return originalCreateAnalyser(...args);
      };
      if (audioStats.oscillators > 0 && audioStats.analysers > 0) {
        reportFingerprinting('audio', {
          method: 'oscillator_analyser_pattern',
          contexts: audioStats.contexts,
          oscillators: audioStats.oscillators,
          analysers: audioStats.analysers
        });
      }
      return context;
    };
    if (window.webkitAudioContext) {
      window.webkitAudioContext = window.AudioContext;
    }
  }
  const fontStats = {
    measurements: 0,
    uniqueFonts: new Set(),
    lastMeasurementTime: 0
  };
  const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function(text) {
    fontStats.measurements++;
    const currentTime = Date.now();
    const timeSinceLastMeasurement = currentTime - fontStats.lastMeasurementTime;
    fontStats.lastMeasurementTime = currentTime;
    if (timeSinceLastMeasurement < 100 && fontStats.measurements > CONFIG.FONT_MEASUREMENT_THRESHOLD) {
      fingerprintingAttempts.fonts.push({
        type: 'rapid_measurement',
        timestamp: Date.now(),
        measurementCount: fontStats.measurements,
        stackTrace: new Error().stack
      });
      if (fontStats.measurements === CONFIG.FONT_MEASUREMENT_THRESHOLD + 1) {
        reportFingerprinting('fonts', {
          method: 'rapid_measurement',
          totalMeasurements: fontStats.measurements,
          avgTimeBetween: timeSinceLastMeasurement
        });
      }
    }
    return originalMeasureText.apply(this, arguments);
  };
  const webrtcStats = {
    peerConnections: 0,
    localDescriptions: 0,
    iceCandidates: 0
  };
  if (window.RTCPeerConnection) {
    const OriginalRTCPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = function(...args) {
      const pc = new OriginalRTCPeerConnection(...args);
      webrtcStats.peerConnections++;
      const originalCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = async function(...args) {
        fingerprintingAttempts.webrtc.push({
          type: 'createOffer',
          timestamp: Date.now(),
          stackTrace: new Error().stack
        });
        return originalCreateOffer(...args);
      };
      const originalSetLocalDescription = pc.setLocalDescription.bind(pc);
      pc.setLocalDescription = async function(...args) {
        webrtcStats.localDescriptions++;
        fingerprintingAttempts.webrtc.push({
          type: 'setLocalDescription',
          timestamp: Date.now(),
          stackTrace: new Error().stack
        });
        return originalSetLocalDescription(...args);
      };
      const originalOnicecandidateDescriptor = Object.getOwnPropertyDescriptor(
        RTCPeerConnection.prototype, 'onicecandidate'
      );
      Object.defineProperty(pc, 'onicecandidate', {
        set: function(handler) {
          const wrappedHandler = function(event) {
            if (event.candidate) {
              webrtcStats.iceCandidates++;
              fingerprintingAttempts.webrtc.push({
                type: 'ice_candidate',
                timestamp: Date.now(),
                candidateType: event.candidate.type,
                stackTrace: new Error().stack
              });
              reportFingerprinting('webrtc', {
                method: 'ice_candidate_leak',
                peerConnections: webrtcStats.peerConnections,
                iceCandidates: webrtcStats.iceCandidates
              });
            }
            if (handler) {
              return handler.apply(this, arguments);
            }
          };
          if (originalOnicecandidateDescriptor && originalOnicecandidateDescriptor.set) {
            originalOnicecandidateDescriptor.set.call(this, wrappedHandler);
          }
        },
        get: function() {
          if (originalOnicecandidateDescriptor && originalOnicecandidateDescriptor.get) {
            return originalOnicecandidateDescriptor.get.call(this);
          }
        }
      });
      return pc;
    };
  }
  function reportFingerprinting(type, details) {
    window.postMessage({
      type: 'FINGERPRINT_DETECTED',
      fingerprintType: type,
      details: details,
      url: window.location.href,
      timestamp: Date.now()
    }, '*');
  }
  setInterval(() => {
    const summary = {
      canvas: {
        toDataURL: canvasStats.toDataURLCalls,
        getImageData: canvasStats.getImageDataCalls,
        uniqueCanvases: canvasStats.uniqueCanvases.size,
        totalPixelsRead: canvasStats.totalPixelsRead
      },
      webgl: {
        contexts: webglStats.contexts,
        parameterQueries: webglStats.parameterQueries,
        uniqueParams: webglStats.queriedParams.size,
        rendererInfoQueries: webglStats.rendererInfo
      },
      audio: {
        contexts: audioStats.contexts,
        oscillators: audioStats.oscillators,
        analysers: audioStats.analysers
      },
      fonts: {
        measurements: fontStats.measurements
      },
      webrtc: {
        peerConnections: webrtcStats.peerConnections,
        iceCandidates: webrtcStats.iceCandidates
      }
    };
    if (Object.values(summary).some(s => Object.values(s).some(v => v > 0))) {
      window.postMessage({
        type: 'FINGERPRINT_SUMMARY',
        summary: summary,
        url: window.location.href,
        timestamp: Date.now()
      }, '*');
    }
  }, 5000); 
  console.log('[CookieGuard] Fingerprinting detection active');
})();
