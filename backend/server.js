const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const database = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use timestamp + original name to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'));
    }
  }
});

// Improved function to extract ALL names and their corresponding phone numbers
function extractNamesAndPhones(text) {
  const results = [];
  
  // Clean the text - replace newlines and multiple spaces
  const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Pattern 1: "Name: XXX Phone: YYY" format
  const pattern1 = /(?:Name|name)\s*:\s*([A-Za-z]+\s+[A-Za-z]+)\s*(?:Phone|phone|Phone no|phone no|number|Number)\s*:?\s*([\d\s\-+()]+)/g;
  
  // Pattern 2: "Name: XXX" followed later by "Phone: YYY"
  const namePattern = /(?:Name|name)\s*:\s*([A-Za-z]+\s+[A-Za-z]+)/g;
  const phonePattern = /(?:Phone|phone|Phone no|phone no|number|Number)\s*:?\s*([\d\s\-+()]{10,})/g;
  
  let match;
  
  // Try pattern 1 first (when name and phone are on same line or close)
  while ((match = pattern1.exec(cleanText)) !== null) {
    const name = match[1].trim();
    const phone = match[2].trim().replace(/\s/g, '');
    // Extract only digits for phone number
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      results.push({ name, phone: cleanPhone });
    }
  }
  
  // If pattern 1 didn't find enough matches, try pattern 2 (separate lines)
  if (results.length === 0) {
    const names = [];
    const phones = [];
    
    // Extract all names
    let nameMatch;
    while ((nameMatch = namePattern.exec(cleanText)) !== null) {
      names.push(nameMatch[1].trim());
    }
    
    // Extract all phones
    let phoneMatch;
    while ((phoneMatch = phonePattern.exec(cleanText)) !== null) {
      const cleanPhone = phoneMatch[1].replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        phones.push(cleanPhone);
      }
    }
    
    // Pair names with phones based on order
    const maxLength = Math.max(names.length, phones.length);
    for (let i = 0; i < maxLength; i++) {
      const name = names[i] || 'Unknown';
      const phone = phones[i] || 'Not found';
      if (phone !== 'Not found') {
        results.push({ name, phone });
      }
    }
  }
  
  // Pattern 3: Handle format like "Raj Aryan 9562385412" or "Adam Seville 5471855623"
  const pattern3 = /([A-Za-z]+\s+[A-Za-z]+)\s+(\d{10,})/g;
  while ((match = pattern3.exec(cleanText)) !== null) {
    const name = match[1].trim();
    const phone = match[2].trim();
    // Check if this combination already exists
    const exists = results.some(r => r.name === name && r.phone === phone);
    if (!exists) {
      results.push({ name, phone });
    }
  }
  
  // Pattern 4: Handle format with commas or other separators
  const pattern4 = /([A-Za-z]+\s+[A-Za-z]+)[^\d]*(\d{10,})/g;
  while ((match = pattern4.exec(cleanText)) !== null) {
    const name = match[1].trim();
    const phone = match[2].trim();
    const exists = results.some(r => r.name === name && r.phone === phone);
    if (!exists && phone.length >= 10) {
      results.push({ name, phone });
    }
  }
  
  // Remove duplicates based on name+phone combination
  const uniqueResults = [];
  const seen = new Set();
  for (const result of results) {
    const key = `${result.name}|${result.phone}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(result);
    }
  }
  
  return uniqueResults;
}

// Process image file with OCR
async function processImage(filePath) {
  try {
    console.log('Processing image with Tesseract...');
    const { data: { text } } = await Tesseract.recognize(
      filePath,
      'eng',
      { 
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );
    console.log('OCR completed. Extracted text:', text);
    return text;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to process image');
  }
}

// Process PDF file
async function processPDF(filePath) {
  try {
    console.log('Processing PDF...');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    console.log('PDF parsed. Extracted text:', data.text);
    return data.text;
  } catch (error) {
    console.error('PDF Parse Error:', error);
    throw new Error('Failed to process PDF');
  }
}

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    filePath = req.file.path;
    const filename = req.file.originalname;
    const fileType = req.file.mimetype;
    
    console.log(`Processing file: ${filename}, Type: ${fileType}`);
    
    let extractedText = '';
    
    // Process based on file type
    if (fileType === 'application/pdf') {
      extractedText = await processPDF(filePath);
    } else {
      extractedText = await processImage(filePath);
    }
    
    // Extract ALL names and phone numbers
    const namePhonePairs = extractNamesAndPhones(extractedText);
    
    console.log('Extracted pairs:', namePhonePairs);
    
    // Store each pair as a separate record in database
    const storedRecords = [];
    for (const pair of namePhonePairs) {
      const recordId = await database.insertExtractedData(
        filename,
        pair.name,
        [pair.phone],
        extractedText
      );
      storedRecords.push({ id: recordId, name: pair.name, phone: pair.phone });
    }
    
    // If no pairs found, store as a single record with "Not found"
    if (namePhonePairs.length === 0) {
      const recordId = await database.insertExtractedData(
        filename,
        'Not found',
        [],
        extractedText
      );
      storedRecords.push({ id: recordId, name: 'Not found', phone: null });
    }
    
    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.json({
      success: true,
      filename,
      extractedPairs: namePhonePairs,
      extractedText: extractedText.substring(0, 1000) // Send first 1000 chars for preview
    });
    
  } catch (error) {
    console.error('Upload Error:', error);
    // Clean up file if it exists
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    res.status(500).json({ error: error.message });
  }
});

// Get all records endpoint
app.get('/api/records', async (req, res) => {
  try {
    const records = await database.getAllRecords();
    // Parse phone numbers JSON for each record
    const processedRecords = records.map(record => ({
      ...record,
      phone_numbers: JSON.parse(record.phone_numbers || '[]')
    }));
    res.json(processedRecords);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// Delete all records endpoint (for testing)
app.delete('/api/records', async (req, res) => {
  try {
    const db = require('./database').db;
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM extracted_info', function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    res.json({ success: true, message: 'All records deleted' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete records' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Make sure to upload files through the web interface');
});