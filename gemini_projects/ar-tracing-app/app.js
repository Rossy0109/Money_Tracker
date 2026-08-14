/**
 * AR Trace Studio — Main Application
 * Professional AR Tracing & Drawing PWA
 * =========================================================
 */

'use strict';

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
const State = {
  // Camera
  cameraActive:    false,
  cameraFacing:    'environment',
  cameraStream:    null,

  // Drawing
  currentTool:     'pen',
  currentColor:    '#ffffff',
  strokeSize:      4,
  opacity:         1.0,
  isDrawing:       false,
  lastX:           0,
  lastY:           0,
  startX:          0,
  startY:          0,
  smoothing:       true,
  showBrushCursor: true,

  // Shape tools temp canvas
  shapeSnapshot:   null,

  // History (undo/redo)
  history:         [],
  historyStep:     -1,
  maxHistory:      40,

  // Camera overlays
  camOpacity:      1.0,
  brightness:      0,
  contrast:        100,

  // Edge detection
  edgeDetect:      false,
  edgeWorker:      null,
  edgeFrame:       null,

  // Reference image
  refImage:        null,
  refOpacity:      0.5,
  refMoving:       false,
  refX:            0,
  refY:            0,
  refScale:        1.0,

  // Settings
  saveCamBg:       false,
  exportFormat:    'png',

  // Grid
  gridVisible:     false,
  gridSize:        40,

  // Pointer tracking (touch/mouse)
  pressure:        1.0,
};

// ═══════════════════════════════════════════════════════════
//  DOM REFS
// ═══════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);

const Dom = {
  splash:           $('splash'),
  app:              $('app'),
  canvasArea:       $('canvas-area'),
  camVideo:         $('camera-video'),
  drawCanvas:       $('draw-canvas'),
  edgeCanvas:       $('edge-canvas'),
  refCanvas:        $('reference-canvas'),
  gridOverlay:      $('grid-overlay'),
  brushPreview:     $('brush-preview'),
  camPermission:    $('cam-permission'),
  toastContainer:   $('toast-container'),
  toolbar:          $('toolbar'),
  layerBadge:       $('layer-name-badge'),
  refControls:      $('ref-controls'),
  settingsModal:    $('settings-modal'),
  refFileInput:     $('ref-file-input'),
  camStatusDot:     $('cam-status-dot'),

  // Buttons
  btnUndo:          $('btn-undo'),
  btnRedo:          $('btn-redo'),
  btnSettings:      $('btn-settings'),
  btnCamToggle:     $('btn-camera-toggle'),
  btnFlipCam:       $('btn-flip-camera'),
  btnGrid:          $('btn-grid'),
  btnSave:          $('btn-save'),
  btnClear:         $('btn-clear'),
  btnEdge:          $('btn-edge-toggle'),
  btnLoadRef:       $('btn-load-ref'),
  btnRefMove:       $('ref-move-mode'),
  btnRefRemove:     $('ref-remove'),
  btnReqCam:        $('btn-request-cam'),
  btnFullscreen:    $('btn-fullscreen'),
  btnClearAll:      $('btn-clear-all-confirm'),
  btnCamFacing:     $('settings-cam-facing'),

  // Sliders
  strokeSize:       $('stroke-size'),
  opacitySlider:    $('opacity-slider'),
  camOpacity:       $('cam-opacity'),
  refOpacity:       $('ref-opacity'),
  settingsBright:   $('settings-brightness'),
  settingsContrast: $('settings-contrast'),

  // Value displays
  strokeSizeVal:    $('stroke-size-val'),
  opacityVal:       $('opacity-val'),
  camOpacityVal:    $('cam-opacity-val'),
  edgeVal:          $('edge-val'),

  // Toggles
  toggleSmooth:     $('toggle-smooth'),
  toggleBrushCur:   $('toggle-brush-cursor'),
  toggleSaveCam:    $('toggle-save-cam'),
  togglePressure:   $('toggle-pressure'),

  // Export
  exportFormat:     $('export-format'),

  // Color
  colorInput:       $('color-picker-input'),
};

// ═══════════════════════════════════════════════════════════
//  CANVAS CONTEXTS
// ═══════════════════════════════════════════════════════════
let drawCtx, edgeCtx, refCtx;

function initCanvases() {
  const area = Dom.canvasArea;
  const W = area.clientWidth;
  const H = area.clientHeight;

  [Dom.drawCanvas, Dom.edgeCanvas, Dom.refCanvas].forEach(c => {
    c.width  = W * devicePixelRatio;
    c.height = H * devicePixelRatio;
    c.style.width  = W + 'px';
    c.style.height = H + 'px';
  });

  drawCtx = Dom.drawCanvas.getContext('2d');
  edgeCtx = Dom.edgeCanvas.getContext('2d');
  refCtx  = Dom.refCanvas.getContext('2d');

  drawCtx.scale(devicePixelRatio, devicePixelRatio);
  edgeCtx.scale(devicePixelRatio, devicePixelRatio);
  refCtx.scale(devicePixelRatio, devicePixelRatio);

  drawCtx.lineCap    = 'round';
  drawCtx.lineJoin   = 'round';
  drawCtx.imageSmoothingEnabled = true;
}

// ═══════════════════════════════════════════════════════════
//  DRAWING ENGINE
// ═══════════════════════════════════════════════════════════
function getCanvasPos(e) {
  const rect = Dom.drawCanvas.getBoundingClientRect();
  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
    // Extract pressure if available
    State.pressure = e.touches[0].force > 0 ? e.touches[0].force : 1.0;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
    State.pressure = 1.0;
  }
  return {
    x: (clientX - rect.left),
    y: (clientY - rect.top)
  };
}

function applyDrawStyle() {
  const alpha = State.opacity * (State.currentTool === 'marker' ? 0.6 : 1.0);
  const size  = State.strokeSize * (State.currentTool === 'marker' ? 1.8 : 1.0);
  const pressureSize = size * (State.showPressure ? State.pressure : 1.0);

  drawCtx.globalCompositeOperation = State.currentTool === 'eraser' ? 'destination-out' : 'source-over';
  drawCtx.globalAlpha   = State.currentTool === 'eraser' ? 1.0 : alpha;
  drawCtx.strokeStyle   = State.currentColor;
  drawCtx.fillStyle     = State.currentColor;
  drawCtx.lineWidth     = pressureSize;
  drawCtx.lineCap       = 'round';
  drawCtx.lineJoin      = 'round';

  if (State.currentTool === 'brush') {
    drawCtx.shadowColor  = State.currentColor;
    drawCtx.shadowBlur   = pressureSize * 0.5;
  } else {
    drawCtx.shadowBlur   = 0;
  }
}

function startDraw(e) {
  e.preventDefault();
  const { x, y } = getCanvasPos(e);

  if (State.currentTool === 'eyedropper') {
    pickColor(x, y);
    return;
  }

  State.isDrawing = true;
  State.lastX = x;
  State.lastY = y;
  State.startX = x;
  State.startY = y;

  if (State.currentTool === 'line' || State.currentTool === 'rect' || State.currentTool === 'circle') {
    // snapshot for shape tools
    State.shapeSnapshot = drawCtx.getImageData(0, 0, Dom.drawCanvas.width, Dom.drawCanvas.height);
  }

  if (State.currentTool === 'pen' || State.currentTool === 'brush' || State.currentTool === 'marker') {
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  }

  if (State.currentTool === 'eraser') {
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  }

  applyDrawStyle();
}

function draw(e) {
  e.preventDefault();
  if (!State.isDrawing) {
    updateBrushPreview(e);
    return;
  }

  const { x, y } = getCanvasPos(e);

  // Update brush preview
  updateBrushPreviewPos(x, y);

  applyDrawStyle();

  switch (State.currentTool) {
    case 'pen':
    case 'brush':
    case 'marker':
    case 'eraser': {
      if (State.smoothing) {
        // Quadratic bezier smoothing
        const mx = (State.lastX + x) / 2;
        const my = (State.lastY + y) / 2;
        drawCtx.quadraticCurveTo(State.lastX, State.lastY, mx, my);
      } else {
        drawCtx.lineTo(x, y);
      }
      drawCtx.stroke();
      drawCtx.beginPath();
      drawCtx.moveTo(State.smoothing ? (State.lastX + x) / 2 : x, State.smoothing ? (State.lastY + y) / 2 : y);
      break;
    }

    case 'line': {
      drawCtx.putImageData(State.shapeSnapshot, 0, 0);
      applyDrawStyle();
      drawCtx.beginPath();
      drawCtx.moveTo(State.startX, State.startY);
      drawCtx.lineTo(x, y);
      drawCtx.stroke();
      break;
    }

    case 'rect': {
      drawCtx.putImageData(State.shapeSnapshot, 0, 0);
      applyDrawStyle();
      drawCtx.beginPath();
      drawCtx.strokeRect(State.startX, State.startY, x - State.startX, y - State.startY);
      break;
    }

    case 'circle': {
      drawCtx.putImageData(State.shapeSnapshot, 0, 0);
      applyDrawStyle();
      const rx = Math.abs(x - State.startX) / 2;
      const ry = Math.abs(y - State.startY) / 2;
      const cx = State.startX + (x - State.startX) / 2;
      const cy = State.startY + (y - State.startY) / 2;
      drawCtx.beginPath();
      drawCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      drawCtx.stroke();
      break;
    }
  }

  State.lastX = x;
  State.lastY = y;
}

function endDraw(e) {
  if (!State.isDrawing) return;
  State.isDrawing = false;

  // Reset composite
  drawCtx.globalCompositeOperation = 'source-over';
  drawCtx.globalAlpha = 1.0;
  drawCtx.shadowBlur  = 0;

  saveHistory();
}

// ═══════════════════════════════════════════════════════════
//  BRUSH CURSOR PREVIEW
// ═══════════════════════════════════════════════════════════
function updateBrushPreview(e) {
  if (!State.showBrushCursor) return;
  const { x, y } = getCanvasPos(e);
  updateBrushPreviewPos(x, y);
}

function updateBrushPreviewPos(x, y) {
  if (!State.showBrushCursor || State.currentTool === 'eyedropper') {
    Dom.brushPreview.style.display = 'none';
    return;
  }
  const size = Math.max(State.strokeSize * 2, 10);
  Dom.brushPreview.style.display = 'block';
  Dom.brushPreview.style.width   = size + 'px';
  Dom.brushPreview.style.height  = size + 'px';
  Dom.brushPreview.style.left    = (x - size / 2) + Dom.canvasArea.getBoundingClientRect().left + 'px';
  Dom.brushPreview.style.top     = (y - size / 2) + Dom.canvasArea.getBoundingClientRect().top + 'px';
  Dom.brushPreview.style.borderColor = State.currentTool === 'eraser'
    ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.7)';
  Dom.brushPreview.style.position = 'fixed';
}

function hideBrushPreview() {
  Dom.brushPreview.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
//  COLOR PICK (EYEDROPPER)
// ═══════════════════════════════════════════════════════════
function pickColor(x, y) {
  // Sample from the draw canvas
  const pixel = drawCtx.getImageData(
    x * devicePixelRatio,
    y * devicePixelRatio,
    1, 1
  ).data;
  // If transparent, try sampling from video
  let r = pixel[0], g = pixel[1], b = pixel[2], a = pixel[3];
  if (a < 10 && Dom.camVideo && State.cameraActive) {
    const offscreen = document.createElement('canvas');
    offscreen.width  = Dom.camVideo.videoWidth;
    offscreen.height = Dom.camVideo.videoHeight;
    const octx = offscreen.getContext('2d');
    octx.drawImage(Dom.camVideo, 0, 0);
    const rect = Dom.canvasArea.getBoundingClientRect();
    const vx = Math.round((x / rect.width)  * Dom.camVideo.videoWidth);
    const vy = Math.round((y / rect.height) * Dom.camVideo.videoHeight);
    const vp = octx.getImageData(vx, vy, 1, 1).data;
    r = vp[0]; g = vp[1]; b = vp[2];
  }
  const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  setColor(hex);
  showToast('🎨 Color picked: ' + hex.toUpperCase(), 'success');

  // Switch back to previous tool
  selectTool('pen');
}

// ═══════════════════════════════════════════════════════════
//  CAMERA MANAGEMENT
// ═══════════════════════════════════════════════════════════
async function startCamera() {
  if (State.cameraStream) {
    State.cameraStream.getTracks().forEach(t => t.stop());
    State.cameraStream = null;
  }

  try {
    const constraints = {
      video: {
        facingMode: State.cameraFacing,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    State.cameraStream = stream;
    Dom.camVideo.srcObject = stream;
    State.cameraActive = true;

    Dom.camPermission.classList.add('hidden');
    Dom.camStatusDot.style.background = 'var(--accent-green)';
    Dom.camStatusDot.style.boxShadow  = '0 0 6px var(--accent-green)';

    Dom.camVideo.onloadedmetadata = () => {
      Dom.camVideo.play();
      if (State.edgeDetect) startEdgeDetection();
    };

    showToast('📷 Camera active', 'success');
  } catch (err) {
    console.warn('Camera error:', err);
    Dom.camPermission.classList.remove('hidden');
    Dom.camStatusDot.style.background = '#ff6363';
    Dom.camStatusDot.style.boxShadow  = '0 0 6px #ff6363';
    showToast('❌ Camera access denied', 'error');
  }
}

function stopCamera() {
  if (State.cameraStream) {
    State.cameraStream.getTracks().forEach(t => t.stop());
    State.cameraStream = null;
  }
  Dom.camVideo.srcObject = null;
  State.cameraActive = false;
  Dom.camStatusDot.style.background = 'var(--text-muted)';
  Dom.camStatusDot.style.boxShadow  = 'none';
  stopEdgeDetection();
  showToast('📷 Camera off', 'info');
}

async function flipCamera() {
  State.cameraFacing = State.cameraFacing === 'environment' ? 'user' : 'environment';
  Dom.btnCamFacing.textContent = State.cameraFacing === 'environment' ? 'Back' : 'Front';
  if (State.cameraActive) {
    await startCamera();
    showToast('🔄 Camera flipped', 'info');
  }
}

function setCameraStyle() {
  const b = State.brightness;
  const c = State.contrast;
  Dom.camVideo.style.filter = `brightness(${1 + b / 100}) contrast(${c / 100})`;
  Dom.camVideo.style.opacity = State.camOpacity;
}

// ═══════════════════════════════════════════════════════════
//  EDGE DETECTION (Sobel operator on video frame)
// ═══════════════════════════════════════════════════════════
let edgeAnimId = null;

function startEdgeDetection() {
  if (!State.cameraActive) return;
  State.edgeDetect = true;
  Dom.edgeCanvas.classList.add('visible');
  Dom.edgeVal.textContent = 'On';
  Dom.btnEdge.style.color = 'var(--accent-green)';
  runEdgeFrame();
}

function stopEdgeDetection() {
  State.edgeDetect = false;
  Dom.edgeCanvas.classList.remove('visible');
  Dom.edgeVal.textContent = 'Off';
  Dom.btnEdge.style.color = '';
  if (edgeAnimId) { cancelAnimationFrame(edgeAnimId); edgeAnimId = null; }
}

function runEdgeFrame() {
  if (!State.edgeDetect) return;

  const video = Dom.camVideo;
  if (!video.videoWidth) {
    edgeAnimId = requestAnimationFrame(runEdgeFrame);
    return;
  }

  const W = Dom.canvasArea.clientWidth;
  const H = Dom.canvasArea.clientHeight;
  const scale = 0.4; // downsample for performance
  const sw = Math.round(W * scale);
  const sh = Math.round(H * scale);

  // Use offscreen canvas for processing
  const offscreen = document.createElement('canvas');
  offscreen.width  = sw;
  offscreen.height = sh;
  const octx = offscreen.getContext('2d');
  octx.drawImage(video, 0, 0, sw, sh);

  const imgData = octx.getImageData(0, 0, sw, sh);
  const src     = imgData.data;
  const out     = new Uint8ClampedArray(sw * sh * 4);

  // Sobel edge detection
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = (y * sw + x) * 4;

      // Sample grayscale of surrounding pixels
      const gray = (p) => {
        const i = p * 4;
        return (src[i] * 0.299 + src[i+1] * 0.587 + src[i+2] * 0.114);
      };

      const tl = gray((y-1)*sw + (x-1));
      const tm = gray((y-1)*sw + x);
      const tr = gray((y-1)*sw + (x+1));
      const ml = gray(y*sw + (x-1));
      const mr = gray(y*sw + (x+1));
      const bl = gray((y+1)*sw + (x-1));
      const bm = gray((y+1)*sw + x);
      const br = gray((y+1)*sw + (x+1));

      const gx = (-tl - 2*ml - bl + tr + 2*mr + br);
      const gy = (-tl - 2*tm - tr + bl + 2*bm + br);
      const mag = Math.min(255, Math.sqrt(gx*gx + gy*gy));

      // Output: glow color for edges
      const threshold = 30;
      if (mag > threshold) {
        const intensity = (mag - threshold) / (255 - threshold);
        out[idx]   = Math.round(108 * intensity);   // R
        out[idx+1] = Math.round(140 * intensity);   // G
        out[idx+2] = Math.round(255 * intensity);   // B
        out[idx+3] = Math.round(220 * intensity);   // A
      } else {
        out[idx+3] = 0; // transparent
      }
    }
  }

  const outData = new ImageData(out, sw, sh);
  edgeCtx.clearRect(0, 0, W, H);
  edgeCtx.save();
  edgeCtx.scale(1/scale, 1/scale);

  const outCanvas = document.createElement('canvas');
  outCanvas.width  = sw;
  outCanvas.height = sh;
  outCanvas.getContext('2d').putImageData(outData, 0, 0);
  edgeCtx.drawImage(outCanvas, 0, 0, W * scale, H * scale);
  edgeCtx.restore();

  // Next frame (throttled to ~15fps for performance)
  setTimeout(() => {
    edgeAnimId = requestAnimationFrame(runEdgeFrame);
  }, 66);
}

// ═══════════════════════════════════════════════════════════
//  REFERENCE IMAGE
// ═══════════════════════════════════════════════════════════
function loadReferenceImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      State.refImage = img;
      State.refX = 0;
      State.refY = 0;
      State.refScale = Math.min(
        Dom.canvasArea.clientWidth  / img.width,
        Dom.canvasArea.clientHeight / img.height
      );
      drawReferenceImage();
      Dom.refControls.classList.add('visible');
      showToast('🖼️ Reference image loaded', 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function drawReferenceImage() {
  if (!State.refImage) return;
  const W = Dom.canvasArea.clientWidth;
  const H = Dom.canvasArea.clientHeight;
  refCtx.clearRect(0, 0, W, H);
  refCtx.globalAlpha = State.refOpacity;
  const dw = State.refImage.width  * State.refScale;
  const dh = State.refImage.height * State.refScale;
  refCtx.drawImage(State.refImage, State.refX, State.refY, dw, dh);
  refCtx.globalAlpha = 1.0;
}

function removeReferenceImage() {
  State.refImage = null;
  const W = Dom.canvasArea.clientWidth;
  const H = Dom.canvasArea.clientHeight;
  refCtx.clearRect(0, 0, W, H);
  Dom.refControls.classList.remove('visible');
  showToast('🗑️ Reference removed', 'info');
}

// ═══════════════════════════════════════════════════════════
//  HISTORY (UNDO / REDO)
// ═══════════════════════════════════════════════════════════
function saveHistory() {
  const snapshot = drawCtx.getImageData(0, 0, Dom.drawCanvas.width, Dom.drawCanvas.height);
  if (State.historyStep < State.history.length - 1) {
    State.history = State.history.slice(0, State.historyStep + 1);
  }
  State.history.push(snapshot);
  if (State.history.length > State.maxHistory) {
    State.history.shift();
  } else {
    State.historyStep++;
  }
  updateUndoRedoBtns();
}

function undo() {
  if (State.historyStep <= 0) {
    if (State.historyStep === 0) {
      // Clear to blank
      drawCtx.clearRect(0, 0, Dom.drawCanvas.width, Dom.drawCanvas.height);
      State.historyStep = -1;
    }
    showToast('⚠️ Nothing to undo', 'info');
    return;
  }
  State.historyStep--;
  drawCtx.putImageData(State.history[State.historyStep], 0, 0);
  updateUndoRedoBtns();
}

function redo() {
  if (State.historyStep >= State.history.length - 1) {
    showToast('⚠️ Nothing to redo', 'info');
    return;
  }
  State.historyStep++;
  drawCtx.putImageData(State.history[State.historyStep], 0, 0);
  updateUndoRedoBtns();
}

function updateUndoRedoBtns() {
  Dom.btnUndo.style.opacity = State.historyStep >= 0 ? '1' : '0.4';
  Dom.btnRedo.style.opacity = State.historyStep < State.history.length - 1 ? '1' : '0.4';
}

// ═══════════════════════════════════════════════════════════
//  TOOL SELECTION
// ═══════════════════════════════════════════════════════════
function selectTool(name) {
  State.currentTool = name;

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
    btn.setAttribute('aria-pressed', btn.dataset.tool === name ? 'true' : 'false');
  });

  Dom.layerBadge.textContent = {
    pen:       'Pen — Precise drawing',
    brush:     'Brush — Soft glow strokes',
    marker:    'Marker — Semi-transparent',
    eraser:    'Eraser — Remove strokes',
    line:      'Line — Straight line',
    rect:      'Rectangle — Shape',
    circle:    'Circle/Ellipse — Shape',
    eyedropper:'Eyedropper — Pick color',
  }[name] || 'Drawing';

  // Cursor style
  Dom.drawCanvas.style.cursor = name === 'eraser' ? 'cell'
    : name === 'eyedropper' ? 'crosshair'
    : name === 'line' || name === 'rect' || name === 'circle' ? 'crosshair'
    : 'default';
}

// ═══════════════════════════════════════════════════════════
//  COLOR MANAGEMENT
// ═══════════════════════════════════════════════════════════
function setColor(hex) {
  State.currentColor = hex;
  Dom.colorInput.value = hex;
  document.querySelectorAll('.color-swatch').forEach(sw => {
    const isSelected = sw.dataset.color === hex;
    sw.classList.toggle('selected', isSelected);
  });
}

// ═══════════════════════════════════════════════════════════
//  EXPORT / SAVE
// ═══════════════════════════════════════════════════════════
function saveDrawing() {
  const format = State.exportFormat;
  const mimeType = format === 'jpg' ? 'image/jpeg'
    : format === 'webp' ? 'image/webp'
    : 'image/png';

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width  = Dom.drawCanvas.width;
  exportCanvas.height = Dom.drawCanvas.height;
  const ectx = exportCanvas.getContext('2d');

  if (State.saveCamBg && State.cameraActive) {
    ectx.drawImage(Dom.camVideo, 0, 0, exportCanvas.width, exportCanvas.height);
  } else {
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  // Draw reference if visible
  if (State.refImage) {
    ectx.globalAlpha = State.refOpacity;
    ectx.drawImage(
      Dom.refCanvas,
      0, 0, Dom.refCanvas.width, Dom.refCanvas.height
    );
    ectx.globalAlpha = 1.0;
  }

  // Draw user strokes
  ectx.drawImage(Dom.drawCanvas, 0, 0);

  const link = document.createElement('a');
  const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
  link.download = `AR-Trace-${ts}.${format}`;
  link.href     = exportCanvas.toDataURL(mimeType, 0.95);
  link.click();

  showToast('💾 Saved as ' + link.download, 'success');
}

// ═══════════════════════════════════════════════════════════
//  TOAST SYSTEM
// ═══════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  if (type === 'success') toast.style.borderColor = 'rgba(57,255,132,0.4)';
  if (type === 'error')   toast.style.borderColor = 'rgba(255,99,99,0.4)';

  Dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ═══════════════════════════════════════════════════════════
//  RESIZE HANDLER
// ═══════════════════════════════════════════════════════════
let resizeTimer;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Save current drawing
    const snapshot = Dom.drawCanvas.width > 0
      ? drawCtx.getImageData(0, 0, Dom.drawCanvas.width, Dom.drawCanvas.height)
      : null;

    initCanvases();

    // Restore drawing
    if (snapshot) {
      drawCtx.putImageData(snapshot, 0, 0);
    }

    // Redraw reference
    if (State.refImage) drawReferenceImage();
  }, 200);
}

// ═══════════════════════════════════════════════════════════
//  FULLSCREEN
// ═══════════════════════════════════════════════════════════
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
//  CLEAR CANVAS
// ═══════════════════════════════════════════════════════════
function clearCanvas() {
  drawCtx.clearRect(0, 0, Dom.drawCanvas.width, Dom.drawCanvas.height);
  saveHistory();
  showToast('🗑️ Canvas cleared', 'info');
}

// ═══════════════════════════════════════════════════════════
//  SETTINGS MODAL
// ═══════════════════════════════════════════════════════════
function openSettings() {
  Dom.settingsModal.classList.add('open');
}
function closeSettings() {
  Dom.settingsModal.classList.remove('open');
}

// ═══════════════════════════════════════════════════════════
//  GRID OVERLAY
// ═══════════════════════════════════════════════════════════
function toggleGrid() {
  State.gridVisible = !State.gridVisible;
  Dom.gridOverlay.classList.toggle('visible', State.gridVisible);
  Dom.btnGrid.classList.toggle('active', State.gridVisible);
  showToast(State.gridVisible ? '📐 Grid on' : '📐 Grid off', 'info');
}

// ═══════════════════════════════════════════════════════════
//  EVENT BINDING
// ═══════════════════════════════════════════════════════════
function bindEvents() {

  // ─ Drawing canvas pointer events ───────────────────────
  Dom.drawCanvas.addEventListener('pointerdown',  startDraw, { passive: false });
  Dom.drawCanvas.addEventListener('pointermove',  draw,      { passive: false });
  Dom.drawCanvas.addEventListener('pointerup',    endDraw,   { passive: false });
  Dom.drawCanvas.addEventListener('pointerleave', endDraw,   { passive: false });
  Dom.drawCanvas.addEventListener('pointercancel', endDraw,  { passive: false });

  // Touch events fallback for older browsers
  Dom.drawCanvas.addEventListener('touchstart',  startDraw, { passive: false });
  Dom.drawCanvas.addEventListener('touchmove',   draw,      { passive: false });
  Dom.drawCanvas.addEventListener('touchend',    endDraw,   { passive: false });

  // Mouse move for brush preview (when not drawing)
  Dom.drawCanvas.addEventListener('mousemove', (e) => {
    if (!State.isDrawing) updateBrushPreview(e);
  });
  Dom.drawCanvas.addEventListener('mouseleave', hideBrushPreview);

  // ─ Tool selection ───────────────────────────────────────
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });

  // ─ Color swatches ───────────────────────────────────────
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => setColor(sw.dataset.color));
    sw.addEventListener('keydown', (e) => e.key === 'Enter' && setColor(sw.dataset.color));
  });

  Dom.colorInput.addEventListener('input', (e) => {
    State.currentColor = e.target.value;
    // deselect swatches
    document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('selected'));
  });

  // ─ Sliders ─────────────────────────────────────────────
  Dom.strokeSize.addEventListener('input', (e) => {
    State.strokeSize = +e.target.value;
    Dom.strokeSizeVal.textContent = State.strokeSize + 'px';
  });

  Dom.opacitySlider.addEventListener('input', (e) => {
    State.opacity = e.target.value / 100;
    Dom.opacityVal.textContent = e.target.value + '%';
  });

  Dom.camOpacity.addEventListener('input', (e) => {
    State.camOpacity = e.target.value / 100;
    Dom.camOpacityVal.textContent = e.target.value + '%';
    setCameraStyle();
  });

  Dom.refOpacity.addEventListener('input', (e) => {
    State.refOpacity = e.target.value / 100;
    if (State.refImage) drawReferenceImage();
  });

  Dom.settingsBright.addEventListener('input', (e) => {
    State.brightness = +e.target.value;
    setCameraStyle();
  });

  Dom.settingsContrast.addEventListener('input', (e) => {
    State.contrast = +e.target.value;
    setCameraStyle();
  });

  // ─ Header buttons ───────────────────────────────────────
  Dom.btnUndo.addEventListener('click', undo);
  Dom.btnRedo.addEventListener('click', redo);
  Dom.btnSettings.addEventListener('click', openSettings);

  // ─ Side panel ───────────────────────────────────────────
  Dom.btnCamToggle.addEventListener('click', () => {
    if (State.cameraActive) stopCamera();
    else startCamera();
  });

  Dom.btnFlipCam.addEventListener('click', flipCamera);
  Dom.btnGrid.addEventListener('click', toggleGrid);
  Dom.btnFullscreen.addEventListener('click', toggleFullscreen);
  Dom.btnSave.addEventListener('click', saveDrawing);

  // ─ Toolbar buttons ──────────────────────────────────────
  Dom.btnClear.addEventListener('click', () => {
    if (confirm('Clear the canvas?')) clearCanvas();
  });

  Dom.btnEdge.addEventListener('click', () => {
    if (State.edgeDetect) stopEdgeDetection();
    else startEdgeDetection();
  });

  Dom.btnLoadRef.addEventListener('click', () => Dom.refFileInput.click());
  Dom.refFileInput.addEventListener('change', (e) => loadReferenceImage(e.target.files[0]));

  Dom.btnRefRemove.addEventListener('click', removeReferenceImage);

  // Reference move mode
  Dom.btnRefMove.addEventListener('click', () => {
    State.refMoving = !State.refMoving;
    Dom.btnRefMove.classList.toggle('active', State.refMoving);
    showToast(State.refMoving ? '↔️ Move reference: drag to reposition' : '✏️ Drawing mode', 'info');
  });

  // Reference image drag
  let refDragStart = null;
  Dom.drawCanvas.addEventListener('pointerdown', (e) => {
    if (!State.refMoving || !State.refImage) return;
    e.stopPropagation();
    const pos = getCanvasPos(e);
    refDragStart = { px: pos.x, py: pos.y, rx: State.refX, ry: State.refY };
  }, true);

  Dom.drawCanvas.addEventListener('pointermove', (e) => {
    if (!State.refMoving || !refDragStart || !State.refImage) return;
    e.stopPropagation();
    const pos = getCanvasPos(e);
    State.refX = refDragStart.rx + (pos.x - refDragStart.px);
    State.refY = refDragStart.ry + (pos.y - refDragStart.py);
    drawReferenceImage();
  }, true);

  Dom.drawCanvas.addEventListener('pointerup', () => { refDragStart = null; }, true);

  // ─ Camera request button ─────────────────────────────
  Dom.btnReqCam.addEventListener('click', startCamera);

  // ─ Settings modal ────────────────────────────────────
  Dom.settingsModal.addEventListener('click', (e) => {
    if (e.target === Dom.settingsModal) closeSettings();
  });

  Dom.btnCamFacing.addEventListener('click', flipCamera);

  Dom.btnClearAll.addEventListener('click', () => {
    if (confirm('Reset everything? This will clear the canvas and all settings.')) {
      clearCanvas();
      State.history = [];
      State.historyStep = -1;
      removeReferenceImage();
      closeSettings();
      showToast('🔄 Everything reset', 'info');
    }
  });

  // ─ Toggles ─────────────────────────────────────────
  Dom.toggleSmooth.addEventListener('change', (e) => {
    State.smoothing = e.target.checked;
  });

  Dom.toggleBrushCur.addEventListener('change', (e) => {
    State.showBrushCursor = e.target.checked;
    if (!e.target.checked) hideBrushPreview();
  });

  Dom.toggleSaveCam.addEventListener('change', (e) => {
    State.saveCamBg = e.target.checked;
  });

  Dom.togglePressure.addEventListener('change', (e) => {
    State.showPressure = e.target.checked;
  });

  Dom.exportFormat.addEventListener('change', (e) => {
    State.exportFormat = e.target.value;
  });

  // ─ Keyboard shortcuts ──────────────────────────────
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'y') { e.preventDefault(); redo(); }
      if (e.key === 's') { e.preventDefault(); saveDrawing(); }
    } else {
      switch (e.key.toLowerCase()) {
        case 'p': selectTool('pen');       break;
        case 'b': selectTool('brush');     break;
        case 'm': selectTool('marker');    break;
        case 'e': selectTool('eraser');    break;
        case 'l': selectTool('line');      break;
        case 'r': selectTool('rect');      break;
        case 'c': selectTool('circle');    break;
        case 'i': selectTool('eyedropper'); break;
        case 'g': toggleGrid();            break;
        case 'escape': closeSettings();    break;
        case '[':
          State.strokeSize = Math.max(1, State.strokeSize - 2);
          Dom.strokeSize.value = State.strokeSize;
          Dom.strokeSizeVal.textContent = State.strokeSize + 'px';
          break;
        case ']':
          State.strokeSize = Math.min(60, State.strokeSize + 2);
          Dom.strokeSize.value = State.strokeSize;
          Dom.strokeSizeVal.textContent = State.strokeSize + 'px';
          break;
      }
    }
  });

  // ─ Pinch-to-zoom reference image ──────────────────
  let lastPinchDist = 0;
  Dom.canvasArea.addEventListener('touchstart', (e) => {
    if (State.refMoving && State.refImage && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.hypot(dx, dy);
    }
  }, { passive: true });

  Dom.canvasArea.addEventListener('touchmove', (e) => {
    if (State.refMoving && State.refImage && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = dist / lastPinchDist;
      State.refScale = Math.max(0.1, Math.min(5, State.refScale * delta));
      lastPinchDist = dist;
      drawReferenceImage();
    }
  }, { passive: true });

  // ─ Window resize ────────────────────────────────────
  window.addEventListener('resize', handleResize);
  screen.orientation?.addEventListener('change', handleResize);

  // ─ PWA install prompt ────────────────────────────────
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window._installPrompt = e;
    setTimeout(() => {
      showToast('📲 Add to Home Screen for best experience', 'info');
    }, 3000);
  });
}

// ═══════════════════════════════════════════════════════════
//  SERVICE WORKER REGISTRATION
// ═══════════════════════════════════════════════════════════
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════
//  BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════
async function boot() {
  // Init canvases
  initCanvases();

  // Bind all events
  bindEvents();

  // Set initial UI state
  updateUndoRedoBtns();
  selectTool('pen');
  setColor('#ffffff');

  // Save initial blank state
  saveHistory();

  // Try to start camera automatically
  try {
    await startCamera();
  } catch {
    // Handled inside startCamera
  }

  // Register service worker
  registerSW();

  // Hide splash after loading animation
  setTimeout(() => {
    Dom.splash.classList.add('hidden');
  }, 2000);

  // Emit welcome toast
  setTimeout(() => {
    showToast('✨ AR Trace Studio ready! Tap to draw.', 'success');
  }, 2400);
}

// ─ Start app ─────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
