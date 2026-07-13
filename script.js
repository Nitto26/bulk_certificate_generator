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
let generatedCertificates = []; // Cache for email dispatch

// 2. RESIZE HANDLER
function resizeCanvasElement() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if(wrapper) {
        canvas.setWidth(wrapper.clientWidth);
        canvas.setHeight(wrapper.clientHeight);
        if (canvas.backgroundImage) {
            fitImageToScreen(canvas.backgroundImage.width, canvas.backgroundImage.height);
        }
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
    try {
        const qr = new QRious({
            value: value || ' ',
            size: 300
        });
        return qr.toDataURL();
    } catch (err) {
        console.error("QR Code generation failed for value:", value, err);
        // Fallback to a 1x1 transparent pixel data URL
        return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }
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

// Step Card click toggle handlers
document.getElementById('tools-box').addEventListener('click', function(e) {
    if (e.target !== document.getElementById('gridToggle') && e.target.tagName !== 'LABEL') {
        const cb = document.getElementById('gridToggle');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    }
});

document.getElementById('qrcode-box').addEventListener('click', function(e) {
    const ignoredTags = ['SELECT', 'BUTTON', 'INPUT', 'LABEL', 'OPTION'];
    if (!ignoredTags.includes(e.target.tagName)) {
        const cb = document.getElementById('qrcodeToggle');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    }
});

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
    
    const generateBtn = document.getElementById('generateBtn');
    const previewBtn = document.getElementById('previewBtn');
    const statusDiv = document.getElementById('status-message');
    
    // Disable buttons to prevent duplicate triggers
    generateBtn.disabled = true;
    previewBtn.disabled = true;
    generateBtn.style.opacity = '0.7';
    previewBtn.style.opacity = '0.7';
    
    statusDiv.innerText = "Initializing generation...";
    
    try {
        canvas.discardActiveObject();
        const wasGrid = isGridEnabled; isGridEnabled=false; drawGrid(); canvas.renderAll();
        
        const originalVpt = canvas.viewportTransform.slice();
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.setWidth(canvas.backgroundImage.width);
        canvas.setHeight(canvas.backgroundImage.height);
        
        const zip = new JSZip();
        const pattern = document.getElementById('fileNamePattern').value.trim() || `{${headers[0]}}_Certificate`;
        generatedCertificates = []; // reset cached images
        
        for (let i = 0; i < excelData.length; i++) {
            statusDiv.innerText = `Generating (${i + 1}/${excelData.length})...`;
            const row = excelData[i];
            
            // Allow renderer to flush status string to UI
            await new Promise(r => setTimeout(r, 0));
            
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
            const sanitizedFname = fname.replace(/[^a-z0-9 \-_]/gi, '_');
            zip.file(`${sanitizedFname}.png`, blob);
            
            // Save for email attachments
            generatedCertificates.push({
                row: row,
                fileName: sanitizedFname,
                dataUrl: canvas.toDataURL({format: 'png', quality: 1.0})
            });
        }
        
        resizeCanvasElement();
        canvas.setViewportTransform(originalVpt);
        if(wasGrid) { isGridEnabled=true; drawGrid(); }
        
        statusDiv.innerText = "Packaging files...";
        const zipBlob = await zip.generateAsync({type:"blob"});
        saveAs(zipBlob, "certificates.zip");
        statusDiv.innerText = "Done!";
        
        // Show the Email Box!
        const emailBox = document.getElementById('email-box');
        if (emailBox) {
            emailBox.style.display = 'block';
            populateEmailDropdown();
            setTimeout(() => {
                emailBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }, 200);
        }
    } catch (err) {
        console.error("Batch generation failed:", err);
        statusDiv.innerText = "Generation failed. Check console.";
    } finally {
        // Restore buttons
        generateBtn.disabled = false;
        previewBtn.disabled = false;
        generateBtn.style.opacity = '1';
        previewBtn.style.opacity = '1';
    }
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

// Drag & Drop Setup
function setupDragAndDrop(dropzoneId, inputId) {
    const dropzone = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    if (!dropzone || !input) return;
    
    dropzone.addEventListener('click', () => input.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    ['dragleave', 'dragend'].forEach(evt => {
        dropzone.addEventListener(evt, () => {
            dropzone.classList.remove('dragover');
        });
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            input.dispatchEvent(new Event('change'));
        }
    });
}

setupDragAndDrop('dataDropzone', 'dataUpload');
setupDragAndDrop('templateDropzone', 'templateUpload');

// Email Column Selector
function populateEmailDropdown() {
    const select = document.getElementById('emailColumnSelect');
    if (!select) return;
    select.innerHTML = '';
    headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        if (h.toLowerCase() === 'email' || h.toLowerCase() === 'mail') {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

// Toggle SMTP Settings
document.getElementById('toggleSmtpBtn').addEventListener('click', function(e) {
    e.preventDefault();
    const smtpDiv = document.getElementById('smtp-settings');
    const span = this.querySelector('span');
    if (smtpDiv.style.display === 'none') {
        smtpDiv.style.display = 'block';
        span.innerText = "Hide SMTP Connection Settings";
    } else {
        smtpDiv.style.display = 'none';
        span.innerText = "Show SMTP Connection Settings";
    }
});

// Send Bulk Emails via SMTP.js
document.getElementById('sendEmailsBtn').addEventListener('click', async function() {
    if (generatedCertificates.length === 0) {
        alert("Please generate certificates first.");
        return;
    }
    
    const emailCol = document.getElementById('emailColumnSelect').value;
    const host = document.getElementById('smtpHost').value.trim();
    const port = document.getElementById('smtpPort').value.trim();
    const senderName = document.getElementById('smtpSenderName').value.trim();
    const senderEmail = document.getElementById('smtpSenderEmail').value.trim();
    const username = document.getElementById('smtpUsername').value.trim();
    const password = document.getElementById('smtpPassword').value.trim();
    const subjectPattern = document.getElementById('emailSubject').value.trim() || "Your Certificate";
    const bodyPattern = document.getElementById('emailBody').value;
    
    if (!senderEmail || !username || !password) {
        alert("Please fill in Sender Email, SMTP Username, and SMTP Password fields.");
        return;
    }
    
    const emailStatus = document.getElementById('email-status-message');
    const sendBtn = document.getElementById('sendEmailsBtn');
    
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.7';
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < generatedCertificates.length; i++) {
        const cert = generatedCertificates[i];
        const row = cert.row;
        const recipient = String(row[emailCol] || '').trim();
        
        if (!recipient) {
            console.warn(`Skipping index ${i}: No email address found in column '${emailCol}'`);
            failCount++;
            continue;
        }
        
        emailStatus.innerText = `Sending email (${i + 1}/${generatedCertificates.length}) to ${recipient}...`;
        
        // Replace placeholder templates
        let subject = subjectPattern;
        let body = bodyPattern;
        headers.forEach(h => {
            const regex = new RegExp(`{${h}}`, 'gi');
            subject = subject.replace(regex, String(row[h] || ''));
            body = body.replace(regex, String(row[h] || ''));
        });
        
        const fromHeader = senderName ? `${senderName} <${senderEmail}>` : senderEmail;
        const rawBase64 = cert.dataUrl.split(',')[1];
        
        try {
            await new Promise((resolve, reject) => {
                Email.send({
                    Host : host,
                    Port : parseInt(port) || 587,
                    Username : username,
                    Password : password,
                    To : recipient,
                    From : fromHeader,
                    Subject : subject,
                    Body : body,
                    Attachments : [
                        {
                            name : `${cert.fileName}.png`,
                            data : rawBase64
                        }
                    ]
                }).then(message => {
                    if (message === "OK") {
                        resolve();
                    } else {
                        reject(new Error(message));
                    }
                }).catch(err => reject(err));
            });
            successCount++;
        } catch (err) {
            console.error(`Failed to send email to ${recipient}:`, err);
            failCount++;
        }
        
        // Slight delay between emails to avoid spam filters
        await new Promise(r => setTimeout(r, 800));
    }
    
    emailStatus.innerText = `Completed! Sent: ${successCount}, Failed: ${failCount}`;
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
});