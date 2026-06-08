import { PDFDocument, degrees, StandardFonts, rgb, PDFName } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { AdManager } from './adManager.js';
import { Filesystem, Directory } from 'https://cdn.jsdelivr.net/npm/@capacitor/filesystem@6.0.0/+esm';
import { Share } from 'https://cdn.jsdelivr.net/npm/@capacitor/share@6.0.0/+esm';
import { App } from 'https://cdn.jsdelivr.net/npm/@capacitor/app@6.0.0/+esm';

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
    const msg = error.message.toLowerCase();
    const activeViewElement = document.querySelector('.view-section.active');
    const activeView = activeViewElement ? activeViewElement.id : '';

    if (msg.includes('encrypted') || msg.includes('password') || msg.includes('decrypt')) {
        if (activeView === 'view-unlock') showCustomAlert("Unlock Failed ❌<br><br>Incorrect password, or API server issue.");
        else showCustomAlert("This PDF is password protected 🔒.<br><br>Please use the <b>'Unlock PDF'</b> tool first to remove the password before using this feature.");
    } else {
        showCustomAlert(`Error: ${error.message}`);
    }
}

let lastBackPress = 0;
if (window.Capacitor && window.Capacitor.isNativePlatform()) {
    App.addListener('backButton', () => {
        const activeView = document.querySelector('.view-section.active').id;
        if (document.getElementById('global-preview-modal').style.display === 'flex') {
            document.getElementById('btn-close-global-preview').click();
            return;
        }
        if (activeView !== 'view-dashboard') window.switchView('dashboard');
        else {
            const now = new Date().getTime();
            if (now - lastBackPress < 2000) App.exitApp();
            else lastBackPress = now;
        }
    });
}

window.switchView = (viewId) => {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewId));
    if(activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewId}`);
    if(targetView) targetView.classList.add('active');

    if(viewId === 'history') window.renderHistory();
};

const views = [
    'merge', 'split', 'delete', 'compress', 'rotate', 'pdftojpg', 'pagenumbers', 
    'jpgtopdf', 'extract', 'watermark', 'sign', 'protect', 'unlock', 'flatten', 
    'crop', 'metadata', 'repair', 'reorder', 'imagewatermark', 'htmltopdf',
    'addtext', 'addblank', 'resizepdf', 'splitevenodd', 'addmargins', 'removeannots',
    'contact', 'privacy', 'terms'
];
const ui = {};
views.forEach(v => ui[v] = document.getElementById(`${v}-ui-container`));

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

// Explicit Button Click added for Foolproof Mobile File Manager triggers
const generateSingleFileUI = (id, icon, color, title, btnText, extraHtml = "") => `
    ${brandHeaderHtml}
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Select PDF to ${title}</h3>
        <button onclick="document.getElementById('${id}-file-input').click()" style="padding: 10px 20px; background: ${color}; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse File</button>
        <input type="file" id="${id}-file-input" accept="application/pdf" style="display: none;">
    </div>
    <div id="${id}-file-info" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas fa-eye"></i> Preview & ${btnText}</button>
    </div>
`;

const generateMultipleFileUI = (id, icon, color, title, btnText, extraHtml = "") => `
    ${brandHeaderHtml}
    <div id="${id}-drop-zone" style="${dropZoneStyle.replace('var(--accent)', color)}">
        <i class="fas ${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 15px;"></i>
        <h3>Drag & Drop PDFs to ${title}</h3>
        <button onclick="document.getElementById('${id}-file-input').click()" style="padding: 10px 20px; background: ${color}; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Files</button>
        <input type="file" id="${id}-file-input" multiple accept="application/pdf" style="display: none;">
    </div>
    <div id="${id}-file-list" style="${fileListStyle}"></div>
    <div id="${id}-controls" style="display: none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);">
        ${extraHtml}
        <button id="btn-${id}-action" style="${btnStyle.replace('var(--accent)', color)}"><i class="fas fa-eye"></i> Preview & ${btnText}</button>
    </div>
`;

// MERGE UI IS NOW CUSTOM FOR ADVANCED EDITOR
if (ui.merge) ui.merge.innerHTML = brandHeaderHtml + `
    <div id="merge-drop-zone" style="${dropZoneStyle}"><i class="fas fa-object-group" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i><h3>Select PDFs to Merge</h3><button onclick="document.getElementById('merge-file-input').click()" style="padding: 10px 20px; background: var(--accent); color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Files</button><input type="file" id="merge-file-input" multiple accept="application/pdf" style="display: none;"></div>
    
    <div id="merge-editor-panel" style="display:none; background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border); margin-bottom: 20px;">
        <h3 style="margin-bottom: 15px; color: var(--accent);"><i class="fas fa-sliders-h"></i> Merge Settings</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
            <div>
                <label style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 5px; display: block;">Page Size</label>
                <select id="merge-setting-size" style="${inputStyle} margin-bottom: 0;"><option value="original">Keep Original</option><option value="A4">Force A4</option></select>
            </div>
            <div>
                <label style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 5px; display: block;">Add Margin Space</label>
                <select id="merge-setting-margin" style="${inputStyle} margin-bottom: 0;"><option value="0">No Margin</option><option value="20">Small (20px)</option><option value="40">Large (40px)</option></select>
            </div>
            <div>
                <label style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 5px; display: block;">Gap Between PDFs</label>
                <select id="merge-setting-gap" style="${inputStyle} margin-bottom: 0;"><option value="0">No Gap</option><option value="1">1 Blank Page</option><option value="2">2 Blank Pages</option></select>
            </div>
        </div>
        <h4 style="margin-bottom: 10px; color: white;">File Order (Drag or Use Arrows)</h4>
        <div id="merge-file-list" style="${fileListStyle}"></div>
        <button id="add-more-merge" style="background:var(--surface-color); color:var(--text-main); border:1px dashed var(--glass-border); padding:10px; width:100%; border-radius:8px; margin-bottom:15px; cursor:pointer; font-weight:600;"><i class="fas fa-plus"></i> Add More PDFs</button>
        <button id="btn-merge-action" style="${btnStyle}"><i class="fas fa-eye"></i> Process & Preview Merge</button>
    </div>
`;

if (ui.jpgtopdf) ui.jpgtopdf.innerHTML = brandHeaderHtml + `<div id="jpgtopdf-drop-zone" style="${dropZoneStyle.replace('var(--accent)', '#eab308')}"><i class="fas fa-images" style="font-size: 3rem; color: #eab308; margin-bottom: 15px;"></i><h3>Drag & Drop Images</h3><button onclick="document.getElementById('jpgtopdf-file-input').click()" style="padding: 10px 20px; background: #eab308; color: white; border: none; border-radius: 8px; cursor: pointer; margin-top: 15px; font-weight: 600;">Browse Images</button><input type="file" id="jpgtopdf-file-input" multiple accept="image/*" style="display: none;"></div><div id="jpgtopdf-file-list" style="${fileListStyle}"></div><button id="btn-jpgtopdf-action" style="${btnStyle.replace('var(--accent)', '#eab308')}; display: none;"><i class="fas fa-eye"></i> Preview & Convert</button>`;
if (ui.htmltopdf) ui.htmltopdf.innerHTML = brandHeaderHtml + `<div style="background: rgba(0,0,0,0.2); padding: 20px; border-radius: 12px; border: 1px solid var(--glass-border);"><label style="color: var(--text-secondary);">Paste your HTML Code here:</label><textarea id="html-input" rows="10" style="${inputStyle}" placeholder="<h1>Hello</h1>"></textarea><button id="btn-htmltopdf-action" style="${btnStyle.replace('var(--accent)', '#f97316')}"><i class="fas fa-eye"></i> Preview PDF</button></div>`;

if (ui.protect) ui.protect.innerHTML = generateMultipleFileUI('protect', 'fa-lock', '#8b5cf6', 'Protect', 'Encrypt', `<input type="password" id="protect-password" placeholder="Set Password for all files" style="${inputStyle}">`);
if (ui.unlock) ui.unlock.innerHTML = generateMultipleFileUI('unlock', 'fa-unlock', '#06b6d4', 'Unlock', 'Unlock', `<input type="password" id="unlock-password" placeholder="Current Password (applied to all)" style="${inputStyle}">`);
if (ui.compress) ui.compress.innerHTML = generateMultipleFileUI('compress', 'fa-compress-arrows-alt', '#10b981', 'Compress', 'Compress');

if (ui.split) ui.split.innerHTML = generateSingleFileUI('split', 'fa-cut', '#f59e0b', 'Split', 'Split', `<input type="text" id="split-ranges" placeholder="e.g. 1-3" style="${inputStyle}">`);
if (ui.delete) ui.delete.innerHTML = generateSingleFileUI('delete', 'fa-trash-alt', '#ef4444', 'Delete Pages', 'Remove Pages', `<input type="text" id="delete-ranges" placeholder="e.g. 2, 4-6" style="${inputStyle}">`);
if (ui.reorder) ui.reorder.innerHTML = generateSingleFileUI('reorder', 'fa-sort-amount-up', '#8b5cf6', 'Reorder Pages', 'Apply Order', `<input type="text" id="reorder-input" placeholder="e.g. 3, 1, 2" style="${inputStyle}">`);
if (ui.rotate) ui.rotate.innerHTML = generateSingleFileUI('rotate', 'fa-sync-alt', '#3b82f6', 'Rotate', 'Rotate', `<select id="rotate-angle" style="${inputStyle}"><option value="90">Right 90°</option><option value="180">Upside Down 180°</option><option value="-90">Left -90°</option></select>`);
if (ui.pdftojpg) ui.pdftojpg.innerHTML = generateSingleFileUI('pdftojpg', 'fa-file-archive', '#eab308', 'Convert to JPG', 'Get ZIP');
if (ui.flatten) ui.flatten.innerHTML = generateSingleFileUI('flatten', 'fa-layer-group', '#64748b', 'Flatten', 'Flatten');
if (ui.metadata) ui.metadata.innerHTML = generateSingleFileUI('metadata', 'fa-info-circle', '#eab308', 'Edit Metadata', 'Update Metadata', `<input type="text" id="meta-title" placeholder="New Document Title" style="${inputStyle}"><input type="text" id="meta-author" placeholder="New Author Name" style="${inputStyle}">`);
if (ui.repair) ui.repair.innerHTML = generateSingleFileUI('repair', 'fa-tools', '#10b981', 'Repair PDF', 'Attempt Repair');
if (ui.addblank) ui.addblank.innerHTML = generateSingleFileUI('addblank', 'fa-file-medical', '#10b981', 'Insert Blank Page', 'Insert', `<select id="addblank-position" style="${inputStyle}"><option value="start">At the very beginning</option><option value="end">At the very end</option></select>`);
if (ui.resizepdf) ui.resizepdf.innerHTML = generateSingleFileUI('resizepdf', 'fa-expand-arrows-alt', '#14b8a6', 'Resize Pages', 'Scale Document', `<select id="resize-profile" style="${inputStyle}"><option value="A4">A4 Profile</option><option value="Letter">Letter Profile</option><option value="Legal">Legal Profile</option></select>`);
if (ui.splitevenodd) ui.splitevenodd.innerHTML = generateSingleFileUI('splitevenodd', 'fa-columns', '#6366f1', 'Split Even/Odd', 'Split into ZIP');
if (ui.removeannots) ui.removeannots.innerHTML = generateSingleFileUI('removeannots', 'fa-eraser', '#8b5cf6', 'Clean Annotations', 'Remove All');
if (ui.imagewatermark) ui.imagewatermark.innerHTML = generateSingleFileUI('imagewatermark', 'fa-images', '#ec4899', 'Add Image Overlay', 'Stamp Image', `<label style="color: var(--text-secondary);">Select Logo/Image (PNG/JPG):</label><input type="file" id="imagewatermark-overlay-input" accept="image/png, image/jpeg" style="${inputStyle}">`);

if (ui.extract) ui.extract.innerHTML = generateSingleFileUI('extract', 'fa-file-alt', '#14b8a6', 'Extract Text', 'Continue', `
    <select id="extract-mode" style="${inputStyle}"><option value="full">Extract Full PDF Text</option><option value="visual">Select Text Area Visually</option></select>
`);

// NOW PURE VISUAL TOOLS
if (ui.crop) ui.crop.innerHTML = generateSingleFileUI('crop', 'fa-crop', '#3b82f6', 'Crop PDF', '');
if (ui.addmargins) ui.addmargins.innerHTML = generateSingleFileUI('addmargins', 'fa-border-all', '#3b82f6', 'Add Margins', '');
if (ui.pagenumbers) ui.pagenumbers.innerHTML = generateSingleFileUI('pagenumbers', 'fa-sort-numeric-down', '#6366f1', 'Add Numbers', '', `<label style="color:var(--text-secondary); font-size:0.9rem;">Format:</label><select id="pagenumbers-format" style="${inputStyle}"><option value="1">1, 2, 3...</option><option value="Page 1">Page 1, Page 2...</option><option value="Page 1 of 10">Page 1 of 10...</option></select>`);

// NEW UPGRADED VISUAL TOOLS
if (ui.sign) ui.sign.innerHTML = generateSingleFileUI('sign', 'fa-signature', '#8b5cf6', 'Sign', '');
if (ui.watermark) ui.watermark.innerHTML = generateSingleFileUI('watermark', 'fa-stamp', '#ec4899', 'Watermark', '');
if (ui.addtext) ui.addtext.innerHTML = generateSingleFileUI('addtext', 'fa-font', '#6366f1', 'Add Text', '');


// --- UTILS ---
const getBaseName = (filename) => filename.substring(0, filename.lastIndexOf('.')) || filename;

const DB_NAME = 'AmazingPDFHistory';
const STORE_NAME = 'files';

function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
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
    return new Promise(resolve => req.onsuccess = () => resolve(req.result.sort((a,b) => b.date - a.date)));
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
    if (!items.length) return list.innerHTML = '<p style="color:var(--text-secondary);">No downloads history found.</p>';
    list.innerHTML = '';
    items.forEach(item => {
        list.innerHTML += `<div style="${fileItemStyle}"><div class="text-container"><b class="text-ellipsis">${item.filename}</b><small style="color:var(--text-secondary);">${new Date(item.date).toLocaleString()}</small></div><div style="display:flex; gap:10px; flex-shrink: 0;"><button onclick="triggerHistoryDownload(${item.id})" style="background:var(--accent); color:white; border:none; padding:8px 12px; border-radius:6px;"><i class="fas fa-share-alt"></i></button><button onclick="removeHistoryItem(${item.id})" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px;"><i class="fas fa-trash"></i></button></div></div>`;
    });
};

window.removeHistoryItem = async (id) => { await window.deleteHistory(id); window.renderHistory(); };
window.triggerHistoryDownload = async (id) => {
    const items = await window.getHistory();
    const item = items.find(i => i.id === id);
    if(item) await processAndDownload(item.data, item.filename, item.type, false);
};

function bytesToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

// --- GLOBAL PREVIEW LOGIC ---
let pendingDownloadData = null;

async function processAndDownload(bytes, filename, type, saveToDb = true) {
    if(saveToDb) { try { await saveToHistory(bytes, filename, type); } catch(e) {} }
    
    pendingDownloadData = { bytes, filename, type };
    
    const modal = document.getElementById('global-preview-modal');
    const iframe = document.getElementById('global-preview-iframe');
    const pdfContainer = document.getElementById('global-preview-pdf-container');
    const msg = document.getElementById('global-preview-message');
    document.getElementById('global-preview-title').innerHTML = `<i class="fas fa-eye" style="color: var(--accent); flex-shrink: 0;"></i> <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Preview: ${filename}</span>`;

    iframe.style.display = 'none';
    pdfContainer.style.display = 'none';
    msg.style.display = 'none';

    if (type === 'application/pdf') {
        // ALWAYS use PDF.js Canvas on mobile/desktop to prevent iframe blocks
        pdfContainer.style.display = 'flex';
        pdfContainer.innerHTML = '<div style="color:#3b82f6; font-weight:600; font-size: 1.1rem; margin-top: 50px;"><i class="fas fa-spinner fa-spin"></i> Generating Preview...</div>';
        modal.style.display = 'flex';
        
        try {
            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            pdfContainer.innerHTML = ''; 
            
            const pagesToRender = Math.min(pdf.numPages, 5);
            for (let i = 1; i <= pagesToRender; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: window.innerWidth > 768 ? 1.5 : 1.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style = "box-shadow: 0 4px 15px rgba(0,0,0,0.2); border-radius: 4px; max-width: 100%; height: auto; display: block; margin-bottom: 10px;";
                pdfContainer.appendChild(canvas);
                
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            }
            if(pdf.numPages > 5) {
                const moreTxt = document.createElement('div');
                moreTxt.style = "color: #475569; font-weight: 600; padding: 10px; background: rgba(255,255,255,0.5); border-radius: 8px;";
                moreTxt.innerText = `+ ${pdf.numPages - 5} more pages (Download to view all)`;
                pdfContainer.appendChild(moreTxt);
            }
        } catch(err) {
            pdfContainer.innerHTML = '<div style="color:#ef4444; padding:20px; text-align:center;"><i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 10px;"></i><br>Preview not available for this specific file.<br>Please click Download to view it.</div>';
        }
    } else if (type === 'text/plain') {
        const blob = new Blob([bytes], { type });
        iframe.src = URL.createObjectURL(blob);
        iframe.style.display = 'block';
        modal.style.display = 'flex';
    } else {
        msg.style.display = 'block';
        modal.style.display = 'flex';
    }
}

async function executeFinalDownload() {
    if (!pendingDownloadData) return;
    const { bytes, filename, type } = pendingDownloadData;
    
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const base64 = bytesToBase64(bytes);
            const savedFile = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Documents });
            await Share.share({ title: filename, text: 'Processed via Amazing PDF', url: savedFile.uri });
        } catch (e) { showCustomAlert("Saved to Documents & History!"); }
    } else {
        const blob = new Blob([bytes], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); 
        a.click(); 
        document.body.removeChild(a); 
        // FIX: Delay revoke to prevent Android Chrome "Download Failed" bug
        setTimeout(() => { URL.revokeObjectURL(url); }, 5000); 
    }
    
    document.getElementById('global-preview-modal').style.display = 'none';
    pendingDownloadData = null;
    document.getElementById('global-preview-iframe').src = "";
    document.getElementById('global-preview-pdf-container').innerHTML = ""; 
}

document.getElementById('btn-close-global-preview')?.addEventListener('click', () => {
    document.getElementById('global-preview-modal').style.display = 'none';
    pendingDownloadData = null;
    document.getElementById('global-preview-iframe').src = "";
    document.getElementById('global-preview-pdf-container').innerHTML = "";
});

document.getElementById('btn-download-global-preview')?.addEventListener('click', executeFinalDownload);


function parseRange(rangeStr) {
    let pages = [];
    rangeStr.split(',').forEach(part => {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(n => parseInt(n.trim()) - 1);
            for (let i = start; i <= end; i++) pages.push(i);
        } else pages.push(parseInt(part.trim()) - 1);
    });
    return [...new Set(pages)].sort((a, b) => a - b);
}

// Visual Workspace Orchestrator
function setupSingleFileLogic(id, actionCallback) {
    const dropZone = document.getElementById(`${id}-drop-zone`);
    const input = document.getElementById(`${id}-file-input`);
    const info = document.getElementById(`${id}-file-info`);
    const controls = document.getElementById(`${id}-controls`);
    const btn = document.getElementById(`btn-${id}-action`);
    let currentFile = null;

    if (!dropZone || !input) return;

    // Direct click to dropzone or specific browse button handles this seamlessly
    dropZone.addEventListener('click', (e) => {
        // Prevent double trigger if button inside is clicked
        if(e.target.tagName !== 'BUTTON') input.click();
    });

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            currentFile = file;

            // DIRECT ROUTE TO VISUAL ENGINE
            if (['crop', 'addmargins', 'pagenumbers', 'sign', 'watermark', 'addtext'].includes(id) || (id === 'extract' && document.getElementById('extract-mode').value === 'visual')) {
                openVisualWorkspace(currentFile, id);
                input.value = ''; // Reset for next time
                return;
            }

            dropZone.style.display = 'none';
            info.innerHTML = `<div style="${fileItemStyle}"><div class="text-container" style="display:flex; align-items:center; gap:15px; min-width:0;"><i class="fas fa-file-pdf" style="color:#ef4444; font-size:1.5rem; flex-shrink:0;"></i><b class="text-ellipsis">${file.name}</b></div><button id="reset-${id}" style="background:var(--glass-border); color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; flex-shrink:0;"><i class="fas fa-times"></i></button></div>`;
            controls.style.display = 'block';
            document.getElementById(`reset-${id}`).addEventListener('click', () => {
                currentFile = null; input.value = '';
                dropZone.style.display = 'block'; info.innerHTML = ''; controls.style.display = 'none';
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
                document.getElementById(`reset-${id}`).click();
                await processAndDownload(result.bytes, result.filename, result.type);
                if(typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
            } catch (error) { handleError(error); } 
            finally { btn.innerHTML = originalText; }
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
    dropZone.addEventListener('click', (e) => { if(e.target.tagName !== 'BUTTON') input.click(); });
    
    function renderList() {
        listContainer.innerHTML = '';
        currentFiles.forEach((f, i) => {
            const itemDiv = document.createElement('div');
            itemDiv.style = fileItemStyle;
            itemDiv.innerHTML = `<div class="text-container"><b class="text-ellipsis">${f.name}</b></div><button class="remove-btn" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; flex-shrink:0;"><i class="fas fa-times"></i></button>`;
            listContainer.appendChild(itemDiv);
        });

        listContainer.querySelectorAll('.remove-btn').forEach(button => {
            button.addEventListener('click', (e) => { const idx = parseInt(e.currentTarget.getAttribute('data-index')); currentFiles.splice(idx, 1); renderList(); });
        });

        if(currentFiles.length > 0) {
            controls.style.display = 'block'; dropZone.style.display = 'none';
            if(!document.getElementById(`add-more-${id}`)) {
               const addMoreBtn = document.createElement('button');
               addMoreBtn.id = `add-more-${id}`; addMoreBtn.innerHTML = '<i class="fas fa-plus"></i> Add More PDFs';
               addMoreBtn.style = `background:var(--surface-color); color:var(--text-main); border:1px dashed var(--glass-border); padding:10px; width:100%; border-radius:8px; margin-bottom:15px; cursor:pointer; font-weight:600;`;
               addMoreBtn.addEventListener('click', () => input.click());
               listContainer.appendChild(addMoreBtn);
            }
        } else { controls.style.display = 'none'; dropZone.style.display = 'block'; }
    }

    input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(f => f.type === 'application/pdf');
        currentFiles = [...currentFiles, ...files]; renderList(); input.value = ''; 
    });

    btn.addEventListener('click', async () => {
        if (!currentFiles.length) return;
        const originalText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        try {
            const result = await actionCallback(currentFiles);
            currentFiles = []; renderList(); 
            await processAndDownload(result.bytes, result.filename, result.type);
            if(typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
        } catch (error) { handleError(error); } 
        finally { btn.innerHTML = originalText; }
    });
}

function hexToRgbPdf(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) { r = parseInt(hex.substring(1, 3), 16) / 255; g = parseInt(hex.substring(3, 5), 16) / 255; b = parseInt(hex.substring(5, 7), 16) / 255; }
    return rgb(r, g, b);
}

// --- STANDARD ACTIONS ---
setupSingleFileLogic('split', async (file) => {
    const pagesToExtract = parseRange(document.getElementById('split-ranges').value);
    if (!pagesToExtract.length) throw new Error("Range required");
    const sourcePdf = await PDFDocument.load(await file.arrayBuffer()); const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pagesToExtract); copiedPages.forEach(p => newPdf.addPage(p));
    return { bytes: await newPdf.save(), filename: `${getBaseName(file.name)}_Split.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('delete', async (file) => {
    const pagesToDelete = parseRange(document.getElementById('delete-ranges').value);
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    pagesToDelete.sort((a, b) => b - a).forEach(i => { if (i >= 0 && i < pdfDoc.getPageCount()) pdfDoc.removePage(i); });
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Deleted.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('rotate', async (file) => {
    const angle = parseInt(document.getElementById('rotate-angle').value);
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    pdfDoc.getPages().forEach(p => p.setRotation(degrees(p.getRotation().angle + angle)));
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Rotated.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('flatten', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    const form = pdfDoc.getForm(); if(form) form.flatten();
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Flattened.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('metadata', async (file) => {
    const title = document.getElementById('meta-title').value; const author = document.getElementById('meta-author').value;
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    if(title) pdfDoc.setTitle(title); if(author) pdfDoc.setAuthor(author);
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Metadata.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('repair', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Repaired.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('addblank', async (file) => {
    const pos = document.getElementById('addblank-position').value;
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    if (pos === 'start') pdfDoc.insertPage(0); else pdfDoc.addPage();
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_BlankPage.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('resizepdf', async (file) => {
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    pdfDoc.getPages().forEach(page => page.setSize(595.28, 841.89));
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_Resized.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('reorder', async (file) => {
    const indices = document.getElementById('reorder-input').value.split(',').map(n => parseInt(n.trim()) - 1);
    const srcDoc = await PDFDocument.load(await file.arrayBuffer()); const newPdf = await PDFDocument.create();
    const copied = await newPdf.copyPages(srcDoc, indices); copied.forEach(p => newPdf.addPage(p));
    return { bytes: await newPdf.save(), filename: `${getBaseName(file.name)}_Reordered.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('removeannots', async (file) => {
    const doc = await PDFDocument.load(await file.arrayBuffer());
    doc.getPages().forEach(page => { if(page.node.Annots) page.node.delete(PDFName.of('Annots')); });
    return { bytes: await doc.save(), filename: `${getBaseName(file.name)}_Cleaned.pdf`, type: 'application/pdf' };
});

setupSingleFileLogic('splitevenodd', async (file) => {
    const srcDoc = await PDFDocument.load(await file.arrayBuffer());
    const oddDoc = await PDFDocument.create(), evenDoc = await PDFDocument.create();
    let oddIdx = [], evenIdx = [];
    for(let i=0; i<srcDoc.getPageCount(); i++) { if(i%2===0) oddIdx.push(i); else evenIdx.push(i); }
    const zip = new JSZip();
    if(oddIdx.length) { const oP = await oddDoc.copyPages(srcDoc, oddIdx); oP.forEach(p => oddDoc.addPage(p)); zip.file("Odd_Pages.pdf", await oddDoc.save()); }
    if(evenIdx.length) { const eP = await evenDoc.copyPages(srcDoc, evenIdx); eP.forEach(p => evenDoc.addPage(p)); zip.file("Even_Pages.pdf", await evenDoc.save()); }
    return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(file.name)}_EvenOdd.zip`, type: 'application/zip' };
});

setupSingleFileLogic('pdftojpg', async (file) => {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const zip = new JSZip();
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const canvas = document.createElement('canvas');
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.height = viewport.height; canvas.width = viewport.width;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        zip.file(`Page_${i}.jpg`, canvas.toDataURL('image/jpeg', 0.9).split(',')[1], {base64: true});
    }
    return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(file.name)}_Images.zip`, type: 'application/zip' };
});

setupSingleFileLogic('imagewatermark', async (file) => {
    const imgInput = document.getElementById('imagewatermark-overlay-input');
    if (!imgInput.files.length) throw new Error("Please select an image file first.");
    const imgFile = imgInput.files[0]; const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
    let pdfImg = imgFile.type === 'image/png' ? await pdfDoc.embedPng(await imgFile.arrayBuffer()) : await pdfDoc.embedJpg(await imgFile.arrayBuffer());
    const dims = pdfImg.scale(0.5);
    pdfDoc.getPages().forEach(page => {
        const { width, height } = page.getSize();
        page.drawImage(pdfImg, { x: width / 2 - dims.width / 2, y: height / 2 - dims.height / 2, width: dims.width, height: dims.height, opacity: 0.4 });
    });
    return { bytes: await pdfDoc.save(), filename: `${getBaseName(file.name)}_ImgWatermark.pdf`, type: 'application/pdf' };
});

setupMultipleFileLogic('compress', async (files) => {
    if (files.length === 1) {
        const pdfDoc = await PDFDocument.load(await files[0].arrayBuffer(), { updateMetadata: false }); const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices()); copiedPages.forEach(p => newPdf.addPage(p));
        return { bytes: await newPdf.save({ useObjectStreams: true }), filename: `${getBaseName(files[0].name)}_Compressed.pdf`, type: 'application/pdf' };
    } else {
        const zip = new JSZip();
        for (const file of files) {
            const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false }); const newPdf = await PDFDocument.create();
            const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices()); copiedPages.forEach(p => newPdf.addPage(p));
            zip.file(`${getBaseName(file.name)}_Compressed.pdf`, await newPdf.save({ useObjectStreams: true }));
        }
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `${getBaseName(files[0].name)}_Batch_Compressed.zip`, type: 'application/zip' };
    }
});

setupMultipleFileLogic('unlock', async (files) => {
    const password = document.getElementById('unlock-password').value;
    if (!password) throw new Error("Please enter a password to unlock the file.");
    const unlockSingleFile = async (file, pwd) => {
        try { const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { password: pwd }); return await pdfDoc.save(); } 
        catch (err) {
            if (!navigator.onLine) throw new Error("Please turn on internet to unlock via Cloud.");
            const formData = new FormData(); formData.append('file', file); formData.append('password', pwd);
            const response = await fetch("https://amazing-pdf-tool.vercel.app/api/unlock", { method: 'POST', body: formData });
            if (!response.ok) throw new Error("Unlock Failed"); return new Uint8Array(await (await response.blob()).arrayBuffer());
        }
    };
    if (files.length === 1) { const bytes = await unlockSingleFile(files[0], password); return { bytes, filename: `${getBaseName(files[0].name)}_Unlocked.pdf`, type: 'application/pdf' }; } 
    else {
        const zip = new JSZip(); let successCount = 0;
        for (const file of files) { try { const bytes = await unlockSingleFile(file, password); zip.file(`${getBaseName(file.name)}_Unlocked.pdf`, bytes); successCount++; } catch (e) { } }
        if (successCount === 0) throw new Error("Failed to unlock.");
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Unlocked.zip`, type: 'application/zip' };
    }
});

setupMultipleFileLogic('protect', async (files) => {
    const password = document.getElementById('protect-password').value;
    if (!password) throw new Error("Password required"); if (!navigator.onLine) throw new Error("Online required for Secure Cloud Protect.");
    const VERCEL_API_URL = "https://amazing-pdf-tool.vercel.app/api/protect"; 
    if (files.length === 1) {
        const formData = new FormData(); formData.append('file', files[0]); formData.append('password', password);
        const response = await fetch(VERCEL_API_URL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Server error."); const bytes = new Uint8Array(await (await response.blob()).arrayBuffer());
        return { bytes, filename: `${getBaseName(files[0].name)}_Protected.pdf`, type: 'application/pdf' };
    } else {
        const zip = new JSZip();
        for (const file of files) {
            const formData = new FormData(); formData.append('file', file); formData.append('password', password);
            const response = await fetch(VERCEL_API_URL, { method: 'POST', body: formData });
            if (response.ok) { const bytes = new Uint8Array(await (await response.blob()).arrayBuffer()); zip.file(`${getBaseName(file.name)}_Protected.pdf`, bytes); }
        }
        return { bytes: await zip.generateAsync({type: 'uint8array'}), filename: `Batch_Protected.zip`, type: 'application/zip' };
    }
});

if (ui.htmltopdf) {
    document.getElementById('btn-htmltopdf-action')?.addEventListener('click', async () => {
        const htmlContent = document.getElementById('html-input').value; if (!htmlContent) return showCustomAlert("Enter HTML first.");
        const btn = document.getElementById('btn-htmltopdf-action'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';
        try {
            const blob = await html2pdf().set({ margin: 1, jsPDF: { format: 'letter' } }).from(htmlContent).output('blob');
            const bytes = new Uint8Array(await blob.arrayBuffer()); document.getElementById('html-input').value = '';
            await processAndDownload(bytes, 'HTML_Converted.pdf', 'application/pdf'); if(typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
        } catch(e) { handleError(e); } finally { btn.innerHTML = '<i class="fas fa-eye"></i> Preview PDF'; }
    });
}

// BINDING VISUAL TOOLS (Action callback null since they launch workspace)
setupSingleFileLogic('crop', null);
setupSingleFileLogic('addmargins', null);
setupSingleFileLogic('pagenumbers', null);
setupSingleFileLogic('sign', null);
setupSingleFileLogic('watermark', null);
setupSingleFileLogic('addtext', null);

setupSingleFileLogic('extract', async (file) => {
    // Only triggers if fallback standard mode is used
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += `--- Page ${i} ---\n${textContent.items.map(item => item.str).join(" ")}\n\n`;
    }
    return { bytes: new TextEncoder().encode(fullText), filename: `${getBaseName(file.name)}_Extracted.txt`, type: 'text/plain' };
});

// SECURE ADVANCED MERGE EDITOR FUNCTION
let mergeFiles = [];
if (ui.merge) {
    const mergeInput = document.getElementById('merge-file-input');
    const mergeDropZone = document.getElementById('merge-drop-zone');
    const mergeEditorPanel = document.getElementById('merge-editor-panel');
    
    mergeDropZone?.addEventListener('click', (e) => { if(e.target.tagName !== 'BUTTON') mergeInput.click(); });
    document.getElementById('add-more-merge')?.addEventListener('click', () => mergeInput.click());
    
    function moveMergeItem(index, direction) {
        if (direction === -1 && index > 0) {
            [mergeFiles[index - 1], mergeFiles[index]] = [mergeFiles[index], mergeFiles[index - 1]];
        } else if (direction === 1 && index < mergeFiles.length - 1) {
            [mergeFiles[index], mergeFiles[index + 1]] = [mergeFiles[index + 1], mergeFiles[index]];
        }
        renderMergeList();
    }
    
    // Attach to window so HTML inline onclick works
    window.moveMergeItem = moveMergeItem;

    function renderMergeList() {
        const list = document.getElementById('merge-file-list'); list.innerHTML = '';
        mergeFiles.forEach((f, i) => { 
            list.innerHTML += `
            <div style="${fileItemStyle}">
                <div class="text-container"><b class="text-ellipsis">${i + 1}. ${f.name}</b></div>
                <div style="display:flex; gap:5px; flex-shrink:0;">
                    <button onclick="window.moveMergeItem(${i}, -1)" style="background:var(--surface-color); color:white; border:1px solid var(--glass-border); padding:6px 10px; border-radius:6px; cursor:pointer;" title="Move Up"><i class="fas fa-arrow-up"></i></button>
                    <button onclick="window.moveMergeItem(${i}, 1)" style="background:var(--surface-color); color:white; border:1px solid var(--glass-border); padding:6px 10px; border-radius:6px; cursor:pointer;" title="Move Down"><i class="fas fa-arrow-down"></i></button>
                    <button class="remove-merge" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;" title="Remove"><i class="fas fa-times"></i></button>
                </div>
            </div>`; 
        });
        
        if (mergeFiles.length > 0) {
            mergeEditorPanel.style.display = 'block';
            mergeDropZone.style.display = 'none';
        } else {
            mergeEditorPanel.style.display = 'none';
            mergeDropZone.style.display = 'block';
        }
    }

    mergeInput?.addEventListener('change', (e) => { 
        mergeFiles = [...mergeFiles, ...Array.from(e.target.files).filter(f => f.type === 'application/pdf')]; 
        renderMergeList(); 
        mergeInput.value = ''; 
    });

    document.getElementById('btn-merge-action')?.addEventListener('click', async () => {
        if(mergeFiles.length < 2) {
            showCustomAlert("Please add at least 2 PDFs to merge.");
            return;
        }
        
        const btn = document.getElementById('btn-merge-action'); 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            const sizeSetting = document.getElementById('merge-setting-size').value;
            const marginSetting = parseInt(document.getElementById('merge-setting-margin').value);
            const gapSetting = parseInt(document.getElementById('merge-setting-gap').value);
            
            const mergedPdf = await PDFDocument.create();
            
            for (let i = 0; i < mergeFiles.length; i++) { 
                const file = mergeFiles[i];
                const pdf = await PDFDocument.load(await file.arrayBuffer()); 
                
                // SAFE MERGE LOGIC (No Ghost Margins on Cropped files)
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices()); 
                
                copiedPages.forEach(p => { 
                    const { width, height } = p.getSize();
                    
                    if (sizeSetting === 'A4') {
                        p.setSize(595.28, 841.89); 
                    }
                    
                    if (marginSetting > 0) {
                        p.setSize(width + marginSetting * 2, height + marginSetting * 2);
                        p.translateContent(marginSetting, marginSetting);
                    }
                    mergedPdf.addPage(p); 
                }); 
                
                // Gap logic
                if (gapSetting > 0 && i < mergeFiles.length - 1) {
                    for(let g = 0; g < gapSetting; g++) {
                        mergedPdf.addPage([595.28, 841.89]); 
                    }
                }
            }
            
            const bytes = await mergedPdf.save(); 
            const outputName = `${getBaseName(mergeFiles[0].name)}_Merged.pdf`;
            mergeFiles = []; 
            renderMergeList(); 
            
            await processAndDownload(bytes, outputName, 'application/pdf');
            
            if(typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
        } catch (e) { 
            handleError(e); 
        } finally { 
            btn.innerHTML = '<i class="fas fa-eye"></i> Process & Preview Merge'; 
        }
    });
}

// SECURE JPG TO PDF LIST FUNCTION
let imageFiles = [];
if (ui.jpgtopdf) {
    const imgInput = document.getElementById('jpgtopdf-file-input');
    document.getElementById('jpgtopdf-drop-zone')?.addEventListener('click', (e) => { if(e.target.tagName !== 'BUTTON') imgInput.click(); });
    function renderImgList() {
        const list = document.getElementById('jpgtopdf-file-list'); list.innerHTML = '';
        imageFiles.forEach((f, i) => { list.innerHTML += `<div style="${fileItemStyle}"><div class="text-container"><b class="text-ellipsis">${f.name}</b></div><button class="remove-img" data-index="${i}" style="background:#ef4444; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;"><i class="fas fa-times"></i></button></div>`; });
        list.querySelectorAll('.remove-img').forEach(btn => btn.addEventListener('click', (e) => { imageFiles.splice(parseInt(e.currentTarget.getAttribute('data-index')), 1); renderImgList(); }));
        document.getElementById('btn-jpgtopdf-action').style.display = imageFiles.length > 0 ? 'block' : 'none';
    }
    imgInput?.addEventListener('change', (e) => { imageFiles = [...imageFiles, ...Array.from(e.target.files).filter(f => f.type.startsWith('image/'))]; renderImgList(); imgInput.value = ''; });
    document.getElementById('btn-jpgtopdf-action')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-jpgtopdf-action'); btn.innerHTML = 'Converting...';
        try {
            const pdfDoc = await PDFDocument.create();
            for (const file of imageFiles) {
                let pdfImage = file.type === 'image/png' ? await pdfDoc.embedPng(await file.arrayBuffer()) : await pdfDoc.embedJpg(await file.arrayBuffer());
                const dims = pdfImage.scale(1); const page = pdfDoc.addPage([dims.width, dims.height]); page.drawImage(pdfImage, { x: 0, y: 0, width: dims.width, height: dims.height });
            }
            const bytes = await pdfDoc.save(); const outputName = imageFiles.length > 0 ? `${getBaseName(imageFiles[0].name)}_Images.pdf` : 'Amazing_Images.pdf';
            imageFiles = []; renderImgList(); await processAndDownload(bytes, outputName, 'application/pdf');
            if(typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
        } catch (e) { handleError(e); } finally { btn.innerHTML = '<i class="fas fa-eye"></i> Preview & Convert'; }
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

if(typeof AdManager !== 'undefined' && AdManager && typeof AdManager.showBanner === 'function') AdManager.showBanner();

// ==========================================
//    UNIVERSAL PRO ENGINE (Edit, Crop, Margin, Extract, PageNumbers, Sign, Watermark)
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
let startX = 0; let startY = 0;
let currentPath = null; 

let activeDragIndex = -1;
let dragOffsetX = 0; let dragOffsetY = 0;
let hasMovedDuringClick = false; 

let selectedEditIndex = -1;
let activeResizeHandle = null;
let originalEditState = null;

let isHoveringTrash = false;
const trashZone = document.getElementById('drag-trash-zone');

let pageEdits = {}; 

document.getElementById('btn-zoom-in')?.addEventListener('click', () => { editScale += 0.2; renderEditPage(editPageNum); });
document.getElementById('btn-zoom-out')?.addEventListener('click', () => { editScale = Math.max(0.4, editScale - 0.2); renderEditPage(editPageNum); });
document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
    if (!editPdfDoc) return;
    const containerWidth = document.querySelector('.canvas-container').clientWidth;
    const padding = window.innerWidth > 768 ? 60 : 20;
    editPdfDoc.getPage(editPageNum).then(page => {
        const baseViewport = page.getViewport({ scale: 1 });
        editScale = (containerWidth - padding) / baseViewport.width;
        renderEditPage(editPageNum);
    });
});

// --- ADVANCED TEXT MODAL LOGIC (IMPROVED BG & SIZE) ---
let pendingTextAction = null; 
let tmState = { bold: false, italic: false, underline: false, align: 'left', bgColor: 'transparent' };

function openTextModal(initialText = "", actionData) {
    pendingTextAction = actionData;
    const modal = document.getElementById('custom-text-modal');
    const input = document.getElementById('custom-text-input');
    document.getElementById('text-modal-title').innerText = actionData.type === 'new' ? "Add New Text" : "Edit Text";
    input.value = initialText; 

    if (actionData.type === 'edit') {
        const edit = pageEdits[editPageNum][actionData.index];
        tmState.bold = edit.bold || false;
        tmState.italic = edit.italic || false;
        tmState.underline = edit.underline || false;
        tmState.align = edit.align || 'left';
        tmState.bgColor = edit.bgColor || 'transparent';
        
        document.getElementById('tm-size').value = edit.size || 20;
        document.getElementById('tm-color').value = edit.color || '#000000';
        document.getElementById('tm-bg-color').value = (tmState.bgColor === 'transparent') ? '#ffffff' : tmState.bgColor;
        document.getElementById('tm-opacity').value = edit.opacity || 1;
    } else {
        tmState = { bold: false, italic: false, underline: false, align: 'left', bgColor: 'transparent' };
        document.getElementById('tm-size').value = editSize;
        document.getElementById('tm-color').value = editColor;
        document.getElementById('tm-bg-color').value = '#ffffff';
        document.getElementById('tm-opacity').value = (currentVisualMode === 'watermark') ? 0.5 : 1;
    }
    
    updateTmUI();
    modal.style.display = 'flex'; input.focus();
}

['bold', 'italic', 'underline'].forEach(prop => {
    document.getElementById(`tm-${prop}`)?.addEventListener('click', () => { tmState[prop] = !tmState[prop]; updateTmUI(); });
});
['left', 'center', 'right'].forEach(align => {
    document.getElementById(`tm-align-${align}`)?.addEventListener('click', () => { tmState.align = align; updateTmUI(); });
});

document.getElementById('tm-bg-color')?.addEventListener('input', (e) => { tmState.bgColor = e.target.value; });
document.getElementById('tm-clear-bg')?.addEventListener('click', () => { tmState.bgColor = 'transparent'; document.getElementById('tm-bg-color').value = '#ffffff'; });

function updateTmUI() {
    ['bold', 'italic', 'underline'].forEach(prop => {
        const btn = document.getElementById(`tm-${prop}`);
        if (tmState[prop]) btn.classList.add('edit-tool-active'); else btn.classList.remove('edit-tool-active');
    });
    ['left', 'center', 'right'].forEach(align => {
        const btn = document.getElementById(`tm-align-${align}`);
        if (tmState.align === align) btn.classList.add('edit-tool-active'); else btn.classList.remove('edit-tool-active');
    });
}

document.getElementById('btn-text-cancel')?.addEventListener('click', () => { document.getElementById('custom-text-modal').style.display = 'none'; pendingTextAction = null; });
document.getElementById('btn-text-save')?.addEventListener('click', () => {
    const val = document.getElementById('custom-text-input').value;
    const color = document.getElementById('tm-color').value;
    const size = parseInt(document.getElementById('tm-size').value) || 20;
    const opacity = parseFloat(document.getElementById('tm-opacity').value);

    editSize = size; 

    if(val && val.trim() !== '' && pendingTextAction) {
        if(pendingTextAction.type === 'new') {
            if (!pageEdits[editPageNum]) pageEdits[editPageNum] = [];
            pageEdits[editPageNum].push({ 
                type: 'text', x: pendingTextAction.pos.x, y: pendingTextAction.pos.y, 
                text: val, color: color, size: size,
                bold: tmState.bold, italic: tmState.italic, underline: tmState.underline, align: tmState.align,
                bgColor: tmState.bgColor, opacity: opacity
            });
        } else if(pendingTextAction.type === 'edit') {
            const edit = pageEdits[editPageNum][pendingTextAction.index];
            edit.text = val; edit.color = color; edit.size = size;
            edit.bold = tmState.bold; edit.italic = tmState.italic; edit.underline = tmState.underline;
            edit.align = tmState.align; edit.bgColor = tmState.bgColor; edit.opacity = opacity;
        }
        drawOverlay();
    }
    document.getElementById('custom-text-modal').style.display = 'none'; pendingTextAction = null;
});

function setToolActive(btnId, toolName) {
    document.querySelectorAll('.edit-toolbar-btn').forEach(b => b.classList.remove('edit-tool-active'));
    if(btnId) document.getElementById(btnId).classList.add('edit-tool-active');
    currentTool = toolName; selectedEditIndex = -1; drawOverlay(); 
}

document.getElementById('edit-color-picker')?.addEventListener('input', (e) => editColor = e.target.value);
document.getElementById('edit-size-picker')?.addEventListener('input', (e) => editSize = parseInt(e.target.value) || 20);

document.getElementById('btn-edit-text')?.addEventListener('click', () => setToolActive('btn-edit-text', 'text'));
document.getElementById('btn-edit-whiteout')?.addEventListener('click', () => setToolActive('btn-edit-whiteout', 'whiteout'));
document.getElementById('btn-edit-draw')?.addEventListener('click', () => setToolActive('btn-edit-draw', 'draw'));
document.getElementById('btn-edit-clear')?.addEventListener('click', () => { pageEdits[editPageNum] = []; selectedEditIndex = -1; drawOverlay(); showCustomAlert("Cleared!"); });

document.getElementById('btn-edit-image')?.addEventListener('click', () => { setToolActive('btn-edit-image', 'image'); document.getElementById('edit-image-input').click(); });
document.getElementById('edit-image-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && (file.type === 'image/png' || file.type === 'image/jpeg')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const dataUrl = event.target.result; const img = new Image();
            img.onload = function() {
                if (!pageEdits[editPageNum]) pageEdits[editPageNum] = [];
                let w = img.width; let h = img.height; const maxDim = 200;
                if(w > maxDim || h > maxDim) { const ratio = Math.min(maxDim/w, maxDim/h); w = w * ratio; h = h * ratio; }
                pageEdits[editPageNum].push({ type: 'image', x: overlayCanvas.width/2 - w/2, y: overlayCanvas.height/2 - h/2, w: w, h: h, dataUrl: dataUrl, imgType: file.type, imgObj: img });
                selectedEditIndex = pageEdits[editPageNum].length - 1; drawOverlay(); document.getElementById('edit-image-input').value = ""; 
            }
            img.src = dataUrl;
        }
        reader.readAsDataURL(file);
    }
});

function openVisualWorkspace(file, mode) {
    currentEditFile = file;
    editOriginalFileName = file.name;
    currentVisualMode = mode;
    pageEdits = {};
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

    headerHelp.style.display = 'none';
    document.body.classList.add('is-editing'); 
    
    // Set Apply Mode Default
    if (mode === 'pagenumbers' || mode === 'watermark') applyModeSelector.value = 'all';
    else applyModeSelector.value = 'current';

    if (['edit', 'sign', 'watermark', 'addtext'].includes(mode)) {
        title.innerHTML = mode === 'sign' ? '<i class="fas fa-signature"></i> Visual Signature' :
                          mode === 'watermark' ? '<i class="fas fa-stamp"></i> Add Watermark' :
                          mode === 'addtext' ? '<i class="fas fa-font"></i> Add Text' :
                          '<i class="fas fa-edit"></i> Pro PDF Editor';
        btnText.style.display = 'inline-flex'; btnDraw.style.display = 'inline-flex'; btnErase.style.display = 'inline-flex'; btnImage.style.display = 'inline-flex'; toolSettings.style.display = 'flex'; btnClear.style.display = 'inline-flex';
        
        // Auto-select tool to help user
        if (mode === 'sign' || mode === 'watermark' || mode === 'addtext') {
            setToolActive('btn-edit-text', 'text');
        } else {
            currentTool = 'none';
        }

    } else {
        btnText.style.display = 'none'; btnDraw.style.display = 'none'; btnErase.style.display = 'none'; btnImage.style.display = 'none'; toolSettings.style.display = 'none'; btnClear.style.display = 'none';
        
        if (mode === 'crop') { title.innerHTML = '<i class="fas fa-crop"></i> Visual Crop'; headerHelp.style.display = 'block'; currentTool = 'visual-box'; }
        else if (mode === 'addmargins') { title.innerHTML = '<i class="fas fa-border-all"></i> Visual Margin'; headerHelp.style.display = 'block'; headerHelp.innerText = "Draw content area (Margins will be added outside)"; currentTool = 'visual-box'; }
        else if (mode === 'extract') { title.innerHTML = '<i class="fas fa-file-alt"></i> Select Text Area'; headerHelp.style.display = 'block'; currentTool = 'visual-box'; }
        else if (mode === 'pagenumbers') {
            title.innerHTML = '<i class="fas fa-sort-numeric-down"></i> Place Page Number';
            currentTool = 'none';
            if (!pageEdits[1]) pageEdits[1] = [];
            visualData.format = document.getElementById('pagenumbers-format').value;
            pageEdits[1].push({ type: 'pagenum-dummy', x: 50, y: 50, text: visualData.format.replace('10', 'MAX'), color: '#3b82f6', size: 16 });
            selectedEditIndex = 0;
            headerHelp.style.display = 'block'; headerHelp.innerText = "Drag the blue text to position it";
        }
    }

    const fileReader = new FileReader();
    fileReader.onload = function() {
        const tempPdfBytes = new Uint8Array(this.result);
        pdfjsLib.getDocument(tempPdfBytes).promise.then(pdf => {
            editPdfDoc = pdf; editPageNum = 1; document.getElementById('page-count').textContent = pdf.numPages;
            window.switchView('edit'); document.getElementById('edit-upload-section').style.display = 'none'; document.getElementById('edit-workspace').style.display = 'flex';
            
            const containerWidth = document.querySelector('.canvas-container').clientWidth;
            const padding = window.innerWidth > 768 ? 60 : 20;
            pdf.getPage(1).then(page => {
                 const baseViewport = page.getViewport({ scale: 1 });
                 let calculatedScale = (containerWidth - padding) / baseViewport.width;
                 editScale = Math.min(calculatedScale, 1.5); 
                 renderEditPage(editPageNum);
            });
            
        }).catch(error => { showCustomAlert("Error loading PDF."); document.body.classList.remove('is-editing'); });
    };
    fileReader.readAsArrayBuffer(file);
}

document.getElementById('btn-close-editor')?.addEventListener('click', () => {
    document.body.classList.remove('is-editing');
    document.getElementById('edit-workspace').style.display='none'; 
    document.getElementById('edit-upload-section').style.display='block'; 
    window.switchView('dashboard');
});

document.getElementById('edit-pdf-input')?.addEventListener('change', function(e) {
    if (e.target.files[0]) openVisualWorkspace(e.target.files[0], 'edit');
});

function renderEditPage(num) {
    if (!editPdfDoc) return;
    editPdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale: editScale });
        renderCanvas.height = viewport.height; renderCanvas.width = viewport.width;
        overlayCanvas.height = viewport.height; overlayCanvas.width = viewport.width;
        page.render({ canvasContext: renderCtx, viewport: viewport });
        document.getElementById('page-num').textContent = num; drawOverlay(); 
    });
}

function getHandleRects(edit) {
    const hs = 16; const half = hs / 2; const {x, y, w, h} = edit;
    return {
        nw: {x: x - half, y: y - half, w: hs, h: hs}, ne: {x: x + w - half, y: y - half, w: hs, h: hs}, se: {x: x + w - half, y: y + h - half, w: hs, h: hs}, sw: {x: x - half, y: y + h - half, w: hs, h: hs},
        n:  {x: x + w/2 - half, y: y - half, w: hs, h: hs}, s:  {x: x + w/2 - half, y: y + h - half, w: hs, h: hs}, e:  {x: x + w - half, y: y + h/2 - half, w: hs, h: hs}, w:  {x: x - half, y: y + h/2 - half, w: hs, h: hs}
    };
}

function drawOverlay() {
    if (!overlayCtx) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const edits = pageEdits[editPageNum] || [];
    
    edits.forEach((edit, i) => {
        if (edit.type === 'whiteout') {
            overlayCtx.fillStyle = 'white'; overlayCtx.fillRect(edit.x, edit.y, edit.w, edit.h);
            if (currentTool === 'whiteout') { overlayCtx.strokeStyle = 'rgba(0,0,0,0.15)'; overlayCtx.lineWidth = 1; overlayCtx.setLineDash([4, 4]); overlayCtx.strokeRect(edit.x, edit.y, edit.w, edit.h); overlayCtx.setLineDash([]); }
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
                overlayCtx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; overlayCtx.lineWidth = 1; 
                overlayCtx.strokeRect(drawX - 5, edit.y - edit.size, textWidth + 10, edit.size + 10); 
            }
            overlayCtx.restore();

        } else if (edit.type === 'draw') {
            overlayCtx.strokeStyle = edit.color; overlayCtx.lineWidth = edit.size; overlayCtx.lineCap = 'round'; overlayCtx.lineJoin = 'round'; overlayCtx.beginPath();
            if(edit.points.length > 0) { overlayCtx.moveTo(edit.points[0].x, edit.points[0].y); for(let k=1; k<edit.points.length; k++) { overlayCtx.lineTo(edit.points[k].x, edit.points[k].y); } overlayCtx.stroke(); }
        } else if (edit.type === 'image' && edit.imgObj) {
            overlayCtx.drawImage(edit.imgObj, edit.x, edit.y, edit.w, edit.h);
            if (i === selectedEditIndex) {
                overlayCtx.strokeStyle = '#3b82f6'; overlayCtx.lineWidth = 2; overlayCtx.strokeRect(edit.x, edit.y, edit.w, edit.h);
                overlayCtx.fillStyle = 'white'; const rects = getHandleRects(edit); for (let key in rects) { const r = rects[key]; overlayCtx.fillRect(r.x, r.y, r.w, r.h); overlayCtx.strokeRect(r.x, r.y, r.w, r.h); }
            }
        } else if (edit.type === 'visual-box') {
            overlayCtx.fillStyle = 'rgba(59, 130, 246, 0.2)'; overlayCtx.fillRect(edit.x, edit.y, edit.w, edit.h);
            overlayCtx.strokeStyle = '#3b82f6'; overlayCtx.lineWidth = 2; overlayCtx.setLineDash([5, 5]); overlayCtx.strokeRect(edit.x, edit.y, edit.w, edit.h); overlayCtx.setLineDash([]);
        } else if (edit.type === 'pagenum-dummy') {
            overlayCtx.font = `bold ${edit.size}px Arial`; overlayCtx.fillStyle = edit.color; overlayCtx.fillText(edit.text, edit.x, edit.y);
            if (i === selectedEditIndex) { overlayCtx.strokeStyle = 'blue'; overlayCtx.strokeRect(edit.x - 5, edit.y - edit.size, overlayCtx.measureText(edit.text).width + 10, edit.size + 10); }
        }
    });
}

function getCursorPos(e) {
    const rect = overlayCanvas.getBoundingClientRect(); const scaleX = overlayCanvas.width / rect.width; const scaleY = overlayCanvas.height / rect.height;
    let clientX = e.clientX; let clientY = e.clientY;
    if(e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function normalizeBox(box) {
    return { x: box.w < 0 ? box.x + box.w : box.x, y: box.h < 0 ? box.y + box.h : box.y, w: Math.abs(box.w), h: Math.abs(box.h) };
}

overlayCanvas?.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && (currentTool !== 'none' || currentVisualMode === 'pagenumbers')) e.preventDefault();
}, {passive: false});

overlayCanvas?.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return; 
    if (currentTool === 'none' && currentVisualMode !== 'pagenumbers') return;
    if (e.target.closest('#custom-text-modal')) return;
    
    const pos = getCursorPos(e); const edits = pageEdits[editPageNum] || []; hasMovedDuringClick = false; 
    
    if (selectedEditIndex !== -1 && edits[selectedEditIndex]?.type === 'image') {
        const edit = edits[selectedEditIndex]; const rects = getHandleRects(edit);
        for (let key in rects) {
            const r = rects[key];
            if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) { activeResizeHandle = key; dragOffsetX = pos.x; dragOffsetY = pos.y; originalEditState = { ...edit }; return; }
        }
    }
    
    for (let i = edits.length - 1; i >= 0; i--) {
        const edit = edits[i]; let isHit = false;
        if (edit.type === 'whiteout' || edit.type === 'image' || edit.type === 'visual-box') {
            const nBox = normalizeBox(edit);
            if (pos.x >= nBox.x && pos.x <= nBox.x + nBox.w && pos.y >= nBox.y && pos.y <= nBox.y + nBox.h) isHit = true;
        } else if (edit.type === 'text' || edit.type === 'pagenum-dummy') {
            overlayCtx.font = `${edit.italic ? 'italic ' : ''}${edit.bold ? 'bold ' : ''}${edit.size}px Arial`; 
            const textWidth = overlayCtx.measureText(edit.text).width;
            let drawX = edit.x;
            if(edit.align === 'center') drawX = edit.x - textWidth/2;
            if(edit.align === 'right') drawX = edit.x - textWidth;
            if (pos.x >= drawX - 5 && pos.x <= drawX + textWidth + 5 && pos.y >= edit.y - edit.size && pos.y <= edit.y + 10) isHit = true;
        } else if (edit.type === 'draw') {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            edit.points.forEach(p => { if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x; if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y; });
            if (pos.x >= minX - 10 && pos.x <= maxX + 10 && pos.y >= minY - 10 && pos.y <= maxY + 10) isHit = true;
        }
        
        if (isHit && (currentTool !== 'draw' || edit.type === 'draw')) { 
            activeDragIndex = i;
            if(edit.type === 'draw') { dragOffsetX = pos.x; dragOffsetY = pos.y; } else { dragOffsetX = pos.x - edit.x; dragOffsetY = pos.y - edit.y; }
            const item = edits.splice(i, 1)[0]; edits.push(item); activeDragIndex = edits.length - 1; selectedEditIndex = activeDragIndex; 
            if(['edit', 'sign', 'watermark', 'addtext'].includes(currentVisualMode)) trashZone.style.display = 'flex';
            drawOverlay(); return; 
        }
    }

    selectedEditIndex = -1; drawOverlay();

    if (currentTool === 'text') openTextModal("", { type: 'new', pos: { x: pos.x, y: pos.y } });
    else if (currentTool === 'whiteout') { isDrawing = true; startX = pos.x; startY = pos.y; }
    else if (currentTool === 'draw') { isDrawing = true; if (!pageEdits[editPageNum]) pageEdits[editPageNum] = []; currentPath = { type: 'draw', color: editColor, size: editSize, points: [ {x: pos.x, y: pos.y} ] }; pageEdits[editPageNum].push(currentPath); }
    else if (currentTool === 'visual-box') {
        isDrawing = true; startX = pos.x; startY = pos.y;
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
        hasMovedDuringClick = true; const edit = pageEdits[editPageNum][selectedEditIndex]; const dx = pos.x - dragOffsetX; const dy = pos.y - dragOffsetY; const orig = originalEditState;
        let newX = orig.x, newY = orig.y, newW = orig.w, newH = orig.h;
        if (activeResizeHandle.includes('e')) newW = orig.w + dx; if (activeResizeHandle.includes('s')) newH = orig.h + dy;
        if (activeResizeHandle.includes('w')) { newX = orig.x + dx; newW = orig.w - dx; } if (activeResizeHandle.includes('n')) { newY = orig.y + dy; newH = orig.h - dy; }
        if (newW >= 20) { edit.x = newX; edit.w = newW; } if (newH >= 20) { edit.y = newY; edit.h = newH; }
        drawOverlay(); return;
    }

    if (activeDragIndex !== -1) {
        hasMovedDuringClick = true; const edit = pageEdits[editPageNum][activeDragIndex];
        if(edit.type === 'draw') { const dx = pos.x - dragOffsetX; const dy = pos.y - dragOffsetY; edit.points.forEach(p => { p.x += dx; p.y += dy; }); dragOffsetX = pos.x; dragOffsetY = pos.y; } 
        else { edit.x = pos.x - dragOffsetX; edit.y = pos.y - dragOffsetY; }
        
        if(['edit', 'sign', 'watermark', 'addtext'].includes(currentVisualMode)) {
            const tRect = trashZone.getBoundingClientRect(); const clientX = e.clientX; const clientY = e.clientY;
            if (clientX >= tRect.left && clientX <= tRect.right && clientY >= tRect.top && clientY <= tRect.bottom) { isHoveringTrash = true; trashZone.style.transform = 'translateX(-50%) scale(1.1)'; trashZone.style.background = 'rgba(220, 38, 38, 1)'; } 
            else { isHoveringTrash = false; trashZone.style.transform = 'translateX(-50%) scale(1)'; trashZone.style.background = 'rgba(239, 68, 68, 0.95)'; }
        }
        drawOverlay(); return;
    }
    
    if (!isDrawing) return;
    if (currentTool === 'whiteout') {
        drawOverlay(); overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.8)'; overlayCtx.fillRect(startX, startY, pos.x - startX, pos.y - startY);
        overlayCtx.strokeStyle = 'red'; overlayCtx.lineWidth = 1; overlayCtx.setLineDash([]); overlayCtx.strokeRect(startX, startY, pos.x - startX, pos.y - startY);
    } else if (currentTool === 'draw') { currentPath.points.push({x: pos.x, y: pos.y}); drawOverlay(); }
    else if (currentTool === 'visual-box') {
        const box = pageEdits[editPageNum][0]; box.w = pos.x - startX; box.h = pos.y - startY; drawOverlay();
    }
}, {passive: false});

window.addEventListener('pointerup', (e) => {
    if (activeResizeHandle) { activeResizeHandle = null; return; }
    if (activeDragIndex !== -1) {
        trashZone.style.display = 'none';
        if (isHoveringTrash && ['edit', 'sign', 'watermark', 'addtext'].includes(currentVisualMode)) { pageEdits[editPageNum].splice(activeDragIndex, 1); isHoveringTrash = false; selectedEditIndex = -1; showCustomAlert("Deleted."); } 
        else if (!hasMovedDuringClick) {
            const edit = pageEdits[editPageNum][activeDragIndex];
            if (edit.type === 'text' && currentTool === 'text') openTextModal(edit.text, { type: 'edit', index: activeDragIndex });
        }
        activeDragIndex = -1; drawOverlay(); return;
    }
    if (!isDrawing) return;
    isDrawing = false; currentPath = null;
    
    if (currentTool === 'whiteout') {
        const pos = getCursorPos(e); 
        let clientX = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0); let clientY = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0);
        const rect = overlayCanvas.getBoundingClientRect(); const scaleX = overlayCanvas.width / rect.width; const scaleY = overlayCanvas.height / rect.height;
        const endX = (clientX - rect.left) * scaleX; const endY = (clientY - rect.top) * scaleY;
        const w = endX - startX; const h = endY - startY;
        if (Math.abs(w) > 5 && Math.abs(h) > 5) { if (!pageEdits[editPageNum]) pageEdits[editPageNum] = []; pageEdits[editPageNum].push({ type: 'whiteout', x: w < 0 ? endX : startX, y: h < 0 ? endY : startY, w: Math.abs(w), h: Math.abs(h) }); }
        drawOverlay();
    }
});

document.getElementById('prev-page')?.addEventListener('click', () => { if (editPageNum > 1) { editPageNum--; selectedEditIndex = -1; renderEditPage(editPageNum); } });
document.getElementById('next-page')?.addEventListener('click', () => { if (editPageNum < editPdfDoc?.numPages) { editPageNum++; selectedEditIndex = -1; renderEditPage(editPageNum); } });

// ==========================================
// UNIVERSAL SAVE ENGINE (Handles 'Apply to All' vs 'Current Page' + Single Page Crop)
// ==========================================
document.getElementById('btn-edit-save')?.addEventListener('click', async () => {
    if (!currentEditFile) return;
    const btn = document.getElementById('btn-edit-save'); const oldText = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    try {
        const freshBuffer = await currentEditFile.arrayBuffer();
        if (freshBuffer.byteLength < 100) { showCustomAlert("File not fully loaded. Wait a moment."); btn.innerHTML = oldText; return; }

        const applyMode = document.getElementById('edit-apply-mode').value;

        if (['edit', 'sign', 'watermark', 'addtext'].includes(currentVisualMode)) {
            const pdfDoc = await PDFDocument.load(freshBuffer);
            const pages = pdfDoc.getPages();
            
            for (let pIdx = 0; pIdx < pages.length; pIdx++) {
                const page = pages[pIdx]; 
                const { width, height } = page.getSize();
                
                let editsToApply = [];
                if (applyMode === 'all') {
                    editsToApply = pageEdits[editPageNum] || [];
                } else {
                    editsToApply = pageEdits[pIdx + 1] || [];
                }

                for (const edit of editsToApply) {
                    const pdfX = edit.x / editScale; const pdfY = height - (edit.y / editScale); 
                    if (edit.type === 'whiteout') { 
                        page.drawRectangle({ x: pdfX, y: pdfY - (edit.h / editScale), width: edit.w / editScale, height: edit.h / editScale, color: rgb(1, 1, 1) }); 
                    } 
                    else if (edit.type === 'text') { 
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
                                x: drawX - 5, y: pdfY - fontSize, width: textWidth + 10, height: fontSize + 10,
                                color: hexToRgbPdf(edit.bgColor), opacity: edit.opacity || 1
                            });
                        }

                        page.drawText(edit.text, { 
                            x: drawX, y: pdfY, size: fontSize, font: font, color: hexToRgbPdf(edit.color), opacity: edit.opacity || 1 
                        }); 

                        if (edit.underline) {
                            page.drawLine({
                                start: {x: drawX, y: pdfY - 2}, end: {x: drawX + textWidth, y: pdfY - 2},
                                thickness: Math.max(1, fontSize/15), color: hexToRgbPdf(edit.color), opacity: edit.opacity || 1
                            });
                        }
                    } 
                    else if (edit.type === 'draw') { 
                        for(let k=0; k < edit.points.length - 1; k++) { const p1 = edit.points[k]; const p2 = edit.points[k+1]; page.drawLine({ start: { x: p1.x / editScale, y: height - (p1.y / editScale) }, end: { x: p2.x / editScale, y: height - (p2.y / editScale) }, thickness: edit.size / editScale, color: hexToRgbPdf(edit.color) }); } 
                    } 
                    else if (edit.type === 'image') { 
                        const res = await fetch(edit.dataUrl); const imageBytes = await res.arrayBuffer(); let pdfImage = edit.imgType === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes); const pdfW = edit.w / editScale; const pdfH = edit.h / editScale; page.drawImage(pdfImage, { x: pdfX, y: pdfY - pdfH, width: pdfW, height: pdfH }); 
                    }
                }
            }
            let outputSuffix = currentVisualMode === 'sign' ? '_Signed' : currentVisualMode === 'watermark' ? '_Watermark' : '_Edited';
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + outputSuffix + '.pdf', 'application/pdf');

        } else if (currentVisualMode === 'crop') {
            const boxData = pageEdits[editPageNum]?.find(e => e.type === 'visual-box');
            if(!boxData) { showCustomAlert("Draw a crop box first!"); btn.innerHTML = oldText; return; }
            const nBox = normalizeBox(boxData);
            const originalDoc = await PDFDocument.load(freshBuffer);
            let finalBytes;
            
            if (applyMode === 'current') {
                const smartDoc = await PDFDocument.create();
                const [copiedPage] = await smartDoc.copyPages(originalDoc, [editPageNum - 1]);
                smartDoc.addPage(copiedPage);
                
                const { height: pHeight } = copiedPage.getSize();
                const cropW = nBox.w / editScale;
                const cropH = nBox.h / editScale;
                const cropX = nBox.x / editScale;
                // FIX: PERFECT MATH FOR BOTTOM-LEFT ORIGIN
                const cropY = pHeight - (nBox.y / editScale) - cropH; 
                
                copiedPage.setCropBox(cropX, cropY, cropW, cropH);
                copiedPage.setMediaBox(cropX, cropY, cropW, cropH); 
                
                finalBytes = await smartDoc.save();
            } else {
                const pages = originalDoc.getPages();
                pages.forEach((p) => {
                    const { height: pHeight } = p.getSize();
                    const cropW = nBox.w / editScale;
                    const cropH = nBox.h / editScale;
                    const cropX = nBox.x / editScale;
                    // FIX: PERFECT MATH FOR BOTTOM-LEFT ORIGIN
                    const cropY = pHeight - (nBox.y / editScale) - cropH;
                    
                    p.setCropBox(cropX, cropY, cropW, cropH);
                    p.setMediaBox(cropX, cropY, cropW, cropH);
                });
                finalBytes = await originalDoc.save();
            }
            await processAndDownload(finalBytes, getBaseName(editOriginalFileName) + '_Cropped.pdf', 'application/pdf');

        } else if (currentVisualMode === 'addmargins') {
            const boxData = pageEdits[editPageNum]?.find(e => e.type === 'visual-box');
            if(!boxData) { showCustomAlert("Draw a content box first!"); btn.innerHTML = oldText; return; }
            const nBox = normalizeBox(boxData);
            const pdfDoc = await PDFDocument.load(freshBuffer);
            const pages = pdfDoc.getPages();
            const { width: pW, height: pH } = pages[0].getSize();
            const mL = nBox.x / editScale; const mT = nBox.y / editScale; const mR = pW - ((nBox.x + nBox.w) / editScale); const mB = pH - ((nBox.y + nBox.h) / editScale);
            pages.forEach((p, i) => { 
                if (applyMode === 'current' && i !== editPageNum - 1) return;
                const { width, height } = p.getSize(); p.setSize(width + mL + mR, height + mT + mB); p.translateContent(mL, mB); 
            });
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Margined.pdf', 'application/pdf');

        } else if (currentVisualMode === 'extract') {
            const boxData = pageEdits[editPageNum]?.find(e => e.type === 'visual-box');
            if(!boxData) { showCustomAlert("Draw a selection box first!"); btn.innerHTML = oldText; return; }
            const nBox = normalizeBox(boxData);
            const pdf = await pdfjsLib.getDocument(freshBuffer).promise;
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                if (applyMode === 'current' && i !== editPageNum) continue;
                const page = await pdf.getPage(i); const textContent = await page.getTextContent(); const viewport = page.getViewport({ scale: editScale });
                const extracted = textContent.items.filter(item => {
                    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                    return tx[4] >= nBox.x && tx[4] <= nBox.x + nBox.w && tx[5] >= nBox.y && tx[5] <= nBox.y + nBox.h;
                }).map(item => item.str).join(" ");
                if(extracted.trim()) fullText += `--- Page ${i} ---\n${extracted}\n\n`;
            }
            if(!fullText) showCustomAlert("No text found in that area."); else await processAndDownload(new TextEncoder().encode(fullText), getBaseName(editOriginalFileName) + '_Extracted.txt', 'text/plain');

        } else if (currentVisualMode === 'pagenumbers') {
            const dummy = pageEdits[1]?.find(e => e.type === 'pagenum-dummy');
            if(!dummy) { showCustomAlert("Position the number first."); btn.innerHTML = oldText; return; }
            const pdfDoc = await PDFDocument.load(freshBuffer);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();
            pages.forEach((page, index) => {
                if (applyMode === 'current' && index !== editPageNum - 1) return;
                const { height } = page.getSize();
                let txt = `${index + 1}`;
                if (visualData.format === 'Page 1') txt = `Page ${index + 1}`;
                if (visualData.format === 'Page 1 of 10') txt = `Page ${index + 1} of ${pages.length}`;
                page.drawText(txt, { x: dummy.x / editScale, y: height - (dummy.y / editScale), size: 14, font, color: rgb(0,0,0) });
            });
            await processAndDownload(await pdfDoc.save(), getBaseName(editOriginalFileName) + '_Numbered.pdf', 'application/pdf');
        }
        document.body.classList.remove('is-editing');
        if(typeof AdManager !== 'undefined' && AdManager) await AdManager.showInterstitial();
    } catch (error) { handleError(error); document.body.classList.remove('is-editing'); } 
    finally { btn.innerHTML = oldText; }
});
