const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'extracted_data.db');
const db = new sqlite3.Database(dbPath);

// Create table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS extracted_info (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      name TEXT,
      phone_numbers TEXT,
      extracted_text TEXT,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Function to insert extracted data
function insertExtractedData(filename, name, phoneNumbers, extractedText) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO extracted_info (filename, name, phone_numbers, extracted_text) 
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(filename, name, JSON.stringify(phoneNumbers), extractedText, function(err) {
      if (err) {
        console.error('Database insert error:', err);
        reject(err);
      } else {
        console.log(`Inserted record with ID: ${this.lastID}, Name: ${name}`);
        resolve(this.lastID);
      }
    });
    stmt.finalize();
  });
}

// Function to get all records
function getAllRecords() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM extracted_info ORDER BY upload_date DESC", (err, rows) => {
      if (err) {
        console.error('Database query error:', err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Function to clear all records (for testing)
function clearAllRecords() {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM extracted_info", function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

module.exports = {
  db,
  insertExtractedData,
  getAllRecords,
  clearAllRecords
};