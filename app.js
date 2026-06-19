import { PDFDocument, degrees, StandardFonts, rgb, PDFName } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { AdManager } from './adManager.js';
import { Filesystem, Directory } from 'https://cdn.jsdelivr.net/npm/@capacitor/filesystem@6.0.0/+esm';
import { Share } from 'https://cdn.jsdelivr.net/npm/@capacitor/share@6.0.0/+esm';
import { App } from 'https://cdn.jsdelivr.net/npm/@capacitor/app@6.0.0/+esm';

// ==========================================
// UTILITY & ALERT FUNCTIONS
// ==========================================
function showCustomAlert(message) {
    let alertBox = document.getElementById('custom-alert-box');
    
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'custom-alert-box';
        alertBox.style = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.8); display: flex; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(5px); opacity: 0; transition: opacity 0.3s ease; pointer-events: none;";
        alertBox.innerHTML = `
            <div style="background: var(--surface-color); padding: 30px; border-radius: 16px; border: 1px solid var(--glass-border); box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; max-width: 85%; width: 320px; transform: translateY(20px); transition: transform 0.3s ease;">
                <i class="fas fa-shield-alt" style="font-size: 3rem; color: #f59e0b; margin-bottom: 15px;"></i>
                <h3 style="margin-bottom: 10px; color: white; font-size: 1.2rem;">Notice</h3>
                <p id="custom-alert-msg" style="color: var(--text-secondary); margin-bottom: 20px; font-size: 0.95rem; line-height: 1.5;"></p>
                <button id="custom-alert-btn" style="background: var(--accent); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; font-size: 1rem; transition: 0.2s;">Got it</button>
            </div>
        `;
        document.body.appendChild(alertBox);
        
        document.getElementById('custom-alert-btn').addEventListener('click', () => {
            alertBox.style.opacity = '0';
            alertBox.style.pointerEvents = 'none';
            alertBox.children[0].style.transform = 'translateY(20px)';
        });
    }
    
    document.getElementById('custom-alert-msg').innerHTML = message;
    alertBox.style.pointerEvents = 'auto';
    alertBox.style.opacity = '1';
    alertBox.children[0].style.transform = 'translateY(0)';
}

function handleError(error) {
    const msg = error.message ? error.message.toLowerCase() : 'unknown error';
    const activeViewElement = document.querySelector('.view-section.active');
    const activeView = activeViewElement ? activeViewElement.id : '';

    if (msg.includes('encrypted') || msg.includes('password') || msg.includes('decrypt')) {
        if (activeView === 'view-unlock') {
            showCustomAlert("Unlock Failed ❌<br><br>Incorrect password, or API server issue.");
        } else {
            showCustomAlert("This PDF is password protected 🔒.<br><br>Please use the <b>'Unlock PDF'</b> tool first to remove the password before using this feature.");
        }
    } else {
        showCustomAlert(`Error: ${error.message}`);
    }
}

let lastBackPress = 0;
if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    App.addListener('backButton', () => {
        const activeView = document.querySelector('.view-section.active')?.id;
        
        if (activeView && activeView !== 'view-dashboard') {
            window.switchView('dashboard');
        } else {
            const now = new Date().getTime();
            if (now - lastBackPress < 2000) {
                App.exitApp();
            } else {
                lastBackPress = now;
            }
        }
    });
}

window.switchView = (viewId) => {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => 
        btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewId)
    );
    
    if(activeBtn) {
        activeBtn.classList.add('active');
    }

    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(`view-${viewId}`);
    if(targetView) {
        targetView.classList.add('active');
    }

    if(viewId === 'history') {
        window.renderHistory();
    }
};

const getBaseName = (filename) => filename.substring(0, filename.lastIndexOf('.')) || filename;

// ==========================================
// HISTORY & DOWNLOAD MANAGEMENT
// ==========================================
const DB_NAME = 'AmazingPDFHistory';
const STORE_NAME = 'files';

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveToHistory(bytes, filename, type) {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ filename, type, data: bytes, date: new Date().getTime() });
    
    return new Promise(resolve => tx.oncomplete = resolve);
}

window.getHistory = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    
    return new Promise(resolve => {
        req.onsuccess = () => resolve(req.result.sort((a,b) => b.date - a.date));
    });
};

window.deleteHistory = async (id) => {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    
    return new Promise(resolve => tx.oncomplete = resolve);
};

window.renderHistory = async () => {
    const list = document.getElementById('history-list');
    if (!list) return;
    
    list.innerHTML = '<p>Loading...</p>';
    const items = await window.getHistory();
    
    if (!items.length) {
        list.innerHTML = '<p style="color:var(--text-secondary);">No downloads history found.</p>';
        return;
    }
    
    list.innerHTML = '';
    items.forEach(item => {
        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border); gap: 10px; margin-bottom: 10px;">
                <div class="text-container" style="flex: 1; min-width: 0;">
                    <b class="text-ellipsis" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${item.filename}</b>
                    <small style="color:var(--text-secondary);">${new Date(item.date).toLocaleString()}</small>
                </div>
                <div style="display:flex; gap:10px; flex-shrink: 0;">
                    <button onclick="triggerHistoryDownload(${item.id})" style="background:var(--accent); color:white; border:none; padding:8px 12px; border-radius:6px;">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <button onclick="removeHistoryItem(${item.id})" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
};

window.removeHistoryItem = async (id) => { 
    await window.deleteHistory(id); 
    window.renderHistory(); 
};

window.triggerHistoryDownload = async (id) => {
    const items = await window.getHistory();
    const item = items.find(i => i.id === id);
    
    if(item) {
        await processAndDownload(item.data, item.filename, item.type, false);
    }
};

function bytesToBase64(bytes) {
    let binary = ''; 
    const len = bytes.byteLength;
    
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    
    return window.btoa(binary);
}

// BULK UPLOAD CHUNKED WRITER
async function processAndDownload(bytes, filename, type, saveToDb = true) {
    if(saveToDb) { 
        try { 
            await saveToHistory(bytes, filename, type); 
        } catch(e) {
            console.error("History save error:", e);
        } 
    }
    
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const chunkSize = 256 * 1024; // 256KB Chunks
            const len = bytes.byteLength; 
            let isFirstChunk = true;
            
            for (let i = 0; i < len; i += chunkSize) {
                const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
                const base64Chunk = bytesToBase64(chunk);
                
                if (isFirstChunk) { 
                    await Filesystem.writeFile({ path: filename, data: base64Chunk, directory: Directory.Documents }); 
                    isFirstChunk = false; 
                } else { 
                    await Filesystem.appendFile({ path: filename, data: base64Chunk, directory: Directory.Documents }); 
                }
            }
            
            const savedFile = await Filesystem.getUri({ path: filename, directory: Directory.Documents });
            await Share.share({ title: filename, text: 'Processed via Amazing PDF', url: savedFile.uri });
            
        } catch (e) { 
            try {
                const blob = new Blob([bytes], { type }); 
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); 
                
                a.href = url; 
                a.download = filename; 
                document.body.appendChild(a); 
                a.click(); 
                document.body.removeChild(a); 
                URL.revokeObjectURL(url);
            } catch(err) { 
                showCustomAlert("Saved to Documents & History!"); 
            }
        }
    } else {
        const blob = new Blob([bytes], { type }); 
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); 
        
        a.href = url; 
        a.download = filename; 
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a); 
        URL.revokeObjectURL(url);
    }
}

// =======================================================
// SMART SCANNER
// =======================================================
let scannerPages = [];
let currentScannerIndex = -1;
let isCroppingMode = false;
let cropPoints = [];
let activeCropPoint = -1;
let scannerOriginalName = "Scanned_Document";

const scannerModal = document.getElementById('scanner-source-modal');
const scannerWorkspace = document.getElementById('scanner-workspace');
const scanCanvas = document.getElementById('scanner-main-canvas');
const scanCtx = scanCanvas ? scanCanvas.getContext('2d') : null;
const cropCanvas = document.getElementById('scanner-crop-canvas');
const cropCtx = cropCanvas ? cropCanvas.getContext('2d') : null;

window.handleScanInput = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    scannerOriginalName = file.name.substring(0, file.name.lastIndexOf('.')) || "Scanned_Document";
    
    if (scannerModal) scannerModal.style.display = 'none';
    if (scannerWorkspace) scannerWorkspace.style.display = 'flex';
    document.body.classList.add('is-editing');
    
    const reader = new FileReader();
    reader.onload = function(event) {
        scannerPages.push({ original: event.target.result, filter: 'magic', rotation: 0 });
        currentScannerIndex = scannerPages.length - 1;
        renderScannerWorkspace();
        renderScannerThumbnails();
    };
    reader.readAsDataURL(file);
    e.target.value = ""; 
};

document.getElementById('hidden-camera-input')?.addEventListener('change', window.handleScanInput);
document.getElementById('hidden-gallery-input')?.addEventListener('change', window.handleScanInput);

function renderScannerWorkspace() {
    if (currentScannerIndex === -1 || !scanCtx || isCroppingMode) return;
    
    const pageData = scannerPages[currentScannerIndex];
    const counter = document.getElementById('scanner-page-counter');
    
    if (counter) {
        counter.innerText = `Page ${currentScannerIndex + 1}`;
    }
    
    document.querySelectorAll('.scanner-filter-btn').forEach(btn => { 
        btn.style.borderColor = btn.dataset.filter === pageData.filter ? '#10b981' : 'transparent'; 
    });

    const renderImg = new Image();
    renderImg.onload = () => {
        const angle = pageData.rotation || 0;
        const isRotated = angle === 90 || angle === 270;
        
        scanCanvas.width = isRotated ? renderImg.height : renderImg.width;
        scanCanvas.height = isRotated ? renderImg.width : renderImg.height;
        
        scanCtx.save();
        scanCtx.translate(scanCanvas.width / 2, scanCanvas.height / 2);
        scanCtx.rotate((angle * Math.PI) / 180);
        scanCtx.translate(-renderImg.width / 2, -renderImg.height / 2);

        if (pageData.filter === 'lighten') scanCtx.filter = 'brightness(1.15) contrast(1.05)';
        else if (pageData.filter === 'magic') scanCtx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)';
        else if (pageData.filter === 'grayscale') scanCtx.filter = 'grayscale(100%)';
        else if (pageData.filter === 'bw') scanCtx.filter = 'grayscale(100%) contrast(1.8) brightness(1.1)';
        else if (pageData.filter === 'eco') scanCtx.filter = 'sepia(0.3) brightness(0.9) contrast(0.9)';
        else scanCtx.filter = 'none';
        
        scanCtx.drawImage(renderImg, 0, 0);
        scanCtx.restore();
    };
    renderImg.src = pageData.original;
}

document.getElementById('btn-scanner-rotate-left')?.addEventListener('click', () => { 
    if(currentScannerIndex === -1 || isCroppingMode) return; 
    scannerPages[currentScannerIndex].rotation = (scannerPages[currentScannerIndex].rotation + 270) % 360; 
    renderScannerWorkspace(); 
});

document.getElementById('btn-scanner-rotate-right')?.addEventListener('click', () => { 
    if(currentScannerIndex === -1 || isCroppingMode) return; 
    scannerPages[currentScannerIndex].rotation = (scannerPages[currentScannerIndex].rotation + 90) % 360; 
    renderScannerWorkspace(); 
});

document.getElementById('btn-scanner-crop-trigger')?.addEventListener('click', () => {
    if(currentScannerIndex === -1) return;
    document.getElementById('scanner-default-top-bar').style.display = 'none';
    document.getElementById('scanner-crop-top-bar').style.display = 'flex';
    startCropMode();
});

function startCropMode() {
    isCroppingMode = true;
    const pageData = scannerPages[currentScannerIndex];
    const tempImg = new Image();
    
    tempImg.onload = () => {
        const angle = pageData.rotation || 0;
        const isRotated = angle === 90 || angle === 270;
        
        scanCanvas.width = isRotated ? tempImg.height : tempImg.width;
        scanCanvas.height = isRotated ? tempImg.width : tempImg.height;
        
        scanCtx.save(); 
        scanCtx.translate(scanCanvas.width / 2, scanCanvas.height / 2); 
        scanCtx.rotate((angle * Math.PI) / 180); 
        scanCtx.translate(-tempImg.width / 2, -tempImg.height / 2); 
        scanCtx.filter = 'none'; 
        scanCtx.drawImage(tempImg, 0, 0); 
        scanCtx.restore();
        
        cropCanvas.width = scanCanvas.width; 
        cropCanvas.height = scanCanvas.height; 
        cropCanvas.style.display = 'block';

        const w = cropCanvas.width; 
        const h = cropCanvas.height; 
        const offset = Math.min(w, h) * 0.15;
        
        cropPoints = [ 
            { x: offset, y: offset }, 
            { x: w - offset, y: offset }, 
            { x: w - offset, y: h - offset }, 
            { x: offset, y: h - offset } 
        ];
        
        drawCropPolygon();
    };
    tempImg.src = pageData.original;
}

function drawCropPolygon() {
    if (!cropCtx) return;
    
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)'; 
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    cropCtx.globalCompositeOperation = 'destination-out';
    cropCtx.beginPath(); 
    cropCtx.moveTo(cropPoints[0].x, cropPoints[0].y); 
    
    for (let i = 1; i < 4; i++) {
        cropCtx.lineTo(cropPoints[i].x, cropPoints[i].y);
    }
    
    cropCtx.closePath(); 
    cropCtx.fill();
    
    cropCtx.globalCompositeOperation = 'source-over';
    cropCtx.strokeStyle = '#10b981'; 
    cropCtx.lineWidth = Math.max(4, cropCanvas.width * 0.005); 
    cropCtx.stroke();
    cropCtx.fillStyle = '#10b981';
    
    const isMobile = window.innerWidth <= 768;
    const radius = isMobile ? Math.max(25, cropCanvas.width * 0.035) : Math.max(10, cropCanvas.width * 0.015);
    
    for (let i = 0; i < 4; i++) {
        cropCtx.beginPath(); 
        cropCtx.arc(cropPoints[i].x, cropPoints[i].y, radius, 0, Math.PI * 2); 
        cropCtx.fill(); 
        cropCtx.stroke();
    }
}

function getScannerCropCursorPos(e) {
    if (!cropCanvas) return { x: 0, y: 0 };
    
    const rect = cropCanvas.getBoundingClientRect();
    const canvasRatio = cropCanvas.width / cropCanvas.height; 
    const rectRatio = rect.width / rect.height;
    
    let actualWidth = rect.width; 
    let actualHeight = rect.height; 
    let offsetX = 0; 
    let offsetY = 0;

    if (canvasRatio > rectRatio) { 
        actualHeight = rect.width / canvasRatio; 
        offsetY = (rect.height - actualHeight) / 2; 
    } else { 
        actualWidth = rect.height * canvasRatio; 
        offsetX = (rect.width - actualWidth) / 2; 
    }

    const scaleX = cropCanvas.width / actualWidth; 
    const scaleY = cropCanvas.height / actualHeight;
    
    let clientX = e.clientX || (e.touches && e.touches[0].clientX); 
    let clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    return { 
        x: (clientX - rect.left - offsetX) * scaleX, 
        y: (clientY - rect.top - offsetY) * scaleY 
    };
}

cropCanvas?.addEventListener('pointerdown', (e) => {
    if (!isCroppingMode) return;
    
    const pos = getScannerCropCursorPos(e);
    const hitRadius = Math.max(60, cropCanvas.width * 0.08); 
    
    for (let i = 0; i < 4; i++) {
        const dx = pos.x - cropPoints[i].x; 
        const dy = pos.y - cropPoints[i].y;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) { 
            activeCropPoint = i; 
            break; 
        }
    }
});

window.addEventListener('pointermove', (e) => {
    if (!isCroppingMode || activeCropPoint === -1) return;
    
    const pos = getScannerCropCursorPos(e);
    cropPoints[activeCropPoint].x = Math.max(0, Math.min(pos.x, cropCanvas.width)); 
    cropPoints[activeCropPoint].y = Math.max(0, Math.min(pos.y, cropCanvas.height));
    
    drawCropPolygon();
});

window.addEventListener('pointerup', () => { 
    if (isCroppingMode) activeCropPoint = -1; 
});

document.getElementById('btn-cancel-crop')?.addEventListener('click', () => { 
    isCroppingMode = false; 
    cropCanvas.style.display = 'none'; 
    document.getElementById('scanner-crop-top-bar').style.display = 'none'; 
    document.getElementById('scanner-default-top-bar').style.display = 'flex'; 
    renderScannerWorkspace(); 
});

document.getElementById('btn-apply-crop')?.addEventListener('click', () => {
    const tl = cropPoints[0], tr = cropPoints[1], br = cropPoints[2], bl = cropPoints[3];
    
    const w1 = Math.hypot(tr.x - tl.x, tr.y - tl.y); 
    const w2 = Math.hypot(br.x - bl.x, br.y - bl.y); 
    const destW = Math.max(w1, w2);
    
    const h1 = Math.hypot(bl.x - tl.x, bl.y - tl.y); 
    const h2 = Math.hypot(br.x - tr.x, br.y - tr.y); 
    const destH = Math.max(h1, h2);
    
    const tempCanvas = document.createElement('canvas'); 
    tempCanvas.width = destW; 
    tempCanvas.height = destH; 
    const ctx = tempCanvas.getContext('2d');

    function drawTriangle(ctx, img, p0, p1, p2, uv0, uv1, uv2) {
        ctx.save(); 
        ctx.beginPath(); 
        ctx.moveTo(p0.x, p0.y); 
        ctx.lineTo(p1.x, p1.y); 
        ctx.lineTo(p2.x, p2.y); 
        ctx.closePath(); 
        ctx.clip();
        
        const det = uv0.x * (uv1.y - uv2.y) - uv1.x * (uv0.y - uv2.y) + uv2.x * (uv0.y - uv1.y);
        if (det === 0) { ctx.restore(); return; }
        
        const a = (p0.x * (uv1.y - uv2.y) - p1.x * (uv0.y - uv2.y) + p2.x * (uv0.y - uv1.y)) / det;
        const c = (uv0.x * (p1.x - p2.x) - uv1.x * (p0.x - p2.x) + uv2.x * (p0.x - p1.x)) / det;
        const e = p0.x - a * uv0.x - c * uv0.y;
        const b = (p0.y * (uv1.y - uv2.y) - p1.y * (uv0.y - uv2.y) + p2.y * (uv0.y - uv1.y)) / det;
        const d = (uv0.x * (p1.y - p2.y) - uv1.x * (p0.y - p2.y) + uv2.x * (p0.y - p1.y)) / det;
        const f = p0.y - b * uv0.x - d * uv0.y;
        
        ctx.transform(a, b, c, d, e, f); 
        ctx.imageSmoothingEnabled = true; 
        ctx.imageSmoothingQuality = 'high'; 
        ctx.drawImage(img, 0, 0); 
        ctx.restore();
    }
    
    const dTl = {x:0, y:0}, dTr = {x:destW, y:0}, dBr = {x:destW, y:destH}, dBl = {x:0, y:destH}; 
    const pad = 1;
    
    drawTriangle(ctx, scanCanvas, dTl, {x:dTr.x+pad, y:dTr.y}, {x:dBl.x, y:dBl.y+pad}, tl, tr, bl);
    drawTriangle(ctx, scanCanvas, {x:dTr.x+pad, y:dTr.y-pad}, {x:dBr.x+pad, y:dBr.y+pad}, {x:dBl.x-pad, y:dBl.y+pad}, tr, br, bl);
    
    scannerPages[currentScannerIndex].original = tempCanvas.toDataURL('image/jpeg', 0.95); 
    scannerPages[currentScannerIndex].rotation = 0; 
    
    isCroppingMode = false; 
    cropCanvas.style.display = 'none'; 
    document.getElementById('scanner-crop-top-bar').style.display = 'none'; 
    document.getElementById('scanner-default-top-bar').style.display = 'flex';
    
    renderScannerWorkspace(); 
    renderScannerThumbnails();
});

function renderScannerThumbnails() {
    const list = document.getElementById('scanner-page-list'); 
    if (!list) return; 
    
    list.innerHTML = '';
    
    scannerPages.forEach((page, index) => {
        const img = document.createElement('img'); 
        img.src = page.original; 
        img.className = `scanned-thumb ${index === currentScannerIndex ? 'active' : ''}`;
        
        img.onclick = () => { 
            if(isCroppingMode) return; 
            currentScannerIndex = index; 
            renderScannerWorkspace(); 
            renderScannerThumbnails(); 
        };
        list.appendChild(img);
    });
}

document.querySelectorAll('.scanner-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { 
        if (currentScannerIndex === -1 || isCroppingMode) return; 
        scannerPages[currentScannerIndex].filter = e.target.dataset.filter; 
        renderScannerWorkspace(); 
    });
});

document.getElementById('btn-scanner-close')?.addEventListener('click', () => { 
    if (scannerWorkspace) {
        scannerWorkspace.style.display = 'none'; 
    }
    document.body.classList.remove('is-editing'); 
    scannerPages = []; 
    isCroppingMode = false; 
});

document.getElementById('btn-scanner-preview')?.addEventListener('click', async () => {
    if (scannerPages.length === 0 || isCroppingMode) return;
    
    const previewModal = document.getElementById('scanner-preview-modal'); 
    const previewList = document.getElementById('scanner-preview-list');
    if (!previewModal || !previewList) return;
    
    previewList.innerHTML = '<p style="color:white; margin-top: 20px;">Generating preview...</p>'; 
    previewModal.style.display = 'flex'; 
    previewList.innerHTML = '';
    
    for (let i = 0; i < scannerPages.length; i++) {
        const page = scannerPages[i]; 
        const tempImg = new Image(); 
        tempImg.src = page.original; 
        await new Promise(res => tempImg.onload = res);
        
        const angle = page.rotation || 0; 
        const isRotated = angle === 90 || angle === 270;
        const cw = isRotated ? tempImg.height : tempImg.width; 
        const ch = isRotated ? tempImg.width : tempImg.height;
        
        const tempCanvas = document.createElement('canvas'); 
        tempCanvas.width = cw; 
        tempCanvas.height = ch; 
        const tCtx = tempCanvas.getContext('2d');
        
        tCtx.translate(cw / 2, ch / 2); 
        tCtx.rotate((angle * Math.PI) / 180); 
        tCtx.translate(-tempImg.width / 2, -tempImg.height / 2);
        
        if (page.filter === 'lighten') tCtx.filter = 'brightness(1.15) contrast(1.05)'; 
        else if (page.filter === 'magic') tCtx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)'; 
        else if (page.filter === 'grayscale') tCtx.filter = 'grayscale(100%)'; 
        else if (page.filter === 'bw') tCtx.filter = 'grayscale(100%) contrast(1.8) brightness(1.1)'; 
        else if (page.filter === 'eco') tCtx.filter = 'sepia(0.3) brightness(0.9) contrast(0.9)'; 
        else tCtx.filter = 'none';
        
        tCtx.drawImage(tempImg, 0, 0);
        
        const finalImg = document.createElement('img'); 
        finalImg.src = tempCanvas.toDataURL('image/jpeg', 0.8); 
        finalImg.className = 'preview-img'; 
        previewList.appendChild(finalImg);
    }
});

document.getElementById('btn-preview-back')?.addEventListener('click', () => { 
    document.getElementById('scanner-preview-modal').style.display = 'none'; 
});

document.getElementById('btn-scanner-export')?.addEventListener('click', async () => {
    if (scannerPages.length === 0) return;
    
    const btn = document.getElementById('btn-scanner-export'); 
    const oldText = btn.innerHTML; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading PDF...';
    
    try {
        const pdfDoc = await PDFDocument.create();
        for (let page of scannerPages) {
            const tempImg = new Image(); 
            tempImg.src = page.original; 
            await new Promise(res => tempImg.onload = res);
            
            const angle = page.rotation || 0; 
            const isRotated = angle === 90 || angle === 270; 
            const cw = isRotated ? tempImg.height : tempImg.width; 
            const ch = isRotated ? tempImg.width : tempImg.height;
            
            const tempCanvas = document.createElement('canvas'); 
            tempCanvas.width = cw; 
            tempCanvas.height = ch; 
            const tCtx = tempCanvas.getContext('2d');
            
            tCtx.translate(cw / 2, ch / 2); 
            tCtx.rotate((angle * Math.PI) / 180); 
            tCtx.translate(-tempImg.width / 2, -tempImg.height / 2);
            
            if (page.filter === 'lighten') tCtx.filter = 'brightness(1.15) contrast(1.05)'; 
            else if (page.filter === 'magic') tCtx.filter = 'brightness(1.1) contrast(1.15) saturate(1.1)'; 
            else if (page.filter === 'grayscale') tCtx.filter = 'grayscale(100%)'; 
            else if (page.filter === 'bw') tCtx.filter = 'grayscale(100%) contrast(1.8) brightness(1.1)'; 
            else if (page.filter === 'eco') tCtx.filter = 'sepia(0.3) brightness(0.9) contrast(0.9)'; 
            else tCtx.filter = 'none';
            
            tCtx.drawImage(tempImg, 0, 0);
            
            const optimizedBase64 = tempCanvas.toDataURL('image/jpeg', 0.85).split(',')[1]; 
            const pdfImage = await pdfDoc.embedJpg(optimizedBase64);
            const dims = pdfImage.scale(1); 
            const pdfPage = pdfDoc.addPage([dims.width, dims.height]); 
            pdfPage.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
        }
        
        const bytes = await pdfDoc.save();
        await processAndDownload(bytes, `${scannerOriginalName}_Scanned.pdf`, 'application/pdf');
        
        document.getElementById('scanner-preview-modal').style.display = 'none'; 
        if (scannerWorkspace) {
            scannerWorkspace.style.display = 'none'; 
        }
        document.body.classList.remove('is-editing'); 
        scannerPages = [];
        
    } catch (e) { 
        handleError(e); 
    } finally { 
        btn.innerHTML = oldText; 
    }
});


// ==========================================
// UI GENERATION FOR TOOLS
// ==========================================
const views = [
    'edit', 'merge', 'split', 'delete', 'compress', 'rotate', 'pdftojpg', 'pagenumbers', 
    'jpgtopdf', 'extract', 'watermark', 'sign', 'protect', 'unlock', 'flatten', 
    'crop', 'metadata', 'repair', 'reorder', 'imagewatermark', 'htmltopdf',
    'addtext', 'addblank', 'resizepdf', 'splitevenodd', 'addmargins', 'removeannots',
    'contact', 'privacy', 'terms'
];

const ui = {};
views.forEach(v => {
    ui[v] = document.getElementById(`${v}-ui-container`);
});

const dropZoneStyle = "border: 2px dashed var(--accent); border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.05); transition: 0.3s; margin-bottom: 20px;";
const btnStyle = "background: var(--accent); color: white; border: none; padding: 14px 24px; border-radius: 8px; font-size: 1.1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 15px;";
const inputStyle = "width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white; margin-bottom: 15px;";
const fileListStyle = "display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;";
const fileItemStyle = "display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--glass-border); gap: 10px;";

const brandHeaderHtml = `
    <div class="app-brand-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 25px; padding-bottom: 12px; border-bottom: 1px solid var(--glass-border);">
        <img src="assets/icon.png?v=5" style="width: 40px; height: 40px; object-fit: contain; border-radius: 8px; box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);">
        <span style="font-size: 1.2rem; font-weight: 700; color: white; letter-spacing: 0.5px; background: linear-gradient(to right, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Amazing PDF Tool</span>
    </div>
`;

const generateSingleFileUI = (id, icon, color, title, btnText, extraHtml = "", acceptType = "application/pdf") => `
    ${brandHeaderHtml}
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Select PDF to ${title}</h3>
        <button onclick="document.getElementById('${id}-file-input').click()" style="padding: 10px 20px; background: ${color}; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse File</button>
        <input type="file" id="${id}-file-input" accept="${acceptType}" style="display: none;">
    </div>
    <div id="${id}-file-info" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas ${icon}"></i> ${btnText}</button>
    </div>
`;

const generateMultipleFileUI = (id, icon, color, title, btnText, extraHtml = "", acceptType = "application/pdf") => `
    ${brandHeaderHtml}
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Drag & Drop PDFs to ${title}</h3>
        <button onclick="document.getElementById('${id}-file-input').click()" style="padding: 10px 20px; background: ${color}; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Files</button>
        <input type="file" id="${id}-file-input" multiple accept="${acceptType}" style="display: none;">
    </div>
    <div id="${id}-file-list" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas ${icon}"></i> ${btnText}</button>
    </div>
`;

// Visual Editors Initialize
if (ui.edit) ui.edit.innerHTML = generateSingleFileUI('edit', 'fa-edit', '#10b981', 'Edit PDF', '');
if (ui.rotate) ui.rotate.innerHTML = generateSingleFileUI('rotate', 'fa-sync-alt', '#3b82f6', 'Rotate', '');
if (ui.flatten) ui.flatten.innerHTML = generateSingleFileUI('flatten', 'fa-layer-group', '#64748b', 'Flatten PDF', '');
if (ui.imagewatermark) ui.imagewatermark.innerHTML = generateSingleFileUI('imagewatermark', 'fa-images', '#ec4899', 'Image Watermark', '');
if (ui.crop) ui.crop.innerHTML = generateSingleFileUI('crop', 'fa-crop', '#3b82f6', 'Crop PDF', '');
if (ui.addmargins) ui.addmargins.innerHTML = generateSingleFileUI('addmargins', 'fa-border-all', '#3b82f6', 'Add Margins', '');

if (ui.pagenumbers) ui.pagenumbers.innerHTML = generateSingleFileUI('pagenumbers', 'fa-sort-numeric-down', '#6366f1', 'Add Numbers', '', `
    <label style="color:var(--text-secondary); font-size:0.9rem;">Format:</label>
    <select id="pagenumbers-format" style="${inputStyle}">
        <option value="1">1, 2, 3...</option>
        <option value="Page 1">Page 1, Page 2...</option>
        <option value="Page 1 of 10">Page 1 of 10...</option>
    </select>
`);

if (ui.sign) ui.sign.innerHTML = generateSingleFileUI('sign', 'fa-signature', '#8b5cf6', 'Sign', '');
if (ui.watermark) ui.watermark.innerHTML = generateSingleFileUI('watermark', 'fa-stamp', '#ec4899', 'Watermark', '');
if (ui.addtext) ui.addtext.innerHTML = generateSingleFileUI('addtext', 'fa-font', '#6366f1', 'Add Text', '');

if (ui.extract) ui.extract.innerHTML = generateSingleFileUI('extract', 'fa-file-alt', '#14b8a6', 'Extract Text', 'Continue', `
    <select id="extract-mode" style="${inputStyle}">
        <option value="full">Extract Full PDF Text</option>
        <option value="visual">Select Text Area Visually</option>
    </select>
`);

// Standard Tools
if (ui.merge) {
    ui.merge.innerHTML = brandHeaderHtml + `
        <div id="merge-drop-zone" style="${dropZoneStyle}">
            <i class="fas fa-cloud-upload-alt" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i>
            <h3>Drag & Drop PDFs or ZIP</h3>
            <button onclick="document.getElementById('merge-file-input').click()" style="padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Files</button>
            <input type="file" id="merge-file-input" multiple accept="application/pdf, application/zip, .zip" style="display: none;">
        </div>
        <div id="merge-file-list" style="${fileListStyle}"></div>
        <button id="btn-merge-action" style="${btnStyle}; display: none;"><i class="fas fa-object-group"></i> Merge Files Now</button>
    `;
}

if (ui.jpgtopdf) {
    ui.jpgtopdf.innerHTML = brandHeaderHtml + `
        <div id="jpgtopdf-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#eab308')}">
            <i class="fas fa-images" style="font-size: 3rem; color: #eab308; margin-bottom: 15px;"></i>
            <h3>Drag & Drop Images</h3>
            <button onclick="document.getElementById('jpgtopdf-file-input').click()" style="padding: 10px 20px; background: #eab308; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Images</button>
            <input type="file" id="jpgtopdf-file-input" multiple accept="image/*" style="display: none;">
        </div>
        <div id="jpgtopdf-file-list" style="${fileListStyle}"></div>
        <button id="btn-jpgtopdf-action" style="${btnStyle.replace('var(--accent)', '#eab308')}; display: none;"><i class="fas fa-file-pdf"></i> Convert to PDF</button>
    `;
}

if (ui.htmltopdf) {
    ui.htmltopdf.innerHTML = brandHeaderHtml + `
        <div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
            <label style="color: var(--text-secondary);">Paste your HTML Code here:</label>
            <textarea id="html-input" rows="10" style="${inputStyle}" placeholder="<h1>Hello</h1>"></textarea>
            <button id="btn-htmltopdf-action" style="${btnStyle.replace('var(--accent)', '#f97316')}"><i class="fas fa-code"></i> Convert to PDF</button>
        </div>
    `;
}

if (ui.protect) {
    ui.protect.innerHTML = generateMultipleFileUI('protect', 'fa-lock', '#8b5cf6', 'Protect', 'Encrypt', `
        <div style="position: relative; width: 100%;">
            <input type="password" id="protect-password" placeholder="Set Password for all files" style="${inputStyle} padding-right: 45px;" autocomplete="new-password">
            <i class="fas fa-eye" onclick="let inp = document.getElementById('protect-password'); if(inp.type==='password'){inp.type='text';this.className='fas fa-eye-slash'}else{inp.type='password';this.className='fas fa-eye'}" style="position: absolute; right: 15px; top: 14px; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; z-index: 10;"></i>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <input type="checkbox" id="protect-remember" style="width: 18px; height: 18px; cursor: pointer;">
            <label for="protect-remember" style="color: var(--text-secondary); font-size: 0.9rem; cursor: pointer;">Remember password on this PC</label>
        </div>
    `);
}

if (ui.unlock) {
    ui.unlock.innerHTML = generateMultipleFileUI('unlock', 'fa-unlock', '#06b6d4', 'Unlock', 'Unlock', `
        <div style="position: relative; width: 100%;">
            <input type="password" id="unlock-password" placeholder="Current Password (applied to all)" style="${inputStyle} padding-right: 45px;" autocomplete="new-password">
            <i class="fas fa-eye" onclick="let inp = document.getElementById('unlock-password'); if(inp.type==='password'){inp.type='text';this.className='fas fa-eye-slash'}else{inp.type='password';this.className='fas fa-eye'}" style="position: absolute; right: 15px; top: 14px; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; z-index: 10;"></i>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
            <input type="checkbox" id="unlock-remember" style="width: 18px; height: 18px; cursor: pointer;">
            <label for="unlock-remember" style="color: var(--text-secondary); font-size: 0.9rem; cursor: pointer;">Remember password on this PC</label>
        </div>
    `);
}

setTimeout(() => {
    const savedProtectPass = localStorage.getItem('amazingpdf_protect_pass');
    if (savedProtectPass) {
        const pInput = document.getElementById('protect-password');
        const pCheck = document.getElementById('protect-remember');
        if (pInput) pInput.value = savedProtectPass;
        if (pCheck) pCheck.checked = true;
    }
    
    const savedUnlockPass = localStorage.getItem('amazingpdf_unlock_pass');
    if (savedUnlockPass) {
        const uInput = document.getElementById('unlock-password');
        const uCheck = document.getElementById('unlock-remember');
        if (uInput) uInput.value = savedUnlockPass;
        if (uCheck) uCheck.checked = true;
    }
}, 500);

if (ui.compress) ui.compress.innerHTML = generateMultipleFileUI('compress', 'fa-compress-arrows-alt', '#10b981', 'Compress', 'Compress Files', '', 'application/pdf, application/zip, .zip');

if (ui.split) ui.split.innerHTML = generateSingleFileUI('split', 'fa-cut', '#f59e0b', 'Split', 'Split & Download', `<input type="text" id="split-ranges" placeholder="e.g. 1-3" style="${inputStyle}">`);
if (ui.delete) ui.delete.innerHTML = generateSingleFileUI('delete', 'fa-trash-alt', '#ef4444', 'Delete Pages', 'Remove Pages', `<input type="text" id="delete-ranges" placeholder="e.g. 2, 4-6" style="${inputStyle}">`);
if (ui.reorder) ui.reorder.innerHTML = generateSingleFileUI('reorder', 'fa-sort-amount-up', '#8b5cf6', 'Reorder Pages', 'Apply New Order', `<input type="text" id="reorder-input" placeholder="e.g. 33-32-31, 3, 1, 2" style="${inputStyle}">`);
if (ui.pdftojpg) ui.pdftojpg.innerHTML = generateSingleFileUI('pdftojpg', 'fa-file-archive', '#eab308', 'Convert to JPG', 'Download ZIP of Images');

if (ui.metadata) {
    ui.metadata.innerHTML = generateSingleFileUI('metadata', 'fa-info-circle', '#eab308', 'Edit Metadata', 'Update Metadata', `
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Update hidden document properties.</p>
        <input type="text" id="meta-title" placeholder="New Document Title" style="${inputStyle}">
        <input type="text" id="meta-author" placeholder="New Author Name" style="${inputStyle}">
    `);
}

if (ui.repair) {
    ui.repair.innerHTML = generateSingleFileUI('repair', 'fa-tools', '#10b981', 'Repair PDF', 'Attempt Repair', `
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Rebuilds broken internal links & corrupted XRef tables.</p>
    `);
}

if (ui.addblank) {
    ui.addblank.innerHTML = generateSingleFileUI('addblank', 'fa-file-medical', '#10b981', 'Insert Blank Pages', 'Insert & Download', `
        <select id="addblank-position" style="${inputStyle}">
            <option value="end">At the very end</option>
            <option value="start">At the very beginning</option>
            <option value="after">After specific page...</option>
        </select>
        <input type="number" id="addblank-after-num" placeholder="Page Number" style="${inputStyle} display:none;">
        <label style="font-size:0.8rem; color:#94a3b8;">Number of Pages:</label>
        <input type="number" id="addblank-count" value="1" min="1" style="${inputStyle}">
    `);
}

if (ui.resizepdf) {
    ui.resizepdf.innerHTML = generateSingleFileUI('resizepdf', 'fa-expand-arrows-alt', '#14b8a6', 'Resize Pages', 'Scale Document', `
        <p style="font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">Proportionally scales content to fit new page size.</p>
        <select id="resize-profile" style="${inputStyle}">
            <option value="A4">A4 Profile</option>
            <option value="Letter">Letter Profile</option>
            <option value="Legal">Legal Profile</option>
        </select>
    `);
}

if (ui.splitevenodd) ui.splitevenodd.innerHTML = generateSingleFileUI('splitevenodd', 'fa-columns', '#6366f1', 'Split Even/Odd', 'Split & Download ZIP');
if (ui.removeannots) ui.removeannots.innerHTML = generateSingleFileUI('removeannots', 'fa-eraser', '#8b5cf6', 'Clean Annotations', 'Remove All');

document.getElementById('addblank-position')?.addEventListener('change', (e) => { 
    document.getElementById('addblank-after-num').style.display = (e.target.value === 'after') ? 'block' : 'none'; 
});


// ==========================================
// FILE LOGIC UTILITIES (Single/Multiple/ZIP)
// ==========================================
function parseRange(rangeStr) {
    let pages = []; 
    rangeStr.split(',').forEach(part => {
        if (part.includes('-')) { 
            const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1); 
            for (let i = start; i <= end; i++) {
                pages.push(i); 
            }
        } else {
            pages.push(parseInt(part.trim()) - 1);
        }
    });
    return [...new Set(pages)].sort((a, b) => a - b);
}

// ZIP Parser Helper
async function handleFilesOrZip(filesArray) {
    let finalFiles = [];
    for(let file of filesArray) {
        if(file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            for(let filename of Object.keys(contents.files)) {
                if(!contents.files[filename].dir && filename.toLowerCase().endsWith('.pdf')) {
                    const blob = await contents.files[filename].async('blob');
                    finalFiles.push(new File([blob], filename, { type: 'application/pdf' }));
                }
            }
        } else if (file.type === 'application/pdf') {
            finalFiles.push(file);
        }
    }
    return finalFiles;
}

function setupSingleFileLogic(id, actionCallback) {
    const dropZone = document.getElementById(`${id}-drop-zone`); 
    const input = document.getElementById(`${id}-file-input`);
    const info = document.getElementById(`${id}-file-info`); 
    const controls = document.getElementById(`${id}-controls`); 
    const btn = document.getElementById(`btn-${id}-action`);
    let currentFile = null;

    if (!dropZone || !input) return;
    
    dropZone.addEventListener('click', (e) => { 
        if(e.target.tagName !== 'BUTTON') {
            input.click(); 
        }
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) {
            currentFile = file;
            
            if (['edit', 'crop', 'addmargins', 'pagenumbers', 'sign', 'watermark', 'addtext', 'rotate', 'flatten', 'imagewatermark'].includes(id) || (id === 'extract' && document.getElementById('extract-mode').value === 'visual')) {
                openVisualWorkspace(currentFile, id); 
                input.value = ''; 
                return;
            }
            
            dropZone.style.display = 'none';
            info.innerHTML = `
                <div style="${fileItemStyle}">
                    <div class="text-container" style="display:flex; align-items:center; gap:15px; min-width:0;">
                        <i class="fas fa-file-pdf" style="color:#ef4444; font-size:1.5rem; flex-shrink:0;"></i>
                        <b class="text-ellipsis">${file.name}</b>
                    </div>
                    <button id="reset-${id}" style="background:var(--glass-border); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; flex-shrink:0;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            controls.style.display = 'block';
            
            document.getElementById(`reset-${id}`)?.addEventListener('click', () => { 
                currentFile = null; 
                input.value = ''; 
                dropZone.style.display = 'block'; 
                info.innerHTML = ''; 
                controls.style.display = 'none'; 
            });
        }
    });

    if(btn) {
        btn.addEventListener('click', async () => {
            if (!currentFile) return; 
            
            const originalText = btn.innerHTML; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            try {
                const result = await actionCallback(currentFile); 
                document.getElementById(`reset-${id}`)?.click();
                await processAndDownload(result.bytes, result.filename, result.type); 
                
                if(typeof AdManager !== 'undefined' && AdManager) {
                    await AdManager.showInterstitial();
                }
            } catch (error) { 
                handleError(error); 
            } finally { 
                btn.innerHTML = originalText; 
            }
        });
    }
}

function setupMultipleFileLogic(id, actionCallback) {
    const dropZone = document.getElementById(`${id}-drop-zone`); 
    const input = document.getElementById(`${id}-file-input`);
    const listContainer = document.getElementById(`${id}-file-list`); 
    const controls = document.getElementById(`${id}-controls`); 
    const btn = document.getElementById(`btn-${id}-action`);
    let currentFiles = [];

    if (!dropZone || !input || !btn) return;
    
    dropZone.addEventListener('click', (e) => { 
        if(e.target.tagName !== 'BUTTON') {
            input.click(); 
        }
    });
    
    function renderList() {
        listContainer.innerHTML = '';
        currentFiles.forEach((f, i) => {
            const itemDiv = document.createElement('div'); 
            itemDiv.style = fileItemStyle;
            itemDiv.innerHTML = `
                <div class="text-container">
                    <b class="text-ellipsis">${f.name}</b>
                </div>
                <button class="remove-btn" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; flex-shrink:0;">
                    <i class="fas fa-times"></i>
                </button>
            `;
            listContainer.appendChild(itemDiv);
        });
        
        listContainer.querySelectorAll('.remove-btn').forEach(button => { 
            button.addEventListener('click', (e) => { 
                const idx = parseInt(e.currentTarget.getAttribute('data-index')); 
                currentFiles.splice(idx, 1); 
                renderList(); 
            }); 
        });
        
        if(currentFiles.length > 0) {
            controls.style.display = 'block'; 
            dropZone.style.display = 'none';
            
            if(!document.getElementById(`add-more-${id}`)) {
               const addMoreBtn = document.createElement('button'); 
               addMoreBtn.id = `add-more-${id}`; 
               addMoreBtn.innerHTML = '<i class="fas fa-plus"></i> Add More PDFs';
               addMoreBtn.style = `background:var(--surface-color); color:var(--text-main); border:1px dashed var(--glass-border); padding:10px; width:100%; border-radius:8px; margin-bottom:15px; cursor:pointer; font-weight:600;`;
               
               addMoreBtn.addEventListener('click', () => input.click()); 
               listContainer.appendChild(addMoreBtn);
            }
        } else { 
            controls.style.display = 'none'; 
            dropZone.style.display = 'block'; 
        }
    }

    input.addEventListener('change', async (e) => {
        const files = await handleFilesOrZip(Array.from(e.target.files));
        currentFiles = [...currentFiles, ...files]; 
        renderList(); 
        input.value = ''; 
    });

    btn.addEventListener('click', async () => {
        if (!currentFiles.length) return; 
        
        const originalText = btn.innerHTML; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            const result = await actionCallback(currentFiles); 
            currentFiles = []; 
            renderList(); 
            
            await processAndDownload(result.bytes, result.filename, result.type); 
            
            if(typeof AdManager !== 'undefined' && AdManager) {
                await AdManager.showInterstitial();
            }
        } catch (error) { 
            handleError(error); 
        } finally { 
            btn.innerHTML = originalText; 
        }
    });
}

function hexToRgbPdf(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) { 
        r = parseInt(hex.substring(1, 3), 16) / 255; 
        g = parseInt(hex.substring(3, 5), 16) / 255; 
        b = parseInt(hex.substring(5, 7), 16) / 255; 
    }
    return rgb(r, g, b);
}

// Visual tool mappings handled inside `openVisualWorkspace`
setupSingleFileLogic('edit', null);
setupSingleFileLogic('rotate', null);
setupSingleFileLogic('flatten', null);
setupSingleFileLogic('imagewatermark', null);
setupSingleFileLogic('crop', null);
setupSingleFileLogic('addmargins', null);
setupSingleFileLogic('pagenumbers', null);
setupSingleFileLogic('sign', null);
setupSingleFileLogic('watermark', null);
setupSingleFileLogic('addtext', null);

// Action Callbacks
setupSingleFileLogic('split', async (file) => {
    const pagesToExtract = parseRange(document.getElementById('split-ranges').value);
    if (!pagesToExtract.length) throw new Error("Range required");
    
    const sourcePdf = await PDFDocument.load(await file.arrayBuffer()); 
    const newPdf = await PDFDocument.create();
    
    const copiedPages = await newPdf.copyPages(sourcePdf, pagesToExtract); 
    copiedPages.forEach(p => newPdf.addPage(p));
    
    return { bytes: await newPdf.save(), filename: `${getBaseName(file.name)}_Split.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('delete', async (file) => {
    const pagesToDelete = parseRange(document.getElementById('delete-ranges').value);
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    
    pagesToDelete.sort((a, b) => b - a).forEach(i => { 
        if (i >= 0 && i < pdfDoc.getPageCount()) {
            pdfDoc.removePage(i); 
        }
    });
    
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Deleted.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('reorder', async (file) => {
    const rawInput = document.getElementById('reorder-input').value;
    const srcDoc = await PDFDocument.load(await file.arrayBuffer()); 
    const maxPages = srcDoc.getPageCount();
    
    let indices = [];
    rawInput.split(',').forEach(part => {
        if (part.includes('-')) { 
            const nums = part.split('-').map(n => parseInt(n.trim()) - 1).filter(n => !isNaN(n) && n >= 0 && n < maxPages); 
            indices.push(...nums); 
        } else { 
            const n = parseInt(part.trim()) - 1; 
            if (!isNaN(n) && n >= 0 && n < maxPages) {
                indices.push(n); 
            }
        }
    });
    
    if (!indices.length) throw new Error("Invalid page numbers provided. Please check the sequence.");
    
    const newPdf = await PDFDocument.create(); 
    const copied = await newPdf.copyPages(srcDoc, indices); 
    copied.forEach(p => newPdf.addPage(p));
    
    return { bytes: await newPdf.save(), filename: `${getBaseName(file.name)}_Reordered.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('metadata', async (file) => {
    const title = document.getElementById('meta-title').value; 
    const author = document.getElementById('meta-author').value;
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    
    if(title) pdfDoc.setTitle(title); 
    if(author) pdfDoc.setAuthor(author);
    
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Metadata.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('repair', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Repaired.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('addblank', async (file) => {
    const pos = document.getElementById('addblank-position').value;
    const afterNum = parseInt(document.getElementById('addblank-after-num').value);
    const count = parseInt(document.getElementById('addblank-count').value) || 1;
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    
    for(let i=0; i<count; i++) {
        if (pos === 'start') {
            pdfDoc.insertPage(0); 
        } else if (pos === 'after' && afterNum > 0 && afterNum <= pdfDoc.getPageCount()) {
            pdfDoc.insertPage(afterNum);
        } else {
            pdfDoc.addPage();
        }
    }
    
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_AddedPages.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('resizepdf', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    const profile = document.getElementById('resize-profile').value;
    
    let targetW = 595.28, targetH = 841.89; // A4 default
    if(profile === 'Letter') { targetW = 612; targetH = 792; }
    if(profile === 'Legal') { targetW = 612; targetH = 1008; }

    pdfDoc.getPages().forEach(page => {
        const { width, height } = page.getSize();
        const scale = Math.min(targetW / width, targetH / height);
        
        page.scaleContent(scale, scale);
        page.setSize(targetW, targetH);
        
        const newX = (targetW - (width * scale)) / 2;
        const newY = (targetH - (height * scale)) / 2;
        
        page.translateContent(newX, newY);
    });
    
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Resized.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('removeannots', async (file) => {
    const doc = await PDFDocument.load(await file.arrayBuffer());
    
    doc.getPages().forEach(page => { 
        if(page.node.Annots) {
            page.node.delete(PDFName.of('Annots')); 
        }
    });
    
    return { bytes: await doc.save(), filename: `${getBaseName(file.name)}_Cleaned.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('splitevenodd', async (file) => {
    const srcDoc = await PDFDocument.load(await file.arrayBuffer());
    const oddDoc = await PDFDocument.create();
    const evenDoc = await PDFDocument.create();
    
    let oddIdx = [], evenIdx = [];
    
    for(let i=0; i<srcDoc.getPageCount(); i++) { 
        if(i%2===0) {
            oddIdx.push(i); 
        } else {
            evenIdx.push(i); 
        }
    }
    
    const zip = new JSZip();
    
    if(oddIdx.length) { 
        const oP = await oddDoc.copyPages(srcDoc, oddIdx); 
        oP.forEach(p => oddDoc.addPage(p)); 
        zip.file("Odd_Pages.pdf", await oddDoc.save()); 
    }
    
    if(evenIdx.length) { 
        const eP = await evenDoc.copyPages(srcDoc, evenIdx); 
        eP.forEach(p => evenDoc.addPage(p)); 
        zip.file("Even_Pages.pdf", await evenDoc.save()); 
    }
    
    return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(file.name)}_EvenOdd.zip`, type: 'application/zip' };
});

setupSingleFileLogic('pdftojpg', async (file) => {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const zip = new JSZip();
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); 
        const canvas = document.createElement('canvas'); 
        const viewport = page.getViewport({ scale: 2.0 });
        
        canvas.height = viewport.height; 
        canvas.width = viewport.width; 
        
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        
        zip.file(`Page_${i}.jpg`, canvas.toDataURL('image/jpeg', 0.9).split(',')[1], {base64: true});
    }
    
    return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(file.name)}_Images.zip`, type: 'application/zip' };
});

setupSingleFileLogic('extract', async (file) => {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; 
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); 
        const textContent = await page.getTextContent();
        
        fullText += `--- Page ${i} ---\n${textContent.items.map(item => item.str).join(" ")}\n\n`;
    }
    
    return { bytes: new TextEncoder().encode(fullText), filename: `${getBaseName(file.name)}_Extracted.txt`, type: 'text/plain' };
});

setupMultipleFileLogic('compress', async (files) => {
    if (files.length === 1) {
        const pdfDoc = await PDFDocument.load(await files[0].arrayBuffer(), { updateMetadata: false }); 
        const newPdf = await PDFDocument.create();
        
        const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices()); 
        copiedPages.forEach(p => newPdf.addPage(p));
        
        return { bytes: await newPdf.save({ useObjectStreams: true }), filename: `${getBaseName(files[0].name)}_Compressed.pdf`, type: 'application/pdf' };
    } else {
        const zip = new JSZip();
        for (const file of files) {
            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); 
            const newPdf = await PDFDocument.create();
            
            const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices()); 
            copiedPages.forEach(p => newPdf.addPage(p));
            
            zip.file(`${getBaseName(file.name)}_Compressed.pdf`, await newPdf.save({ useObjectStreams: true }));
        }
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Compressed.zip`, type: 'application/zip' };
    }
});

setupMultipleFileLogic('unlock', async (files) => {
    const passwordInput = document.getElementById('unlock-password');
    const rememberCheck = document.getElementById('unlock-remember');
    const password = passwordInput.value; 
    
    if (!password) throw new Error("Please enter a password to unlock the file.");
    
    if (rememberCheck && rememberCheck.checked) {
        localStorage.setItem('amazingpdf_unlock_pass', password);
    } else {
        localStorage.removeItem('amazingpdf_unlock_pass');
    }
    
    const unlockSingleFile = async (file, pwd) => {
        try { 
            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { password: pwd }); 
            return await pdfDoc.save(); 
        } catch (err) {
            if (!navigator.onLine) throw new Error("Please turn on internet to unlock via Cloud.");
            
            const formData = new FormData(); 
            formData.append('file', file); 
            formData.append('password', pwd);
            
            const response = await fetch("https://amazing-pdf-tool.vercel.app/api/unlock", { method: 'POST', body: formData });
            if (!response.ok) throw new Error("Unlock Failed"); 
            
            return new Uint8Array(await (await response.blob()).arrayBuffer());
        }
    };
    
    if (files.length === 1) { 
        const bytes = await unlockSingleFile(files[0], password); 
        return { bytes, filename: `${getBaseName(files[0].name)}_Unlocked.pdf`, type: 'application/pdf' }; 
    } else {
        const zip = new JSZip(); 
        let successCount = 0;
        
        for (const file of files) { 
            try { 
                const bytes = await unlockSingleFile(file, password); 
                zip.file(`${getBaseName(file.name)}_Unlocked.pdf`, bytes); 
                successCount++; 
            } catch (e) { } 
        }
        
        if (successCount === 0) throw new Error("Failed to unlock."); 
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Unlocked.zip`, type: 'application/zip' };
    }
});

setupMultipleFileLogic('protect', async (files) => {
    const passwordInput = document.getElementById('protect-password');
    const rememberCheck = document.getElementById('protect-remember');
    const password = passwordInput.value; 
    
    if (!password) throw new Error("Password required"); 
    if (!navigator.onLine) throw new Error("Online required for Secure Cloud Protect.");
    
    if (rememberCheck && rememberCheck.checked) {
        localStorage.setItem('amazingpdf_protect_pass', password);
    } else {
        localStorage.removeItem('amazingpdf_protect_pass');
    }
    
    const VERCEL_API_URL = "https://amazing-pdf-tool.vercel.app/api/protect"; 
    
    if (files.length === 1) {
        const formData = new FormData(); 
        formData.append('file', new Blob([await files[0].arrayBuffer()], {type: 'application/pdf'}), files[0].name); 
        formData.append('password', password);
        
        const response = await fetch(VERCEL_API_URL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Server error."); 
        
        const bytes = new Uint8Array(await (await response.blob()).arrayBuffer());
        return { bytes, filename: `${getBaseName(files[0].name)}_Protected.pdf`, type: 'application/pdf' };
    } else {
        const zip = new JSZip();
        for (const file of files) {
            const formData = new FormData(); 
            formData.append('file', new Blob([await file.arrayBuffer()], {type: 'application/pdf'}), file.name); 
            formData.append('password', password);
            
            const response = await fetch(VERCEL_API_URL, { method: 'POST', body: formData });
            if (response.ok) { 
                const bytes = new Uint8Array(await (await response.blob()).arrayBuffer()); 
                zip.file(`${getBaseName(file.name)}_Protected.pdf`, bytes); 
            }
        }
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Protected.zip`, type: 'application/zip' };
    }
});

// HTML TO PDF FIX (Iframe Method)
if (ui.htmltopdf) {
    document.getElementById('btn-htmltopdf-action')?.addEventListener('click', async () => {
        const htmlContent = document.getElementById('html-input').value; 
        if (!htmlContent) return showCustomAlert("Enter HTML first.");
        
        const btn = document.getElementById('btn-htmltopdf-action'); 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';
        
        try {
            const iframe = document.createElement('iframe');
            iframe.style.position = 'absolute'; 
            iframe.style.top = '-9999px'; 
            iframe.style.width = '800px';
            document.body.appendChild(iframe);
            
            iframe.contentDocument.open(); 
            iframe.contentDocument.write(htmlContent); 
            iframe.contentDocument.close();
            
            const blob = await html2pdf().set({ margin: 1, jsPDF: { format: 'letter' } }).from(iframe.contentDocument.body).output('blob');
            const bytes = new Uint8Array(await blob.arrayBuffer()); 
            
            document.getElementById('html-input').value = '';
            document.body.removeChild(iframe);
            
            await processAndDownload(bytes, 'HTML_Converted.pdf', 'application/pdf'); 
            
            if(typeof AdManager !== 'undefined' && AdManager) {
                await AdManager.showInterstitial();
            }
        } catch(e) { 
            handleError(e); 
        } finally { 
            btn.innerHTML = '<i class="fas fa-code"></i> Convert to PDF'; 
        }
    });
}

// MERGE LOGIC (Updated for ZIP)
let mergeFiles = [];
if (ui.merge) {
    const mergeInput = document.getElementById('merge-file-input');
    
    document.getElementById('merge-drop-zone')?.addEventListener('click', (e) => { 
        if(e.target.tagName !== 'BUTTON') mergeInput.click(); 
    });
    
    function renderMergeList() {
        const list = document.getElementById('merge-file-list'); 
        list.innerHTML = '';
        
        mergeFiles.forEach((f, i) => { 
            list.innerHTML += `
                <div style="${fileItemStyle}">
                    <div class="text-container">
                        <b class="text-ellipsis">${f.name}</b>
                    </div>
                    <button class="remove-merge" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `; 
        });
        
        list.querySelectorAll('.remove-merge').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                mergeFiles.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); 
                renderMergeList(); 
            });
        });
        
        const actionBtn = document.getElementById('btn-merge-action'); 
        if (actionBtn) {
            actionBtn.style.display = mergeFiles.length > 1 ? 'block' : 'none';
        }
    }
    
    mergeInput?.addEventListener('change', async (e) => { 
        const files = await handleFilesOrZip(Array.from(e.target.files));
        mergeFiles = [...mergeFiles, ...files]; 
        renderMergeList(); 
        mergeInput.value = ''; 
    });
    
    document.getElementById('btn-merge-action')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-merge-action'); 
        btn.innerHTML = 'Processing...';
        
        try {
            const mergedPdf = await PDFDocument.create();
            for (const file of mergeFiles) { 
                const pdf = await PDFDocument.load(await file.arrayBuffer()); 
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices()); 
                copiedPages.forEach(p => mergedPdf.addPage(p)); 
            }
            
            const bytes = await mergedPdf.save(); 
            const outputName = mergeFiles.length > 0 ? `${getBaseName(mergeFiles[0].name)}_Merged.pdf` : 'Amazing_Merged.pdf';
            
            mergeFiles = []; 
            renderMergeList(); 
            
            await processAndDownload(bytes, outputName, 'application/pdf');
        } catch (e) { 
            handleError(e); 
        } finally { 
            btn.innerHTML = 'Merge Files Now'; 
        }
    });
}

// JPG TO PDF
let imageFiles = [];
if (ui.jpgtopdf) {
    const imgInput = document.getElementById('jpgtopdf-file-input'); 
    
    document.getElementById('jpgtopdf-drop-zone')?.addEventListener('click', (e) => { 
        if(e.target.tagName !== 'BUTTON') imgInput.click(); 
    });
    
    function renderImgList() {
        const list = document.getElementById('jpgtopdf-file-list'); 
        list.innerHTML = '';
        
        imageFiles.forEach((f, i) => { 
            list.innerHTML += `
                <div style="${fileItemStyle}">
                    <div class="text-container">
                        <b class="text-ellipsis">${f.name}</b>
                    </div>
                    <button class="remove-img" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `; 
        });
        
        list.querySelectorAll('.remove-img').forEach(btn => {
            btn.addEventListener('click', (e) => { 
                imageFiles.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); 
                renderImgList(); 
            });
        });
        
        const actionBtn = document.getElementById('btn-jpgtopdf-action'); 
        if (actionBtn) {
            actionBtn.style.display = imageFiles.length > 0 ? 'block' : 'none';
        }
    }
    
    imgInput?.addEventListener('change', (e) => { 
        imageFiles = [...imageFiles, ...Array.from(e.target.files).filter(f => f.type.startsWith('image/'))]; 
        renderImgList(); 
        imgInput.value = ''; 
    });
    
    document.getElementById('btn-jpgtopdf-action')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-jpgtopdf-action'); 
        btn.innerHTML = 'Converting...';
        
        try {
            const pdfDoc = await PDFDocument.create();
            for (const file of imageFiles) {
                const dataUrl = await new Promise(resolve => { 
                    const reader = new FileReader(); 
                    reader.onload = e => resolve(e.target.result); 
                    reader.readAsDataURL(file); 
                });
                
                const imgObj = new Image(); 
                imgObj.src = dataUrl; 
                await new Promise(resolve => imgObj.onload = resolve);
                
                const canvas = document.createElement('canvas'); 
                canvas.width = imgObj.width; 
                canvas.height = imgObj.height; 
                const ctx = canvas.getContext('2d'); 
                ctx.drawImage(imgObj, 0, 0);
                
                const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]; 
                const pdfImage = await pdfDoc.embedJpg(optimizedBase64);
                
                const dims = pdfImage.scale(1); 
                const page = pdfDoc.addPage([dims.width, dims.height]); 
                page.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
            }
            
            const bytes = await pdfDoc.save(); 
            const outputName = imageFiles.length > 0 ? `${getBaseName(imageFiles[0].name)}_Images.pdf` : 'Amazing_Images.pdf';
            
            imageFiles = []; 
            renderImgList(); 
            
            await processAndDownload(bytes, outputName, 'application/pdf');
        } catch (e) { 
            handleError(e); 
        } finally { 
            btn.innerHTML = 'Convert to PDF'; 
        }
    });
}

const handleSearch = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.tool-card').forEach(card => {
        const title = card.querySelector('h3').innerText.toLowerCase();
        card.style.display = title.includes(searchTerm) ? 'block' : 'none';
    });
};
document.getElementById('mobile-search')?.addEventListener('input', handleSearch); 
document.getElementById('desktop-search')?.addEventListener('input', handleSearch);

// ==========================================
// UNIVERSAL PRO VISUAL EDITOR
// ==========================================

let editPdfDoc = null;
let currentEditFile = null; 
let editOriginalFileName = "";
let editPageNum = 1;
let editScale = 1.5; 

const renderCanvas = document.getElementById('pdf-render-canvas');
const renderCtx = renderCanvas ? renderCanvas.getContext('2d') : null;
const overlayCanvas = document.getElementById('pdf-overlay-canvas');
const overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;

let currentTool = 'none'; 
let currentVisualMode = 'edit';
let visualData = {};
let editColor = '#000000'; 
let editSize = 20;
let isDrawing = false; 
let startX = 0; 
let startY = 0; 
let currentPath = null; 
let activeDragIndex = -1; 
let dragOffsetX = 0; 
let dragOffsetY = 0; 
let hasMovedDuringClick = false; 
let selectedEditIndex = -1; 
let activeResizeHandle = null; 
let originalEditState = null;
let isHoveringTrash = false; 
const trashZone = document.getElementById('drag-trash-zone');
let pageEdits = {}; 
let pageRotations = {}; 

document.getElementById('btn-zoom-in')?.addEventListener('click', () => { 
    editScale += 0.2; 
    renderEditPage(editPageNum); 
});

document.getElementById('btn-zoom-out')?.addEventListener('click', () => { 
    editScale = Math.max(0.4, editScale - 0.2); 
    renderEditPage(editPageNum); 
});

document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
    if (!editPdfDoc) return;
    editPdfDoc.getPage(editPageNum).then(page => {
        const baseViewport = page.getViewport({ scale: 1 });
        
        // Accurate screen size calculation (Sidebar + Toolbars minus karke)
        const sidebarWidth = window.innerWidth > 768 ? 280 : 20;
        const cWidth = window.innerWidth - sidebarWidth;
        const cHeight = window.innerHeight - 200; 
        
        const scaleW = cWidth / baseViewport.width;
        const scaleH = cHeight / baseViewport.height;
        
        // Jo sabse chhota scale hoga, wo PDF ko 100% fit kar dega
        editScale = Math.min(scaleW, scaleH, 2.0);
        renderEditPage(editPageNum);
    });
});
let pendingTextAction = null; 
let tmState = { bold: false, italic: false, underline: false, align: 'left', bgColor: 'transparent' };

function openTextModal(initialText = "", actionData) {
    pendingTextAction = actionData;
    const modal = document.getElementById('custom-text-modal'); 
    const input = document.getElementById('custom-text-input');
    
    if(document.getElementById('text-modal-title')) {
        document.getElementById('text-modal-title').innerText = actionData.type === 'new' ? "Add New Text" : "Edit Text";
    }
    if(input) {
        input.value = initialText; 
    }

    if (actionData.type === 'edit') {
        const edit = pageEdits[editPageNum][actionData.index];
        tmState.bold = edit.bold || false; 
        tmState.italic = edit.italic || false; 
        tmState.underline = edit.underline || false; 
        tmState.align = edit.align || 'left'; 
        tmState.bgColor = edit.bgColor || 'transparent';
        
        if(document.getElementById('tm-size')) document.getElementById('tm-size').value = edit.size || 20;
        if(document.getElementById('tm-color')) document.getElementById('tm-color').value = edit.color || '#000000';
        if(document.getElementById('tm-bg-color')) document.getElementById('tm-bg-color').value = (tmState.bgColor === 'transparent') ? '#ffffff' : tmState.bgColor;
        if(document.getElementById('tm-opacity')) document.getElementById('tm-opacity').value = edit.opacity || 1;
    } else {
        tmState = { bold: false, italic: false, underline: false, align: 'left', bgColor: 'transparent' };
        
        if(document.getElementById('tm-size')) document.getElementById('tm-size').value = editSize;
        if(document.getElementById('tm-color')) document.getElementById('tm-color').value = editColor;
        if(document.getElementById('tm-bg-color')) document.getElementById('tm-bg-color').value = '#ffffff';
        if(document.getElementById('tm-opacity')) document.getElementById('tm-opacity').value = (currentVisualMode === 'watermark') ? 0.5 : 1;
    }
    
    updateTmUI();
    
    if(modal) { 
        modal.style.display = 'flex'; 
        if(input) input.focus(); 
    }
}

['bold', 'italic', 'underline'].forEach(prop => { 
    document.getElementById(`tm-${prop}`)?.addEventListener('click', () => { 
        tmState[prop] = !tmState[prop]; 
        updateTmUI(); 
    }); 
});

['left', 'center', 'right'].forEach(align => { 
    document.getElementById(`tm-align-${align}`)?.addEventListener('click', () => { 
        tmState.align = align; 
        updateTmUI(); 
    }); 
});

document.getElementById('tm-bg-color')?.addEventListener('input', (e) => { 
    tmState.bgColor = e.target.value; 
});

document.getElementById('tm-clear-bg')?.addEventListener('click', () => { 
    tmState.bgColor = 'transparent'; 
    const bg = document.getElementById('tm-bg-color'); 
    if(bg) bg.value = '#ffffff'; 
});

function updateTmUI() {
    ['bold', 'italic', 'underline'].forEach(prop => { 
        const btn = document.getElementById(`tm-${prop}`); 
        if(btn) { 
            if (tmState[prop]) btn.classList.add('edit-tool-active'); 
            else btn.classList.remove('edit-tool-active'); 
        } 
    });
    
    ['left', 'center', 'right'].forEach(align => { 
        const btn = document.getElementById(`tm-align-${align}`); 
        if(btn) { 
            if (tmState.align === align) btn.classList.add('edit-tool-active'); 
            else btn.classList.remove('edit-tool-active'); 
        } 
    });
}

document.getElementById('btn-text-cancel')?.addEventListener('click', () => { 
    const m = document.getElementById('custom-text-modal'); 
    if(m) m.style.display = 'none'; 
    pendingTextAction = null; 
});

document.getElementById('btn-text-save')?.addEventListener('click', () => {
    const valObj = document.getElementById('custom-text-input'); 
    const colorObj = document.getElementById('tm-color'); 
    const sizeObj = document.getElementById('tm-size'); 
    const opacityObj = document.getElementById('tm-opacity');
    
    const val = valObj ? valObj.value : ""; 
    const color = colorObj ? colorObj.value : "#000000"; 
    const size = sizeObj ? (parseInt(sizeObj.value) || 20) : 20; 
    const opacity = opacityObj ? parseFloat(opacityObj.value) : 1;
    
    editSize = size; 

    if(val && val.trim() !== '' && pendingTextAction) {
        if(pendingTextAction.type === 'new') {
            if (!pageEdits[editPageNum]) pageEdits[editPageNum] = [];
            
            pageEdits[editPageNum].push({ 
                type: 'text', 
                x: pendingTextAction.pos.x, 
                y: pendingTextAction.pos.y, 
                text: val, 
                color: color, 
                size: size, 
                bold: tmState.bold, 
                italic: tmState.italic, 
                underline: tmState.underline, 
                align: tmState.align, 
                bgColor: tmState.bgColor, 
                opacity: opacity 
            });
        } else if(pendingTextAction.type === 'edit') {
            const edit = pageEdits[editPageNum][pendingTextAction.index];
            
            edit.text = val; 
            edit.color = color; 
            edit.size = size; 
            edit.bold = tmState.bold; 
            edit.italic = tmState.italic; 
            edit.underline = tmState.underline; 
            edit.align = tmState.align; 
            edit.bgColor = tmState.bgColor; 
            edit.opacity = opacity;
        }
        drawOverlay();
    }
    
    const m = document.getElementById('custom-text-modal'); 
    if(m) m.style.display = 'none'; 
    pendingTextAction = null;
});

function setToolActive(btnId, toolName) {
    document.querySelectorAll('.edit-toolbar-btn').forEach(b => {
        b.classList.remove('edit-tool-active');
    });
    
    if(btnId) { 
        const btn = document.getElementById(btnId); 
        if(btn) btn.classList.add('edit-tool-active'); 
    }
    
    currentTool = toolName; 
    selectedEditIndex = -1; 
    drawOverlay(); 
}

document.getElementById('edit-color-picker')?.addEventListener('input', (e) => {
    editColor = e.target.value;
});

document.getElementById('edit-size-picker')?.addEventListener('input', (e) => {
    editSize = parseInt(e.target.value) || 20;
});

document.getElementById('btn-edit-text')?.addEventListener('click', () => setToolActive('btn-edit-text', 'text'));
document.getElementById('btn-edit-whiteout')?.addEventListener('click', () => setToolActive('btn-edit-whiteout', 'whiteout'));
document.getElementById('btn-edit-draw')?.addEventListener('click', () => setToolActive('btn-edit-draw', 'draw'));

document.getElementById('btn-edit-clear')?.addEventListener('click', () => { 
    pageEdits[editPageNum] = []; 
    selectedEditIndex = -1; 
    drawOverlay(); 
    showCustomAlert("Cleared!"); 
});

document.getElementById('btn-edit-image')?.addEventListener('click', () => { 
    setToolActive('btn-edit-image', 'image'); 
    document.getElementById('edit-image-input')?.click(); 
});

document.getElementById('edit-image-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const dataUrl = event.target.result; 
            const img = new Image();
            img.onload = function() {
                if (!pageEdits[editPageNum]) pageEdits[editPageNum] = [];
                
                let w = img.width; 
                let h = img.height; 
                const maxDim = 200;
                
                if(w > maxDim || h > maxDim) { 
                    const ratio = Math.min(maxDim/w, maxDim/h); 
                    w = w * ratio; 
                    h = h * ratio; 
                }
                
                pageEdits[editPageNum].push({ 
                    type: 'image', 
                    x: overlayCanvas.width/2 - w/2, 
                    y: overlayCanvas.height/2 - h/2, 
                    w: w, 
                    h: h, 
                    dataUrl: dataUrl, 
                    imgType: file.type, 
                    imgObj: img 
                });
                
                selectedEditIndex = pageEdits[editPageNum].length - 1; 
                drawOverlay(); 
                document.getElementById('edit-image-input').value = ""; 
            }
            img.src = dataUrl;
        }
        reader.readAsDataURL(file);
    }
});

document.getElementById('watermark-opacity')?.addEventListener('input', (e) => {
    if(selectedEditIndex !== -1 && pageEdits[editPageNum][selectedEditIndex].type === 'image') {
        pageEdits[editPageNum][selectedEditIndex].opacity = parseFloat(e.target.value); 
        drawOverlay();
    }
});

function openVisualWorkspace(file, mode) {
    currentEditFile = file; 
    editOriginalFileName = file.name; 
    currentVisualMode = mode;
    pageEdits = {}; 
    pageRotations = {}; 
    selectedEditIndex = -1;

    const title = document.getElementById('workspace-title'); 
    const headerHelp = document.getElementById('visual-tool-header');
    const btnText = document.getElementById('btn-edit-text'); 
    const btnDraw = document.getElementById('btn-edit-draw'); 
    const btnErase = document.getElementById('btn-edit-whiteout'); 
    const btnImage = document.getElementById('btn-edit-image');
    const toolSettings = document.querySelector('.tool-settings'); 
    const btnClear = document.getElementById('btn-edit-clear');
    const applyModeSelector = document.getElementById('edit-apply-mode');
    
    const btnRotLeft = document.getElementById('btn-rotate-left'); 
    const btnRotRight = document.getElementById('btn-rotate-right');
    const btnFlatten = document.getElementById('btn-flatten-apply'); 
    const watermarkSettings = document.getElementById('watermark-settings');

    if(headerHelp) headerHelp.style.display = 'none';
    if(btnRotLeft) btnRotLeft.style.display = 'none'; 
    if(btnRotRight) btnRotRight.style.display = 'none';
    if(btnFlatten) btnFlatten.style.display = 'none'; 
    if(watermarkSettings) watermarkSettings.style.display = 'none';
    
    document.body.classList.add('is-editing'); 
    
    if(applyModeSelector) {
        applyModeSelector.value = ['pagenumbers', 'watermark', 'imagewatermark'].includes(mode) ? 'all' : 'current';
    }

    if (['edit', 'sign', 'watermark', 'imagewatermark', 'addtext'].includes(mode)) {
        if(title) {
            title.innerHTML = mode === 'sign' ? '<i class="fas fa-signature"></i> Signature' : 
                              mode === 'watermark' ? '<i class="fas fa-stamp"></i> Watermark' : 
                              mode === 'imagewatermark' ? '<i class="fas fa-images"></i> Image Watermark' : 
                              mode === 'addtext' ? '<i class="fas fa-font"></i> Add Text' : 
                              '<i class="fas fa-edit"></i> Visual Editor';
        }
        
        if(btnText) btnText.style.display = (mode !== 'imagewatermark') ? 'inline-flex' : 'none'; 
        if(btnDraw) btnDraw.style.display = 'inline-flex'; 
        if(btnErase) btnErase.style.display = 'inline-flex'; 
        if(btnImage) btnImage.style.display = 'inline-flex'; 
        if(toolSettings) toolSettings.style.display = 'flex'; 
        if(btnClear) btnClear.style.display = 'inline-flex';
        
        if (mode === 'imagewatermark') { 
            if(watermarkSettings) watermarkSettings.style.display = 'flex'; 
            setToolActive('btn-edit-image', 'image'); 
            document.getElementById('edit-image-input')?.click(); 
        } else if (mode === 'sign' || mode === 'watermark' || mode === 'addtext') { 
            setToolActive('btn-edit-text', 'text'); 
        } else { 
            currentTool = 'none'; 
        }

    } else {
        if(btnText) btnText.style.display = 'none'; 
        if(btnDraw) btnDraw.style.display = 'none'; 
        if(btnErase) btnErase.style.display = 'none'; 
        if(btnImage) btnImage.style.display = 'none'; 
        if(toolSettings) toolSettings.style.display = 'none'; 
        if(btnClear) btnClear.style.display = 'none';
        
        if (mode === 'crop') { 
            if(title) title.innerHTML = '<i class="fas fa-crop"></i> Visual Crop'; 
            if(headerHelp) { headerHelp.style.display = 'block'; headerHelp.innerText = "Draw a box to crop the page."; } 
            currentTool = 'visual-box'; 
        }
        else if (mode === 'addmargins') { 
            if(title) title.innerHTML = '<i class="fas fa-border-all"></i> Visual Margin'; 
            if(headerHelp) { headerHelp.style.display = 'block'; headerHelp.innerText = "Draw content area (Margins will be added outside)"; } 
            currentTool = 'visual-box'; 
        }
        else if (mode === 'extract') { 
            if(title) title.innerHTML = '<i class="fas fa-file-alt"></i> Select Text Area'; 
            if(headerHelp) { headerHelp.style.display = 'block'; headerHelp.innerText = "Draw a box to extract text from that area."; } 
            currentTool = 'visual-box'; 
        }
        else if (mode === 'rotate') { 
            if(title) title.innerHTML = '<i class="fas fa-sync-alt"></i> Rotate Pages'; 
            if(btnRotLeft) btnRotLeft.style.display = 'inline-flex'; 
            if(btnRotRight) btnRotRight.style.display = 'inline-flex';
            currentTool = 'none'; 
        }
        else if (mode === 'flatten') {
            if(title) title.innerHTML = '<i class="fas fa-layer-group"></i> Flatten Form'; 
            if(btnFlatten) btnFlatten.style.display = 'inline-flex';
            if(headerHelp) { headerHelp.style.display = 'block'; headerHelp.innerText = "Preview the form. Click Flatten Content to make fields uneditable."; }
            currentTool = 'none';
        }
        else if (mode === 'pagenumbers') {
            if(title) title.innerHTML = '<i class="fas fa-sort-numeric-down"></i> Place Number'; 
            currentTool = 'none';
            if (!pageEdits[1]) pageEdits[1] = [];
            const fmtObj = document.getElementById('pagenumbers-format'); 
            visualData.format = fmtObj ? fmtObj.value : "1";
            pageEdits[1].push({ type: 'pagenum-dummy', x: 50, y: 50, text: visualData.format.replace('10', 'MAX'), color: '#3b82f6', size: 16 });
            selectedEditIndex = 0;
            if(headerHelp) { headerHelp.style.display = 'block'; headerHelp.innerText = "Drag the blue text to position it"; }
        }
    }

    const fileReader = new FileReader();
    fileReader.onload = function() {
        const tempPdfBytes = new Uint8Array(this.result);
        pdfjsLib.getDocument(tempPdfBytes).promise.then(pdf => {
            editPdfDoc = pdf; 
            editPageNum = 1; 
            const countObj = document.getElementById('page-count'); 
            if(countObj) countObj.textContent = pdf.numPages;
            
            window.switchView('edit'); 
            const upl = document.getElementById('edit-upload-section'); 
            if(upl) upl.style.display = 'none'; 
            
            const wrk = document.getElementById('edit-workspace'); 
            if(wrk) wrk.style.display = 'flex';
            
            const cont = document.querySelector('.canvas-container'); 
            const padding = window.innerWidth > 768 ? 60 : 20;
            
            pdf.getPage(1).then(page => {
                 const baseViewport = page.getViewport({ scale: 1 });
                 
                 // Initial load par bhi same perfect "Fit to Page" math chalega
                 const sidebarWidth = window.innerWidth > 768 ? 280 : 20;
                 const cWidth = window.innerWidth - sidebarWidth;
                 const cHeight = window.innerHeight - 200;
                 
                 const scaleW = cWidth / baseViewport.width;
                 const scaleH = cHeight / baseViewport.height;
                 
                 editScale = Math.min(scaleW, scaleH, 2.0); 
                 
                 renderEditPage(editPageNum);
            });
            
        }).catch(error => { 
            showCustomAlert("Error loading PDF."); 
            document.body.classList.remove('is-editing'); 
        });
    };
    fileReader.readAsArrayBuffer(file);
}

document.getElementById('btn-rotate-left')?.addEventListener('click', () => { 
    pageRotations[editPageNum] = (pageRotations[editPageNum] || 0) - 90; 
    renderEditPage(editPageNum); 
});

document.getElementById('btn-rotate-right')?.addEventListener('click', () => { 
    pageRotations[editPageNum] = (pageRotations[editPageNum] || 0) + 90; 
    renderEditPage(editPageNum); 
});

document.getElementById('btn-flatten-apply')?.addEventListener('click', () => { 
    document.getElementById('btn-edit-save').click(); 
});

document.getElementById('btn-close-editor')?.addEventListener('click', () => {
    document.body.classList.remove('is-editing');
    const wrk = document.getElementById('edit-workspace'); 
    if(wrk) wrk.style.display='none'; 
    
    const upl = document.getElementById('edit-upload-section'); 
    if(upl) upl.style.display='block'; 
    
    window.switchView('dashboard');
});

document.getElementById('edit-pdf-input')?.addEventListener('change', function(e) { 
    if (e.target.files[0]) openVisualWorkspace(e.target.files[0], 'edit'); 
});

function renderEditPage(num) {
    if (!editPdfDoc) return;
    editPdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale: editScale, rotation: pageRotations[num] || 0 });
        
        if(renderCanvas) { 
            renderCanvas.height = viewport.height; 
            renderCanvas.width = viewport.width; 
        }
        if(overlayCanvas) { 
            overlayCanvas.height = viewport.height; 
            overlayCanvas.width = viewport.width; 
        }
        
        if(renderCtx) {
            page.render({ canvasContext: renderCtx, viewport: viewport });
        }
        
        const pNum = document.getElementById('page-num'); 
        if(pNum) pNum.textContent = num; 
        
        drawOverlay(); 
    });
}

function getHandleRects(edit) {
    const hs = 16; 
    const half = hs / 2; 
    const {x, y, w, h} = edit;
    
    return {
        nw: {x: x - half, y: y - half, w: hs, h: hs}, 
        ne: {x: x + w - half, y: y - half, w: hs, h: hs}, 
        se: {x: x + w - half, y: y + h - half, w: hs, h: hs}, 
        sw: {x: x - half, y: y + h - half, w: hs, h: hs},
        n:  {x: x + w/2 - half, y: y - half, w: hs, h: hs}, 
        s:  {x: x + w/2 - half, y: y + h - half, w: hs, h: hs}, 
        e:  {x: x + w - half, y: y + h/2 - half, w: hs, h: hs}, 
        w:  {x: x - half, y: y + h/2 - half, w: hs, h: hs}
    };
}

function drawOverlay() {
    if (!overlayCtx || !overlayCanvas) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const edits = pageEdits[editPageNum] || [];
    
    edits.forEach((edit, i) => {
        if (edit.type === 'whiteout') {
            overlayCtx.fillStyle = 'white'; 
            overlayCtx.fillRect(edit.x, edit.y, edit.w, edit.h);
        } else if (edit.type === 'text') {
            overlayCtx.save(); 
            overlayCtx.globalAlpha = edit.opacity || 1;
            
            const fontStyle = `${edit.italic ? 'italic ' : ''}${edit.bold ? 'bold ' : ''}${edit.size}px Arial`; 
            overlayCtx.font = fontStyle;
            
            const textWidth = overlayCtx.measureText(edit.text).width;
            let drawX = edit.x; 
            
            if (edit.align === 'center') drawX = edit.x - textWidth/2; 
            if (edit.align === 'right') drawX = edit.x - textWidth;

            if (edit.bgColor && edit.bgColor !== 'transparent') { 
                overlayCtx.fillStyle = edit.bgColor; 
                overlayCtx.fillRect(drawX - 5, edit.y - edit.size, textWidth + 10, edit.size + 10); 
            }
            
            overlayCtx.fillStyle = edit.color; 
            overlayCtx.fillText(edit.text, drawX, edit.y);
            
            if (edit.underline) { 
                overlayCtx.beginPath(); 
                overlayCtx.moveTo(drawX, edit.y + 2); 
                overlayCtx.lineTo(drawX + textWidth, edit.y + 2); 
                overlayCtx.strokeStyle = edit.color; 
                overlayCtx.lineWidth = Math.max(1, edit.size/15); 
                overlayCtx.stroke(); 
            }

            if (i === selectedEditIndex) { 
                overlayCtx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; 
                overlayCtx.lineWidth = 1; 
                overlayCtx.strokeRect(drawX - 5, edit.y - edit.size, textWidth + 10, edit.size + 10); 
            }
            overlayCtx.restore();
            
        } else if (edit.type === 'draw') {
            overlayCtx.strokeStyle = edit.color; 
            overlayCtx.lineWidth = edit.size; 
            overlayCtx.lineCap = 'round'; 
            overlayCtx.lineJoin = 'round'; 
            overlayCtx.beginPath();
            if(edit.points.length > 0) { 
                overlayCtx.moveTo(edit.points[0].x, edit.points[0].y); 
                for(let k=1; k<edit.points.length; k++) { 
                    overlayCtx.lineTo(edit.points[k].x, edit.points[k].y); 
                } 
                overlayCtx.stroke(); 
            }
        } else if (edit.type === 'image' && edit.imgObj) {
            overlayCtx.save(); 
            overlayCtx.globalAlpha = edit.opacity || 1; 
            overlayCtx.drawImage(edit.imgObj, edit.x, edit.y, edit.w, edit.h); 
            overlayCtx.restore();
            
            if (i === selectedEditIndex) {
                overlayCtx.strokeStyle = '#3b82f6'; 
                overlayCtx.lineWidth = 2; 
                overlayCtx.strokeRect(edit.x, edit.y, edit.w, edit.h);
                overlayCtx.fillStyle = 'white'; 
                
                const rects = getHandleRects(edit); 
                for (let key in rects) { 
                    const r = rects[key]; 
                    overlayCtx.fillRect(r.x, r.y, r.w, r.h); 
                    overlayCtx.strokeRect(r.x, r.y, r.w, r.h); 
                }
            }
        } else if (edit.type === 'visual-box') {
            overlayCtx.fillStyle = 'rgba(59, 130, 246, 0.2)'; 
            overlayCtx.fillRect(edit.x, edit.y, edit.w, edit.h);
            overlayCtx.strokeStyle = '#3b82f6'; 
            overlayCtx.lineWidth = 2; 
            overlayCtx.setLineDash([5, 5]); 
            overlayCtx.strokeRect(edit.x, edit.y, edit.w, edit.h); 
            overlayCtx.setLineDash([]);
        } else if (edit.type === 'pagenum-dummy') {
            overlayCtx.font = `bold ${edit.size}px Arial`; 
            overlayCtx.fillStyle = edit.color; 
            overlayCtx.fillText(edit.text, edit.x, edit.y);
            
            if (i === selectedEditIndex) { 
                overlayCtx.strokeStyle = 'blue'; 
                overlayCtx.strokeRect(edit.x - 5, edit.y - edit.size, overlayCtx.measureText(edit.text).width + 10, edit.size + 10); 
            }
        }
    });
}

function getCursorPos(e) {
    if(!overlayCanvas) return {x:0, y:0};
    
    const rect = overlayCanvas.getBoundingClientRect(); 
    const scaleX = overlayCanvas.width / rect.width; 
    const scaleY = overlayCanvas.height / rect.height;
    
    let clientX = e.clientX; 
    let clientY = e.clientY;
    
    if(e.touches && e.touches.length > 0) { 
        clientX = e.touches[0].clientX; 
        clientY = e.touches[0].clientY; 
    }
    
    return { 
        x: (clientX - rect.left) * scaleX, 
        y: (clientY - rect.top) * scaleY 
    };
}

function normalizeBox(box) { 
    return { 
        x: box.w < 0 ? box.x + box.w : box.x, 
        y: box.h < 0 ? box.y + box.h : box.y, 
        w: Math.abs(box.w), 
        h: Math.abs(box.h) 
    }; 
}

overlayCanvas?.addEventListener('touchstart', (e) => { 
    if (e.touches.length === 1 && (currentTool !== 'none' || currentVisualMode === 'pagenumbers')) {
        e.preventDefault(); 
    }
}, {passive: false});

overlayCanvas?.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return; 
    if (currentTool === 'none' && currentVisualMode !== 'pagenumbers') return;
    if (e.target.closest('#custom-text-modal')) return;
    
    const pos = getCursorPos(e); 
    const edits = pageEdits[editPageNum] || []; 
    hasMovedDuringClick = false; 
    
    if (selectedEditIndex !== -1 && edits[selectedEditIndex]?.type === 'image') {
        const edit = edits[selectedEditIndex]; 
        const rects = getHandleRects(edit);
        for (let key in rects) { 
            const r = rects[key]; 
            if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) { 
                activeResizeHandle = key; 
                dragOffsetX = pos.x; 
                dragOffsetY = pos.y; 
                originalEditState = { ...edit }; 
                return; 
            } 
        }
    }
    
    for (let i = edits.length - 1; i >= 0; i--) {
        const edit = edits[i]; 
        let isHit = false;
        
        if (edit.type === 'whiteout' || edit.type === 'image' || edit.type === 'visual-box') {
            const nBox = normalizeBox(edit); 
            if (pos.x >= nBox.x && pos.x <= nBox.x + nBox.w && pos.y >= nBox.y && pos.y <= nBox.y + nBox.h) {
                isHit = true;
            }
        } else if (edit.type === 'text' || edit.type === 'pagenum-dummy') {
            if(overlayCtx) { 
                overlayCtx.font = `${edit.italic ? 'italic ' : ''}${edit.bold ? 'bold ' : ''}${edit.size}px Arial`; 
                const textWidth = overlayCtx.measureText(edit.text).width;
                let drawX = edit.x; 
                
                if(edit.align === 'center') drawX = edit.x - textWidth/2; 
                if(edit.align === 'right') drawX = edit.x - textWidth;
                
                if (pos.x >= drawX - 5 && pos.x <= drawX + textWidth + 5 && pos.y >= edit.y - edit.size && pos.y <= edit.y + 10) {
                    isHit = true; 
                }
            }
        } else if (edit.type === 'draw') {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; 
            edit.points.forEach(p => { 
                if(p.x < minX) minX = p.x; 
                if(p.x > maxX) maxX = p.x; 
                if(p.y < minY) minY = p.y; 
                if(p.y > maxY) maxY = p.y; 
            });
            if (pos.x >= minX - 10 && pos.x <= maxX + 10 && pos.y >= minY - 10 && pos.y <= maxY + 10) {
                isHit = true;
            }
        }
        
        if (isHit && (currentTool !== 'draw' || edit.type === 'draw')) { 
            activeDragIndex = i; 
            if(edit.type === 'draw') { 
                dragOffsetX = pos.x; 
                dragOffsetY = pos.y; 
            } else { 
                dragOffsetX = pos.x - edit.x; 
                dragOffsetY = pos.y - edit.y; 
            }
            
            const item = edits.splice(i, 1)[0]; 
            edits.push(item); 
            activeDragIndex = edits.length - 1; 
            selectedEditIndex = activeDragIndex; 
            
            if(['edit', 'sign', 'watermark', 'imagewatermark', 'addtext'].includes(currentVisualMode) && trashZone) {
                trashZone.style.display = 'flex';
            }
            
            if(currentVisualMode === 'imagewatermark') {
                document.getElementById('watermark-opacity').value = edit.opacity || 1;
            }
            
            drawOverlay(); 
            return; 
        }
    }

    selectedEditIndex = -1; 
    drawOverlay();

    if (currentTool === 'text') {
        openTextModal("", { type: 'new', pos: { x: pos.x, y: pos.y } });
    } else if (currentTool === 'whiteout') { 
        isDrawing = true; 
        startX = pos.x; 
        startY = pos.y; 
    } else if (currentTool === 'draw') { 
        isDrawing = true; 
        if (!pageEdits[editPageNum]) pageEdits[editPageNum] = []; 
        currentPath = { type: 'draw', color: editColor, size: editSize, points: [ {x: pos.x, y: pos.y} ] }; 
        pageEdits[editPageNum].push(currentPath); 
    } else if (currentTool === 'visual-box') { 
        isDrawing = true; 
        startX = pos.x; 
        startY = pos.y; 
        pageEdits[editPageNum] = [{ type: 'visual-box', x: pos.x, y: pos.y, w: 0, h: 0 }]; 
    }
});

window.addEventListener('pointermove', (e) => {
    if (activeDragIndex === -1 && !activeResizeHandle && !isDrawing) return;
    if (e.pointerType === 'touch') { 
        if (!e.isPrimary) return; 
        e.preventDefault(); 
    }
    
    const pos = getCursorPos(e);
    
    if (activeResizeHandle) {
        hasMovedDuringClick = true; 
        const edit = pageEdits[editPageNum][selectedEditIndex]; 
        const dx = pos.x - dragOffsetX; 
        const dy = pos.y - dragOffsetY; 
        const orig = originalEditState;
        
        let newX = orig.x, newY = orig.y, newW = orig.w, newH = orig.h;
        
        if (activeResizeHandle.includes('e')) newW = orig.w + dx; 
        if (activeResizeHandle.includes('s')) newH = orig.h + dy;
        if (activeResizeHandle.includes('w')) { newX = orig.x + dx; newW = orig.w - dx; } 
        if (activeResizeHandle.includes('n')) { newY = orig.y + dy; newH = orig.h - dy; }
        
        if (newW >= 20) { edit.x = newX; edit.w = newW; } 
        if (newH >= 20) { edit.y = newY; edit.h = newH; }
        
        drawOverlay(); 
        return;
    }

    if (activeDragIndex !== -1) {
        hasMovedDuringClick = true; 
        const edit = pageEdits[editPageNum][activeDragIndex];
        
        if(edit.type === 'draw') { 
            const dx = pos.x - dragOffsetX; 
            const dy = pos.y - dragOffsetY; 
            edit.points.forEach(p => { p.x += dx; p.y += dy; }); 
            dragOffsetX = pos.x; 
            dragOffsetY = pos.y; 
        } else { 
            edit.x = pos.x - dragOffsetX; 
            edit.y = pos.y - dragOffsetY; 
        }
        
        if(['edit', 'sign', 'watermark', 'imagewatermark', 'addtext'].includes(currentVisualMode) && trashZone) {
            const tRect = trashZone.getBoundingClientRect(); 
            const clientX = e.clientX; 
            const clientY = e.clientY;
            
            if (clientX >= tRect.left && clientX <= tRect.right && clientY >= tRect.top && clientY <= tRect.bottom) { 
                isHoveringTrash = true; 
                trashZone.style.transform = 'translateX(-50%) scale(1.1)'; 
                trashZone.style.background = 'rgba(220, 38, 38, 1)'; 
            } else { 
                isHoveringTrash = false; 
                trashZone.style.transform = 'translateX(-50%) scale(1)'; 
                trashZone.style.background = 'rgba(239, 68, 68, 0.95)'; 
            }
        }
        
        drawOverlay(); 
        return;
    }
    
    if (!isDrawing) return;
    
    if (currentTool === 'whiteout' && overlayCtx) { 
        drawOverlay(); 
        overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.8)'; 
        overlayCtx.fillRect(startX, startY, pos.x - startX, pos.y - startY); 
        overlayCtx.strokeStyle = 'red'; 
        overlayCtx.lineWidth = 1; 
        overlayCtx.setLineDash([]); 
        overlayCtx.strokeRect(startX, startY, pos.x - startX, pos.y - startY); 
    } else if (currentTool === 'draw') { 
        currentPath.points.push({x: pos.x, y: pos.y}); 
        drawOverlay(); 
    } else if (currentTool === 'visual-box') { 
        const box = pageEdits[editPageNum][0]; 
        box.w = pos.x - startX; 
        box.h = pos.y - startY; 
        drawOverlay(); 
    }
});

window.addEventListener('pointerup', (e) => {
    if (activeResizeHandle) { 
        activeResizeHandle = null; 
        return; 
    }
    
    if (activeDragIndex !== -1) {
        if(trashZone) trashZone.style.display = 'none';
        
        if (isHoveringTrash && ['edit', 'sign', 'watermark', 'imagewatermark', 'addtext'].includes(currentVisualMode)) { 
            pageEdits[editPageNum].splice(activeDragIndex, 1); 
            isHoveringTrash = false; 
            selectedEditIndex = -1; 
            showCustomAlert("Deleted."); 
        } else if (!hasMovedDuringClick) {
            const edit = pageEdits[editPageNum][activeDragIndex]; 
            if (edit.type === 'text' && currentTool === 'text') {
                openTextModal(edit.text, { type: 'edit', index: activeDragIndex });
            }
        }
        
        activeDragIndex = -1; 
        drawOverlay(); 
        return;
    }
    
    if (!isDrawing) return;
    
    isDrawing = false; 
    currentPath = null;
    
    if (currentTool === 'whiteout' && overlayCanvas) {
        const pos = getCursorPos(e); 
        let clientX = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0); 
        let clientY = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0);
        
        const rect = overlayCanvas.getBoundingClientRect(); 
        const scaleX = overlayCanvas.width / rect.width; 
        const scaleY = overlayCanvas.height / rect.height;
        
        const endX = (clientX - rect.left) * scaleX; 
        const endY = (clientY - rect.top) * scaleY; 
        const w = endX - startX; 
        const h = endY - startY;
        
        if (Math.abs(w) > 5 && Math.abs(h) > 5) { 
            if (!pageEdits[editPageNum]) pageEdits[editPageNum] = []; 
            pageEdits[editPageNum].push({ type: 'whiteout', x: w < 0 ? endX : startX, y: h < 0 ? endY : startY, w: Math.abs(w), h: Math.abs(h) }); 
        }
        
        drawOverlay();
    }
});

document.getElementById('prev-page')?.addEventListener('click', () => { 
    if (editPageNum > 1) { 
        editPageNum--; 
        selectedEditIndex = -1; 
        renderEditPage(editPageNum); 
    } 
});

document.getElementById('next-page')?.addEventListener('click', () => { 
    if (editPageNum < editPdfDoc?.numPages) { 
        editPageNum++; 
        selectedEditIndex = -1; 
        renderEditPage(editPageNum); 
    } 
});

// ==========================================
// VISUAL EDITOR SAVE & RENDER LOGIC
// ==========================================
document.getElementById('btn-edit-save')?.addEventListener('click', async () => {
    if (!currentEditFile) return;
    
    const btn = document.getElementById('btn-edit-save'); 
    const oldText = btn.innerHTML; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
        const freshBuffer = await currentEditFile.arrayBuffer();
        if (freshBuffer.byteLength < 100) { 
            showCustomAlert("File error."); 
            btn.innerHTML = oldText; 
            return; 
        }

        const applyModeObj = document.getElementById('edit-apply-mode'); 
        const applyMode = applyModeObj ? applyModeObj.value : 'current';

        if (['edit', 'sign', 'watermark', 'imagewatermark', 'addtext'].includes(currentVisualMode)) {
            const pdfDoc = await PDFDocument.load(freshBuffer);
            const pages = pdfDoc.getPages();
            
            for (let pIdx = 0; pIdx < pages.length; pIdx++) {
                const page = pages[pIdx]; 
                const { width, height } = page.getSize();
                
                let editsToApply = (applyMode === 'all') ? (pageEdits[editPageNum] || []) : (pageEdits[pIdx + 1] || []);

                for (const edit of editsToApply) {
                    const pdfX = edit.x / editScale; 
                    const pdfY = height - (edit.y / editScale); 
                    
                    if (edit.type === 'whiteout') { 
                        page.drawRectangle({ 
                            x: pdfX, 
                            y: pdfY - (edit.h / editScale), 
                            width: edit.w / editScale, 
                            height: edit.h / editScale, 
                            color: rgb(1, 1, 1) 
                        }); 
                    } else if (edit.type === 'text') { 
                        let font;
                        if (edit.bold && edit.italic) font = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique); 
                        else if (edit.bold) font = await pdfDoc.embedFont(StandardFonts.HelveticaBold); 
                        else if (edit.italic) font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique); 
                        else font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                        
                        const fontSize = edit.size / editScale; 
                        const textWidth = font.widthOfTextAtSize(edit.text, fontSize);
                        
                        let drawX = pdfX; 
                        if (edit.align === 'center') drawX = pdfX - textWidth/2; 
                        if (edit.align === 'right') drawX = pdfX - textWidth;

                        if (edit.bgColor && edit.bgColor !== 'transparent') { 
                            page.drawRectangle({ 
                                x: drawX - 5, 
                                y: pdfY - fontSize, 
                                width: textWidth + 10, 
                                height: fontSize + 10, 
                                color: hexToRgbPdf(edit.bgColor), 
                                opacity: edit.opacity || 1 
                            }); 
                        }
                        
                        page.drawText(edit.text, { 
                            x: drawX, 
                            y: pdfY, 
                            size: fontSize, 
                            font: font, 
                            color: hexToRgbPdf(edit.color), 
                            opacity: edit.opacity || 1 
                        }); 
                        
                        if (edit.underline) { 
                            page.drawLine({ 
                                start: {x: drawX, y: pdfY - 2}, 
                                end: {x: drawX + textWidth, y: pdfY - 2}, 
                                thickness: Math.max(1, fontSize/15), 
                                color: hexToRgbPdf(edit.color), 
                                opacity: edit.opacity || 1 
                            }); 
                        }
                    } else if (edit.type === 'draw') { 
                        for(let k=0; k < edit.points.length - 1; k++) { 
                            const p1 = edit.points[k]; 
                            const p2 = edit.points[k+1]; 
                            
                            page.drawLine({ 
                                start: { x: p1.x / editScale, y: height - (p1.y / editScale) }, 
                                end: { x: p2.x / editScale, y: height - (p2.y / editScale) }, 
                                thickness: edit.size / editScale, 
                                color: hexToRgbPdf(edit.color) 
                            }); 
                        } 
                    } else if (edit.type === 'image') { 
                        const res = await fetch(edit.dataUrl); 
                        const imageBytes = await res.arrayBuffer(); 
                        
                        let pdfImage = edit.imgType === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes); 
                        
                        const pdfW = edit.w / editScale; 
                        const pdfH = edit.h / editScale; 
                        
                        page.drawImage(pdfImage, { 
                            x: pdfX, 
                            y: pdfY - pdfH, 
                            width: pdfW, 
                            height: pdfH, 
                            opacity: edit.opacity || 1 
                        }); 
                    }
                }
            }
            let outputSuffix = currentVisualMode === 'sign' ? '_Signed' : currentVisualMode.includes('watermark') ? '_Watermark' : '_Edited';
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + outputSuffix + '.pdf', 'application/pdf');

        } else if (currentVisualMode === 'crop') {
            const boxData = pageEdits[editPageNum]?.find(e => e.type === 'visual-box');
            if(!boxData) { 
                showCustomAlert("Draw a crop box first!"); 
                btn.innerHTML = oldText; 
                return; 
            }
            
            const nBox = normalizeBox(boxData); 
            const pdfDoc = await PDFDocument.load(freshBuffer);
            
            if (applyMode === 'current') {
                const pageCount = pdfDoc.getPageCount();
                for (let i = pageCount - 1; i >= 0; i--) { 
                    if (i !== editPageNum - 1) {
                        pdfDoc.removePage(i); 
                    }
                }
                const p = pdfDoc.getPage(0); 
                const { height } = p.getSize(); 
                p.setCropBox(nBox.x / editScale, height - ((nBox.y + nBox.h) / editScale), nBox.w / editScale, nBox.h / editScale);
            } else {
                pdfDoc.getPages().forEach((p) => { 
                    const { height } = p.getSize(); 
                    p.setCropBox(nBox.x / editScale, height - ((nBox.y + nBox.h) / editScale), nBox.w / editScale, nBox.h / editScale); 
                });
            }
            
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Cropped.pdf', 'application/pdf');

        } else if (currentVisualMode === 'addmargins') {
            const boxData = pageEdits[editPageNum]?.find(e => e.type === 'visual-box');
            if(!boxData) { 
                showCustomAlert("Draw a content box first!"); 
                btn.innerHTML = oldText; 
                return; 
            }
            
            const nBox = normalizeBox(boxData); 
            const pdfDoc = await PDFDocument.load(freshBuffer); 
            const pages = pdfDoc.getPages();
            
            const { width: pW, height: pH } = pages[0].getSize();
            const mL = nBox.x / editScale; 
            const mT = nBox.y / editScale; 
            const mR = pW - ((nBox.x + nBox.w) / editScale); 
            const mB = pH - ((nBox.y + nBox.h) / editScale);
            
            pages.forEach((p, i) => { 
                if (applyMode === 'current' && i !== editPageNum - 1) return;
                const { width, height } = p.getSize(); 
                p.setSize(width + mL + mR, height + mT + mB); 
                p.translateContent(mL, mB); 
            });
            
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Margined.pdf', 'application/pdf');

        } else if (currentVisualMode === 'extract') {
            const boxData = pageEdits[editPageNum]?.find(e => e.type === 'visual-box');
            if(!boxData) { 
                showCustomAlert("Draw a selection box first!"); 
                btn.innerHTML = oldText; 
                return; 
            }
            
            const nBox = normalizeBox(boxData); 
            const pdf = await pdfjsLib.getDocument(freshBuffer).promise; 
            let fullText = "";
            
            for (let i = 1; i <= pdf.numPages; i++) {
                if (applyMode === 'current' && i !== editPageNum) continue;
                
                const page = await pdf.getPage(i); 
                const textContent = await page.getTextContent(); 
                const viewport = page.getViewport({ scale: editScale });
                
                const extracted = textContent.items.filter(item => { 
                    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform); 
                    return tx[4] >= nBox.x && tx[4] <= nBox.x + nBox.w && tx[5] >= nBox.y && tx[5] <= nBox.y + nBox.h; 
                }).map(item => item.str).join(" ");
                
                if(extracted.trim()) {
                    fullText += `--- Page ${i} ---\n${extracted}\n\n`;
                }
            }
            
            if(!fullText) {
                showCustomAlert("No text found in that area."); 
            } else {
                await processAndDownload(new TextEncoder().encode(fullText), getBaseName(editOriginalFileName) + '_Extracted.txt', 'text/plain');
            }

        } else if (currentVisualMode === 'pagenumbers') {
            const dummy = pageEdits[1]?.find(e => e.type === 'pagenum-dummy');
            if(!dummy) { 
                showCustomAlert("Position the number first."); 
                btn.innerHTML = oldText; 
                return; 
            }
            
            const pdfDoc = await PDFDocument.load(freshBuffer); 
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica); 
            const pages = pdfDoc.getPages();
            
            pages.forEach((page, index) => {
                if (applyMode === 'current' && index !== editPageNum - 1) return;
                
                const { height } = page.getSize(); 
                let txt = `${index + 1}`; 
                
                if (visualData.format === 'Page 1') {
                    txt = `Page ${index + 1}`; 
                }
                if (visualData.format === 'Page 1 of 10') {
                    txt = `Page ${index + 1} of ${pages.length}`;
                }
                
                page.drawText(txt, { 
                    x: dummy.x / editScale, 
                    y: height - (dummy.y / editScale), 
                    size: 14, 
                    font, 
                    color: rgb(0,0,0) 
                });
            });
            
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Numbered.pdf', 'application/pdf');
            
        } else if (currentVisualMode === 'rotate') {
            const pdfDoc = await PDFDocument.load(freshBuffer);
            pdfDoc.getPages().forEach((p, i) => {
                if (applyMode === 'current' && i !== editPageNum - 1) return;
                const rot = pageRotations[i + 1] || 0;
                if (rot !== 0) {
                    p.setRotation(degrees(p.getRotation().angle + rot));
                }
            });
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Rotated.pdf', 'application/pdf');
            
        } else if (currentVisualMode === 'flatten') {
            const pdfDoc = await PDFDocument.load(freshBuffer);
            const form = pdfDoc.getForm(); 
            if (form) {
                form.flatten();
            }
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Flattened.pdf', 'application/pdf');
        }

        document.body.classList.remove('is-editing');
        const wrk = document.getElementById('edit-workspace'); 
        if(wrk) wrk.style.display='none'; 
        
        const upl = document.getElementById('edit-upload-section'); 
        if(upl) upl.style.display='block'; 
        
        window.switchView('dashboard');
        
        if(typeof AdManager !== 'undefined' && AdManager) {
            await AdManager.showInterstitial();
        }
        
    } catch (error) { 
        handleError(error); 
        document.body.classList.remove('is-editing'); 
    } finally { 
        btn.innerHTML = oldText; 
    }
});

// ==========================================
// MOBILE SMART SCROLL & PINCH-TO-ZOOM FIX
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SMART SCROLL (Only block scroll when Drawing) ---
    // User jab koi Tool button click karega tab scroll check hoga
    const toolbarButtons = document.querySelectorAll('.edit-toolbar-btn');
    
    toolbarButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Thoda timeout lagaya hai taaki pehle button "Active" ho jaye uske baad check ho
            setTimeout(() => {
                const overlayCanvas = document.getElementById('pdf-overlay-canvas');
                if (!overlayCanvas) return;

                // Check karo ki kya user ne 'Draw' ya 'Whiteout' (Pen) select kiya hai
                const isDrawActive = document.getElementById('btn-edit-draw').classList.contains('edit-tool-active');
                const isWhiteoutActive = document.getElementById('btn-edit-whiteout').classList.contains('edit-tool-active');
                
                if (isDrawActive || isWhiteoutActive) {
                    // Agar pen chalana hai toh Screen ka scroll block kardo (taaki ungli chalane se screen na hile)
                    overlayCanvas.style.touchAction = 'none';
                } else {
                    // Agar koi doosra tool hai ya tool hata diya gaya hai, toh scroll enable kardo (mobile default scroll)
                    overlayCanvas.style.touchAction = 'pan-x pan-y';
                }
            }, 100); 
        });
    });


    // --- 2. PINCH TO ZOOM LOGIC (2 fingers zooming) ---
    const overlayCanvas = document.getElementById('pdf-overlay-canvas');
    let initialPinchDistance = null; // Dono ungliyon ki shuruvaati doori

    if (overlayCanvas) {
        // Jab ungliyan screen par lagengi
        overlayCanvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Agar 2 ungli hain toh browser ka default behavior rok do taaki page ajeeb sa zoom na ho
                e.preventDefault(); 
                
                // Dono ungliyon ke beech ki doori calculate karo
                initialPinchDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            }
        }, { passive: false });

        // Jab ungliyan screen par chalengi
        overlayCanvas.addEventListener('touchmove', (e) => {
            // Check ki dono ungli touch kar rahi hain aur humne shuruvaati distance liya hua hai
            if (e.touches.length === 2 && initialPinchDistance !== null) {
                e.preventDefault(); 
                
                // Current ungliyon ki doori calculate karo
                const currentDistance = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );

                // Check karo kitni doori tay ki
                const distanceDifference = currentDistance - initialPinchDistance;
                
                // 40px ka gap rakha hai taaki halke se hilne par ekdum se bahut zyada zoom na ho jaye
                if (Math.abs(distanceDifference) > 40) {
                    if (distanceDifference > 0) {
                        // Ungliyan door jaa rahi hain = Zoom In
                        const zoomInButton = document.getElementById('btn-zoom-in');
                        if(zoomInButton) zoomInButton.click();
                    } else {
                        // Ungliyan paas aa rahi hain = Zoom Out
                        const zoomOutButton = document.getElementById('btn-zoom-out');
                        if(zoomOutButton) zoomOutButton.click();
                    }
                    
                    // Dobara trigger karne ke liye purane distance ko naye wale se update kardo
                    initialPinchDistance = currentDistance; 
                }
            }
        }, { passive: false });

        // Jab koi ek ya dono ungli screen se hatayega toh calculation wapas zero (reset) kardo
        overlayCanvas.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                initialPinchDistance = null;
            }
        });
    }
});

