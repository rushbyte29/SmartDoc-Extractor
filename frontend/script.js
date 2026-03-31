const API_URL = 'http://localhost:3000/api';

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const extractedPairsContainer = document.getElementById('extractedPairs');
const extractedText = document.getElementById('extractedText');
const recordsList = document.getElementById('recordsList');
const refreshBtn = document.getElementById('refreshRecords');
const clearBtn = document.getElementById('clearRecords');
const totalDocumentsSpan = document.getElementById('totalDocuments');
const totalNamesSpan = document.getElementById('totalNames');

// Upload area event listeners
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
refreshBtn.addEventListener('click', loadRecords);
if (clearBtn) {
    clearBtn.addEventListener('click', clearAllRecords);
}

// Close result function
window.closeResult = function() {
    result.style.display = 'none';
}

// Copy extracted text function
window.copyExtractedText = function() {
    const text = extractedText.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const copyBtn = document.querySelector('.copy-btn');
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 2000);
    });
}

function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
    // Reset file input to allow uploading the same file again
    fileInput.value = '';
}

async function handleFile(file) {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
        showNotification('Please upload a valid file (JPEG, PNG, or PDF)', 'error');
        return;
    }
    
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
        showNotification('File size must be less than 10MB', 'error');
        return;
    }
    
    // Show file info
    fileInfo.style.display = 'block';
    fileInfo.innerHTML = `
        <i class="fas fa-file"></i>
        <strong>${file.name}</strong> (${(file.size / 1024).toFixed(2)} KB)
    `;
    
    // Upload file
    await uploadFile(file);
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Hide previous result and show loading
    result.style.display = 'none';
    loading.style.display = 'flex';
    
    // Animate processing steps
    animateProcessingSteps();
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            displayResult(data);
            await loadRecords(); // Refresh records list
            showNotification('Document processed successfully!', 'success');
        } else {
            showNotification('Error: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Failed to upload file. Please try again.', 'error');
    } finally {
        loading.style.display = 'none';
        // Reset processing steps animation
        resetProcessingSteps();
    }
}

function animateProcessingSteps() {
    const steps = document.querySelectorAll('.step');
    let currentStep = 0;
    
    const interval = setInterval(() => {
        if (currentStep < steps.length) {
            steps[currentStep].classList.add('active');
            currentStep++;
        } else {
            clearInterval(interval);
        }
    }, 800);
}

function resetProcessingSteps() {
    const steps = document.querySelectorAll('.step');
    steps.forEach(step => step.classList.remove('active'));
}

function displayResult(data) {
    // Display all extracted name-phone pairs
    extractedPairsContainer.innerHTML = '';
    
    if (data.extractedPairs && data.extractedPairs.length > 0) {
        data.extractedPairs.forEach((pair, index) => {
            const pairCard = document.createElement('div');
            pairCard.className = 'pair-card';
            pairCard.style.animation = `slideUp 0.3s ease ${index * 0.1}s backwards`;
            pairCard.innerHTML = `
                <div class="pair-number">${index + 1}</div>
                <div class="pair-info">
                    <div class="pair-name">
                        <strong><i class="fas fa-user"></i> Name:</strong>
                        <span>${escapeHtml(pair.name)}</span>
                    </div>
                    <div class="pair-phone">
                        <strong><i class="fas fa-phone-alt"></i> Phone:</strong>
                        <span>${escapeHtml(pair.phone)}</span>
                    </div>
                </div>
            `;
            extractedPairsContainer.appendChild(pairCard);
        });
    } else {
        extractedPairsContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1">
                <i class="fas fa-search"></i>
                <p>No names or phone numbers found</p>
                <span>Try uploading a clearer document</span>
            </div>
        `;
    }
    
    // Display extracted text preview
    extractedText.textContent = data.extractedText || 'No text extracted';
    
    // Show result with animation
    result.style.display = 'block';
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadRecords() {
    try {
        const response = await fetch(`${API_URL}/records`);
        const records = await response.json();
        
        // Update statistics
        const uniqueFiles = new Set(records.map(r => r.filename));
        const uniqueNames = new Set(records.filter(r => r.name !== 'Not found').map(r => r.name));
        totalDocumentsSpan.textContent = uniqueFiles.size;
        totalNamesSpan.textContent = uniqueNames.size;
        
        if (records.length === 0) {
            recordsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No documents processed yet</p>
                    <span>Upload your first document to get started</span>
                </div>
            `;
            return;
        }
        
        // Group records by filename
        const groupedRecords = {};
        records.forEach(record => {
            if (!groupedRecords[record.filename]) {
                groupedRecords[record.filename] = [];
            }
            groupedRecords[record.filename].push(record);
        });
        
        recordsList.innerHTML = Object.keys(groupedRecords).map((filename, groupIndex) => `
            <div class="record-group" style="animation: slideUp 0.3s ease ${groupIndex * 0.1}s backwards">
                <div class="record-group-header" onclick="toggleRecordGroup(this)">
                    <div class="record-filename">
                        <i class="fas fa-file-${filename.endsWith('.pdf') ? 'pdf' : 'image'}"></i>
                        ${escapeHtml(filename)}
                    </div>
                    <div class="record-count">
                        <i class="fas fa-tag"></i> ${groupedRecords[filename].length} entr${groupedRecords[filename].length === 1 ? 'y' : 'ies'}
                    </div>
                </div>
                <div class="record-group-content">
                    ${groupedRecords[filename].map(record => `
                        <div class="record-card">
                            <div class="record-date">
                                <i class="far fa-calendar-alt"></i>
                                ${new Date(record.upload_date).toLocaleString()}
                            </div>
                            <div class="record-name">
                                <strong><i class="fas fa-user"></i> Name:</strong>
                                ${escapeHtml(record.name)}
                            </div>
                            <div class="record-phones">
                                <strong><i class="fas fa-phone-alt"></i> Phone Numbers:</strong><br>
                                ${record.phone_numbers && record.phone_numbers.length > 0 
                                    ? record.phone_numbers.map(phone => 
                                        `<span class="phone-badge">${escapeHtml(phone)}</span>`
                                      ).join('') 
                                    : '<span style="color: #999;">No phone numbers found</span>'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading records:', error);
        recordsList.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Failed to load records</p></div>';
    }
}

// Toggle record group expansion
window.toggleRecordGroup = function(element) {
    const content = element.nextElementSibling;
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    element.style.opacity = isVisible ? '0.8' : '1';
}

async function clearAllRecords() {
    if (confirm('Are you sure you want to delete all records? This action cannot be undone.')) {
        try {
            const response = await fetch(`${API_URL}/records`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                showNotification('All records have been cleared', 'success');
                await loadRecords();
                // Reset statistics
                totalDocumentsSpan.textContent = '0';
                totalNamesSpan.textContent = '0';
            } else {
                showNotification('Failed to clear records', 'error');
            }
        } catch (error) {
            console.error('Error clearing records:', error);
            showNotification('Failed to clear records', 'error');
        }
    }
}

// Notification system
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        animation: slideDown 0.3s ease;
        border-left: 4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#667eea'};
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load records on page load
loadRecords();

// Add keyboard shortcut (Ctrl+U to upload)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        fileInput.click();
    }
});

// Add CSS for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .notification {
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        font-weight: 500;
    }
    
    .record-group-content {
        display: block;
    }
    
    .record-group-header {
        cursor: pointer;
        transition: opacity 0.3s ease;
    }
    
    .record-group-header:hover {
        opacity: 0.9;
    }
`;
document.head.appendChild(style);