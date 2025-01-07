const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const stream = require('stream');
const finished = promisify(stream.finished);

async function generateLargeZipFile() {
    console.log('Starting to generate large test files...');
    
    // Create temp directory for log files
    const tempDir = path.join(__dirname, 'temp_logs');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    // Generate multiple log files
    const numFiles = 10;
    const linesPerFile = 1000000;
    const linesPerChunk = 10000;

    for (let fileNum = 1; fileNum <= numFiles; fileNum++) {
        console.log(`Generating file ${fileNum}/${numFiles}...`);
        const filePath = path.join(tempDir, `log_${fileNum}.log`);
        const writeStream = fs.createWriteStream(filePath);

        try {
            for (let chunk = 0; chunk < linesPerFile / linesPerChunk; chunk++) {
                let content = '';
                
                for (let i = 1; i <= linesPerChunk; i++) {
                    const timestamp = new Date(2024, 0, 1, 0, 0, i % 60).toISOString();
                    const level = ['INFO', 'WARN', 'ERROR', 'DEBUG'][Math.floor(Math.random() * 4)];
                    const keywords = ['user', 'system', 'network', 'database', 'api', 'cache', 'error', 'success'];
                    const randomKeywords = Array(3).fill().map(() => keywords[Math.floor(Math.random() * keywords.length)]);
                    const message = `Message with ${randomKeywords.join(', ')} - ID:${Math.floor(Math.random() * 1000000)}`;
                    
                    content += `${timestamp} [${level}] [Thread-${Math.floor(Math.random() * 100)}] ${message}\n`;
                }

                // Write chunk to file
                writeStream.write(content);

                if (chunk % 10 === 0) {
                    console.log(`  Progress: ${Math.floor((chunk * linesPerChunk / linesPerFile) * 100)}%`);
                }
            }

            // Properly close the stream and wait for it to finish
            writeStream.end();
            await finished(writeStream);
            console.log(`File ${fileNum} generated`);
        } catch (err) {
            console.error(`Error generating file ${fileNum}:`, err);
            writeStream.destroy();
            throw err;
        }
    }

    console.log('Creating ZIP file...');
    
    try {
        // Use system zip command instead of JSZip
        const zipCommand = process.platform === 'win32' 
            ? `powershell Compress-Archive -Path "${tempDir}\\*" -DestinationPath test_logs.zip -Force`
            : `zip -r test_logs.zip ${tempDir}/*`;

        const { execSync } = require('child_process');
        execSync(zipCommand);

        // Clean up temp files
        console.log('Cleaning up temporary files...');
        fs.rmSync(tempDir, { recursive: true, force: true });

        console.log('Large ZIP file generated successfully: test_logs.zip');
    } catch (err) {
        console.error('Error during zip or cleanup:', err);
        throw err;
    }
}

// Increase Node.js memory limit if needed
// node --max-old-space-size=4096 generateTestZip.js
generateLargeZipFile().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
}); 