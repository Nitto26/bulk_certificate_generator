// 1. INITIAL CONFIG
const canvas = new fabric.Canvas('c', {
    selection: false,
    preserveObjectStacking: true,
    allowTouchScrolling: false
});

let excelData = [];
let headers = [];
let isGridEnabled = false;
const gridSize = 40;

// 2. RESIZE HANDLER
function resizeCanvasElement() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if(wrapper) {
        canvas.setWidth(wrapper.clientWidth);
        canvas.setHeight(wrapper.clientHeight);
    }
}
window.addEventListener('resize', resizeCanvasElement);
resizeCanvasElement(); 

// 3. IMAGE UPLOAD
document.getElementById('templateUpload').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const imgObj = new Image();
        imgObj.src = event.target.result;
        imgObj.onload = function() {
            canvas.clear();
            canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

            const imgInstance = new fabric.Image(imgObj, {
                selectable: false, evented: false, originX: 'left', originY: 'top'
            });

            canvas.setBackgroundImage(imgInstance, canvas.renderAll.bind(canvas));
            fitImageToScreen(imgInstance.width, imgInstance.height);
            syncGridState();
            
            // Clear layers list on new template
            updateLayerList();
        }
    }
    reader.readAsDataURL(e.target.files[0]);
});

function fitImageToScreen(imgW, imgH) {
    if (!imgW || !imgH) return;
    const canvasW = canvas.getWidth();
    const canvasH = canvas.getHeight();
    const padding = 20;
    
    const scale = Math.min((canvasW - padding) / imgW, (canvasH - padding) / imgH);
    const panX = (canvasW - imgW * scale) / 2;
    const panY = (canvasH - imgH * scale) / 2;

    canvas.setViewportTransform([scale, 0, 0, scale, panX, panY]);
    canvas.renderAll();
}

// 4. TOUCH & MOUSE LOGIC
let isDragging = false;
let isMouseDown = false;
let lastPosX, lastPosY;
let dragStartPosX, dragStartPosY;

canvas.on('mouse:down', function(opt) {
    if (opt.target) { isDragging = false; isMouseDown = false; return; }
    isMouseDown = true; isDragging = false;
    
    const evt = opt.e;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    
    lastPosX = clientX; lastPosY = clientY;
    dragStartPosX = clientX; dragStartPosY = clientY;
});

canvas.on('mouse:move', function(opt) {
    if (!isMouseDown) return;
    const evt = opt.e;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

    if (!isDragging) {
        const dist = Math.sqrt(Math.pow(clientX - dragStartPosX, 2) + Math.pow(clientY - dragStartPosY, 2));
        if (dist < 10) return; 
        isDragging = true;
    }

    const vpt = this.viewportTransform;
    vpt[4] += clientX - lastPosX;
    vpt[5] += clientY - lastPosY;
    this.requestRenderAll();
    lastPosX = clientX; lastPosY = clientY;
});

canvas.on('mouse:up', function() { isMouseDown = false; isDragging = false; });

canvas.on('mouse:wheel', function(opt) {
    const delta = opt.e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    if (zoom > 5) zoom = 5; if (zoom < 0.1) zoom = 0.1;
    canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
    opt.e.preventDefault(); opt.e.stopPropagation();
});

// 5. SNAPPING
canvas.on('object:moving', function(options) {
    if (!isGridEnabled) return;
    const target = options.target;
    target.set({
        left: Math.round(target.left / gridSize) * gridSize,
        top: Math.round(target.top / gridSize) * gridSize
    });
});

// 6. ADD TEXT & LAYERS
function generateQrDataUrl(value) {
    const qr = new QRious({
        value: value || ' ',
        size: 300
    });
    return qr.toDataURL();
}

function addTextToCanvas(headerName) {
    if (!canvas.backgroundImage) { alert("Upload template first"); return; }
    
    const vpt = canvas.viewportTransform;
    const centerX = (-vpt[4] + canvas.getWidth() / 2) / vpt[0];
    const centerY = (-vpt[5] + canvas.getHeight() / 2) / vpt[3];

    const text = new fabric.Text(`{${headerName}}`, {
        left: centerX, top: centerY,
        fontFamily: 'Arial', fontSize: 40 / canvas.getZoom(),
        fill: '#000000', originX: 'center', originY: 'center', textAlign: 'center',
        id: headerName
    });
    
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
    updateLayerList();
}

function addQrcodeToCanvas(headerName) {
    if (!canvas.backgroundImage) { alert("Upload template first"); return; }
    
    const vpt = canvas.viewportTransform;
    const centerX = (-vpt[4] + canvas.getWidth() / 2) / vpt[0];
    const centerY = (-vpt[5] + canvas.getHeight() / 2) / vpt[3];

    const qrImg = new Image();
    qrImg.onload = function() {
        const fabricImg = new fabric.Image(qrImg, {
            left: centerX, top: centerY,
            originX: 'center', originY: 'center',
            id: 'qr-' + headerName,
            isQrCode: true,
            columnHeader: headerName
        });
        
        fabricImg.scaleToWidth(150 / canvas.getZoom());
        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.renderAll();
        updateLayerList();
    };
    qrImg.src = generateQrDataUrl(`{QR:${headerName}}`);
}

function updateLayerList() {
    const container = document.getElementById('layers-container');
    const panel = document.getElementById('layers-panel');
    container.innerHTML = '';
    
    const objects = canvas.getObjects().filter(o => (o.type === 'text' && o.id) || o.isQrCode);
    panel.style.display = objects.length > 0 ? 'block' : 'none';

    const activeObj = canvas.getActiveObject();

    objects.forEach(obj => {
        const btn = document.createElement('button');
        btn.innerText = obj.isQrCode ? `QR Code: {${obj.columnHeader}}` : obj.text;
        btn.style.padding = '8px'; btn.style.textAlign = 'left';
        btn.style.border = '1px solid #ccc'; btn.style.background = 'white';
        btn.style.borderRadius = '4px'; btn.style.cursor = 'pointer';

        if (activeObj === obj) {
            btn.style.background = '#e7f1ff';
            btn.style.borderColor = '#007bff';
            btn.style.color = '#007bff';
            btn.style.fontWeight = 'bold';
        }

        btn.onclick = () => {
            canvas.setActiveObject(obj);
            canvas.renderAll();
            document.getElementById('properties-panel').scrollIntoView({behavior: "smooth"});
        };
        container.appendChild(btn);
    });
}

// 7. GRID
function drawGrid() {
    canvas.getObjects().forEach(o => { if(o.id === 'grid-line') canvas.remove(o) });
    if (!isGridEnabled || !canvas.backgroundImage) return;

    const width = canvas.backgroundImage.width;
    const height = canvas.backgroundImage.height;

    for (let i = 0; i < (width / gridSize); i++) {
        const line = new fabric.Line([i * gridSize, 0, i * gridSize, height], { stroke: '#000', strokeWidth: 1, selectable: false, evented: false, id: 'grid-line', opacity: 0.2 });
        canvas.add(line); line.sendToBack();
    }
    for (let i = 0; i < (height / gridSize); i++) {
        const line = new fabric.Line([0, i * gridSize, width, i * gridSize], { stroke: '#000', strokeWidth: 1, selectable: false, evented: false, id: 'grid-line', opacity: 0.2 });
        canvas.add(line); line.sendToBack();
    }
    if(canvas.backgroundImage) canvas.backgroundImage.sendToBack();
}
const gridCheckbox = document.getElementById('gridToggle');
function syncGridState() { isGridEnabled = gridCheckbox.checked; drawGrid(); }
gridCheckbox.addEventListener('change', syncGridState);


// 8. DATA UPLOAD
document.getElementById('dataUpload').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        excelData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        if(excelData.length > 0) {
            headers = Object.keys(excelData[0]);
            generateFieldButtons(headers);
            populateQrDropdown();
            document.getElementById('field-controls').style.display = 'block';
        }
    };
    reader.readAsArrayBuffer(e.target.files[0]);
});

function generateFieldButtons(list) {
    const container = document.getElementById('buttons-container');
    container.innerHTML = '';
    list.forEach(h => {
        const btn = document.createElement('button');
        btn.innerText = `+ {${h}}`;
        btn.className = 'field-btn';
        btn.onclick = () => addTextToCanvas(h);
        container.appendChild(btn);
    });
}

// QR Code Generator UI events and helpers
function populateQrDropdown() {
    const select = document.getElementById('qrcodeColumnSelect');
    if (!select) return;
    select.innerHTML = '';
    headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        select.appendChild(opt);
    });
}

document.getElementById('qrcodeToggle').addEventListener('change', function() {
    const fieldsDiv = document.getElementById('qrcode-fields');
    if (this.checked) {
        fieldsDiv.style.display = 'block';
        populateQrDropdown();
    } else {
        fieldsDiv.style.display = 'none';
    }
});

function addSelectedQrcode() {
    const select = document.getElementById('qrcodeColumnSelect');
    if (select && select.value) {
        addQrcodeToCanvas(select.value);
    } else {
        alert("Please upload Data file first and select a column.");
    }
}

document.getElementById('addQrcodeColBtn').addEventListener('click', addSelectedQrcode);
document.getElementById('addQrcodeBtn').addEventListener('click', addSelectedQrcode);

// 9. PROPERTIES & LOGIC
const propPanel = document.getElementById('properties-panel');

function changeAlignment(activeObj, alignment) {
    if (!activeObj) return;
    const centerPoint = activeObj.getCenterPoint();
    activeObj.set({
        originX: alignment,
        textAlign: alignment
    });
    activeObj.setPositionByOrigin(centerPoint, alignment, activeObj.originY || 'center');
    canvas.requestRenderAll();
}

function updatePanel() {
    const active = canvas.getActiveObject();
    if (!active) {
        propPanel.style.display = 'none';
        return;
    }
    
    propPanel.style.display = 'block';
    
    if (active.type === 'text') {
        document.getElementById('propertiesTitle').innerText = "Edit Text Field";
        document.getElementById('textProperties').style.display = 'block';
        document.getElementById('qrcodeProperties').style.display = 'none';
        
        document.getElementById('fontFamilyBtn').value = active.fontFamily || 'Arial';
        document.getElementById('fontSizeBtn').value = active.fontSize || 40;
        document.getElementById('fontColorBtn').value = active.fill || '#000000';
        document.getElementById('alignmentBtn').value = active.originX || 'center';
    } else if (active.isQrCode) {
        document.getElementById('propertiesTitle').innerText = "Edit QR Code";
        document.getElementById('textProperties').style.display = 'none';
        document.getElementById('qrcodeProperties').style.display = 'block';
        document.getElementById('qrcodeSourceDisplay').value = active.columnHeader || '';
    } else {
        propPanel.style.display = 'none';
        return;
    }

    // Automatically scroll the sidebar to show the properties panel
    setTimeout(() => {
        propPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
}
canvas.on('selection:created', () => { updatePanel(); updateLayerList(); });
canvas.on('selection:updated', () => { updatePanel(); updateLayerList(); });
canvas.on('selection:cleared', () => { updatePanel(); updateLayerList(); });

document.getElementById('fontFamilyBtn').addEventListener('change', function() { if(canvas.getActiveObject()) { canvas.getActiveObject().set('fontFamily', this.value); canvas.requestRenderAll(); }});
document.getElementById('fontSizeBtn').addEventListener('input', function() { if(canvas.getActiveObject()) { canvas.getActiveObject().set('fontSize', parseInt(this.value)); canvas.requestRenderAll(); }});
document.getElementById('fontColorBtn').addEventListener('input', function() { if(canvas.getActiveObject()) { canvas.getActiveObject().set('fill', this.value); canvas.requestRenderAll(); }});
document.getElementById('alignmentBtn').addEventListener('change', function() { if(canvas.getActiveObject() && canvas.getActiveObject().type === 'text') { changeAlignment(canvas.getActiveObject(), this.value); }});
document.getElementById('deleteBtn').addEventListener('click', () => { 
    canvas.remove(canvas.getActiveObject()); canvas.discardActiveObject(); canvas.renderAll(); updateLayerList();
});

// 10. PREVIEW ROW
document.getElementById('previewBtn').addEventListener('click', function() {
    if(excelData.length > 0) {
        const row = excelData[0];
        const updatePromises = [];
        
        canvas.getObjects().forEach(obj => {
            if (obj.type === 'text' && obj.id) {
                const newData = row[obj.id] !== undefined ? String(row[obj.id]) : '';
                obj.set({ text: newData });
            } else if (obj.isQrCode && obj.columnHeader) {
                const value = row[obj.columnHeader] !== undefined ? String(row[obj.columnHeader]) : '';
                const promise = new Promise((resolve) => {
                    const tempImg = new Image();
                    tempImg.onload = function() {
                        obj.setElement(tempImg);
                        resolve();
                    };
                    tempImg.src = generateQrDataUrl(value);
                });
                updatePromises.push(promise);
            }
        });
        
        Promise.all(updatePromises).then(() => {
            canvas.renderAll();
            updateLayerList();
        });
    } else {
        alert("Please upload Data file first.");
    }
});

// 11. GENERATE
document.getElementById('generateBtn').addEventListener('click', async function() {
    if(excelData.length === 0) { alert("Upload Data First"); return; }
    const statusDiv = document.getElementById('status-message');
    statusDiv.innerText = "Generating...";
    
    canvas.discardActiveObject();
    const wasGrid = isGridEnabled; isGridEnabled=false; drawGrid(); canvas.renderAll();
    
    const originalVpt = canvas.viewportTransform.slice();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.setWidth(canvas.backgroundImage.width);
    canvas.setHeight(canvas.backgroundImage.height);
    
    const zip = new JSZip();
    const pattern = document.getElementById('fileNamePattern').value.trim() || `{${headers[0]}}_Certificate`;
    
    for (let i = 0; i < excelData.length; i++) {
        const row = excelData[i];
        canvas.getObjects().forEach(o => { if(o.type==='text' && o.id) o.set('text', String(row[o.id]||'')) });
        
        // Update QR code layers for each row
        const qrPromises = [];
        canvas.getObjects().forEach(o => {
            if (o.isQrCode && o.columnHeader) {
                const val = String(row[o.columnHeader] !== undefined ? row[o.columnHeader] : '');
                const p = new Promise(resolve => {
                    const tempImg = new Image();
                    tempImg.onload = function() {
                        o.setElement(tempImg);
                        resolve();
                    };
                    tempImg.src = generateQrDataUrl(val);
                });
                qrPromises.push(p);
            }
        });
        
        if (qrPromises.length > 0) {
            await Promise.all(qrPromises);
        }
        
        canvas.renderAll();
        
        const blob = await new Promise(r => canvas.getElement().toBlob(r));
        let fname = pattern;
        headers.forEach(h => fname = fname.replace(new RegExp(`{${h}}`, 'gi'), row[h]||''));
        zip.file(`${fname.replace(/[^a-z0-9 \-_]/gi, '_')}.png`, blob);
    }
    
    resizeCanvasElement();
    canvas.setViewportTransform(originalVpt);
    if(wasGrid) { isGridEnabled=true; drawGrid(); }
    
    zip.generateAsync({type:"blob"}).then(c => { saveAs(c, "certificates.zip"); statusDiv.innerText="Done!"; });
});

// Zoom Helpers
window.zoomCanvas = (factor) => {
    let zoom = canvas.getZoom() * factor;
    if(zoom>5) zoom=5; if(zoom<0.1) zoom=0.1;
    canvas.setZoom(zoom);
    canvas.renderAll();
};
window.resetZoom = () => {
    if(canvas.backgroundImage) fitImageToScreen(canvas.backgroundImage.width, canvas.backgroundImage.height);
};